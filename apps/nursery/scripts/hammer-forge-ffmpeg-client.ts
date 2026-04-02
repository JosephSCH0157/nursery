export interface HammerForgeFfmpegClientConfig {
  baseUrl: string;
  timeoutMs: number;
  maxAttempts: number;
  retryDelayMs: number;
}

export interface HammerForgeFfmpegTranscodeResult {
  audioBytes: Buffer;
  requestId: string | null;
  outputFormat: string | null;
  outputSampleRate: number | null;
  outputChannels: number | null;
}

const DEFAULT_FORGE_FFMPEG_TIMEOUT_MS = 120_000;
const DEFAULT_FORGE_FFMPEG_MAX_ATTEMPTS = 2;
const DEFAULT_FORGE_FFMPEG_RETRY_DELAY_MS = 400;

function readTrimmed(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readPositiveInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.floor(value);
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function readResponseHeaderNumber(headers: Headers, name: string): number | null {
  const raw = readTrimmed(headers.get(name));
  if (!raw) return null;
  return readPositiveInteger(raw);
}

function createTimeoutAbortController(timeoutMs: number): {
  controller: AbortController;
  dispose: () => void;
} {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return {
    controller,
    dispose: () => clearTimeout(timeoutId),
  };
}

async function readForgeFfmpegErrorMessage(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const payload = await response.json().catch(() => null) as
      | { error?: { message?: unknown }; message?: unknown; detail?: unknown }
      | null;
    const message = readTrimmed(payload?.error?.message)
      ?? readTrimmed(payload?.message)
      ?? readTrimmed(payload?.detail);
    if (message) return message;
  }
  const text = readTrimmed(await response.text().catch(() => ""));
  return text ?? "Forge FFmpeg request failed.";
}

export function readHammerForgeFfmpegClientConfig(
  env: NodeJS.ProcessEnv = process.env,
): HammerForgeFfmpegClientConfig | null {
  const baseUrl = readTrimmed(env.HAMMER_FORGE_FFMPEG_BASE_URL)
    ?? readTrimmed(env.FORGE_FFMPEG_BASE_URL);
  if (!baseUrl) return null;
  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    timeoutMs: readPositiveInteger(env.HAMMER_FORGE_FFMPEG_TIMEOUT_MS)
      ?? DEFAULT_FORGE_FFMPEG_TIMEOUT_MS,
    maxAttempts: readPositiveInteger(env.HAMMER_FORGE_FFMPEG_MAX_ATTEMPTS)
      ?? DEFAULT_FORGE_FFMPEG_MAX_ATTEMPTS,
    retryDelayMs: readPositiveInteger(env.HAMMER_FORGE_FFMPEG_RETRY_DELAY_MS)
      ?? DEFAULT_FORGE_FFMPEG_RETRY_DELAY_MS,
  };
}

function shouldRetryForgeFfmpegStatus(status: number): boolean {
  return status === 408 || status === 429 || status === 502 || status === 503 || status === 504;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function transcodeToWorkingWavWithForgeFfmpeg(args: {
  client: HammerForgeFfmpegClientConfig;
  sourceBytes: Buffer;
  sourceFilename?: string | null;
  contentType?: string | null;
}): Promise<HammerForgeFfmpegTranscodeResult> {
  const maxAttempts = Math.max(1, args.client.maxAttempts);
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const timeout = createTimeoutAbortController(args.client.timeoutMs);
    try {
      const response = await fetch(`${args.client.baseUrl}/transcode/wav`, {
        method: "POST",
        headers: {
          "content-type": readTrimmed(args.contentType) ?? "application/octet-stream",
          ...(readTrimmed(args.sourceFilename) ? { "x-file-name": readTrimmed(args.sourceFilename)! } : {}),
        },
        body: args.sourceBytes,
        signal: timeout.controller.signal,
      });

      if (!response.ok) {
        const message = await readForgeFfmpegErrorMessage(response);
        const error = new Error(`Forge FFmpeg working-audio transcode failed: ${message}`);
        if (attempt < maxAttempts && shouldRetryForgeFfmpegStatus(response.status)) {
          lastError = error;
          await wait(args.client.retryDelayMs);
          continue;
        }
        throw error;
      }

      const audioBytes = Buffer.from(await response.arrayBuffer());
      if (audioBytes.byteLength === 0) {
        throw new Error("Forge FFmpeg working-audio transcode returned an empty response body.");
      }

      return {
        audioBytes,
        requestId: readTrimmed(response.headers.get("x-forge-request-id")),
        outputFormat: readTrimmed(response.headers.get("x-forge-output-format")),
        outputSampleRate: readResponseHeaderNumber(response.headers, "x-forge-output-sample-rate"),
        outputChannels: readResponseHeaderNumber(response.headers, "x-forge-output-channels"),
      };
    } catch (error) {
      if (timeout.controller.signal.aborted) {
        throw new Error(`Forge FFmpeg working-audio transcode timed out after ${args.client.timeoutMs}ms.`);
      }
      lastError = error instanceof Error ? error : new Error("Forge FFmpeg working-audio transcode failed.");
      if (attempt < maxAttempts) {
        await wait(args.client.retryDelayMs);
        continue;
      }
      throw lastError;
    } finally {
      timeout.dispose();
    }
  }

  throw lastError ?? new Error("Forge FFmpeg working-audio transcode failed.");
}
