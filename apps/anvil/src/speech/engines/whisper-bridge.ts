import { getPrimaryScroller, getScriptRoot } from "../../scroll/scroller";
import { supabase } from "../../forge/supabaseClient";
import { resolveForgeUserAccessToken } from "../../forge/tongs-user-auth";
import { shouldLogLevel } from "../../env/dev-log";
import { getActiveAsrProfile } from "../../asr/active-profile";

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
  calibrationProfileId?: string | null;
  calibrationVersion?: number | null;
};

type WhisperBridgeResponse = {
  ok?: boolean;
  text?: string;
  error?: string;
  code?: string;
  detail?: string;
  provider?: string;
  model_id?: string;
  asr_lane?: string | null;
  upstream_status?: number;
  upstream_message?: string | null;
  upstream_url?: string | null;
  model_url?: string | null;
  model?: string;
  provider_request_id?: string | null;
  ffmpeg_fallback_attempted?: boolean;
  ffmpeg_fallback_used?: boolean;
  ffmpeg_fallback_error?: string | null;
};

class WhisperBridgeHttpError extends Error {
  readonly status: number;
  readonly payload: WhisperBridgeResponse | null;

  constructor(status: number, message: string, payload: WhisperBridgeResponse | null = null) {
    super(message);
    this.name = "WhisperBridgeHttpError";
    this.status = status;
    this.payload = payload;
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
  asrLane?: string;
  modelHint?: string;
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
const DEFAULT_SEGMENT_MS = 1000;
const MAX_WINDOW_WORDS = 56;
const MAX_PROMPT_CHARS = 1200;
const MAX_PROMPT_LOOKAHEAD = 6;
const MAX_PROMPT_LOOKBEHIND = 1;
const MAX_OVERLAP_WORDS = 12;
const RESET_WINDOW_IDLE_MS = 4000;
const SOURCE = "openai-whisper-bridge";
const MIN_CHUNK_SIZE_BYTES = 2048;
const MAX_CONSECUTIVE_UNSUPPORTED_AUDIO_ERRORS = 3;

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

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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
  if (error.status !== 400 && error.status !== 413 && error.status !== 422) return false;

  const message = String(error.message || "").toLowerCase();
  if (!message) return false;

  if (
    message.includes("multipart/form-data body required")
    || message.includes("file field is required")
    || message.includes("audio chunk is empty")
    || message.includes("audio chunk exceeds 25mb limit")
    || message.includes("invalid file format")
    || message.includes("supported formats")
    || message.includes("unsupported media type")
  ) {
    return true;
  }

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

function isUnsupportedAudioError(error: unknown): boolean {
  if (!(error instanceof WhisperBridgeHttpError)) return false;
  const message = String(error.message || "").toLowerCase();
  if (!message) return false;
  return (
    (message.includes("audio file") && (message.includes("corrupt") || message.includes("unsupported")))
    || message.includes("invalid file format")
    || message.includes("supported formats")
    || message.includes("unsupported media type")
  );
}

async function resolveWhisperAccessToken(): Promise<string> {
  try {
    const forgeToken = await resolveForgeUserAccessToken();
    if (forgeToken) {
      logWhisperAuthAttachment(true, "forge_resolver");
      return forgeToken;
    }
  } catch {
    // continue to additional fallbacks
  }

  try {
    const w = window as any;
    const fromWindow = readNonEmptyString(w.__forgeTongsApiToken ?? w.__tpTongsApiToken);
    if (fromWindow) {
      logWhisperAuthAttachment(true, "window_token");
      return fromWindow;
    }
  } catch {
    // continue to Supabase session fallback
  }

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
  const fromUpstream = typeof payload.upstream_message === "string" ? payload.upstream_message.trim() : "";
  const fromPayload = typeof payload.error === "string" ? payload.error.trim() : "";
  return fromUpstream || fromPayload || `Whisper bridge failed (${status})`;
}

class WhisperBridgeRecognizer {
  private readonly listeners = new Map<WhisperBridgeEvent, Set<WhisperBridgeListener>>();
  private readonly route: string;
  private readonly lang: string;
  private readonly interim: boolean;
  private readonly segmentMs: number;
  private readonly asrLane: string;
  private readonly modelHint: string | null;
  private queue: Array<{ blob: Blob; seq: number; durationMs?: number }> = [];
  private queueRunning = false;
  private running = false;
  private recorder: MediaRecorder | null = null;
  private recorderStream: MediaStream | null = null;
  private recorderMimeType: string | undefined = undefined;
  private segmentTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  private pendingRecorderStop: "rotate" | "final" | null = null;
  private endEmitted = false;
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
  private generation = 0;
  private unauthorized = false;
  private requestInvalid = false;
  private consecutiveUnsupportedAudioErrors = 0;
  private deterministicLatchLogged = false;
  private readonly inFlightTranscriptionControllers = new Set<AbortController>();
  private firstAudioChunkLogged = false;
  private firstTranscriptPacketLogged = false;

  constructor(options: WhisperBridgeRecognizerOptions = {}) {
    this.route = options.route || DEFAULT_ROUTE;
    this.lang = options.lang || "en-US";
    this.interim = options.interim !== false;
    const endpointingMs = Number(options.endpointingMs);
    this.segmentMs = Number.isFinite(endpointingMs)
      ? Math.max(700, Math.min(1800, Math.round(endpointingMs + 500)))
      : DEFAULT_SEGMENT_MS;
    this.asrLane = String(options.asrLane || 'ASR1_CURRENT').trim() || 'ASR1_CURRENT';
    this.modelHint = readNonEmptyString(options.modelHint);
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

  private readRunMeta(): { runKey: string | null; runGeneration: number | null; elapsedSinceLiveStartMs: number | null } {
    try {
      const win = window as any;
      const runKeyRaw = String(win.__tpAsrRunKey || win.__tpAsrRuntimeStatus?.runKey || "").trim();
      const runGenerationRaw = Number(win.__tpAsrRunGeneration ?? win.__tpAsrRuntimeStatus?.runGeneration);
      const startedAtRaw = Number(win.__tpAsrRunStartedAt);
      const now = Date.now();
      const elapsed = Number.isFinite(startedAtRaw) && startedAtRaw > 0 ? Math.max(0, now - startedAtRaw) : null;
      return {
        runKey: runKeyRaw || null,
        runGeneration: Number.isFinite(runGenerationRaw) ? Math.max(0, Math.floor(runGenerationRaw)) : null,
        elapsedSinceLiveStartMs: elapsed,
      };
    } catch {
      return { runKey: null, runGeneration: null, elapsedSinceLiveStartMs: null };
    }
  }

  private describeAudioTracks(stream: MediaStream): Array<{
    id: string | null;
    label: string | null;
    readyState: string | null;
    enabled: boolean | null;
    muted: boolean | null;
  }> {
    try {
      return stream.getAudioTracks().map((track) => {
        const row = track as MediaStreamTrack & { muted?: boolean };
        return {
          id: typeof row.id === "string" ? row.id : null,
          label: typeof row.label === "string" ? row.label : null,
          readyState: typeof row.readyState === "string" ? row.readyState : null,
          enabled: typeof row.enabled === "boolean" ? row.enabled : null,
          muted: typeof row.muted === "boolean" ? row.muted : null,
        };
      });
    } catch {
      return [];
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

    const activeProfile = getActiveAsrProfile();
    const runtimePath = this.asrLane === 'ASR2' ? 'whisper-large-live' : 'whisper-bridge';
    {
      const runMeta = this.readRunMeta();
      try {
        console.info("[ASR_WHISPER_CAPTURE_START_REQUESTED]", {
          runKey: runMeta.runKey,
          runGeneration: runMeta.runGeneration,
          runtimePath,
          elapsedSinceLiveStartMs: runMeta.elapsedSinceLiveStartMs,
        });
      } catch {}
    }
    const stream = await (window as any).__tpMic.requestMic({
      source: "whisper-bridge",
      asrPath: runtimePath,
      profileId: activeProfile?.id || null,
      capture: activeProfile?.capture || null,
    });
    {
      const runMeta = this.readRunMeta();
      try {
        const audioTracks = stream.getAudioTracks();
        console.info("[ASR_WHISPER_CAPTURE_STREAM_READY]", {
          runKey: runMeta.runKey,
          runGeneration: runMeta.runGeneration,
          streamTrackCount: audioTracks.length,
          trackStates: this.describeAudioTracks(stream),
          elapsedSinceLiveStartMs: runMeta.elapsedSinceLiveStartMs,
        });
      } catch {}
    }
    try {
      const runtimeDetail = (window as any).__tpCalibrationRuntime;
      const state = String(runtimeDetail?.calibrationState || (activeProfile ? "partially_calibrated" : "bypassed"));
      const detail = {
        path: "whisper-bridge",
        runtimePath,
        profileId: activeProfile?.id || null,
        version: activeProfile?.version ?? null,
        state,
        runtime: runtimeDetail || null,
      };
      window.dispatchEvent(new CustomEvent("tp:asr:calibration-status", { detail }));
      console.info('[ASR_CALIBRATION_STATUS]', detail);
    } catch {
      // diagnostics are best-effort
    }
    const audioTracks = stream.getAudioTracks();
    if (!audioTracks.length) {
      throw new Error("No audio track available");
    }

    this.recorderStream = new MediaStream(audioTracks.map((track: MediaStreamTrack) => track.clone()));
    const mimeType = chooseMimeType();
    this.recorderMimeType = mimeType;
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
    this.consecutiveUnsupportedAudioErrors = 0;
    this.deterministicLatchLogged = false;
    this.firstAudioChunkLogged = false;
    this.firstTranscriptPacketLogged = false;
    this.pendingRecorderStop = null;
    this.endEmitted = false;
    this.generation += 1;
    this.abortInFlightTranscriptions();
    this.running = true;
    this.startRecorderSegment();
    this.syncAiActivity();
    this.emit("start", { source: SOURCE, timestamp: nowTs() });
  }

  stop(): void {
    if (!this.recorder && !this.running) return;
    this.running = false;
    this.generation += 1;
    this.queue = [];
    this.pendingRecorderStop = "final";
    this.clearSegmentTimer();
    this.abortInFlightTranscriptions();
    this.syncAiActivity();
    try { this.recorder?.requestData(); } catch {}
    try {
      if (this.recorder && this.recorder.state !== "inactive") {
        this.recorder.stop();
      } else {
        this.finishRecorderSession();
      }
    } catch {
      this.finishRecorderSession();
    }
  }

  abort(): void {
    this.stop();
  }

  private abortInFlightTranscriptions(): void {
    if (this.inFlightTranscriptionControllers.size === 0) return;
    for (const controller of this.inFlightTranscriptionControllers) {
      try {
        controller.abort();
      } catch {
        // ignore abort errors
      }
    }
    this.inFlightTranscriptionControllers.clear();
  }

  private isAbortError(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;
    const named = (error as { name?: unknown }).name;
    if (typeof named === "string" && named.toLowerCase() === "aborterror") return true;
    const message = error instanceof Error ? error.message : String(error ?? "");
    return /aborted?/i.test(message);
  }

  private readLiveArmedState(): {
    known: boolean;
    liveArmed: boolean;
    phase: string | null;
    armed: boolean | null;
  } {
    try {
      const store = (window as any).__tpStore;
      if (store && typeof store.get === "function") {
        const phaseRaw = String(store.get("session.phase") || "").trim().toLowerCase();
        const armed = !!store.get("session.asrArmed");
        const liveArmed = phaseRaw === "live" && armed;
        return {
          known: phaseRaw.length > 0,
          liveArmed,
          phase: phaseRaw || null,
          armed,
        };
      }
    } catch {
      // ignore lookup failures
    }
    // If session SSOT is unavailable, keep legacy permissive behavior.
    return {
      known: false,
      liveArmed: true,
      phase: null,
      armed: null,
    };
  }

  private getStaleDropReason(requestGeneration: number): string | null {
    if (requestGeneration !== this.generation) return "generation-mismatch";
    if (!this.running) return "recognizer-stopped";
    const liveState = this.readLiveArmedState();
    if (liveState.known && !liveState.liveArmed) return "session-not-live-armed";
    return null;
  }

  private logStaleResponseDropped(info: {
    seq: number;
    reason: string;
    requestGeneration: number;
    currentGeneration: number;
  }): void {
    if (!shouldLogLevel(1)) return;
    const liveState = this.readLiveArmedState();
    try {
      console.warn("[whisper-bridge] whisper_stale_response_dropped", {
        seq: info.seq,
        reason: info.reason,
        requestGeneration: info.requestGeneration,
        currentGeneration: info.currentGeneration,
        running: this.running,
        phase: liveState.phase,
        asrArmed: liveState.armed,
      });
    } catch {
      // ignore logging failures
    }
  }

  private startRecorderSegment(): void {
    if (!this.running) return;
    if (!this.recorderStream) {
      throw new Error("Recorder stream not available");
    }

    // Rolling full recorder sessions keeps each upload as a standalone media file.
    this.lastChunkTimecode = null;
    const recorder = this.recorderMimeType
      ? new MediaRecorder(this.recorderStream, { mimeType: this.recorderMimeType })
      : new MediaRecorder(this.recorderStream);
    const timesliceMs = Math.max(700, this.segmentMs);
    {
      const runMeta = this.readRunMeta();
      try {
        console.info("[ASR_WHISPER_MEDIA_RECORDER_CREATED]", {
          runKey: runMeta.runKey,
          runGeneration: runMeta.runGeneration,
          mimeType: this.recorderMimeType || null,
          timesliceMs,
          streamTrackCount: this.recorderStream.getAudioTracks().length,
          trackStates: this.describeAudioTracks(this.recorderStream),
          elapsedSinceLiveStartMs: runMeta.elapsedSinceLiveStartMs,
        });
      } catch {}
    }
    this.recorder = recorder;
    this.pendingRecorderStop = null;

    recorder.ondataavailable = (event: BlobEvent) => {
      const blob = event.data;
      const runMeta = this.readRunMeta();
      try {
        console.info("[ASR_WHISPER_MEDIA_RECORDER_DATAAVAILABLE]", {
          runKey: runMeta.runKey,
          runGeneration: runMeta.runGeneration,
          blobSize: blob?.size ?? 0,
          blobType: blob?.type || "unknown",
          mimeType: this.recorderMimeType || null,
          timesliceMs,
          elapsedSinceLiveStartMs: runMeta.elapsedSinceLiveStartMs,
        });
      } catch {}
      const queueBefore = this.queue.length;
      const nextSeq = this.seq + 1;
      if (!this.running) {
        this.logChunkLifecycle("dropped", blob, {
          seq: nextSeq,
          queueDepthBefore: queueBefore,
          queueDepthAfter: queueBefore,
          reason: "stopped",
          requestInvalid: this.requestInvalid,
        });
        return;
      }
      if (this.unauthorized || this.requestInvalid) {
        this.logChunkLifecycle("dropped", blob, {
          seq: nextSeq,
          queueDepthBefore: queueBefore,
          queueDepthAfter: queueBefore,
          requestInvalid: this.requestInvalid,
          reason: this.requestInvalid ? "requestInvalid" : "unauthorized",
        });
        return;
      }
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
        this.logChunkLifecycle("skipped", blob, {
          seq: nextSeq,
          queueDepthBefore: queueBefore,
          queueDepthAfter: queueBefore,
          durationMs: chunkDurationMs,
          reason: skipReason,
          requestInvalid: this.requestInvalid,
        });
        return;
      }
      this.seq = nextSeq;
      this.queue.push({ blob, seq: this.seq, durationMs: chunkDurationMs });
      const queueAfter = this.queue.length;
      const enqueueTs = Date.now();
      const runMetaForQueue = this.readRunMeta();
      if (!this.firstAudioChunkLogged) {
        this.firstAudioChunkLogged = true;
        try {
          console.info("[ASR_FIRST_AUDIO_CHUNK]", {
            runKey: runMetaForQueue.runKey,
            runGeneration: runMetaForQueue.runGeneration,
            seq: this.seq,
            blobSize: blob.size,
            blobType: blob.type || "unknown",
            queueDepthAfter: queueAfter,
            elapsedSinceLiveStartMs: runMetaForQueue.elapsedSinceLiveStartMs,
          });
        } catch {
          // diagnostics are best-effort
        }
      }
      try {
        console.info("[ASR_WHISPER_QUEUE_ENQUEUED]", {
          runKey: runMetaForQueue.runKey,
          runGeneration: runMetaForQueue.runGeneration,
          seq: this.seq,
          blobSize: blob.size,
          blobType: blob.type || "unknown",
          queueDepthBefore: queueBefore,
          queueDepthAfter: queueAfter,
          elapsedSinceLiveStartMs: runMetaForQueue.elapsedSinceLiveStartMs,
        });
      } catch {
        // diagnostics are best-effort
      }
      try {
        window.dispatchEvent(new CustomEvent("tp:asr:audio-chunk", {
          detail: {
            ts: enqueueTs,
            chunkEnqueueTs: enqueueTs,
            runKey: runMetaForQueue.runKey,
            runGeneration: runMetaForQueue.runGeneration,
            seq: this.seq,
            blobSize: blob.size,
            blobType: blob.type || "unknown",
          },
        }));
      } catch {
        // diagnostics are best-effort
      }
      this.logChunkLifecycle("queued", blob, {
        seq: this.seq,
        queueDepthBefore: queueBefore,
        queueDepthAfter: queueAfter,
        durationMs: chunkDurationMs,
        requestInvalid: this.requestInvalid,
      });
      this.syncAiActivity();
      void this.flushQueue();
    };
    recorder.onerror = (event: Event) => {
      const error = (event as Event & { error?: { message?: string } }).error;
      const message = error?.message || "Whisper recorder error";
      const runMeta = this.readRunMeta();
      try {
        console.warn("[ASR_WHISPER_MEDIA_RECORDER_ERROR]", {
          runKey: runMeta.runKey,
          runGeneration: runMeta.runGeneration,
          message,
          mimeType: this.recorderMimeType || null,
          timesliceMs,
          elapsedSinceLiveStartMs: runMeta.elapsedSinceLiveStartMs,
        });
      } catch {}
      this.lastAiError = message;
      this.syncAiActivity();
      this.emit("error", { source: SOURCE, message, timestamp: nowTs() });
    };
    recorder.onstop = () => {
      const runMeta = this.readRunMeta();
      try {
        console.info("[ASR_WHISPER_MEDIA_RECORDER_STOPPED]", {
          runKey: runMeta.runKey,
          runGeneration: runMeta.runGeneration,
          mimeType: this.recorderMimeType || null,
          timesliceMs,
          elapsedSinceLiveStartMs: runMeta.elapsedSinceLiveStartMs,
        });
      } catch {}
      this.handleRecorderStop(recorder);
    };

    try {
      recorder.start(timesliceMs);
      const runMeta = this.readRunMeta();
      try {
        console.info("[ASR_WHISPER_MEDIA_RECORDER_STARTED]", {
          runKey: runMeta.runKey,
          runGeneration: runMeta.runGeneration,
          mimeType: this.recorderMimeType || null,
          timesliceMs,
          elapsedSinceLiveStartMs: runMeta.elapsedSinceLiveStartMs,
        });
      } catch {}
    } catch {
      recorder.start();
      const runMeta = this.readRunMeta();
      try {
        console.info("[ASR_WHISPER_MEDIA_RECORDER_STARTED]", {
          runKey: runMeta.runKey,
          runGeneration: runMeta.runGeneration,
          mimeType: this.recorderMimeType || null,
          timesliceMs: 0,
          fallbackNoTimeslice: true,
          elapsedSinceLiveStartMs: runMeta.elapsedSinceLiveStartMs,
        });
      } catch {}
    }
    this.armSegmentTimer();
  }

  private armSegmentTimer(): void {
    this.clearSegmentTimer();
    if (!this.running) return;
    this.segmentTimer = globalThis.setTimeout(() => {
      this.rotateRecorderSegment();
    }, this.segmentMs);
  }

  private clearSegmentTimer(): void {
    if (this.segmentTimer == null) return;
    globalThis.clearTimeout(this.segmentTimer);
    this.segmentTimer = null;
  }

  private rotateRecorderSegment(): void {
    const recorder = this.recorder;
    if (!this.running || !recorder) return;
    if (recorder.state === "inactive") return;
    this.pendingRecorderStop = "rotate";
    this.clearSegmentTimer();
    try {
      recorder.stop();
    } catch {
      this.pendingRecorderStop = null;
      this.finishRecorderSession();
      this.emit("error", {
        source: SOURCE,
        message: "Whisper recorder failed to roll to the next segment.",
        timestamp: nowTs(),
      });
    }
  }

  private handleRecorderStop(recorder: MediaRecorder): void {
    if (this.recorder === recorder) {
      this.recorder = null;
    }
    this.clearSegmentTimer();
    const stopMode = this.pendingRecorderStop;
    this.pendingRecorderStop = null;

    if (stopMode === "rotate" && this.running && !this.unauthorized && !this.requestInvalid) {
      try {
        this.startRecorderSegment();
        this.syncAiActivity();
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Whisper recorder restart failed";
        this.lastAiError = message;
        this.emit("error", { source: SOURCE, message, timestamp: nowTs() });
      }
    }

    this.finishRecorderSession();
  }

  private finishRecorderSession(): void {
    this.clearSegmentTimer();
    this.pendingRecorderStop = null;
    this.recorder = null;
    this.running = false;
    this.cleanupRecorderStream();
    this.syncAiActivity();
    if (!this.endEmitted) {
      this.endEmitted = true;
      this.emit("end", { source: SOURCE, timestamp: nowTs() });
    }
  }

  private cleanupRecorderStream(): void {
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
      if (this.requestInvalid) return;
      while (this.queue.length > 0) {
        if (this.requestInvalid) break;
        const queueDepthBefore = this.queue.length;
        const next = this.queue.shift();
        if (!next) continue;
        const queueDepthAfter = this.queue.length;
        this.requestsInFlight += 1;
        this.syncAiActivity();
        const requestGeneration = this.generation;
        try {
          const payload = await this.transcribe(
            next.blob,
            next.seq,
            requestGeneration,
            next.durationMs,
            queueDepthBefore,
            queueDepthAfter,
          );
          const staleDropReason = this.getStaleDropReason(requestGeneration);
          if (staleDropReason) {
            const runMeta = this.readRunMeta();
            try {
              console.warn("[ASR_WHISPER_RESPONSE_DROPPED]", {
                runKey: runMeta.runKey,
                runGeneration: runMeta.runGeneration,
                seq: next.seq,
                reason: staleDropReason,
                dropPhase: "post-response",
                elapsedSinceLiveStartMs: runMeta.elapsedSinceLiveStartMs,
              });
            } catch {}
            this.logStaleResponseDropped({
              seq: next.seq,
              reason: staleDropReason,
              requestGeneration,
              currentGeneration: this.generation,
            });
            continue;
          }
          this.lastModel = payload.model ?? this.lastModel;
          this.lastAiError = null;
          this.consecutiveUnsupportedAudioErrors = 0;
          this.logRecoveredChunkViaServerFallback(payload, next.seq);
          this.handleTranscript(payload);
        } catch (error) {
          const staleDropReason = this.getStaleDropReason(requestGeneration);
          if (staleDropReason || this.isAbortError(error)) {
            const runMeta = this.readRunMeta();
            try {
              console.warn("[ASR_WHISPER_RESPONSE_DROPPED]", {
                runKey: runMeta.runKey,
                runGeneration: runMeta.runGeneration,
                seq: next.seq,
                reason: staleDropReason ?? "request-aborted",
                dropPhase: "request-error",
                elapsedSinceLiveStartMs: runMeta.elapsedSinceLiveStartMs,
              });
            } catch {}
            this.logStaleResponseDropped({
              seq: next.seq,
              reason: staleDropReason ?? "request-aborted",
              requestGeneration,
              currentGeneration: this.generation,
            });
            continue;
          }
          let message = error instanceof Error ? error.message : "Whisper bridge error";
          this.lastAiError = message;
          if (
            (error instanceof WhisperBridgeHttpError && error.status === 401)
            || error instanceof WhisperBridgeAuthError
          ) {
            this.unauthorized = true;
            this.queue = [];
            this.stop();
          } else if (isDeterministicWhisperRequestError(error)) {
            const queueDepthAtLatch = this.queue.length;
            const classification = isUnsupportedAudioError(error) ? "unsupported-audio" : "invalid-request";
            if (classification === "unsupported-audio") {
              this.consecutiveUnsupportedAudioErrors += 1;
              const shouldStop = this.consecutiveUnsupportedAudioErrors >= MAX_CONSECUTIVE_UNSUPPORTED_AUDIO_ERRORS;
              if (shouldStop) {
                this.logDeterministicLatch(error, {
                  classification,
                  queueDepth: queueDepthAtLatch,
                  requestsInFlight: this.requestsInFlight,
                  queueCleared: queueDepthAtLatch > 0,
                });
                this.requestInvalid = true;
                this.queue = [];
                this.stop();
                message = "ASR recorder format is not supported by the current transcription path after repeated chunk failures.";
                this.lastAiError = message;
              } else {
                this.logUnsupportedAudioDrop(error, {
                  blob: next.blob,
                  seq: next.seq,
                  durationMs: next.durationMs,
                  queueDepthBefore,
                  queueDepthAfter: this.queue.length,
                  consecutiveFailures: this.consecutiveUnsupportedAudioErrors,
                });
                message = `ASR chunk dropped: unsupported audio; continuing session (${this.consecutiveUnsupportedAudioErrors}/${MAX_CONSECUTIVE_UNSUPPORTED_AUDIO_ERRORS}).`;
                this.lastAiError = message;
              }
            } else {
              this.logDeterministicLatch(error, {
                classification,
                queueDepth: queueDepthAtLatch,
                requestsInFlight: this.requestsInFlight,
                queueCleared: queueDepthAtLatch > 0,
              });
              this.requestInvalid = true;
              this.queue = [];
              this.stop();
            }
          }
          const upstreamPayload = error instanceof WhisperBridgeHttpError ? error.payload : null;
          this.emit("error", {
            source: SOURCE,
            message,
            timestamp: nowTs(),
            code: upstreamPayload?.code ?? null,
            provider: upstreamPayload?.provider ?? null,
            modelId: upstreamPayload?.model_id ?? null,
            asrLane: upstreamPayload?.asr_lane ?? null,
            upstreamStatus: upstreamPayload?.upstream_status ?? (error instanceof WhisperBridgeHttpError ? error.status : null),
            upstreamMessage: upstreamPayload?.upstream_message ?? null,
            upstreamUrl: upstreamPayload?.upstream_url ?? null,
            modelUrl: upstreamPayload?.model_url ?? null,
            detail: upstreamPayload?.detail ?? null,
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

  private logChunkLifecycle(
    action: "skipped" | "queued" | "sent" | "dropped",
    blob: Blob | null,
    info: {
      seq: number;
      queueDepthBefore?: number;
      queueDepthAfter?: number;
      durationMs?: number;
      mimeType?: string | undefined;
      normalizedLanguage?: string | null;
      reason?: string;
      requestInvalid: boolean;
    },
  ): void {
    if (!shouldLogLevel(2)) return;
    try {
      const payload = {
        action,
        seq: info.seq,
        filename: buildChunkFilename(info.seq, blob?.type || this.recorderMimeType),
        size: blob?.size ?? 0,
        blobType: blob?.type || "unknown",
        mimeType: info.mimeType ?? blob?.type ?? null,
        recorderMimeType: this.recorderMimeType || null,
        queueDepthBefore: info.queueDepthBefore,
        queueDepthAfter: info.queueDepthAfter,
        durationMs: info.durationMs,
        normalizedLanguage: info.normalizedLanguage ?? null,
        languageRequested: this.lang,
        requestInvalid: info.requestInvalid,
        reason: info.reason ?? null,
      };
      const logFn = action === "sent" ? console.info : console.debug;
      logFn("[whisper-bridge] chunk", payload);
    } catch {
      // ignore logging failures
    }
  }

  private logDeterministicLatch(
    error: unknown,
    info: {
      classification: string;
      queueDepth: number;
      requestsInFlight: number;
      queueCleared: boolean;
    },
  ): void {
    if (this.deterministicLatchLogged) return;
    this.deterministicLatchLogged = true;
    if (!shouldLogLevel(1)) return;
    try {
      const message = error instanceof Error ? error.message : String(error ?? "");
      console.warn("[whisper-bridge] deterministic request stop", {
        classification: info.classification,
        queueDepth: info.queueDepth,
        requestsInFlight: info.requestsInFlight,
        queueCleared: info.queueCleared,
        message: message || "",
      });
    } catch {
      // ignore logging failures
    }
  }

  private logUnsupportedAudioDrop(
    error: unknown,
    info: {
      blob: Blob;
      seq: number;
      durationMs?: number;
      queueDepthBefore: number;
      queueDepthAfter: number;
      consecutiveFailures: number;
    },
  ): void {
    this.logChunkLifecycle("dropped", info.blob, {
      seq: info.seq,
      queueDepthBefore: info.queueDepthBefore,
      queueDepthAfter: info.queueDepthAfter,
      durationMs: info.durationMs,
      reason: "unsupported-audio",
      requestInvalid: this.requestInvalid,
    });

    if (!shouldLogLevel(1)) return;

    const payload = error instanceof WhisperBridgeHttpError ? error.payload : null;
    const ffmpegFallbackAttempted = payload?.ffmpeg_fallback_attempted === true || payload?.ffmpeg_fallback_used === true;
    const ffmpegFallbackUsed = payload?.ffmpeg_fallback_used === true;
    const ffmpegFallbackError = typeof payload?.ffmpeg_fallback_error === "string"
      ? payload.ffmpeg_fallback_error
      : null;

    try {
      console.warn("[whisper-bridge] chunk dropped: unsupported-audio", {
        seq: info.seq,
        consecutiveFailures: info.consecutiveFailures,
        maxConsecutiveFailures: MAX_CONSECUTIVE_UNSUPPORTED_AUDIO_ERRORS,
        queueDepthBefore: info.queueDepthBefore,
        queueDepthAfter: info.queueDepthAfter,
        durationMs: info.durationMs,
        providerRequestId: payload?.provider_request_id ?? null,
        ffmpegFallbackAttempted,
        ffmpegFallbackUsed,
        ffmpegFallbackError,
        detail: payload?.detail ?? null,
      });
    } catch {
      // ignore logging failures
    }

    try {
      console.info("[whisper-bridge] continuing ASR session", {
        seq: info.seq,
        consecutiveFailures: info.consecutiveFailures,
        remainingBeforeLatch: Math.max(
          0,
          MAX_CONSECUTIVE_UNSUPPORTED_AUDIO_ERRORS - info.consecutiveFailures,
        ),
      });
    } catch {
      // ignore logging failures
    }
  }

  private logRecoveredChunkViaServerFallback(payload: WhisperBridgeResponse, seq: number): void {
    if (payload.ffmpeg_fallback_used !== true || !shouldLogLevel(1)) return;
    try {
      console.info("[whisper-bridge] server ffmpeg fallback recovered chunk", {
        seq,
        providerRequestId: payload.provider_request_id ?? null,
        model: payload.model ?? null,
      });
    } catch {
      // ignore logging failures
    }
  }

  private async transcribe(
    blob: Blob,
    seq: number,
    requestGeneration: number,
    durationMs?: number,
    queueDepthBefore?: number,
    queueDepthAfter?: number,
  ): Promise<WhisperBridgeResponse> {
    const accessToken = await resolveWhisperAccessToken();
    if (this.getStaleDropReason(requestGeneration)) {
      throw new Error("whisper_stale_response");
    }

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
    form.set("asr_lane", this.asrLane);
    if (this.modelHint) {
      form.set("model_hint", this.modelHint);
    }

    if (this.requestInvalid) {
      throw new Error("Whisper bridge suppressed due to previous invalid request");
    }

    this.logChunkLifecycle("sent", blob, {
      seq,
      queueDepthBefore,
      queueDepthAfter,
      durationMs,
      mimeType,
      normalizedLanguage,
      requestInvalid: this.requestInvalid,
    });
    {
      const runMeta = this.readRunMeta();
      try {
        console.info("[ASR_WHISPER_REQUEST_SENT]", {
          runKey: runMeta.runKey,
          runGeneration: runMeta.runGeneration,
          seq,
          blobSize: blob.size,
          blobType: blob.type || "unknown",
          mimeType,
          queueDepthBefore,
          queueDepthAfter,
          elapsedSinceLiveStartMs: runMeta.elapsedSinceLiveStartMs,
        });
      } catch {}
    }

    const abortController = new AbortController();
    this.inFlightTranscriptionControllers.add(abortController);
    if (this.getStaleDropReason(requestGeneration)) {
      try {
        abortController.abort();
      } catch {
        // ignore abort errors
      }
      this.inFlightTranscriptionControllers.delete(abortController);
      throw new Error("whisper_stale_response");
    }
    let response: Response;
    try {
      response = await fetch(this.route, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: form,
        cache: "no-store",
        credentials: "same-origin",
        signal: abortController.signal,
      });
    } finally {
      this.inFlightTranscriptionControllers.delete(abortController);
    }

    const rawText = await response.text();
    let payload: WhisperBridgeResponse = {};
    if (rawText.trim()) {
      try {
        payload = JSON.parse(rawText) as WhisperBridgeResponse;
      } catch {
        payload = {
          ok: response.ok,
          error: rawText.trim().slice(0, 400),
        };
      }
    }

    if (!response.ok || payload.ok === false) {
      if (shouldLogLevel(1)) {
        try {
          console.warn("[whisper-bridge] request failed", {
            status: response.status,
            statusText: response.statusText,
            error: payload.error ?? null,
            code: payload.code ?? null,
            provider: payload.provider ?? null,
            modelId: payload.model_id ?? null,
            asrLane: payload.asr_lane ?? null,
            upstreamStatus: payload.upstream_status ?? null,
            upstreamMessage: payload.upstream_message ?? null,
            upstreamUrl: payload.upstream_url ?? null,
            modelUrl: payload.model_url ?? null,
            detail: payload.detail ?? null,
            model: payload.model ?? null,
            providerRequestId: payload.provider_request_id ?? null,
            ffmpegFallbackAttempted: payload.ffmpeg_fallback_attempted ?? false,
            ffmpegFallbackUsed: payload.ffmpeg_fallback_used ?? false,
            ffmpegFallbackError: payload.ffmpeg_fallback_error ?? null,
          });
        } catch {
          // ignore logging failures
        }
      }
      throw new WhisperBridgeHttpError(response.status, readResponseError(payload, response.status), payload);
    }
    if (this.getStaleDropReason(requestGeneration)) {
      throw new Error("whisper_stale_response");
    }
    {
      const runMeta = this.readRunMeta();
      try {
        console.info("[ASR_WHISPER_RESPONSE_RECEIVED]", {
          runKey: runMeta.runKey,
          runGeneration: runMeta.runGeneration,
          seq,
          ok: response.ok,
          status: response.status,
          hasText: typeof payload.text === "string" && payload.text.trim().length > 0,
          textLength: typeof payload.text === "string" ? payload.text.trim().length : 0,
          providerRequestId: payload.provider_request_id ?? null,
          elapsedSinceLiveStartMs: runMeta.elapsedSinceLiveStartMs,
        });
      } catch {}
    }
    return payload;
  }

  private handleTranscript(payload: WhisperBridgeResponse): void {
    const text = typeof payload.text === "string" ? payload.text.trim() : "";
    if (!text) return;

    const now = nowTs();
    const incomingTokens = toWordTokens(text);
    if (!incomingTokens.length) return;
    if (!this.firstTranscriptPacketLogged) {
      this.firstTranscriptPacketLogged = true;
      const runMeta = this.readRunMeta();
      try {
        console.info("[ASR_FIRST_TRANSCRIPT_PACKET]", {
          runKey: runMeta.runKey,
          runGeneration: runMeta.runGeneration,
          textLength: text.length,
          incomingTokenCount: incomingTokens.length,
          providerRequestId: payload.provider_request_id ?? null,
          elapsedSinceLiveStartMs: runMeta.elapsedSinceLiveStartMs,
        });
      } catch {}
    }

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
      calibrationProfileId: getActiveAsrProfile()?.id || null,
      calibrationVersion: getActiveAsrProfile()?.version ?? null,
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
