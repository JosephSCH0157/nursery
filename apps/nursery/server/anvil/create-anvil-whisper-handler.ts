import crypto from "node:crypto";
import { Buffer } from "node:buffer";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@forge/tongs";
import {
  AI_USAGE_FEATURE,
  AI_USAGE_LANE,
  AI_USAGE_STATUS,
  AI_USAGE_SUBFEATURE,
  AI_USAGE_TRIGGER,
} from "../../../../packages/tongs/src/ai-usage-taxonomy";
import { resolveHearthRuntimeConfig } from "../hearth/hearth-runtime-config";
import {
  applyAiTokenDelta,
  buildTranscriptionAccounting,
  normalizeBillingMode,
  readBearerToken,
  readOptionalString,
  recordAiUsageEvent,
  resolveUserIdFromAccessToken,
  type BillingMode,
} from "../ai-usage-accounting";
import {
  MissingForgeKeyError,
  MissingUserKeyError,
  resolveEffectiveAiCredentials,
} from "../hearth/resolve-effective-ai-credentials";
import {
  readForgeFfmpegClientConfig,
  transcodeToWavWithForgeFfmpeg,
  type ForgeFfmpegClientConfig,
} from "../forge-ffmpeg-client";

export const ANVIL_WHISPER_ROUTE = "/api/anvil/asr/whisper";
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const DEFAULT_MODEL = "gpt-4o-mini-transcribe";
const MISSING_OPENAI_API_KEY_ERROR = "Missing OPENAI_TEXT_API_KEY (or OPENAI_API_KEY) in server env";

export type AnvilWhisperRuntimeConfig = {
  apiKey: string | null;
  sttModel: string;
  configuredBillingMode?: BillingMode;
  initialTokenBalance?: number | null;
  supabaseUrl?: string | null;
  supabaseServiceRoleKey?: string | null;
  disableUserKeys?: boolean;
  ffmpegClient?: ForgeFfmpegClientConfig | null;
};

type AnvilWhisperResponse = {
  ok: boolean;
  text: string;
  empty?: boolean;
  error?: string;
  code?: string;
  detail?: string;
  model?: string;
  provider_request_id?: string | null;
  billing_mode?: BillingMode;
  actual_cost_usd?: number;
  billable_tokens?: number;
  credits_warning?: string | null;
  ffmpeg_fallback_attempted?: boolean;
  ffmpeg_fallback_used?: boolean;
  ffmpeg_fallback_error?: string | null;
};

function jsonResponse(status: number, obj: AnvilWhisperResponse): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function isBlobLike(value: unknown): value is Blob & { name?: string; type?: string } {
  return !!value
    && typeof value === "object"
    && typeof (value as Blob).arrayBuffer === "function"
    && typeof (value as Blob).size === "number";
}

function readUpstreamErrorMessage(detail: string): string | null {
  if (!detail.trim()) return null;
  try {
    const payload = JSON.parse(detail) as Record<string, unknown>;
    const rootError = payload.error;
    if (rootError && typeof rootError === "object") {
      return readOptionalString((rootError as Record<string, unknown>).message);
    }
    return readOptionalString(payload.message) ?? readOptionalString(payload.error);
  } catch {
    return null;
  }
}

function isInvalidLanguageUpstreamError(detail: string): boolean {
  const text = String(detail || "").trim();
  if (!text) return false;

  const lower = text.toLowerCase();
  if (
    lower.includes("language")
    && (
      lower.includes("invalid")
      || lower.includes("not recognized")
      || lower.includes("not supported")
      || lower.includes("unknown")
      || lower.includes("unsupported")
    )
  ) {
    return true;
  }

  try {
    const payload = JSON.parse(text) as Record<string, unknown>;
    const rootError = payload.error;
    if (!rootError || typeof rootError !== "object") return false;
    const row = rootError as Record<string, unknown>;
    const param = readOptionalString(row.param)?.toLowerCase() ?? "";
    const code = readOptionalString(row.code)?.toLowerCase() ?? "";
    const message = readOptionalString(row.message)?.toLowerCase() ?? "";

    if (param.includes("language")) return true;
    if (code.includes("language")) return true;
    if (message.includes("language") && message.includes("invalid")) return true;
    return false;
  } catch {
    return false;
  }
}

function isUnsupportedAudioUpstreamError(detail: string): boolean {
  const text = String(detail || "").trim();
  if (!text) return false;

  const lower = text.toLowerCase();
  return (
    (lower.includes("audio file") && (lower.includes("corrupt") || lower.includes("unsupported")))
    || lower.includes("invalid file format")
    || lower.includes("supported formats")
    || lower.includes("unsupported media type")
  );
}

function extractTranscriptionText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const row = payload as Record<string, unknown>;
  return readOptionalString(row.text) ?? "";
}

function inferExtension(fileName: string | null, mimeType: string | null): string {
  const normalizedName = readOptionalString(fileName)?.toLowerCase() ?? "";
  if (normalizedName.endsWith(".wav")) return "wav";
  if (normalizedName.endsWith(".mp4") || normalizedName.endsWith(".m4a")) return "m4a";
  if (normalizedName.endsWith(".ogg") || normalizedName.endsWith(".oga")) return "ogg";
  if (normalizedName.endsWith(".mp3")) return "mp3";
  if (normalizedName.endsWith(".webm")) return "webm";

  const normalizedType = readOptionalString(mimeType)?.toLowerCase() ?? "";
  if (normalizedType.includes("wav")) return "wav";
  if (normalizedType.includes("mp4") || normalizedType.includes("m4a")) return "m4a";
  if (normalizedType.includes("ogg")) return "ogg";
  if (normalizedType.includes("mpeg") || normalizedType.includes("mp3")) return "mp3";
  return "webm";
}

function replaceFileExtension(fileName: string, nextExtension: string): string {
  const normalizedExt = nextExtension.startsWith(".") ? nextExtension : `.${nextExtension}`;
  const trimmed = readOptionalString(fileName) ?? "";
  if (!trimmed) return `chunk${normalizedExt}`;
  const next = trimmed.replace(/\.[^./\\]+$/u, "");
  return `${next || "chunk"}${normalizedExt}`;
}

export function resolveAnvilWhisperRuntimeConfig(): AnvilWhisperRuntimeConfig {
  const runtime = resolveHearthRuntimeConfig();
  const modelOverride = readOptionalString(process.env.ANVIL_STT_MODEL);
  return {
    apiKey: runtime.textApiKey ?? runtime.apiKey ?? null,
    sttModel: modelOverride ?? runtime.sttModel ?? DEFAULT_MODEL,
    configuredBillingMode: runtime.configuredBillingMode,
    initialTokenBalance: runtime.initialTokenBalance,
    supabaseUrl: runtime.supabaseUrl,
    supabaseServiceRoleKey: runtime.supabaseServiceRoleKey,
    disableUserKeys: runtime.disableUserKeys,
    ffmpegClient: readForgeFfmpegClientConfig(process.env, {
      baseUrlEnvNames: [
        "ANVIL_FORGE_FFMPEG_BASE_URL",
        "FORGE_FFMPEG_BASE_URL",
        "HAMMER_FORGE_FFMPEG_BASE_URL",
      ],
      timeoutEnvNames: [
        "ANVIL_FORGE_FFMPEG_TIMEOUT_MS",
        "FORGE_FFMPEG_TIMEOUT_MS",
        "HAMMER_FORGE_FFMPEG_TIMEOUT_MS",
      ],
      maxAttemptsEnvNames: [
        "ANVIL_FORGE_FFMPEG_MAX_ATTEMPTS",
        "FORGE_FFMPEG_MAX_ATTEMPTS",
        "HAMMER_FORGE_FFMPEG_MAX_ATTEMPTS",
      ],
      retryDelayEnvNames: [
        "ANVIL_FORGE_FFMPEG_RETRY_DELAY_MS",
        "FORGE_FFMPEG_RETRY_DELAY_MS",
        "HAMMER_FORGE_FFMPEG_RETRY_DELAY_MS",
      ],
    }),
  };
}

export function createAnvilWhisperHandler(config: AnvilWhisperRuntimeConfig) {
  const apiKey = readOptionalString(config.apiKey);
  const sttModel = readOptionalString(config.sttModel) ?? DEFAULT_MODEL;
  const configuredBillingMode = normalizeBillingMode(config.configuredBillingMode, "forge");
  let tokenBalance = typeof config.initialTokenBalance === "number" && Number.isFinite(config.initialTokenBalance)
    ? Math.max(0, Math.floor(config.initialTokenBalance))
    : null;
  const disableUserKeys = config.disableUserKeys === true;
  const ffmpegClient = config.ffmpegClient ?? null;
  const supabaseService: SupabaseClient<Database> | null = config.supabaseUrl && config.supabaseServiceRoleKey
    ? createClient<Database>(config.supabaseUrl, config.supabaseServiceRoleKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      })
    : null;

  function readUserAccessToken(headers: Headers): string | null {
    const explicitToken = readBearerToken(headers.get("x-forge-user-token"));
    if (explicitToken) return explicitToken;
    const forgeAuth = readBearerToken(headers.get("x-forge-user-authorization"));
    if (forgeAuth) return forgeAuth;
    return readBearerToken(headers.get("authorization"));
  }

  return async function anvilWhisperHandler(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (url.pathname !== ANVIL_WHISPER_ROUTE) {
        return jsonResponse(404, { ok: false, text: "", error: "Not found" });
      }

      const method = (request.method || "GET").toUpperCase();
      if (method !== "POST") {
        return jsonResponse(405, { ok: false, text: "", error: "Method not allowed" });
      }

      let formData: FormData;
      try {
        formData = await request.formData();
      } catch {
        return jsonResponse(400, {
          ok: false,
          text: "",
          error: "multipart/form-data body required",
          code: "invalid_multipart_body",
        });
      }

      const fileValue = formData.get("file") ?? formData.get("audio");
      if (!isBlobLike(fileValue)) {
        return jsonResponse(400, {
          ok: false,
          text: "",
          error: "file field is required",
          code: "missing_audio_file",
        });
      }

      if (fileValue.size <= 0) {
        return jsonResponse(400, {
          ok: false,
          text: "",
          error: "audio chunk is empty",
          code: "empty_audio_chunk",
        });
      }

      if (fileValue.size > MAX_AUDIO_BYTES) {
        return jsonResponse(413, {
          ok: false,
          text: "",
          error: "audio chunk exceeds 25MB limit",
        });
      }

      const laneFromBody = readOptionalString(formData.get("lane"));
      const laneFromQuery = readOptionalString(url.searchParams.get("lane"));
      const laneHint = normalizeBillingMode(laneFromBody ?? laneFromQuery, configuredBillingMode);
      // Client lane is advisory only; server config + credential resolution is authoritative.
      const byoRequested = !disableUserKeys && (
        configuredBillingMode === AI_USAGE_LANE.BYO
        || laneHint === AI_USAGE_LANE.BYO
      );
      const userAccessToken = readUserAccessToken(request.headers);
      const userId = await resolveUserIdFromAccessToken({
        supabaseService,
        accessToken: userAccessToken,
      });
      let lane: BillingMode = AI_USAGE_LANE.FORGE;
      let effectiveApiKey: string;
      if (byoRequested) {
        if (!supabaseService) {
          return jsonResponse(500, {
            ok: false,
            text: "",
            error: "Supabase service role is not configured.",
            billing_mode: AI_USAGE_LANE.BYO,
          });
        }
        if (!userAccessToken || !userId) {
          return jsonResponse(401, {
            ok: false,
            text: "",
            error: "Authentication required.",
            billing_mode: AI_USAGE_LANE.BYO,
          });
        }
        try {
          const credentials = await resolveEffectiveAiCredentials({
            requestedLane: AI_USAGE_LANE.BYO,
            provider: "openai",
            // BYO lane must not silently spend forge capacity when key resolution fails.
            forgeManagedApiKey: null,
            userId,
            supabaseService,
            disableUserKeys: false,
          });
          if (credentials.billingLane !== AI_USAGE_LANE.BYO || credentials.keySource !== "user_byo") {
            return jsonResponse(422, {
              ok: false,
              text: "",
              error: "A connected BYO key is required for this request.",
              code: "missing_user_byo_key",
              billing_mode: AI_USAGE_LANE.BYO,
            });
          }
          lane = credentials.billingLane;
          effectiveApiKey = credentials.apiKey;
        } catch (error) {
          if (error instanceof MissingUserKeyError) {
            return jsonResponse(422, {
              ok: false,
              text: "",
              error: error.message,
              code: "missing_user_byo_key",
              billing_mode: AI_USAGE_LANE.BYO,
            });
          }
          if (error instanceof MissingForgeKeyError) {
            return jsonResponse(500, {
              ok: false,
              text: "",
              error: MISSING_OPENAI_API_KEY_ERROR,
              billing_mode: AI_USAGE_LANE.FORGE,
            });
          }
          return jsonResponse(500, {
            ok: false,
            text: "",
            error: "Failed resolving effective AI credentials.",
            billing_mode: AI_USAGE_LANE.BYO,
          });
        }
      } else {
        lane = AI_USAGE_LANE.FORGE;
        if (!apiKey) {
          return jsonResponse(500, {
            ok: false,
            text: "",
            error: MISSING_OPENAI_API_KEY_ERROR,
            billing_mode: AI_USAGE_LANE.FORGE,
          });
        }
        if (!supabaseService) {
          return jsonResponse(500, {
            ok: false,
            text: "",
            error: "Supabase service role is not configured.",
            billing_mode: AI_USAGE_LANE.FORGE,
          });
        }
        if (!userAccessToken || !userId) {
          return jsonResponse(401, {
            ok: false,
            text: "",
            error: "Authentication required.",
            billing_mode: AI_USAGE_LANE.FORGE,
          });
        }
        if (tokenBalance != null && tokenBalance <= 0) {
          return jsonResponse(402, {
            ok: false,
            text: "",
            error: "No AI credits remaining.",
            billing_mode: AI_USAGE_LANE.FORGE,
          });
        }
        effectiveApiKey = apiKey;
      }
      const providedActionId = readOptionalString(formData.get("action_id"));
      const actionId = providedActionId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(providedActionId)
        ? providedActionId
        : crypto.randomUUID();

      const language = readOptionalString(formData.get("language"));
      const prompt = readOptionalString(formData.get("prompt"));
      const asrLane = readOptionalString(formData.get("asr_lane"));
      const modelHint = readOptionalString(formData.get("model_hint"));
      const requestSttModel =
        (asrLane || "").toUpperCase() === "ASR2_WHISPER_LARGE_V3_EXPERIMENTAL"
          ? (modelHint || "whisper-large-v3")
          : sttModel;
      const fileName = readOptionalString((fileValue as { name?: unknown }).name);
      const mimeType = readOptionalString((fileValue as { type?: unknown }).type);
      const extension = inferExtension(fileName, mimeType);
      const uploadFileName = fileName ?? `chunk.${extension}`;

      function buildUpstreamForm(
        nextFileValue: Blob,
        nextFileName: string,
        includeLanguage: boolean,
      ): FormData {
        const upstreamForm = new FormData();
        upstreamForm.set("model", requestSttModel);
        upstreamForm.set("response_format", "json");
        upstreamForm.set("file", nextFileValue, nextFileName);
        if (includeLanguage && language) upstreamForm.set("language", language);
        if (prompt) upstreamForm.set("prompt", prompt);
        return upstreamForm;
      }

      async function sendToOpenAi(
        nextFileValue: Blob,
        nextFileName: string,
      ): Promise<{
        upstream: Response;
        detail: string;
        message: string | null;
      }> {
        let upstream: Response;
        let usedLanguageHint = Boolean(language);
        let detail = "";
        let message: string | null = null;
        try {
          upstream = await fetch("https://api.openai.com/v1/audio/transcriptions", {
            method: "POST",
            headers: {
              authorization: `Bearer ${effectiveApiKey}`,
            },
            body: buildUpstreamForm(nextFileValue, nextFileName, usedLanguageHint),
            signal: upstreamAbort.signal,
          });

          if (!upstream.ok) {
            detail = await upstream.text();
            message = readUpstreamErrorMessage(detail) ?? "OpenAI error";
            const shouldRetryWithoutLanguage =
              usedLanguageHint
              && (upstream.status === 400 || upstream.status === 422)
              && isInvalidLanguageUpstreamError(detail);

            if (shouldRetryWithoutLanguage) {
              usedLanguageHint = false;
              upstream = await fetch("https://api.openai.com/v1/audio/transcriptions", {
                method: "POST",
                headers: {
                  authorization: `Bearer ${effectiveApiKey}`,
                },
                body: buildUpstreamForm(nextFileValue, nextFileName, false),
                signal: upstreamAbort.signal,
              });

              if (!upstream.ok) {
                detail = await upstream.text();
                message = readUpstreamErrorMessage(detail) ?? "OpenAI error";
              } else {
                detail = "";
                message = null;
              }
            }
          }
        } catch (error) {
          if (clientAborted || upstreamAbort.signal.aborted) {
            throw new Response(null, { status: 499 });
          }
          throw error;
        }

        return { upstream, detail, message };
      }

      const upstreamAbort = new AbortController();
      let clientAborted = request.signal.aborted;
      const onAborted = () => {
        clientAborted = true;
        upstreamAbort.abort();
      };
      request.signal.addEventListener("abort", onAborted, { once: true });

      try {
        let upstream: Response;
        let upstreamDetail = "";
        let upstreamMessage: string | null = null;
        let ffmpegFallbackAttempted = false;
        let ffmpegFallbackUsed = false;
        let ffmpegFallbackError: string | null = null;
        try {
          const directAttempt = await sendToOpenAi(fileValue, uploadFileName);
          upstream = directAttempt.upstream;
          upstreamDetail = directAttempt.detail;
          upstreamMessage = directAttempt.message;

          if (!upstream.ok && ffmpegClient && isUnsupportedAudioUpstreamError(upstreamDetail)) {
            ffmpegFallbackAttempted = true;
            try {
              console.info("[anvil-whisper] ffmpeg fallback attempting", {
                fileName: uploadFileName,
                mimeType: mimeType ?? null,
                providerRequestId: upstream.headers.get("x-request-id"),
                status: upstream.status,
              });
            } catch {
              // ignore logging failures
            }
            try {
              const transcoded = await transcodeToWavWithForgeFfmpeg({
                client: ffmpegClient,
                sourceBytes: Buffer.from(await fileValue.arrayBuffer()),
                sourceFilename: uploadFileName,
                contentType: mimeType ?? undefined,
              });
              const transcodedBlob = new Blob([new Uint8Array(transcoded.audioBytes)], { type: "audio/wav" });
              const transcodedAttempt = await sendToOpenAi(
                transcodedBlob,
                replaceFileExtension(uploadFileName, "wav"),
              );
              upstream = transcodedAttempt.upstream;
              upstreamDetail = transcodedAttempt.detail;
              upstreamMessage = transcodedAttempt.message;
              ffmpegFallbackUsed = upstream.ok;
              try {
                console.info("[anvil-whisper] ffmpeg fallback completed", {
                  recovered: upstream.ok,
                  providerRequestId: upstream.headers.get("x-request-id"),
                  outputFormat: transcoded.outputFormat ?? "wav",
                  outputSampleRate: transcoded.outputSampleRate,
                  outputChannels: transcoded.outputChannels,
                });
              } catch {
                // ignore logging failures
              }
            } catch (error) {
              ffmpegFallbackError = error instanceof Error ? error.message : String(error ?? "Forge FFmpeg fallback failed.");
              try {
                console.warn("[anvil-whisper] ffmpeg fallback failed", {
                  fileName: uploadFileName,
                  mimeType: mimeType ?? null,
                  message: ffmpegFallbackError,
                });
              } catch {
                // ignore logging failures
              }
            }
          }
        } catch (error) {
          if (error instanceof Response) {
            return error;
          }
          if (clientAborted || upstreamAbort.signal.aborted) {
            return new Response(null, { status: 499 });
          }
          throw error;
        }

        if (clientAborted) {
          return new Response(null, { status: 499 });
        }

        if (!upstream.ok) {
          const detail = upstreamDetail || await upstream.text();
          const resolvedUpstreamMessage = upstreamMessage ?? readUpstreamErrorMessage(detail) ?? "OpenAI error";
          const status = upstream.status >= 400 && upstream.status <= 599 ? upstream.status : 502;
          const responseDetail = ffmpegFallbackError
            ? `${detail}\n\n[forge-ffmpeg fallback] ${ffmpegFallbackError}`
            : detail;
          await recordAiUsageEvent({
            supabaseService,
            userId,
            lane,
            provider: "openai",
            workspaceId: null,
            workpieceId: null,
            sessionId: null,
            feature: AI_USAGE_FEATURE.SPEECH_TRANSCRIPTION,
            subfeature: AI_USAGE_SUBFEATURE.ANVIL_WHISPER,
            model: requestSttModel,
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            estimatedCostUsd: 0,
            actualCostUsd: 0,
            billableTokens: 0,
            trigger: AI_USAGE_TRIGGER.USER,
            status: AI_USAGE_STATUS.ERROR,
            actionId,
            providerRequestId: upstream.headers.get("x-request-id"),
            correlationId: actionId,
          });
          return jsonResponse(status, {
            ok: false,
            text: "",
            error: resolvedUpstreamMessage,
            detail: responseDetail,
            model: requestSttModel,
            provider_request_id: upstream.headers.get("x-request-id"),
            billing_mode: lane,
            ffmpeg_fallback_attempted: ffmpegFallbackAttempted || undefined,
            ffmpeg_fallback_used: ffmpegFallbackUsed || undefined,
            ffmpeg_fallback_error: ffmpegFallbackError ?? undefined,
          });
        }

        const payload = (await upstream.json()) as unknown;
        const text = extractTranscriptionText(payload);
        const providerRequestId = upstream.headers.get("x-request-id");
        const accounting = buildTranscriptionAccounting({
          model: requestSttModel,
          payload,
          text,
          billableMode: lane === AI_USAGE_LANE.FORGE ? AI_USAGE_LANE.FORGE : "non-billable",
        });
        await recordAiUsageEvent({
          supabaseService,
          userId,
          lane,
          provider: "openai",
          workspaceId: null,
          workpieceId: null,
          sessionId: null,
          feature: AI_USAGE_FEATURE.SPEECH_TRANSCRIPTION,
          subfeature: AI_USAGE_SUBFEATURE.ANVIL_WHISPER,
          model: requestSttModel,
          inputTokens: accounting.inputTokens,
          outputTokens: accounting.outputTokens,
          totalTokens: accounting.totalTokens,
          estimatedCostUsd: accounting.estimatedCostUsd,
          actualCostUsd: accounting.actualCostUsd,
          billableTokens: accounting.billableTokens,
          trigger: AI_USAGE_TRIGGER.USER,
          status: AI_USAGE_STATUS.SUCCESS,
          actionId,
          providerRequestId,
          correlationId: actionId,
        });

        if (lane === AI_USAGE_LANE.FORGE && accounting.billableTokens > 0 && userId) {
          const deltaResult = await applyAiTokenDelta({
            supabaseService,
            userId,
            spent: accounting.billableTokens,
            requestId: actionId,
            openAiRequestId: providerRequestId,
            reason: "speech_transcription:anvil_whisper:forge_billing_tokens",
          });
          if (!deltaResult.ok) {
            return jsonResponse(502, {
              ok: false,
              text: "",
              error: "Failed to apply Forge credit deduction.",
              code: "forge_deduction_failed",
              model: requestSttModel,
              provider_request_id: providerRequestId,
              billing_mode: lane,
            });
          }
          if (deltaResult.tokenBalance != null) {
            tokenBalance = deltaResult.tokenBalance;
          }
        }

        return jsonResponse(200, {
          ok: true,
          text,
          empty: text.length === 0,
          model: requestSttModel,
          provider_request_id: providerRequestId,
          billing_mode: lane,
          actual_cost_usd: accounting.actualCostUsd,
          billable_tokens: accounting.billableTokens,
          credits_warning: null,
          ffmpeg_fallback_attempted: ffmpegFallbackAttempted || undefined,
          ffmpeg_fallback_used: ffmpegFallbackUsed || undefined,
          ffmpeg_fallback_error: ffmpegFallbackError ?? undefined,
        });
      } finally {
        request.signal.removeEventListener("abort", onAborted);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return jsonResponse(500, { ok: false, text: "", error: message });
    }
  };
}
