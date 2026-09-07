import { Buffer } from "node:buffer";

export interface ForgeFfmpegClientConfig {
  baseUrl: string;
  callerId: "netlify" | "worker";
  serviceToken: string;
  timeoutMs: number;
  maxAttempts: number;
  retryDelayMs: number;
}

export interface ForgeFfmpegTranscodeResult {
  audioBytes: Buffer;
  requestId: string | null;
  outputFormat: string | null;
  outputSampleRate: number | null;
  outputChannels: number | null;
}

export interface ReadForgeFfmpegClientConfigOptions {
  baseUrlEnvNames?: string[];
  timeoutEnvNames?: string[];
  maxAttemptsEnvNames?: string[];
  retryDelayEnvNames?: string[];
  serviceTokenEnvNames?: string[];
  callerId?: ForgeFfmpegClientConfig["callerId"];
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

function readFirstTrimmed(env: NodeJS.ProcessEnv, keys: string[]): string | null {
  for (const key of keys) {
    const value = readTrimmed(env[key]);
    if (value) return value;
  }
  return null;
}

function readFirstPositiveInteger(env: NodeJS.ProcessEnv, keys: string[]): number | null {
  for (const key of keys) {
    const value = readPositiveInteger(env[key]);
    if (value != null) return value;
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

export function readForgeFfmpegClientConfig(
  env: NodeJS.ProcessEnv = process.env,
  options: ReadForgeFfmpegClientConfigOptions = {},
): ForgeFfmpegClientConfig | null {
  const baseUrl = readFirstTrimmed(env, options.baseUrlEnvNames ?? ["FORGE_FFMPEG_BASE_URL"]);
  const serviceToken = readFirstTrimmed(
    env,
    options.serviceTokenEnvNames ?? ["FORGE_FFMPEG_NETLIFY_SERVICE_TOKEN_CURRENT"],
  );
  if (!baseUrl || !serviceToken || serviceToken.length < 32) return null;
  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    callerId: options.callerId ?? "netlify",
    serviceToken,
    timeoutMs: readFirstPositiveInteger(env, options.timeoutEnvNames ?? ["FORGE_FFMPEG_TIMEOUT_MS"])
      ?? DEFAULT_FORGE_FFMPEG_TIMEOUT_MS,
    maxAttempts: readFirstPositiveInteger(env, options.maxAttemptsEnvNames ?? ["FORGE_FFMPEG_MAX_ATTEMPTS"])
      ?? DEFAULT_FORGE_FFMPEG_MAX_ATTEMPTS,
    retryDelayMs: readFirstPositiveInteger(env, options.retryDelayEnvNames ?? ["FORGE_FFMPEG_RETRY_DELAY_MS"])
      ?? DEFAULT_FORGE_FFMPEG_RETRY_DELAY_MS,
  };
}

export interface ForgeFfmpegMediaInspection {
  width: number;
  height: number;
  durationMs: number;
  hasAudio: boolean;
  requestId: string | null;
}

export interface ForgeFfmpegPosterResult {
  posterBytes: Buffer;
  requestId: string | null;
}

export function buildForgeFfmpegRequestHeaders(
  client: ForgeFfmpegClientConfig,
  headers: Record<string, string> = {},
): Record<string, string> {
  return {
    ...headers,
    authorization: `Bearer ${client.serviceToken}`,
  };
}

function shouldRetryForgeFfmpegStatus(status: number): boolean {
  return status === 408 || status === 429 || status === 502 || status === 503 || status === 504;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function transcodeToWavWithForgeFfmpeg(args: {
  client: ForgeFfmpegClientConfig;
  sourceBytes: Buffer;
  sourceFilename?: string | null;
  contentType?: string | null;
}): Promise<ForgeFfmpegTranscodeResult> {
  const maxAttempts = Math.max(1, args.client.maxAttempts);
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const timeout = createTimeoutAbortController(args.client.timeoutMs);
    try {
      const sourceBytesBody = new Uint8Array(args.sourceBytes);
      const response = await fetch(`${args.client.baseUrl}/transcode/wav`, {
        method: "POST",
        headers: buildForgeFfmpegRequestHeaders(args.client, {
          "content-type": readTrimmed(args.contentType) ?? "application/octet-stream",
          ...(readTrimmed(args.sourceFilename) ? { "x-file-name": readTrimmed(args.sourceFilename)! } : {}),
        }),
        body: sourceBytesBody,
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

export async function probeMediaWithForgeFfmpeg(args: {
  client: ForgeFfmpegClientConfig;
  sourceBytes: Uint8Array;
  sourceFilename?: string | null;
  contentType?: string | null;
}): Promise<ForgeFfmpegMediaInspection> {
  const timeout = createTimeoutAbortController(args.client.timeoutMs);
  try {
    const response = await fetch(`${args.client.baseUrl}/probe/media`, {
      method: "POST",
      headers: buildForgeFfmpegRequestHeaders(args.client, {
        "content-type": readTrimmed(args.contentType) ?? "application/octet-stream",
        ...(readTrimmed(args.sourceFilename) ? { "x-file-name": readTrimmed(args.sourceFilename)! } : {}),
      }),
      body: new Uint8Array(args.sourceBytes),
      signal: timeout.controller.signal,
    });
    if (!response.ok) throw new Error(`Forge FFmpeg media probe failed: ${await readForgeFfmpegErrorMessage(response)}`);
    const payload = await response.json() as { inspection?: { width?: unknown; height?: unknown; duration_ms?: unknown; has_audio?: unknown } };
    const width = Number(payload.inspection?.width);
    const height = Number(payload.inspection?.height);
    const durationMs = Number(payload.inspection?.duration_ms);
    if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0
      || !Number.isFinite(durationMs) || durationMs <= 0) {
      throw new Error("Forge FFmpeg media probe returned incomplete metadata.");
    }
    return {
      width,
      height,
      durationMs,
      hasAudio: payload.inspection?.has_audio === true,
      requestId: readTrimmed(response.headers.get("x-forge-request-id")),
    };
  } catch (error) {
    if (timeout.controller.signal.aborted) throw new Error(`Forge FFmpeg media probe timed out after ${args.client.timeoutMs}ms.`);
    throw error;
  } finally {
    timeout.dispose();
  }
}

export async function derivePosterWithForgeFfmpeg(args: {
  client: ForgeFfmpegClientConfig;
  sourceBytes: Uint8Array;
  sourceFilename?: string | null;
  contentType?: string | null;
}): Promise<ForgeFfmpegPosterResult> {
  const timeout = createTimeoutAbortController(args.client.timeoutMs);
  try {
    const response = await fetch(`${args.client.baseUrl}/derive/poster`, {
      method: "POST",
      headers: buildForgeFfmpegRequestHeaders(args.client, {
        "content-type": readTrimmed(args.contentType) ?? "application/octet-stream",
        ...(readTrimmed(args.sourceFilename) ? { "x-file-name": readTrimmed(args.sourceFilename)! } : {}),
      }),
      body: new Uint8Array(args.sourceBytes),
      signal: timeout.controller.signal,
    });
    if (!response.ok) throw new Error(`Forge FFmpeg poster extraction failed: ${await readForgeFfmpegErrorMessage(response)}`);
    const posterBytes = Buffer.from(await response.arrayBuffer());
    if (posterBytes.byteLength === 0) throw new Error("Forge FFmpeg poster extraction returned an empty response body.");
    return { posterBytes, requestId: readTrimmed(response.headers.get("x-forge-request-id")) };
  } catch (error) {
    if (timeout.controller.signal.aborted) throw new Error(`Forge FFmpeg poster extraction timed out after ${args.client.timeoutMs}ms.`);
    throw error;
  } finally {
    timeout.dispose();
  }
}
