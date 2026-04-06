import { getPrimaryScroller, getScriptRoot } from "../../scroll/scroller";
import { supabase } from "../../forge/supabaseClient";
import { shouldLogLevel } from "../../env/dev-log";

type WhisperBridgeEvent = "start" | "end" | "error" | "partial" | "final";
type WhisperBridgeListener = (payload?: unknown) => void;

type WhisperBridgePayload = {
  text: string;
  final: boolean;
  isFinal: boolean;
  timestamp: number;
  source: string;
  model?: string | null;
  providerRequestId?: string | null;
};

type WhisperBridgeResponse = {
  ok?: boolean;
  text?: string;
  error?: string;
  model?: string;
  provider_request_id?: string | null;
};

class WhisperBridgeHttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "WhisperBridgeHttpError";
    this.status = status;
  }
}

class WhisperBridgeAuthError extends Error {
  readonly code = "ASR_AUTH_REQUIRED";

  constructor(message: string) {
    super(message);
    this.name = "WhisperBridgeAuthError";
  }
}

type WordToken = {
  raw: string;
  normalized: string;
};

type WhisperBridgeRecognizerOptions = {
  lang?: string;
  interim?: boolean;
  endpointingMs?: number;
  route?: string;
};

type AiActivityPhase = "off" | "ready" | "transcribing" | "error";

type AiActivityPayload = {
  active: boolean;
  provider: string;
  engine: string;
  phase: AiActivityPhase;
  source: string;
  timestamp: number;
  model?: string | null;
  message?: string;
  requestsInFlight: number;
  queueDepth: number;
};

const DEFAULT_ROUTE = "/api/anvil/asr/whisper";
const DEFAULT_SEGMENT_MS = 1800;
const MAX_WINDOW_WORDS = 56;
const MAX_PROMPT_CHARS = 1200;
const MAX_PROMPT_LOOKAHEAD = 6;
const MAX_PROMPT_LOOKBEHIND = 1;
const MAX_OVERLAP_WORDS = 12;
const RESET_WINDOW_IDLE_MS = 4000;
const SOURCE = "openai-whisper-bridge";
const MIN_CHUNK_SIZE_BYTES = 2048;

function isDevAuthLoggingEnabled(): boolean {
  try {
    const host = String(window.location.hostname || "").toLowerCase();
    if (host === "localhost" || host === "127.0.0.1") return true;
    return (window as any).__tpDebugAsrAuth === true;
  } catch {
    return false;
  }
}

function logWhisperAuthAttachment(attached: boolean, reason?: string): void {
  if (!isDevAuthLoggingEnabled()) return;
  try {
    const suffix = reason ? ` (${reason})` : "";
    console.debug(`[whisper-bridge] auth header attached=${attached}${suffix}`);
  } catch {
    // ignore console failures
  }
}

function normalizeWhisperLanguage(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  const primary = trimmed.split("-")[0]?.trim() ?? "";
  if (!/^[a-z]{2,3}$/.test(primary)) return null;
  return primary;
}

function logWhisperLanguageNormalization(raw: unknown, normalized: string | null): void {
  if (!isDevAuthLoggingEnabled()) return;
  try {
    const rawValue = typeof raw === "string" ? raw : String(raw ?? "");
    console.debug(
      `[whisper-bridge] language raw="${rawValue}" normalized="${normalized ?? ""}" omitted=${normalized ? "false" : "true"}`,
    );
  } catch {
    // ignore console failures
  }
}

function isDeterministicWhisperRequestError(error: unknown): boolean {
  if (!(error instanceof WhisperBridgeHttpError)) return false;
  if (error.status !== 400 && error.status !== 422) return false;

  const message = String(error.message || "").toLowerCase();
  if (!message) return false;

  if (
    (message.includes("language") && (message.includes("not recognized") || message.includes("invalid")))
    || message.includes("malformed request")
    || message.includes("invalid request")
    || message.includes("bad request config")
    || message.includes("request-shape")
  ) {
    return true;
  }

  if (message.includes("audio file") && (message.includes("corrupt") || message.includes("unsupported"))) {
    return true;
  }

  return false;
}

async function resolveWhisperAccessToken(): Promise<string> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      logWhisperAuthAttachment(false, "session_error");
      throw new WhisperBridgeAuthError("ASR_AUTH_REQUIRED: unable to resolve session.");
    }
    const token = String(data?.session?.access_token ?? "").trim();
    if (!token) {
      logWhisperAuthAttachment(false, "missing_token");
      throw new WhisperBridgeAuthError("ASR_AUTH_REQUIRED: missing active session token.");
    }
    logWhisperAuthAttachment(true);
    return token;
  } catch (error) {
    if (error instanceof WhisperBridgeAuthError) {
      throw error;
    }
    logWhisperAuthAttachment(false, "session_unavailable");
    throw new WhisperBridgeAuthError("ASR_AUTH_REQUIRED: session unavailable.");
  }
}

function dispatchAiActivity(detail: AiActivityPayload): void {
  try {
    (window as any).__tpAiActivity = detail;
  } catch {
    // ignore global snapshot failures
  }
  try {
    window.dispatchEvent(new CustomEvent("tp:ai:activity", { detail }));
  } catch {
    // ignore event dispatch failures
  }
}

function nowTs(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function chooseMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return undefined;
  }
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  for (const candidate of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(candidate)) return candidate;
    } catch {
      // ignore unsupported probes
    }
  }
  return undefined;
}

function extensionFromMimeType(mimeType: string | undefined): string {
  const normalized = String(mimeType || "").toLowerCase();
  if (normalized.includes("ogg")) return "ogg";
  if (normalized.includes("m4a")) return "m4a";
  if (normalized.includes("mp4")) return "mp4";
  return "webm";
}

function buildChunkFilename(seq: number, mimeType: string | undefined): string {
  const extension = extensionFromMimeType(mimeType);
  return `chunk-${seq}.${extension}`;
}

function splitWords(text: string): string[] {
  return String(text || "").trim().split(/\s+/).filter(Boolean);
}

function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/[^\p{L}\p{N}'’]+/gu, "");
}

function toWordTokens(text: string): WordToken[] {
  const words = splitWords(text);
  const out: WordToken[] = [];
  for (const raw of words) {
    const normalized = normalizeWord(raw);
    if (!normalized) continue;
    out.push({ raw, normalized });
  }
  return out;
}

function mergeTokenWindow(current: WordToken[], incoming: WordToken[]): WordToken[] {
  if (!incoming.length) return current;
  if (!current.length) return incoming.slice(-MAX_WINDOW_WORDS);

  const maxOverlap = Math.min(MAX_OVERLAP_WORDS, current.length, incoming.length);
  let overlap = 0;
  for (let size = maxOverlap; size >= 1; size -= 1) {
    let matches = true;
    for (let idx = 0; idx < size; idx += 1) {
      const currentToken = current[current.length - size + idx];
      const incomingToken = incoming[idx];
      if (!currentToken || !incomingToken || currentToken.normalized !== incomingToken.normalized) {
        matches = false;
        break;
      }
    }
    if (matches) {
      overlap = size;
      break;
    }
  }

  const merged = overlap >= incoming.length
    ? current.slice()
    : current.concat(incoming.slice(overlap));
  return merged.slice(-MAX_WINDOW_WORDS);
}

function tokensToText(tokens: WordToken[]): string {
  return tokens.map((token) => token.raw).join(" ").trim();
}

function readCurrentLineIndex(): number {
  const raw = Number((window as any).currentIndex ?? 0);
  return Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
}

function readLineText(host: ParentNode, lineIndex: number): string {
  const idx = Math.max(0, Math.floor(lineIndex));
  try {
    const line =
      host.querySelector<HTMLElement>(`.line[data-line="${idx}"]`) ||
      host.querySelector<HTMLElement>(`.line[data-line-idx="${idx}"]`) ||
      host.querySelector<HTMLElement>(`.line[data-i="${idx}"]`) ||
      host.querySelector<HTMLElement>(`.line[data-index="${idx}"]`);
    return String(line?.textContent || "").replace(/\s+/g, " ").trim();
  } catch {
    return "";
  }
}

function isPromptLineUsable(text: string): boolean {
  const trimmed = String(text || "").trim();
  if (!trimmed) return false;
  if (/^\s*\[[^\]]+\]\s*$/u.test(trimmed)) return false;
  return splitWords(trimmed).length >= 2;
}

function buildScriptPrompt(): string {
  try {
    const host = getScriptRoot() || getPrimaryScroller() || document;
    const currentIdx = readCurrentLineIndex();
    const lines: string[] = [];
    for (
      let idx = Math.max(0, currentIdx - MAX_PROMPT_LOOKBEHIND);
      idx <= currentIdx + MAX_PROMPT_LOOKAHEAD;
      idx += 1
    ) {
      const text = readLineText(host, idx);
      if (!isPromptLineUsable(text)) continue;
      lines.push(text);
    }
    const prompt = lines.join("\n").trim();
    if (!prompt) return "";
    return prompt.length > MAX_PROMPT_CHARS ? prompt.slice(0, MAX_PROMPT_CHARS) : prompt;
  } catch {
    return "";
  }
}

function readResponseError(payload: WhisperBridgeResponse, status: number): string {
  const fromPayload = typeof payload.error === "string" ? payload.error.trim() : "";
  return fromPayload || `Whisper bridge failed (${status})`;
}

class WhisperBridgeRecognizer {
  private readonly listeners = new Map<WhisperBridgeEvent, Set<WhisperBridgeListener>>();
  private readonly route: string;
  private readonly lang: string;
  private readonly interim: boolean;
  private readonly segmentMs: number;
  private queue: Array<{ blob: Blob; seq: number; durationMs?: number }> = [];
  private queueRunning = false;
  private running = false;
  private recorder: MediaRecorder | null = null;
  private recorderStream: MediaStream | null = null;
  private recorderMimeType: string | undefined = undefined;
  private lastChunkTimecode: number | null = null;
  private transcriptWindow: WordToken[] = [];
  private lastTranscriptAt = 0;
  private lastPartialText = "";
  private lastFinalText = "";
  private lastModel: string | null = null;
  private lastAiError: string | null = null;
  private requestsInFlight = 0;
  private lastAiSnapshotKey = "";
  private seq = 0;
  private unauthorized = false;
  private requestInvalid = false;

  constructor(options: WhisperBridgeRecognizerOptions = {}) {
    this.route = options.route || DEFAULT_ROUTE;
    this.lang = options.lang || "en-US";
    this.interim = options.interim !== false;
    const endpointingMs = Number(options.endpointingMs);
    this.segmentMs = Number.isFinite(endpointingMs)
      ? Math.max(1200, Math.min(2600, Math.round(endpointingMs + 1100)))
      : DEFAULT_SEGMENT_MS;
  }

  on(event: WhisperBridgeEvent, listener: WhisperBridgeListener): () => void {
    const listeners = this.listeners.get(event) || new Set<WhisperBridgeListener>();
    listeners.add(listener);
    this.listeners.set(event, listeners);
    return () => listeners.delete(listener);
  }

  private emit(event: WhisperBridgeEvent, payload?: unknown): void {
    const listeners = this.listeners.get(event);
    if (!listeners || listeners.size === 0) return;
    for (const listener of listeners) {
      try {
        listener(payload);
      } catch {
        // listener failures are non-fatal
      }
    }
  }

  private syncAiActivity(): void {
    const queueDepth = this.queue.length;
    const requestsInFlight = this.requestsInFlight;
    let phase: AiActivityPhase = "off";
    if (requestsInFlight > 0 || queueDepth > 0) {
      phase = "transcribing";
    } else if (this.running) {
      phase = this.lastAiError ? "error" : "ready";
    }

    const detail: AiActivityPayload = {
      active: phase !== "off",
      provider: "openai",
      engine: "whisper",
      phase,
      source: SOURCE,
      timestamp: nowTs(),
      model: this.lastModel,
      message: phase === "error" ? this.lastAiError || undefined : undefined,
      requestsInFlight,
      queueDepth,
    };
    const key = JSON.stringify([
      detail.phase,
      detail.active,
      detail.model || "",
      detail.message || "",
      detail.requestsInFlight,
      detail.queueDepth,
    ]);
    if (key === this.lastAiSnapshotKey) return;
    this.lastAiSnapshotKey = key;
    dispatchAiActivity(detail);
  }

  async start(): Promise<void> {
    if (this.running) return;
    if (typeof MediaRecorder === "undefined") {
      throw new Error("MediaRecorder not available");
    }
    if (typeof (window as any).__tpMic?.requestMic !== "function") {
      throw new Error("Microphone API not available");
    }

    const stream = await (window as any).__tpMic.requestMic();
    const audioTracks = stream.getAudioTracks();
    if (!audioTracks.length) {
      throw new Error("No audio track available");
    }

    this.recorderStream = new MediaStream(audioTracks.map((track: MediaStreamTrack) => track.clone()));
    const mimeType = chooseMimeType();
    this.recorderMimeType = mimeType;
    this.lastChunkTimecode = null;
    this.recorder = mimeType
      ? new MediaRecorder(this.recorderStream, { mimeType })
      : new MediaRecorder(this.recorderStream);

    this.recorder.ondataavailable = (event: BlobEvent) => {
      if (this.unauthorized || this.requestInvalid) return;
      const blob = event.data;
      const nextSeq = this.seq + 1;
      let chunkDurationMs: number | undefined;
      const timecode = Number(event.timecode);
      if (Number.isFinite(timecode)) {
        if (typeof this.lastChunkTimecode === "number" && Number.isFinite(this.lastChunkTimecode)) {
          const delta = timecode - this.lastChunkTimecode;
          if (Number.isFinite(delta) && delta >= 0) {
            chunkDurationMs = delta;
          }
        }
        this.lastChunkTimecode = timecode;
      }
      const skipReason = this.getChunkSkipReason(blob);
      if (skipReason) {
        this.logChunkSkip(blob, {
          seq: nextSeq,
          durationMs: chunkDurationMs,
          reason: skipReason,
        });
        return;
      }
      this.seq = nextSeq;
      this.queue.push({ blob, seq: this.seq, durationMs: chunkDurationMs });
      this.syncAiActivity();
      void this.flushQueue();
    };
    this.recorder.onerror = (event: Event) => {
      const error = (event as Event & { error?: { message?: string } }).error;
      const message = error?.message || "Whisper recorder error";
      this.lastAiError = message;
      this.syncAiActivity();
      this.emit("error", { source: SOURCE, message, timestamp: nowTs() });
    };
    this.recorder.onstop = () => {
      this.cleanupRecorder();
      this.syncAiActivity();
      this.emit("end", { source: SOURCE, timestamp: nowTs() });
    };

    this.transcriptWindow = [];
    this.lastTranscriptAt = 0;
    this.lastPartialText = "";
    this.lastFinalText = "";
    this.lastModel = null;
    this.lastAiError = null;
    this.requestsInFlight = 0;
    this.lastAiSnapshotKey = "";
    this.unauthorized = false;
    this.requestInvalid = false;
    this.running = true;
    this.recorder.start(this.segmentMs);
    this.syncAiActivity();
    this.emit("start", { source: SOURCE, timestamp: nowTs() });
  }

  stop(): void {
    if (!this.recorder && !this.running) return;
    this.running = false;
    this.syncAiActivity();
    try { this.recorder?.requestData(); } catch {}
    try {
      if (this.recorder && this.recorder.state !== "inactive") {
        this.recorder.stop();
      } else {
        this.cleanupRecorder();
        this.syncAiActivity();
        this.emit("end", { source: SOURCE, timestamp: nowTs() });
      }
    } catch {
      this.cleanupRecorder();
      this.syncAiActivity();
      this.emit("end", { source: SOURCE, timestamp: nowTs() });
    }
  }

  abort(): void {
    this.stop();
  }

  private cleanupRecorder(): void {
    const stream = this.recorderStream;
    this.recorder = null;
    this.recorderStream = null;
    try {
      stream?.getTracks().forEach((track: MediaStreamTrack) => track.stop());
    } catch {
      // ignore recorder track cleanup failures
    }
  }

  private async flushQueue(): Promise<void> {
    if (this.queueRunning) return;
    this.queueRunning = true;
    try {
      while (this.queue.length > 0) {
        const next = this.queue.shift();
        if (!next) continue;
        this.requestsInFlight += 1;
        this.syncAiActivity();
        try {
          const payload = await this.transcribe(next.blob, next.seq, next.durationMs);
          this.lastModel = payload.model ?? this.lastModel;
          this.lastAiError = null;
          this.handleTranscript(payload);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Whisper bridge error";
          this.lastAiError = message;
          if (
            (error instanceof WhisperBridgeHttpError && error.status === 401)
            || error instanceof WhisperBridgeAuthError
          ) {
            this.unauthorized = true;
            this.queue = [];
            this.stop();
          } else if (isDeterministicWhisperRequestError(error)) {
            this.requestInvalid = true;
            this.queue = [];
            this.stop();
          }
          this.emit("error", {
            source: SOURCE,
            message,
            timestamp: nowTs(),
          });
        } finally {
          this.requestsInFlight = Math.max(0, this.requestsInFlight - 1);
          this.syncAiActivity();
        }
      }
    } finally {
      this.queueRunning = false;
      this.syncAiActivity();
    }
  }

  private getChunkSkipReason(blob: Blob | null): string | null {
    if (!blob) return "empty";
    if (blob.size <= 0) return "empty";
    if (blob.size < MIN_CHUNK_SIZE_BYTES) {
      return `too-small (${blob.size} < ${MIN_CHUNK_SIZE_BYTES})`;
    }
    return null;
  }

  private logChunkSkip(
    blob: Blob | null,
    info: { seq: number; durationMs?: number; reason: string },
  ): void {
    if (!shouldLogLevel(2)) return;
    try {
      console.debug("[whisper-bridge] skip chunk", {
        seq: info.seq,
        filename: buildChunkFilename(info.seq, blob?.type || this.recorderMimeType),
        size: blob?.size ?? 0,
        type: blob?.type || "unknown",
        durationMs: info.durationMs,
        overrideMimeType: this.recorderMimeType || null,
        reason: info.reason,
        language: this.lang,
      });
    } catch {
      // ignore logging failures
    }
  }

  private logChunkUpload(
    blob: Blob,
    info: {
      seq: number;
      filename: string;
      normalizedLanguage: string | null;
      durationMs?: number;
      mimeType: string | undefined;
    },
  ): void {
    if (!shouldLogLevel(2)) return;
    try {
      console.info("[whisper-bridge] send chunk", {
        seq: info.seq,
        filename: info.filename,
        size: blob.size,
        type: blob.type || "unknown",
        mimeType: info.mimeType || null,
        overrideMimeType: this.recorderMimeType || null,
        durationMs: info.durationMs,
        languageSent: info.normalizedLanguage ?? "auto",
        languageRequested: this.lang,
      });
    } catch {
      // ignore logging failures
    }
  }

  private async transcribe(blob: Blob, seq: number, durationMs?: number): Promise<WhisperBridgeResponse> {
    const accessToken = await resolveWhisperAccessToken();

    const form = new FormData();
    const mimeType = blob.type || this.recorderMimeType || chooseMimeType();
    const filename = buildChunkFilename(seq, mimeType);
    form.set("file", blob, filename);
    const normalizedLanguage = normalizeWhisperLanguage(this.lang);
    logWhisperLanguageNormalization(this.lang, normalizedLanguage);
    if (normalizedLanguage) {
      form.set("language", normalizedLanguage);
    }
    const prompt = buildScriptPrompt();
    if (prompt) {
      form.set("prompt", prompt);
    }

    this.logChunkUpload(blob, {
      seq,
      filename,
      normalizedLanguage,
      durationMs,
      mimeType,
    });

    const response = await fetch(this.route, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: form,
      cache: "no-store",
      credentials: "same-origin",
    });

    const payload = (await response.json()) as WhisperBridgeResponse;
    if (!response.ok || payload.ok === false) {
      throw new WhisperBridgeHttpError(response.status, readResponseError(payload, response.status));
    }
    return payload;
  }

  private handleTranscript(payload: WhisperBridgeResponse): void {
    const text = typeof payload.text === "string" ? payload.text.trim() : "";
    if (!text) return;

    const now = nowTs();
    const incomingTokens = toWordTokens(text);
    if (!incomingTokens.length) return;

    if (this.lastTranscriptAt > 0 && now - this.lastTranscriptAt > RESET_WINDOW_IDLE_MS) {
      this.transcriptWindow = [];
    }
    this.lastTranscriptAt = now;
    this.transcriptWindow = mergeTokenWindow(this.transcriptWindow, incomingTokens);
    const assembledText = tokensToText(this.transcriptWindow);
    if (!assembledText) return;

    const basePayload: WhisperBridgePayload = {
      text: assembledText,
      final: false,
      isFinal: false,
      timestamp: now,
      source: SOURCE,
      model: payload.model ?? null,
      providerRequestId: payload.provider_request_id ?? null,
    };

    if (this.interim && assembledText !== this.lastPartialText) {
      this.lastPartialText = assembledText;
      this.emit("partial", basePayload);
    }

    if (assembledText !== this.lastFinalText) {
      this.lastFinalText = assembledText;
      this.emit("final", {
        ...basePayload,
        final: true,
        isFinal: true,
      });
    }
  }
}

export function createWhisperBridgeRecognizer(options: WhisperBridgeRecognizerOptions = {}) {
  return new WhisperBridgeRecognizer(options);
}
