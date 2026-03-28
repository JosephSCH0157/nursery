import crypto from "node:crypto";
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

export const ANVIL_WHISPER_ROUTE = "/api/anvil/asr/whisper";
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const DEFAULT_MODEL = "gpt-4o-mini-transcribe";
const MISSING_OPENAI_API_KEY_ERROR = "Missing OPENAI_TEXT_API_KEY (or OPENAI_API_KEY) in server env";

export type AnvilWhisperRuntimeConfig = {
  apiKey: string | null;
  sttModel: string;
  configuredBillingMode?: BillingMode;
  supabaseUrl?: string | null;
  supabaseServiceRoleKey?: string | null;
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

export function resolveAnvilWhisperRuntimeConfig(): AnvilWhisperRuntimeConfig {
  const runtime = resolveHearthRuntimeConfig();
  const modelOverride = readOptionalString(process.env.ANVIL_STT_MODEL);
  return {
    apiKey: runtime.textApiKey ?? runtime.apiKey ?? null,
    sttModel: modelOverride ?? runtime.sttModel ?? DEFAULT_MODEL,
    configuredBillingMode: runtime.configuredBillingMode,
    supabaseUrl: runtime.supabaseUrl,
    supabaseServiceRoleKey: runtime.supabaseServiceRoleKey,
  };
}

export function createAnvilWhisperHandler(config: AnvilWhisperRuntimeConfig) {
  const apiKey = readOptionalString(config.apiKey);
  const sttModel = readOptionalString(config.sttModel) ?? DEFAULT_MODEL;
  const configuredBillingMode = normalizeBillingMode(config.configuredBillingMode, "forge");
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

      if (!apiKey) {
        return jsonResponse(500, {
          ok: false,
          text: "",
          error: MISSING_OPENAI_API_KEY_ERROR,
        });
      }

      let formData: FormData;
      try {
        formData = await request.formData();
      } catch {
        return jsonResponse(400, {
          ok: false,
          text: "",
          error: "multipart/form-data body required",
        });
      }

      const fileValue = formData.get("file") ?? formData.get("audio");
      if (!isBlobLike(fileValue)) {
        return jsonResponse(400, {
          ok: false,
          text: "",
          error: "file field is required",
        });
      }

      if (fileValue.size <= 0) {
        return jsonResponse(400, {
          ok: false,
          text: "",
          error: "audio chunk is empty",
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
      const lane = normalizeBillingMode(laneFromBody ?? laneFromQuery, configuredBillingMode);
      if (lane === AI_USAGE_LANE.FORGE && !supabaseService) {
        return jsonResponse(500, {
          ok: false,
          text: "",
          error: "Supabase service role is not configured.",
          billing_mode: lane,
        });
      }
      const userAccessToken = readUserAccessToken(request.headers);
      if (lane === AI_USAGE_LANE.FORGE && !userAccessToken) {
        return jsonResponse(401, {
          ok: false,
          text: "",
          error: "Authentication required.",
          billing_mode: lane,
        });
      }

      const userId = await resolveUserIdFromAccessToken({
        supabaseService,
        accessToken: userAccessToken,
      });
      if (lane === AI_USAGE_LANE.FORGE && !userId) {
        return jsonResponse(401, {
          ok: false,
          text: "",
          error: "Authentication required.",
          billing_mode: lane,
        });
      }
      const providedActionId = readOptionalString(formData.get("action_id"));
      const actionId = providedActionId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(providedActionId)
        ? providedActionId
        : crypto.randomUUID();

      const language = readOptionalString(formData.get("language"));
      const prompt = readOptionalString(formData.get("prompt"));
      const fileName = readOptionalString((fileValue as { name?: unknown }).name);
      const mimeType = readOptionalString((fileValue as { type?: unknown }).type);
      const extension = inferExtension(fileName, mimeType);

      const upstreamForm = new FormData();
      upstreamForm.set("model", sttModel);
      upstreamForm.set("response_format", "json");
      upstreamForm.set("file", fileValue, fileName ?? `chunk.${extension}`);
      if (language) upstreamForm.set("language", language);
      if (prompt) upstreamForm.set("prompt", prompt);

      const upstreamAbort = new AbortController();
      let clientAborted = request.signal.aborted;
      const onAborted = () => {
        clientAborted = true;
        upstreamAbort.abort();
      };
      request.signal.addEventListener("abort", onAborted, { once: true });

      try {
        let upstream: Response;
        try {
          upstream = await fetch("https://api.openai.com/v1/audio/transcriptions", {
            method: "POST",
            headers: {
              authorization: `Bearer ${apiKey}`,
            },
            body: upstreamForm,
            signal: upstreamAbort.signal,
          });
        } catch (error) {
          if (clientAborted || upstreamAbort.signal.aborted) {
            return new Response(null, { status: 499 });
          }
          throw error;
        }

        if (clientAborted) {
          return new Response(null, { status: 499 });
        }

        if (!upstream.ok) {
          const detail = await upstream.text();
          const upstreamMessage = readUpstreamErrorMessage(detail) ?? "OpenAI error";
          const status = upstream.status >= 400 && upstream.status <= 599 ? upstream.status : 502;
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
            model: sttModel,
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
            error: upstreamMessage,
            detail,
            model: sttModel,
            provider_request_id: upstream.headers.get("x-request-id"),
            billing_mode: lane,
          });
        }

        const payload = (await upstream.json()) as unknown;
        const text = extractTranscriptionText(payload);
        const providerRequestId = upstream.headers.get("x-request-id");
        const accounting = buildTranscriptionAccounting({
          model: sttModel,
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
          model: sttModel,
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
              model: sttModel,
              provider_request_id: providerRequestId,
              billing_mode: lane,
            });
          }
        }

        return jsonResponse(200, {
          ok: true,
          text,
          empty: text.length === 0,
          model: sttModel,
          provider_request_id: providerRequestId,
          billing_mode: lane,
          actual_cost_usd: accounting.actualCostUsd,
          billable_tokens: accounting.billableTokens,
          credits_warning: null,
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
