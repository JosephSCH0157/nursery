import { getPrimaryScroller, getScriptRoot } from "../../scroll/scroller";
import { supabase } from "../../forge/supabaseClient";
import { resolveForgeUserAccessToken } from "../../forge/tongs-user-auth";
import { shouldLogLevel } from "../../env/dev-log";
import { getActiveAsrProfile } from "../../asr/active-profile";
import { isSessionRecording } from "../../recording/recorderRegistry";

type WhisperBridgeEvent = "start" | "end" | "error" | "partial" | "final";
type WhisperBridgeListener = (payload?: unknown) => void;

type WhisperBridgePayload = {
  text: string;
  final: boolean;
  isFinal: boolean;
  timestamp: number;
  source: string;
  transcriptSeq?: number | null;
  requestSeq?: string | null;
  model?: string | null;
  providerRequestId?: string | null;
  calibrationProfileId?: string | null;
  calibrationVersion?: number | null;
  requestGeneration?: number | null;
  bridgeGeneration?: number | null;
  rawText?: string | null;
  assembledText?: string | null;
  rawTextHash?: string | null;
  assembledTextHash?: string | null;
  rawTextPreview?: string | null;
  assembledTextPreview?: string | null;
  sourceRequestSeqs?: number[];
  supportingRawSeqs?: number[];
  forwardSupportRequestSeqs?: number[];
  appendedTokenRange?: { start: number; end: number } | null;
  appendedBySeq?: number[];
  promptIncluded?: boolean;
  promptHash?: string | null;
  promptLength?: number | null;
  promptPreview?: string | null;
  chunkBytes?: number | null;
  chunkMimeType?: string | null;
  chunkDurationMs?: number | null;
  chunkEnqueueTs?: number | null;
  captureStartedAtMs?: number | null;
  captureEndedAtMs?: number | null;
  captureRuntimePath?: string | null;
  captureRecorderGeneration?: number | null;
  requestCaptureVerdict?: "voice_detected" | "silence_detected" | "unknown" | null;
  requestCaptureEvidence?: Array<{
    requestSeq: number;
    verdict: "voice_detected" | "silence_detected" | "unknown";
    evidenceSource?: string | null;
    vadSpeaking?: boolean | null;
    rmsDbfs?: number | null;
    peakDbfs?: number | null;
    activeVadFrameCount?: number | null;
    activeVadDurationMs?: number | null;
    captureStartedAtMs?: number | null;
    captureEndedAtMs?: number | null;
    lastVoiceAtMs?: number | null;
    lastSilenceAtMs?: number | null;
    silenceBoundaryAtMs?: number | null;
  }> | null;
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
  sourceSeq: number | null;
};

type ChunkEnvelope = {
  blob: Blob;
  seq: number;
  durationMs?: number;
  enqueueTs: number;
  captureStartedAtMs: number | null;
  captureEndedAtMs: number | null;
  captureEvidence: {
    requestSeq: number;
    verdict: "voice_detected" | "silence_detected" | "unknown";
    evidenceSource: string | null;
    vadSpeaking: boolean | null;
    rmsDbfs: number | null;
    peakDbfs: number | null;
    activeVadFrameCount: number;
    activeVadDurationMs: number;
    captureStartedAtMs: number | null;
    captureEndedAtMs: number | null;
    lastVoiceAtMs: number | null;
    lastSilenceAtMs: number | null;
    silenceBoundaryAtMs: number | null;
  };
};

type CaptureWindowStats = {
  sampleCount: number;
  rmsDbfs: number | null;
  peakDbfs: number | null;
  activeVadFrameCount: number;
  activeVadDurationMs: number;
  lastSpeaking: boolean | null;
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

function estimateHeaderBytesFromRecord(headers: Record<string, string>): number {
  return Object.entries(headers).reduce((total, [key, value]) => total + key.length + value.length + 4, 0);
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

function isWhisperBridgeHeaderOverflowError(error: unknown): boolean {
  if (!(error instanceof WhisperBridgeHttpError)) return false;
  if (error.status === 431) return true;
  const code = String(error.payload?.code || "").toLowerCase();
  const message = String(error.message || "").toLowerCase();
  const upstreamMessage = String(error.payload?.upstream_message || "").toLowerCase();
  return (
    code === "whisper_bridge_header_overflow"
    || code === "whisper_local_header_overflow"
    || code === "whisper_upstream_header_overflow"
    || code === "whisper_unknown_header_overflow"
    || message.includes("request header fields too large")
    || upstreamMessage.includes("request header fields too large")
  );
}

function classifyWhisperBridgeHeaderOverflow(
  error: unknown,
): "whisper_local_header_overflow" | "whisper_upstream_header_overflow" | "whisper_unknown_header_overflow" | null {
  if (!(error instanceof WhisperBridgeHttpError)) return null;
  const code = String(error.payload?.code || "").toLowerCase();
  if (
    code === "whisper_local_header_overflow"
    || code === "whisper_upstream_header_overflow"
    || code === "whisper_unknown_header_overflow"
  ) {
    return code;
  }
  if (error.status === 431) return "whisper_unknown_header_overflow";
  return null;
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

function hashTextFragment(value: string): string {
  const input = String(value || "");
  let hash = 2166136261;
  for (let idx = 0; idx < input.length; idx += 1) {
    hash ^= input.charCodeAt(idx);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function previewText(value: string, maxChars = 96): string {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  return normalized.length > maxChars ? `${normalized.slice(0, maxChars)}...` : normalized;
}

function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/[^\p{L}\p{N}'’]+/gu, "");
}

function toWordTokens(text: string, sourceSeq: number | null = null): WordToken[] {
  const words = splitWords(text);
  const out: WordToken[] = [];
  for (const raw of words) {
    const normalized = normalizeWord(raw);
    if (!normalized) continue;
    out.push({ raw, normalized, sourceSeq });
  }
  return out;
}

function uniqSeqs(values: Array<number | null | undefined>): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const value of values) {
    if (!Number.isFinite(Number(value))) continue;
    const normalized = Math.max(0, Math.floor(Number(value)));
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function mergeTokenWindow(current: WordToken[], incoming: WordToken[]): {
  tokens: WordToken[];
  overlap: number;
  appendedTokenRange: { start: number; end: number } | null;
  sourceRequestSeqs: number[];
  appendedBySeq: number[];
} {
  if (!incoming.length) {
    return {
      tokens: current,
      overlap: 0,
      appendedTokenRange: null,
      sourceRequestSeqs: uniqSeqs(current.map((token) => token.sourceSeq)),
      appendedBySeq: [],
    };
  }
  if (!current.length) {
    const tokens = incoming.slice(-MAX_WINDOW_WORDS);
    return {
      tokens,
      overlap: 0,
      appendedTokenRange: tokens.length ? { start: 0, end: tokens.length - 1 } : null,
      sourceRequestSeqs: uniqSeqs(tokens.map((token) => token.sourceSeq)),
      appendedBySeq: uniqSeqs(tokens.map((token) => token.sourceSeq)),
    };
  }

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
  const tokens = merged.slice(-MAX_WINDOW_WORDS);
  const appendedCount = Math.max(0, Math.min(incoming.length - overlap, tokens.length));
  const appendedTokenRange = appendedCount > 0
    ? { start: tokens.length - appendedCount, end: tokens.length - 1 }
    : null;
  return {
    tokens,
    overlap,
    appendedTokenRange,
    sourceRequestSeqs: uniqSeqs(tokens.map((token) => token.sourceSeq)),
    appendedBySeq: appendedTokenRange
      ? uniqSeqs(tokens.slice(appendedTokenRange.start, appendedTokenRange.end + 1).map((token) => token.sourceSeq))
      : [],
  };
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
  private queue: ChunkEnvelope[] = [];
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
  private zeroByteChunkStreak = 0;
  private switchedToRawCapture = false;
  private flowProbeLogged = false;
  private recordingActiveAtCaptureStart = false;
  private lastCaptureRuntimePath = "whisper-bridge";
  private lastCaptureProfileId: string | null = null;
  private lastCaptureConstraints: unknown = null;
  private captureRecorderGeneration = 0;
  private captureStartedAtMs = 0;
  private nextChunkCaptureStartedAtMs = 0;
  private lastVadSpeaking: boolean | null = null;
  private lastVadRmsDbfs: number | null = null;
  private lastVadAtMs = 0;
  private lastVadVoiceAtMs = 0;
  private lastSilenceAtMs = 0;
  private lastSilenceBoundaryAtMs = 0;
  private silenceActive = false;
  private readonly requestCaptureEvidenceBySeq = new Map<number, ChunkEnvelope["captureEvidence"]>();
  private captureAnalyserCtx: AudioContext | null = null;
  private captureAnalyser: AnalyserNode | null = null;
  private captureAnalyserSource: MediaStreamAudioSourceNode | null = null;
  private captureAnalyserBuffer: Float32Array | null = null;
  private captureAnalyserTimer: ReturnType<typeof globalThis.setInterval> | null = null;
  private captureWindowStats: CaptureWindowStats = {
    sampleCount: 0,
    rmsDbfs: null,
    peakDbfs: null,
    activeVadFrameCount: 0,
    activeVadDurationMs: 0,
    lastSpeaking: null,
  };

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

  private handleVadEvent = (event: Event): void => {
    const detail = (event as CustomEvent).detail || {};
    const speaking = typeof detail.speaking === "boolean" ? detail.speaking : null;
    const rmsDbfs = Number.isFinite(Number(detail.rmsDbfs)) ? Number(detail.rmsDbfs) : null;
    const now = Date.now();
    this.lastVadSpeaking = speaking;
    this.lastVadRmsDbfs = rmsDbfs;
    this.lastVadAtMs = now;
    if (speaking === true) {
      this.lastVadVoiceAtMs = now;
      this.silenceActive = false;
    }
  };

  private handleSilenceEvent = (event: Event): void => {
    const detail = (event as CustomEvent).detail || {};
    const silent = detail.silent !== false;
    const now = Date.now();
    this.silenceActive = silent;
    if (silent) {
      this.lastSilenceAtMs = now;
      this.lastSilenceBoundaryAtMs = now;
    }
  };

  private addCaptureSignalListeners(): void {
    try { window.addEventListener("tp:vad", this.handleVadEvent as EventListener); } catch {}
    try { window.addEventListener("tp:asr:silence", this.handleSilenceEvent as EventListener); } catch {}
  }

  private removeCaptureSignalListeners(): void {
    try { window.removeEventListener("tp:vad", this.handleVadEvent as EventListener); } catch {}
    try { window.removeEventListener("tp:asr:silence", this.handleSilenceEvent as EventListener); } catch {}
  }

  private buildChunkCaptureEvidence(
    seq: number,
    captureStartedAtMs: number | null,
    captureEndedAtMs: number | null,
  ): ChunkEnvelope["captureEvidence"] {
    const streamStats = this.captureWindowStats;
    const captureStart = Number.isFinite(Number(captureStartedAtMs)) ? Number(captureStartedAtMs) : null;
    const captureEnd = Number.isFinite(Number(captureEndedAtMs)) ? Number(captureEndedAtMs) : null;
    const hasStreamStats = streamStats.sampleCount > 0;
    const voiceSeenInWindow =
      this.lastVadVoiceAtMs > 0 &&
      captureStart != null &&
      captureEnd != null &&
      this.lastVadVoiceAtMs >= captureStart &&
      this.lastVadVoiceAtMs <= (captureEnd + 250);
    const silenceSeenInWindow =
      (
        this.lastSilenceAtMs > 0 &&
        captureStart != null &&
        captureEnd != null &&
        this.lastSilenceAtMs >= captureStart &&
        this.lastSilenceAtMs <= (captureEnd + 250)
      ) ||
      (
        this.lastVadAtMs > 0 &&
        this.lastVadSpeaking === false &&
        captureStart != null &&
        captureEnd != null &&
        this.lastVadAtMs >= captureStart &&
        this.lastVadAtMs <= (captureEnd + 250)
      );
    let verdict: "voice_detected" | "silence_detected" | "unknown" = "unknown";
    let evidenceSource: string | null = null;
    if (hasStreamStats) {
      evidenceSource = "stream_analyser";
      if (streamStats.activeVadFrameCount > 0 || streamStats.lastSpeaking === true) {
        verdict = "voice_detected";
      } else if (streamStats.sampleCount > 0) {
        verdict = "silence_detected";
      }
    }
    if (verdict === "unknown" && (voiceSeenInWindow || this.lastVadSpeaking === true)) {
      verdict = "voice_detected";
      evidenceSource = evidenceSource || "tp_vad_window";
    } else if (verdict === "unknown" && (silenceSeenInWindow || this.silenceActive)) {
      verdict = "silence_detected";
      evidenceSource = evidenceSource || "tp_vad_window";
    }
    return {
      requestSeq: seq,
      verdict,
      evidenceSource,
      vadSpeaking: hasStreamStats ? streamStats.lastSpeaking : this.lastVadSpeaking,
      rmsDbfs: hasStreamStats ? streamStats.rmsDbfs : this.lastVadRmsDbfs,
      peakDbfs: hasStreamStats ? streamStats.peakDbfs : null,
      activeVadFrameCount: hasStreamStats ? streamStats.activeVadFrameCount : 0,
      activeVadDurationMs: hasStreamStats ? streamStats.activeVadDurationMs : 0,
      captureStartedAtMs: captureStart,
      captureEndedAtMs: captureEnd,
      lastVoiceAtMs: this.lastVadVoiceAtMs > 0 ? this.lastVadVoiceAtMs : null,
      lastSilenceAtMs: this.lastSilenceAtMs > 0 ? this.lastSilenceAtMs : null,
      silenceBoundaryAtMs: this.lastSilenceBoundaryAtMs > 0 ? this.lastSilenceBoundaryAtMs : null,
    };
  }

  private resetCaptureWindowStats(): void {
    this.captureWindowStats = {
      sampleCount: 0,
      rmsDbfs: null,
      peakDbfs: null,
      activeVadFrameCount: 0,
      activeVadDurationMs: 0,
      lastSpeaking: null,
    };
  }

  private sampleCaptureAnalyser(): void {
    const analyser = this.captureAnalyser;
    const buffer = this.captureAnalyserBuffer;
    if (!analyser || !buffer) return;
    try {
      analyser.getFloatTimeDomainData(buffer as unknown as Float32Array<ArrayBuffer>);
      let sumSq = 0;
      let peak = 0;
      for (let idx = 0; idx < buffer.length; idx += 1) {
        const sample = Number(buffer[idx]) || 0;
        sumSq += sample * sample;
        const abs = Math.abs(sample);
        if (abs > peak) peak = abs;
      }
      const rms = Math.sqrt(sumSq / Math.max(1, buffer.length));
      const rmsDbfs = 20 * Math.log10(Math.max(rms, 1e-12));
      const peakDbfs = 20 * Math.log10(Math.max(peak, 1e-12));
      const activeProfile = getActiveAsrProfile();
      const tonDb = Number.isFinite(Number(activeProfile?.vad?.tonDb)) ? Number(activeProfile?.vad?.tonDb) : -38;
      const toffDb = Number.isFinite(Number(activeProfile?.vad?.toffDb)) ? Number(activeProfile?.vad?.toffDb) : -44;
      const thresholdDb = this.captureWindowStats.lastSpeaking === true ? toffDb : tonDb;
      const speaking = rmsDbfs >= thresholdDb;
      const stats = this.captureWindowStats;
      stats.sampleCount += 1;
      stats.rmsDbfs = stats.rmsDbfs == null ? rmsDbfs : Math.max(stats.rmsDbfs, rmsDbfs);
      stats.peakDbfs = stats.peakDbfs == null ? peakDbfs : Math.max(stats.peakDbfs, peakDbfs);
      stats.lastSpeaking = speaking;
      if (speaking) {
        stats.activeVadFrameCount += 1;
        stats.activeVadDurationMs += 20;
        this.lastVadVoiceAtMs = Date.now();
        this.silenceActive = false;
      } else {
        this.lastSilenceAtMs = Date.now();
      }
      this.lastVadSpeaking = speaking;
      this.lastVadRmsDbfs = rmsDbfs;
      this.lastVadAtMs = Date.now();
    } catch {
      // best-effort capture metrics only
    }
  }

  private async stopCaptureAnalyser(): Promise<void> {
    if (this.captureAnalyserTimer) {
      try { clearInterval(this.captureAnalyserTimer); } catch {}
      this.captureAnalyserTimer = null;
    }
    try { this.captureAnalyserSource?.disconnect(); } catch {}
    try { this.captureAnalyser?.disconnect(); } catch {}
    this.captureAnalyserSource = null;
    this.captureAnalyser = null;
    this.captureAnalyserBuffer = null;
    const ctx = this.captureAnalyserCtx;
    this.captureAnalyserCtx = null;
    try { await ctx?.close?.(); } catch {}
  }

  private async startCaptureAnalyser(stream: MediaStream): Promise<void> {
    await this.stopCaptureAnalyser();
    this.resetCaptureWindowStats();
    const AC = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
    if (!AC) return;
    try {
      const ctx = new AC();
      try {
        if (typeof ctx.resume === "function" && ctx.state === "suspended") await ctx.resume();
      } catch {}
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      this.captureAnalyserCtx = ctx;
      this.captureAnalyserSource = source;
      this.captureAnalyser = analyser;
      this.captureAnalyserBuffer = new Float32Array(analyser.fftSize);
      this.captureAnalyserTimer = globalThis.setInterval(() => this.sampleCaptureAnalyser(), 20);
    } catch {
      await this.stopCaptureAnalyser();
    }
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

  private logBridgeTranscriptLineage(stage: string, payload: {
    seq: number | null;
    requestGeneration: number | null;
    bridgeGeneration: number | null;
    rawText: string;
    assembledText: string;
    sourceRequestSeqs: number[];
    appendedTokenRange: { start: number; end: number } | null;
    appendedBySeq: number[];
    promptIncluded: boolean;
    promptHash: string | null;
    promptLength: number;
    requestCaptureVerdict: "voice_detected" | "silence_detected" | "unknown";
  }): void {
    try {
      console.info("[ASR_WHISPER_TRANSCRIPT_LINEAGE]", {
        stage,
        seq: payload.seq,
        requestGeneration: payload.requestGeneration,
        bridgeGeneration: payload.bridgeGeneration,
        rawTextHash: hashTextFragment(payload.rawText),
        assembledTextHash: hashTextFragment(payload.assembledText),
        rawTextPreview: previewText(payload.rawText),
        assembledTextPreview: previewText(payload.assembledText),
        sourceRequestSeqs: payload.sourceRequestSeqs,
        appendedTokenRange: payload.appendedTokenRange,
        appendedBySeq: payload.appendedBySeq,
        requestCaptureVerdict: payload.requestCaptureVerdict,
        forwardSupportCreatedOnlyByAssembly: payload.sourceRequestSeqs.length <= 1 && payload.rawText !== payload.assembledText,
        promptIncluded: payload.promptIncluded,
        promptHash: payload.promptHash,
        promptLength: payload.promptLength,
      });
    } catch {
      // ignore logging failures
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

  private isRecordingActiveNow(): boolean {
    try {
      if (isSessionRecording()) return true;
    } catch {}
    try {
      return !!(window as any).__tpRecordingActive;
    } catch {
      return false;
    }
  }

  private logCapturePolicy(selected: string, preferRawForAsr: boolean, reason: string): void {
    const runMeta = this.readRunMeta();
    try {
      console.info("[ASR_WHISPER_CAPTURE_POLICY]", {
        runKey: runMeta.runKey,
        runGeneration: runMeta.runGeneration,
        recordingActive: this.recordingActiveAtCaptureStart,
        preferRawForAsr,
        selected,
        reason,
        elapsedSinceLiveStartMs: runMeta.elapsedSinceLiveStartMs,
      });
    } catch {}
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

  private describeAudioTrackState(stream: MediaStream): Array<Record<string, unknown>> {
    try {
      return stream.getAudioTracks().map((track) => {
        const row = track as MediaStreamTrack & { muted?: boolean };
        const settings = typeof row.getSettings === "function" ? row.getSettings() : null;
        const constraints = typeof row.getConstraints === "function" ? row.getConstraints() : null;
        const capabilities = typeof (row as any).getCapabilities === "function"
          ? (row as any).getCapabilities()
          : null;
        return {
          streamId: (stream as any).id || null,
          streamActive: (stream as any).active !== false,
          trackId: typeof row.id === "string" ? row.id : null,
          label: typeof row.label === "string" ? row.label : null,
          readyState: typeof row.readyState === "string" ? row.readyState : null,
          enabled: typeof row.enabled === "boolean" ? row.enabled : null,
          muted: typeof row.muted === "boolean" ? row.muted : null,
          settings,
          constraints,
          capabilities,
        };
      });
    } catch {
      return [];
    }
  }

  private logTrackState(marker: string, stream: MediaStream): void {
    const runMeta = this.readRunMeta();
    try {
      console.info("[ASR_WHISPER_STREAM_TRACK_STATE]", {
        marker,
        runKey: runMeta.runKey,
        runGeneration: runMeta.runGeneration,
        trackCount: stream.getAudioTracks().length,
        tracks: this.describeAudioTrackState(stream),
        elapsedSinceLiveStartMs: runMeta.elapsedSinceLiveStartMs,
      });
    } catch {}
  }

  private async probeAudioFlow(stream: MediaStream, source: string): Promise<{ rms: number; peak: number; sampleCount: number } | null> {
    if (this.flowProbeLogged) return null;
    this.flowProbeLogged = true;
    const AC = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
    if (!AC) return null;
    let ctx: AudioContext | null = null;
    try {
      ctx = new AC();
      try {
        if (typeof ctx.resume === "function" && ctx.state === "suspended") await ctx.resume();
      } catch {}
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      src.connect(analyser);
      await new Promise((resolve) => setTimeout(resolve, 140));
      const data = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(data);
      let sumSq = 0;
      let peak = 0;
      for (let i = 0; i < data.length; i += 1) {
        const centered = (data[i] - 128) / 128;
        const abs = Math.abs(centered);
        if (abs > peak) peak = abs;
        sumSq += centered * centered;
      }
      const rms = Math.sqrt(sumSq / Math.max(1, data.length));
      const runMeta = this.readRunMeta();
      try {
        console.info("[ASR_WHISPER_AUDIO_FLOW_PROBE]", {
          runKey: runMeta.runKey,
          runGeneration: runMeta.runGeneration,
          source,
          rms,
          peak,
          sampleCount: data.length,
          elapsedSinceLiveStartMs: runMeta.elapsedSinceLiveStartMs,
        });
      } catch {}
      return { rms, peak, sampleCount: data.length };
    } catch {
      // best-effort diagnostics only
      return null;
    } finally {
      try { await ctx?.close?.(); } catch {}
    }
  }

  private async switchToRawCaptureStream(reason: string): Promise<boolean> {
    const runMeta = this.readRunMeta();
    try {
      console.warn("[ASR_WHISPER_RAW_FALLBACK_ATTEMPT]", {
        runKey: runMeta.runKey,
        runGeneration: runMeta.runGeneration,
        reason,
        recordingActive: this.recordingActiveAtCaptureStart,
        elapsedSinceLiveStartMs: runMeta.elapsedSinceLiveStartMs,
      });
    } catch {}
    try {
      const mic = (window as any).__tpMic;
      let raw = mic?.__lastRawStream as MediaStream | undefined;
      let rawTracks = raw?.getAudioTracks?.().filter((track) => track && track.readyState === "live") || [];
      if (!raw || !rawTracks.length) {
        try {
          raw = await mic?.requestMic?.({
            source: "whisper-bridge",
            asrPath: this.lastCaptureRuntimePath,
            profileId: this.lastCaptureProfileId,
            capture: this.lastCaptureConstraints,
            preferRawForAsr: true,
          });
          rawTracks = raw?.getAudioTracks?.().filter((track) => track && track.readyState === "live") || [];
        } catch {
          raw = undefined;
          rawTracks = [];
        }
      }
      if (!raw || typeof raw.getAudioTracks !== "function" || !rawTracks.length) {
        try {
          console.warn("[ASR_WHISPER_RAW_FALLBACK_UNAVAILABLE]", {
            runKey: runMeta.runKey,
            runGeneration: runMeta.runGeneration,
            recordingActive: this.recordingActiveAtCaptureStart,
            hasLastRawStream: !!mic?.__lastRawStream,
            lastRawTrackState: mic?.__lastRawStream ? this.describeAudioTrackState(mic.__lastRawStream) : [],
            elapsedSinceLiveStartMs: runMeta.elapsedSinceLiveStartMs,
          });
        } catch {}
        return false;
      }
      const cloned = new MediaStream(rawTracks.map((track) => track.clone()));
      this.recorderStream = cloned;
      this.switchedToRawCapture = true;
      try {
        console.info("[ASR_WHISPER_CAPTURE_STREAM_READY]", {
          runKey: runMeta.runKey,
          runGeneration: runMeta.runGeneration,
          streamTrackCount: cloned.getAudioTracks().length,
          trackStates: this.describeAudioTracks(cloned),
          elapsedSinceLiveStartMs: runMeta.elapsedSinceLiveStartMs,
          source: "raw-fallback",
        });
      } catch {}
      try {
        console.warn("[ASR_WHISPER_CAPTURE_SOURCE_SELECTED]", {
          runKey: runMeta.runKey,
          runGeneration: runMeta.runGeneration,
          selected: "raw-mic",
          reason,
          elapsedSinceLiveStartMs: runMeta.elapsedSinceLiveStartMs,
        });
      } catch {}
      this.logCapturePolicy("raw-mic", true, reason);
      this.logTrackState("raw-fallback", cloned);
      this.flowProbeLogged = false;
      await this.startCaptureAnalyser(cloned);
      await this.probeAudioFlow(cloned, "raw-fallback");
      try {
        console.info("[ASR_WHISPER_RAW_FALLBACK_STARTED]", {
          runKey: runMeta.runKey,
          runGeneration: runMeta.runGeneration,
          streamTrackCount: cloned.getAudioTracks().length,
          elapsedSinceLiveStartMs: runMeta.elapsedSinceLiveStartMs,
        });
      } catch {}
      return true;
    } catch {
      return false;
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
    this.zeroByteChunkStreak = 0;
    this.switchedToRawCapture = false;
    this.flowProbeLogged = false;
    this.recordingActiveAtCaptureStart = this.isRecordingActiveNow();
    this.requestCaptureEvidenceBySeq.clear();
    this.resetCaptureWindowStats();
    this.addCaptureSignalListeners();

    const activeProfile = getActiveAsrProfile();
    const runtimePath = this.asrLane === 'ASR2' ? 'whisper-large-live' : 'whisper-bridge';
    this.lastCaptureRuntimePath = runtimePath;
    this.lastCaptureProfileId = activeProfile?.id || null;
    this.lastCaptureConstraints = activeProfile?.capture || null;
    const preferRawForAsr = this.recordingActiveAtCaptureStart;
    this.logCapturePolicy(
      preferRawForAsr ? "raw-mic" : "processed-dsp",
      preferRawForAsr,
      preferRawForAsr ? "recording_active" : "default_processed_path",
    );
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
      preferRawForAsr,
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
    this.logTrackState("requestMic-return", stream);
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
    let captureStream = new MediaStream(audioTracks.map((track: MediaStreamTrack) => track.clone()));
    this.logTrackState("capture-start", captureStream);
    const flowSource = preferRawForAsr ? "raw-capture" : "processed-capture";
    const flow = await this.probeAudioFlow(captureStream, flowSource);
    if (!preferRawForAsr && flow && flow.rms === 0 && flow.peak === 0) {
      const switched = await this.switchToRawCaptureStream("probe_zero_energy");
      if (switched && this.recorderStream) {
        captureStream = this.recorderStream;
      }
    }
    this.recorderStream = captureStream;
    await this.startCaptureAnalyser(captureStream);
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
    this.requestCaptureEvidenceBySeq.clear();
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
    this.captureRecorderGeneration += 1;
    this.captureStartedAtMs = Date.now();
    this.nextChunkCaptureStartedAtMs = this.captureStartedAtMs;
    this.resetCaptureWindowStats();

    recorder.ondataavailable = async (event: BlobEvent) => {
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
        if ((blob?.size ?? 0) <= 0) {
          this.zeroByteChunkStreak += 1;
          const zeroRunMeta = this.readRunMeta();
          try {
            console.warn("[ASR_WHISPER_ZERO_BYTE_CHUNK]", {
              runKey: zeroRunMeta.runKey,
              runGeneration: zeroRunMeta.runGeneration,
              streak: this.zeroByteChunkStreak,
              seq: nextSeq,
              mimeType: this.recorderMimeType || null,
              elapsedSinceLiveStartMs: zeroRunMeta.elapsedSinceLiveStartMs,
            });
          } catch {}
          if (this.zeroByteChunkStreak >= 3 && !this.switchedToRawCapture) {
            const switched = await this.switchToRawCaptureStream("repeated_zero_byte_chunks");
            if (switched) {
              try { recorder.stop(); } catch {}
            } else {
              this.requestInvalid = true;
              this.lastAiError = "ASR raw fallback unavailable after repeated zero-byte chunks.";
              this.syncAiActivity();
              this.emit("error", {
                source: SOURCE,
                message: this.lastAiError,
                timestamp: nowTs(),
              });
              this.stop();
            }
          }
        }
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
      this.zeroByteChunkStreak = 0;
      this.seq = nextSeq;
      const enqueueTs = Date.now();
      const captureWindowStartedAtMs = this.nextChunkCaptureStartedAtMs > 0 ? this.nextChunkCaptureStartedAtMs : this.captureStartedAtMs;
      const captureEvidence = this.buildChunkCaptureEvidence(
        this.seq,
        captureWindowStartedAtMs > 0 ? captureWindowStartedAtMs : null,
        enqueueTs,
      );
      this.requestCaptureEvidenceBySeq.set(this.seq, captureEvidence);
      this.queue.push({
        blob,
        seq: this.seq,
        durationMs: chunkDurationMs,
        enqueueTs,
        captureStartedAtMs: captureWindowStartedAtMs > 0 ? captureWindowStartedAtMs : null,
        captureEndedAtMs: enqueueTs,
        captureEvidence,
      });
      this.nextChunkCaptureStartedAtMs = enqueueTs;
      this.resetCaptureWindowStats();
      const queueAfter = this.queue.length;
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
            chunkDurationMs: chunkDurationMs ?? null,
            chunkEnqueueTs: enqueueTs,
            queueDepthAfter: queueAfter,
            requestCaptureVerdict: captureEvidence.verdict,
            requestCaptureRmsDbfs: captureEvidence.rmsDbfs,
            requestCapturePeakDbfs: captureEvidence.peakDbfs,
            requestCaptureEvidenceSource: captureEvidence.evidenceSource,
            requestCaptureActiveVadFrameCount: captureEvidence.activeVadFrameCount,
            requestCaptureActiveVadDurationMs: captureEvidence.activeVadDurationMs,
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
          chunkDurationMs: chunkDurationMs ?? null,
          chunkEnqueueTs: enqueueTs,
          queueDepthBefore: queueBefore,
          queueDepthAfter: queueAfter,
          requestCaptureVerdict: captureEvidence.verdict,
          requestCaptureRmsDbfs: captureEvidence.rmsDbfs,
          requestCapturePeakDbfs: captureEvidence.peakDbfs,
          requestCaptureEvidenceSource: captureEvidence.evidenceSource,
          requestCaptureActiveVadFrameCount: captureEvidence.activeVadFrameCount,
          requestCaptureActiveVadDurationMs: captureEvidence.activeVadDurationMs,
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
            chunkDurationMs: chunkDurationMs ?? null,
            requestCaptureVerdict: captureEvidence.verdict,
            requestCaptureRmsDbfs: captureEvidence.rmsDbfs,
            requestCapturePeakDbfs: captureEvidence.peakDbfs,
            requestCaptureEvidenceSource: captureEvidence.evidenceSource,
            requestCaptureActiveVadFrameCount: captureEvidence.activeVadFrameCount,
            requestCaptureActiveVadDurationMs: captureEvidence.activeVadDurationMs,
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
    this.removeCaptureSignalListeners();
    void this.stopCaptureAnalyser();
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
          const payload = await this.transcribe(next, requestGeneration, queueDepthBefore, queueDepthAfter);
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
          this.handleTranscript(payload, next.seq);
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
          } else if (isWhisperBridgeHeaderOverflowError(error)) {
            message = "ASR chunk dropped: whisper bridge header overflow; continuing session.";
            this.lastAiError = message;
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
            code: upstreamPayload?.code ?? classifyWhisperBridgeHeaderOverflow(error) ?? (isWhisperBridgeHeaderOverflowError(error) ? "whisper_unknown_header_overflow" : null),
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
    chunk: ChunkEnvelope,
    requestGeneration: number,
    queueDepthBefore?: number,
    queueDepthAfter?: number,
  ): Promise<WhisperBridgeResponse> {
    const { blob, seq, durationMs } = chunk;
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
    const promptCandidate = buildScriptPrompt();
    const promptSuppressed = !!promptCandidate;
    const promptIncluded = false;
    const promptHash = null;
    const promptPreview = null;
    const promptLength = 0;
    form.set("asr_lane", this.asrLane);
    form.set("request_seq", String(seq));
    form.set("user_access_token", accessToken);
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
          promptIncluded,
          promptSuppressed,
          promptCandidateHash: promptSuppressed ? hashTextFragment(promptCandidate) : null,
          promptCandidateLength: promptCandidate.length,
          promptHash,
          promptLength,
          promptPreview,
          requestGeneration,
          bridgeGeneration: this.generation,
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
      const explicitHeaders: Record<string, string> = {
        "x-whisper-request-seq": String(seq),
      };
      try {
        console.info("[ASR_WHISPER_CLIENT_UPLOAD_BUDGET]", {
          seq,
          blobSize: blob.size,
          queueDepth: queueDepthBefore,
          credentialsMode: "omit",
          explicitlySetHeaderNames: Object.keys(explicitHeaders),
          estimatedExplicitHeaderBytes: estimateHeaderBytesFromRecord(explicitHeaders),
          hasCookieHeader: Object.prototype.hasOwnProperty.call(explicitHeaders, "cookie"),
        });
      } catch {}
      response = await fetch(this.route, {
        method: "POST",
        headers: explicitHeaders,
        body: form,
        cache: "no-store",
        credentials: "omit",
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
          promptIncluded,
          promptSuppressed,
          promptCandidateHash: promptSuppressed ? hashTextFragment(promptCandidate) : null,
          promptCandidateLength: promptCandidate.length,
          promptHash,
          promptLength,
        });
      } catch {}
    }
    try {
      console.info("[ASR_WHISPER_RAW_RESPONSE_TEXT]", {
        seq,
        runKey: this.readRunMeta().runKey,
        runGeneration: this.readRunMeta().runGeneration,
        requestGeneration,
        bridgeGeneration: this.generation,
        rawTextHash: hashTextFragment(String(payload.text || "")),
        rawTextPreview: previewText(String(payload.text || "")),
        promptIncluded,
        promptSuppressed,
        promptCandidateHash: promptSuppressed ? hashTextFragment(promptCandidate) : null,
        promptCandidateLength: promptCandidate.length,
        promptHash,
        promptLength,
      });
    } catch {}
    (payload as WhisperBridgeResponse & Record<string, unknown>).__tpRequestGeneration = requestGeneration;
    (payload as WhisperBridgeResponse & Record<string, unknown>).__tpPromptIncluded = promptIncluded;
    (payload as WhisperBridgeResponse & Record<string, unknown>).__tpPromptHash = promptHash;
    (payload as WhisperBridgeResponse & Record<string, unknown>).__tpPromptLength = promptLength;
    (payload as WhisperBridgeResponse & Record<string, unknown>).__tpPromptPreview = promptPreview;
    (payload as WhisperBridgeResponse & Record<string, unknown>).__tpChunkBytes = blob.size;
    (payload as WhisperBridgeResponse & Record<string, unknown>).__tpChunkMimeType = mimeType ?? null;
    (payload as WhisperBridgeResponse & Record<string, unknown>).__tpChunkDurationMs = durationMs ?? null;
    (payload as WhisperBridgeResponse & Record<string, unknown>).__tpChunkEnqueueTs = chunk.enqueueTs;
    (payload as WhisperBridgeResponse & Record<string, unknown>).__tpCaptureStartedAtMs = chunk.captureStartedAtMs;
    (payload as WhisperBridgeResponse & Record<string, unknown>).__tpCaptureEndedAtMs = chunk.captureEndedAtMs;
    (payload as WhisperBridgeResponse & Record<string, unknown>).__tpCaptureRuntimePath = this.lastCaptureRuntimePath;
    (payload as WhisperBridgeResponse & Record<string, unknown>).__tpCaptureRecorderGeneration = this.captureRecorderGeneration;
    (payload as WhisperBridgeResponse & Record<string, unknown>).__tpRequestCaptureEvidence = chunk.captureEvidence;
    return payload;
  }

  private handleTranscript(payload: WhisperBridgeResponse, seq?: number): void {
    const text = typeof payload.text === "string" ? payload.text.trim() : "";
    if (!text) return;

    const now = nowTs();
    const transcriptSeq = Number.isFinite(Number(seq)) ? Math.max(0, Math.floor(Number(seq))) : null;
    const incomingTokens = toWordTokens(text, transcriptSeq);
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
    const mergeResult = mergeTokenWindow(this.transcriptWindow, incomingTokens);
    this.transcriptWindow = mergeResult.tokens;
    const assembledText = tokensToText(this.transcriptWindow);
    if (!assembledText) return;
    const requestGeneration = Number.isFinite(Number((payload as Record<string, unknown>).__tpRequestGeneration))
      ? Math.max(0, Math.floor(Number((payload as Record<string, unknown>).__tpRequestGeneration)))
      : null;
    const promptIncluded = (payload as Record<string, unknown>).__tpPromptIncluded === true;
    const promptHash = typeof (payload as Record<string, unknown>).__tpPromptHash === "string"
      ? String((payload as Record<string, unknown>).__tpPromptHash)
      : null;
    const promptLength = Number.isFinite(Number((payload as Record<string, unknown>).__tpPromptLength))
      ? Math.max(0, Math.floor(Number((payload as Record<string, unknown>).__tpPromptLength)))
      : null;
    const promptPreview = typeof (payload as Record<string, unknown>).__tpPromptPreview === "string"
      ? String((payload as Record<string, unknown>).__tpPromptPreview)
      : null;
    const requestCaptureEvidenceRaw = (payload as Record<string, unknown>).__tpRequestCaptureEvidence;
    const requestCaptureEvidence = requestCaptureEvidenceRaw && typeof requestCaptureEvidenceRaw === "object"
      ? requestCaptureEvidenceRaw as ChunkEnvelope["captureEvidence"]
      : null;
    const lineageCaptureEvidence = mergeResult.sourceRequestSeqs
      .map((seq) => this.requestCaptureEvidenceBySeq.get(seq) ?? null)
      .filter((value): value is ChunkEnvelope["captureEvidence"] => value != null);
    const forwardSupportRequestSeqs = mergeResult.appendedBySeq.length > 0
      ? mergeResult.appendedBySeq
      : mergeResult.sourceRequestSeqs;

    this.logBridgeTranscriptLineage("assembled", {
      seq: transcriptSeq,
      requestGeneration,
      bridgeGeneration: this.generation,
      rawText: text,
      assembledText,
      sourceRequestSeqs: mergeResult.sourceRequestSeqs,
      appendedTokenRange: mergeResult.appendedTokenRange,
      appendedBySeq: mergeResult.appendedBySeq,
      promptIncluded,
      promptHash,
      promptLength: promptLength ?? 0,
      requestCaptureVerdict: requestCaptureEvidence?.verdict ?? "unknown",
    });

    const basePayload: WhisperBridgePayload = {
      text: assembledText,
      final: false,
      isFinal: false,
      timestamp: now,
      source: SOURCE,
      transcriptSeq,
      requestSeq: transcriptSeq != null ? String(transcriptSeq) : null,
      model: payload.model ?? null,
      providerRequestId: payload.provider_request_id ?? null,
      calibrationProfileId: getActiveAsrProfile()?.id || null,
      calibrationVersion: getActiveAsrProfile()?.version ?? null,
      requestGeneration,
      bridgeGeneration: this.generation,
      rawText: text,
      assembledText,
      rawTextHash: hashTextFragment(text),
      assembledTextHash: hashTextFragment(assembledText),
      rawTextPreview: previewText(text),
      assembledTextPreview: previewText(assembledText),
      sourceRequestSeqs: mergeResult.sourceRequestSeqs,
      supportingRawSeqs: mergeResult.sourceRequestSeqs,
      forwardSupportRequestSeqs,
      appendedTokenRange: mergeResult.appendedTokenRange,
      appendedBySeq: mergeResult.appendedBySeq,
      promptIncluded,
      promptHash,
      promptLength,
      promptPreview,
      requestCaptureVerdict: requestCaptureEvidence?.verdict ?? null,
      requestCaptureEvidence: lineageCaptureEvidence,
      chunkBytes: Number.isFinite(Number((payload as Record<string, unknown>).__tpChunkBytes))
        ? Number((payload as Record<string, unknown>).__tpChunkBytes)
        : null,
      chunkMimeType: typeof (payload as Record<string, unknown>).__tpChunkMimeType === "string"
        ? String((payload as Record<string, unknown>).__tpChunkMimeType)
        : null,
      chunkDurationMs: Number.isFinite(Number((payload as Record<string, unknown>).__tpChunkDurationMs))
        ? Number((payload as Record<string, unknown>).__tpChunkDurationMs)
        : null,
      chunkEnqueueTs: Number.isFinite(Number((payload as Record<string, unknown>).__tpChunkEnqueueTs))
        ? Number((payload as Record<string, unknown>).__tpChunkEnqueueTs)
        : null,
      captureStartedAtMs: Number.isFinite(Number((payload as Record<string, unknown>).__tpCaptureStartedAtMs))
        ? Number((payload as Record<string, unknown>).__tpCaptureStartedAtMs)
        : null,
      captureEndedAtMs: Number.isFinite(Number((payload as Record<string, unknown>).__tpCaptureEndedAtMs))
        ? Number((payload as Record<string, unknown>).__tpCaptureEndedAtMs)
        : null,
      captureRuntimePath: typeof (payload as Record<string, unknown>).__tpCaptureRuntimePath === "string"
        ? String((payload as Record<string, unknown>).__tpCaptureRuntimePath)
        : null,
      captureRecorderGeneration: Number.isFinite(Number((payload as Record<string, unknown>).__tpCaptureRecorderGeneration))
        ? Math.max(0, Math.floor(Number((payload as Record<string, unknown>).__tpCaptureRecorderGeneration)))
        : null,
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
