import crypto from "node:crypto";
import { Buffer } from "node:buffer";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { InferenceClient } from "@huggingface/inference";
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
const HUGGINGFACE_UPSTREAM_TIMEOUT_MS = 30_000;

export type AnvilWhisperRuntimeConfig = {
  apiKey: string | null;
  sttModel: string;
  asr2SttModel?: string;
  asr2Provider?: "openai" | "huggingface" | "auto";
  huggingFaceApiToken?: string | null;
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
  provider?: "openai" | "huggingface" | "auto";
  model_id?: string;
  asr_lane?: string | null;
  upstream_status?: number;
  upstream_message?: string | null;
  upstream_url?: string | null;
  model_url?: string | null;
  model?: string;
  provider_request_id?: string | null;
  billing_mode?: BillingMode;
  actual_cost_usd?: number;
  billable_tokens?: number;
  credits_warning?: string | null;
  ffmpeg_fallback_attempted?: boolean;
  ffmpeg_fallback_used?: boolean;
  ffmpeg_fallback_error?: string | null;
  input_audio_content_type?: string | null;
  input_audio_size_bytes?: number;
  hf_request_content_type?: string | null;
  billing_status?: "deduction_applied" | "deduction_deferred";
  billing_error_code?: string | null;
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

function isModelUnavailableUpstreamError(detail: string): boolean {
  const text = String(detail || "").trim().toLowerCase();
  if (!text) return false;
  return (
    text.includes("model_not_found")
    || (text.includes("model") && text.includes("does not exist"))
    || (text.includes("model") && text.includes("do not have access"))
    || (text.includes("model") && text.includes("not available"))
  );
}

function extractTranscriptionText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const row = payload as Record<string, unknown>;
  return readOptionalString(row.text) ?? "";
}

function extractHuggingFaceTranscriptionText(payload: unknown): string {
  if (!payload) return "";
  if (typeof payload === "string") return payload.trim();
  if (Array.isArray(payload)) {
    for (const entry of payload) {
      if (!entry || typeof entry !== "object") continue;
      const text = readOptionalString((entry as Record<string, unknown>).text);
      if (text) return text;
    }
    return "";
  }
  if (typeof payload === "object") {
    const row = payload as Record<string, unknown>;
    return readOptionalString(row.text) ?? "";
  }
  return "";
}

function readHuggingFaceErrorMessage(detail: string): string | null {
  if (!detail.trim()) return null;
  try {
    const payload = JSON.parse(detail) as Record<string, unknown>;
    return readOptionalString(payload.error) ?? readOptionalString(payload.message);
  } catch {
    return null;
  }
}

function stringifyUpstreamBody(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.trim() || null;
  try {
    const text = JSON.stringify(value);
    return text.trim() || null;
  } catch {
    return null;
  }
}

function truncateForDetail(value: string | null, limit = 2000): string | null {
  if (!value) return null;
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}…`;
}

function normalizeHuggingFaceModelId(modelId: string): string {
  const trimmed = modelId.trim();
  const suffixIndex = trimmed.indexOf(":");
  return suffixIndex > 0 ? trimmed.slice(0, suffixIndex) : trimmed;
}

function inferHuggingFaceAudioContentType(fileName: string | null, mimeType: string | null): string | null {
  const normalizedType = readOptionalString(mimeType)?.toLowerCase() ?? "";
  if (normalizedType.includes("audio/webm") && normalizedType.includes("codecs=opus")) return "audio/webm;codecs=opus";
  if (normalizedType.includes("audio/webm")) return "audio/webm";
  if (normalizedType.includes("audio/wav") || normalizedType.includes("audio/x-wav")) return "audio/wav";
  if (normalizedType.includes("audio/flac") || normalizedType.includes("audio/x-flac")) return "audio/flac";
  if (normalizedType.includes("audio/m4a") || normalizedType.includes("audio/mp4")) return "audio/m4a";

  const normalizedName = readOptionalString(fileName)?.toLowerCase() ?? "";
  if (normalizedName.endsWith(".webm")) return "audio/webm";
  if (normalizedName.endsWith(".wav")) return "audio/wav";
  if (normalizedName.endsWith(".flac")) return "audio/flac";
  if (normalizedName.endsWith(".m4a") || normalizedName.endsWith(".mp4")) return "audio/m4a";
  return null;
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
  const asr2ModelOverride = readOptionalString(process.env.ANVIL_ASR2_STT_MODEL);
  const asr2ProviderOverride = readOptionalString(process.env.ANVIL_ASR2_PROVIDER)?.toLowerCase();
  const huggingFaceApiToken = readOptionalString(process.env.HUGGINGFACE_API_TOKEN)
    ?? readOptionalString(process.env.HF_TOKEN)
    ?? null;
  const asr2Provider = asr2ProviderOverride === "auto"
    ? "auto"
    : asr2ProviderOverride === "huggingface"
      ? "huggingface"
      : asr2ProviderOverride === "openai"
        ? "openai"
        : (huggingFaceApiToken ? "auto" : "openai");
  return {
    apiKey: runtime.textApiKey ?? runtime.apiKey ?? null,
    sttModel: modelOverride ?? runtime.sttModel ?? DEFAULT_MODEL,
    asr2SttModel: asr2ModelOverride ?? ((asr2Provider === "huggingface" || asr2Provider === "auto")
      ? "openai/whisper-large-v3-turbo"
      : "gpt-4o-transcribe"),
    asr2Provider,
    huggingFaceApiToken,
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
  const asr2Provider = config.asr2Provider === "huggingface"
    ? "huggingface"
    : config.asr2Provider === "auto"
      ? "auto"
      : "openai";
  const asr2SttModel = readOptionalString(config.asr2SttModel) ?? ((asr2Provider === "huggingface" || asr2Provider === "auto")
    ? "openai/whisper-large-v3-turbo"
    : "gpt-4o-transcribe");
  const huggingFaceApiToken = readOptionalString(config.huggingFaceApiToken);
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
      const requestSttModel =
        (asrLane || "").toUpperCase() === "ASR2_WHISPER_LARGE_V3_EXPERIMENTAL"
          ? asr2SttModel
          : sttModel;
      const asr2ExperimentalSelected = (asrLane || "").toUpperCase() === "ASR2_WHISPER_LARGE_V3_EXPERIMENTAL";
      const requestProvider = asr2ExperimentalSelected ? asr2Provider : "openai";
      const normalizedRequestSttModel = (requestProvider === "huggingface" || requestProvider === "auto")
        ? normalizeHuggingFaceModelId(requestSttModel)
        : requestSttModel;
      const huggingFaceModelUrl = (requestProvider === "huggingface" || requestProvider === "auto")
        ? `https://huggingface.co/${normalizedRequestSttModel}`
        : null;
      const fileName = readOptionalString((fileValue as { name?: unknown }).name);
      const mimeType = readOptionalString((fileValue as { type?: unknown }).type);
      const extension = inferExtension(fileName, mimeType);
      const uploadFileName = fileName ?? `chunk.${extension}`;
      const inputAudioSizeBytes = fileValue.size;
      const inputAudioContentType = inferHuggingFaceAudioContentType(fileName, mimeType);

      function buildUpstreamForm(
        nextModel: string,
        nextFileValue: Blob,
        nextFileName: string,
        includeLanguage: boolean,
      ): FormData {
        const upstreamForm = new FormData();
        upstreamForm.set("model", nextModel);
        upstreamForm.set("response_format", "json");
        upstreamForm.set("file", nextFileValue, nextFileName);
        if (includeLanguage && language) upstreamForm.set("language", language);
        if (prompt) upstreamForm.set("prompt", prompt);
        return upstreamForm;
      }

      async function sendToOpenAi(
        nextModel: string,
        nextFileValue: Blob,
        nextFileName: string,
      ): Promise<{
        upstream: Response;
        detail: string;
        message: string | null;
        upstreamUrl: string | null;
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
            body: buildUpstreamForm(nextModel, nextFileValue, nextFileName, usedLanguageHint),
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
                body: buildUpstreamForm(nextModel, nextFileValue, nextFileName, false),
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

        return { upstream, detail, message, upstreamUrl: null };
      }

      async function sendToHuggingFace(
        _providerMode: "huggingface" | "auto",
        nextModel: string,
        nextFileValue: Blob,
        nextContentType: string,
      ): Promise<{
        upstream: Response;
        detail: string;
        message: string | null;
        upstreamUrl: string | null;
      }> {
        if (!huggingFaceApiToken) {
          return {
            upstream: new Response(JSON.stringify({ error: "Missing HUGGINGFACE_API_TOKEN in server env", code: "hf_missing_token" }), { status: 500 }),
            detail: JSON.stringify({ error: "Missing HUGGINGFACE_API_TOKEN in server env", code: "hf_missing_token" }),
            message: "Missing HUGGINGFACE_API_TOKEN in server env",
            upstreamUrl: null,
          };
        }
        let upstream: Response;
        let detail = "";
        let message: string | null = null;
        let upstreamUrl: string | null = null;
        const hfAbort = new AbortController();
        const timeoutHandle = setTimeout(() => {
          hfAbort.abort();
        }, HUGGINGFACE_UPSTREAM_TIMEOUT_MS);
        const onParentAbort = () => hfAbort.abort();
        upstreamAbort.signal.addEventListener("abort", onParentAbort, { once: true });
        try {
          const inferenceClient = new InferenceClient(huggingFaceApiToken);
          const audioBytes = await nextFileValue.arrayBuffer();
          const requestBlob = new Blob([audioBytes], { type: nextContentType });
          const response = await inferenceClient.automaticSpeechRecognition({
            provider: "hf-inference",
            model: nextModel,
            data: requestBlob,
          }, {
            fetch: async (url, init) => {
              upstreamUrl = typeof url === "string" ? url : url.toString();
              const headers = new Headers(init?.headers);
              if (!headers.get("content-type")) headers.set("content-type", nextContentType);
              return fetch(url, {
                ...init,
                headers,
                signal: hfAbort.signal,
              });
            },
          });
          if (response instanceof Blob || response instanceof ArrayBuffer || ArrayBuffer.isView(response)) {
            detail = JSON.stringify({
              error: "Malformed response from Hugging Face ASR upstream",
              code: "hf_malformed_upstream_response",
              upstream_status: 502,
            });
            message = "Malformed upstream response";
            upstream = new Response(detail, {
              status: 502,
              headers: { "content-type": "application/json; charset=utf-8" },
            });
            return { upstream, detail, message, upstreamUrl };
          }
          upstream = new Response(JSON.stringify(response), {
            status: 200,
            headers: { "content-type": "application/json; charset=utf-8" },
          });
        } catch (error) {
          if (hfAbort.signal.aborted && !clientAborted && !upstreamAbort.signal.aborted) {
            return {
              upstream: new Response(JSON.stringify({ error: "Hugging Face upstream timeout", code: "hf_upstream_timeout" }), { status: 504 }),
              detail: JSON.stringify({ error: "Hugging Face upstream timeout", code: "hf_upstream_timeout" }),
              message: "Hugging Face upstream timeout",
              upstreamUrl,
            };
          }
          if (clientAborted || upstreamAbort.signal.aborted) {
            throw new Response(null, { status: 499 });
          }
          const row = error as {
            message?: string;
            cause?: {
              message?: string;
              httpRequest?: { url?: string };
              httpResponse?: { status?: number; body?: unknown };
            };
            httpRequest?: { url?: string };
            httpResponse?: { status?: number; body?: unknown };
          };
          const httpRequest = row.httpRequest ?? row.cause?.httpRequest;
          const httpResponse = row.httpResponse ?? row.cause?.httpResponse;
          upstreamUrl = httpRequest?.url ?? upstreamUrl;
          const rawBody = truncateForDetail(stringifyUpstreamBody(httpResponse?.body));
          message = (typeof row.message === "string" && row.message.trim())
            ? row.message
            : (typeof row.cause?.message === "string" && row.cause.message.trim())
              ? row.cause.message
            : "Hugging Face error";
          detail = JSON.stringify({
            error: message,
            code: httpResponse?.status === 404 ? "hf_upstream_404" : "hf_upstream_error",
            upstream_status: httpResponse?.status ?? 502,
            upstream_body: rawBody,
          });
          upstream = new Response(detail, {
            status: httpResponse?.status ?? 502,
            headers: { "content-type": "application/json; charset=utf-8" },
          });
        } finally {
          clearTimeout(timeoutHandle);
          upstreamAbort.signal.removeEventListener("abort", onParentAbort);
        }
        return { upstream, detail, message, upstreamUrl };
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
        let upstreamUrl: string | null = null;
        let resolvedModel = normalizedRequestSttModel;
        let ffmpegFallbackAttempted = false;
        let ffmpegFallbackUsed = false;
        let ffmpegFallbackError: string | null = null;
        let hfRequestContentType: string | null = null;
        try {
          if ((requestProvider === "huggingface" || requestProvider === "auto") && !inputAudioContentType) {
            return jsonResponse(400, {
              ok: false,
              text: "",
              error: "ASR2 Hugging Face audio content type missing",
              code: "hf_audio_content_type_missing",
              provider: requestProvider,
              model_id: normalizedRequestSttModel,
              asr_lane: asrLane ?? null,
              input_audio_content_type: null,
              input_audio_size_bytes: inputAudioSizeBytes,
              hf_request_content_type: null,
              billing_mode: lane,
            });
          }
          const directAttempt = requestProvider === "huggingface"
            || requestProvider === "auto"
            ? await sendToHuggingFace(
              requestProvider === "auto" ? "auto" : "huggingface",
              normalizedRequestSttModel,
              fileValue,
              inputAudioContentType ?? "audio/webm",
            )
            : await sendToOpenAi(requestSttModel, fileValue, uploadFileName);
          upstream = directAttempt.upstream;
          upstreamDetail = directAttempt.detail;
          upstreamMessage = directAttempt.message;
          upstreamUrl = directAttempt.upstreamUrl ?? upstreamUrl;
          hfRequestContentType = (requestProvider === "huggingface" || requestProvider === "auto")
            ? (inputAudioContentType ?? null)
            : null;

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
              const transcodedAttempt = requestProvider === "huggingface"
                || requestProvider === "auto"
                ? await sendToHuggingFace(requestProvider === "auto" ? "auto" : "huggingface", resolvedModel, transcodedBlob, "audio/wav")
                : await sendToOpenAi(
                  resolvedModel,
                  transcodedBlob,
                  replaceFileExtension(uploadFileName, "wav"),
                );
              upstream = transcodedAttempt.upstream;
              upstreamDetail = transcodedAttempt.detail;
              upstreamMessage = transcodedAttempt.message;
              upstreamUrl = transcodedAttempt.upstreamUrl ?? upstreamUrl;
              hfRequestContentType = (requestProvider === "huggingface" || requestProvider === "auto")
                ? "audio/wav"
                : hfRequestContentType;
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
          const isHfProvider = requestProvider === "huggingface" || requestProvider === "auto";
          const isAsr2ModelUnavailable = asr2ExperimentalSelected && isModelUnavailableUpstreamError(detail);
          const hfMessage = isHfProvider ? readHuggingFaceErrorMessage(detail) : null;
          const hfMissingToken = isHfProvider && (
            hfMessage?.toLowerCase().includes("missing huggingface_api_token")
            || detail.toLowerCase().includes("hf_missing_token")
          );
          const hfTimeout = isHfProvider && (
            hfMessage?.toLowerCase().includes("upstream timeout")
            || detail.toLowerCase().includes("hf_upstream_timeout")
          );
          const hfMalformed = isHfProvider && detail.toLowerCase().includes("hf_malformed_upstream_response");
          const resolvedUpstreamMessage = isAsr2ModelUnavailable
            ? "ASR2 model unavailable for selected provider"
            : (
              upstreamMessage
              ?? (isHfProvider
                ? readHuggingFaceErrorMessage(detail)
                : readUpstreamErrorMessage(detail))
              ?? (isHfProvider ? "Hugging Face error" : "OpenAI error")
            );
          const resolvedCode = isHfProvider
            ? (
              hfMissingToken ? "hf_missing_token"
                : hfTimeout ? "hf_upstream_timeout"
                  : hfMalformed ? "hf_malformed_upstream_response"
                  : isAsr2ModelUnavailable ? "hf_provider_model_unavailable"
                    : upstream.status === 404 ? "hf_upstream_404"
                      : "hf_upstream_error"
            )
            : undefined;
          const status = upstream.status >= 400 && upstream.status <= 599 ? upstream.status : 502;
          const responseDetail = ffmpegFallbackError
            ? `${detail}\n\n[forge-ffmpeg fallback] ${ffmpegFallbackError}`
            : detail;
          await recordAiUsageEvent({
            supabaseService,
            userId,
            lane,
            provider: requestProvider,
            workspaceId: null,
            workpieceId: null,
            sessionId: null,
            feature: AI_USAGE_FEATURE.SPEECH_TRANSCRIPTION,
            subfeature: AI_USAGE_SUBFEATURE.ANVIL_WHISPER,
            model: resolvedModel,
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
            code: resolvedCode,
            detail: responseDetail,
            provider: requestProvider,
            model_id: resolvedModel,
            asr_lane: asrLane ?? null,
            upstream_status: upstream.status,
            upstream_message: resolvedUpstreamMessage,
            upstream_url: isHfProvider
              ? upstreamUrl
              : "https://api.openai.com/v1/audio/transcriptions",
            model_url: isHfProvider ? huggingFaceModelUrl : null,
            model: resolvedModel,
            provider_request_id: upstream.headers.get("x-request-id"),
            billing_mode: lane,
            ffmpeg_fallback_attempted: ffmpegFallbackAttempted || undefined,
            ffmpeg_fallback_used: ffmpegFallbackUsed || undefined,
            ffmpeg_fallback_error: ffmpegFallbackError ?? undefined,
            input_audio_content_type: isHfProvider ? inputAudioContentType : undefined,
            input_audio_size_bytes: isHfProvider ? inputAudioSizeBytes : undefined,
            hf_request_content_type: isHfProvider ? hfRequestContentType : undefined,
          });
        }

        let payload: unknown;
        try {
          payload = (await upstream.json()) as unknown;
        } catch {
          if (requestProvider === "huggingface" || requestProvider === "auto") {
            return jsonResponse(502, {
              ok: false,
              text: "",
              error: "Malformed response from Hugging Face ASR upstream",
              code: "hf_malformed_upstream_response",
              detail: "Expected JSON payload from Hugging Face inference API.",
              provider: requestProvider,
              model_id: resolvedModel,
              asr_lane: asrLane ?? null,
              upstream_status: upstream.status,
              upstream_message: "Malformed upstream response",
              upstream_url: requestProvider === "auto"
                ? upstreamUrl
                : upstreamUrl,
              model_url: huggingFaceModelUrl,
              model: resolvedModel,
              provider_request_id: upstream.headers.get("x-request-id"),
              billing_mode: lane,
              input_audio_content_type: inputAudioContentType,
              input_audio_size_bytes: inputAudioSizeBytes,
              hf_request_content_type: hfRequestContentType,
            });
          }
          throw new Error("Malformed response from OpenAI ASR upstream");
        }
        const text = requestProvider === "huggingface"
          ? extractHuggingFaceTranscriptionText(payload)
          : extractTranscriptionText(payload);
        const providerRequestId = upstream.headers.get("x-request-id");
        const accounting = buildTranscriptionAccounting({
            model: resolvedModel,
          payload,
          text,
          billableMode: lane === AI_USAGE_LANE.FORGE ? AI_USAGE_LANE.FORGE : "non-billable",
        });
        await recordAiUsageEvent({
          supabaseService,
          userId,
          lane,
          provider: requestProvider,
          workspaceId: null,
          workpieceId: null,
          sessionId: null,
          feature: AI_USAGE_FEATURE.SPEECH_TRANSCRIPTION,
          subfeature: AI_USAGE_SUBFEATURE.ANVIL_WHISPER,
          model: resolvedModel,
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
            if (asr2ExperimentalSelected) {
              try {
                console.warn("[anvil-whisper] ASR2 experimental billing deferred", {
                  asrLane,
                  billingMode: lane,
                  billingErrorCode: "forge_deduction_failed",
                  provider: requestProvider,
                  model: resolvedModel,
                  providerRequestId,
                });
              } catch {
                // ignore logging failures
              }
              return jsonResponse(200, {
                ok: true,
                text,
                empty: text.length === 0,
                provider: requestProvider,
                model_id: resolvedModel,
                asr_lane: asrLane ?? null,
                upstream_status: upstream.status,
                upstream_message: null,
                upstream_url: requestProvider === "openai"
                  ? "https://api.openai.com/v1/audio/transcriptions"
                  : upstreamUrl,
                model_url: (requestProvider === "huggingface" || requestProvider === "auto")
                  ? huggingFaceModelUrl
                  : null,
                model: resolvedModel,
                provider_request_id: providerRequestId,
                billing_mode: lane,
                billing_status: "deduction_deferred",
                billing_error_code: "forge_deduction_failed",
                actual_cost_usd: accounting.actualCostUsd,
                billable_tokens: accounting.billableTokens,
                credits_warning: null,
                ffmpeg_fallback_attempted: ffmpegFallbackAttempted || undefined,
                ffmpeg_fallback_used: ffmpegFallbackUsed || undefined,
                ffmpeg_fallback_error: ffmpegFallbackError ?? undefined,
                input_audio_content_type: (requestProvider === "huggingface" || requestProvider === "auto") ? inputAudioContentType : undefined,
                input_audio_size_bytes: (requestProvider === "huggingface" || requestProvider === "auto") ? inputAudioSizeBytes : undefined,
                hf_request_content_type: (requestProvider === "huggingface" || requestProvider === "auto") ? hfRequestContentType : undefined,
              });
            }
            return jsonResponse(502, {
              ok: false,
              text: "",
              error: "Failed to apply Forge credit deduction.",
              code: "forge_deduction_failed",
              model: resolvedModel,
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
          provider: requestProvider,
          model_id: resolvedModel,
          asr_lane: asrLane ?? null,
          upstream_status: upstream.status,
          upstream_message: null,
          upstream_url: requestProvider === "openai"
            ? "https://api.openai.com/v1/audio/transcriptions"
            : upstreamUrl,
          model_url: (requestProvider === "huggingface" || requestProvider === "auto")
            ? huggingFaceModelUrl
            : null,
          model: resolvedModel,
          provider_request_id: providerRequestId,
          billing_mode: lane,
          billing_status: lane === AI_USAGE_LANE.FORGE && accounting.billableTokens > 0 ? "deduction_applied" : undefined,
          billing_error_code: null,
          actual_cost_usd: accounting.actualCostUsd,
          billable_tokens: accounting.billableTokens,
          credits_warning: null,
          ffmpeg_fallback_attempted: ffmpegFallbackAttempted || undefined,
          ffmpeg_fallback_used: ffmpegFallbackUsed || undefined,
          ffmpeg_fallback_error: ffmpegFallbackError ?? undefined,
          input_audio_content_type: (requestProvider === "huggingface" || requestProvider === "auto") ? inputAudioContentType : undefined,
          input_audio_size_bytes: (requestProvider === "huggingface" || requestProvider === "auto") ? inputAudioSizeBytes : undefined,
          hf_request_content_type: (requestProvider === "huggingface" || requestProvider === "auto") ? hfRequestContentType : undefined,
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
