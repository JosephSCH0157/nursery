import { getPrimaryScroller, getScriptRoot } from "../../scroll/scroller";

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
  if (normalized.includes("mp4") || normalized.includes("m4a")) return "m4a";
  return "webm";
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
  private queue: Array<{ blob: Blob; seq: number }> = [];
  private queueRunning = false;
  private running = false;
  private recorder: MediaRecorder | null = null;
  private recorderStream: MediaStream | null = null;
  private transcriptWindow: WordToken[] = [];
  private lastTranscriptAt = 0;
  private lastPartialText = "";
  private lastFinalText = "";
  private lastModel: string | null = null;
  private lastAiError: string | null = null;
  private requestsInFlight = 0;
  private lastAiSnapshotKey = "";
  private seq = 0;

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
    this.recorder = mimeType
      ? new MediaRecorder(this.recorderStream, { mimeType })
      : new MediaRecorder(this.recorderStream);

    this.recorder.ondataavailable = (event: BlobEvent) => {
      const blob = event.data;
      if (!blob || blob.size <= 0) return;
      this.queue.push({ blob, seq: ++this.seq });
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
          const payload = await this.transcribe(next.blob, next.seq);
          this.lastModel = payload.model ?? this.lastModel;
          this.lastAiError = null;
          this.handleTranscript(payload);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Whisper bridge error";
          this.lastAiError = message;
          if (error instanceof WhisperBridgeHttpError && error.status === 401) {
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

  private async transcribe(blob: Blob, seq: number): Promise<WhisperBridgeResponse> {
    const form = new FormData();
    const mimeType = blob.type || chooseMimeType();
    const extension = extensionFromMimeType(mimeType);
    form.set("file", blob, `chunk-${seq}.${extension}`);
    form.set("language", this.lang);
    const prompt = buildScriptPrompt();
    if (prompt) {
      form.set("prompt", prompt);
    }

    const response = await fetch(this.route, {
      method: "POST",
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
