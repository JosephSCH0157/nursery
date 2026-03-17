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

const DEFAULT_ROUTE = "/api/anvil/asr/whisper";
const DEFAULT_SEGMENT_MS = 1800;
const MAX_WINDOW_WORDS = 56;
const MAX_PROMPT_CHARS = 1200;
const MAX_PROMPT_LOOKAHEAD = 6;
const MAX_PROMPT_LOOKBEHIND = 1;
const MAX_OVERLAP_WORDS = 12;
const RESET_WINDOW_IDLE_MS = 4000;
const SOURCE = "openai-whisper-bridge";

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
      void this.flushQueue();
    };
    this.recorder.onerror = (event: Event) => {
      const error = (event as Event & { error?: { message?: string } }).error;
      const message = error?.message || "Whisper recorder error";
      this.emit("error", { source: SOURCE, message, timestamp: nowTs() });
    };
    this.recorder.onstop = () => {
      this.cleanupRecorder();
      this.emit("end", { source: SOURCE, timestamp: nowTs() });
    };

    this.transcriptWindow = [];
    this.lastTranscriptAt = 0;
    this.lastPartialText = "";
    this.lastFinalText = "";
    this.running = true;
    this.recorder.start(this.segmentMs);
    this.emit("start", { source: SOURCE, timestamp: nowTs() });
  }

  stop(): void {
    if (!this.recorder && !this.running) return;
    this.running = false;
    try { this.recorder?.requestData(); } catch {}
    try {
      if (this.recorder && this.recorder.state !== "inactive") {
        this.recorder.stop();
      } else {
        this.cleanupRecorder();
        this.emit("end", { source: SOURCE, timestamp: nowTs() });
      }
    } catch {
      this.cleanupRecorder();
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
        try {
          const payload = await this.transcribe(next.blob, next.seq);
          this.handleTranscript(payload);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Whisper bridge error";
          this.emit("error", {
            source: SOURCE,
            message,
            timestamp: nowTs(),
          });
        }
      }
    } finally {
      this.queueRunning = false;
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
      throw new Error(readResponseError(payload, response.status));
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
