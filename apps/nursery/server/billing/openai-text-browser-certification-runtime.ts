import { createClient } from "@supabase/supabase-js";
import type { HearthRuntimeConfig } from "../hearth/hearth-runtime-config";
import type { HammerPrepMiddlewareOptions } from "../../scripts/mw-hammer-prep";
import type { TongsCommitApiOptions } from "../../../../packages/tongs/src/workpiece-commit-api";
import { OpenAiTextBrowserCertificationGate } from "./openai-text-browser-certification-gate";

type JsonObject = Record<string, unknown>;

export type OpenAiTextBrowserCertificationRuntime = {
  hearth: Partial<HearthRuntimeConfig>;
  hammer: HammerPrepMiddlewareOptions;
  tongs: Partial<TongsCommitApiOptions>;
};

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required for isolated browser certification`);
  return value;
}

function malformed(value: unknown): boolean {
  return JSON.stringify(value).includes("[CERT MALFORMED]");
}

function parsePricingMap(raw: string): Record<string, string> {
  const value = JSON.parse(raw) as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid certification pricing map");
  return Object.fromEntries(Object.entries(value as JsonObject).map(([route, id]) => [route, String(id)]));
}

export function resolveOpenAiTextBrowserCertificationRuntime(
  env: NodeJS.ProcessEnv = process.env,
): OpenAiTextBrowserCertificationRuntime | null {
  const batchId = env.FORGE_OPENAI_BROWSER_CERTIFICATION_BATCH_ID?.trim();
  if (!batchId) return null;
  const supabaseUrl = required(env, "TONGS_SUPABASE_URL");
  if (!/^http:\/\/(127\.0\.0\.1|localhost):55321\/?$/i.test(supabaseUrl)) {
    throw new Error("OpenAI browser certification is pinned to the isolated 55321 Supabase API");
  }
  if (env.NODE_ENV === "production") throw new Error("OpenAI browser certification cannot run in production");
  if (env.OPENAI_TEXT_API_KEY || env.OPENAI_API_KEY) {
    throw new Error("Remove all OpenAI execution credentials from the browser-certification process");
  }
  const serviceRoleKey = required(env, "TONGS_SERVICE_ROLE_KEY");
  const anonKey = required(env, "TONGS_SUPABASE_ANON_KEY");
  const operatorId = required(env, "FORGE_OPENAI_BROWSER_CERTIFICATION_OPERATOR_ID");
  const pricingRevisionIds = parsePricingMap(required(env, "FORGE_OPENAI_BROWSER_CERTIFICATION_PRICING_MAP"));
  const gate = new OpenAiTextBrowserCertificationGate({
    supabaseUrl,
    serviceRoleKey,
    batchId,
    operatorId,
    pricingRevisionIds,
  });
  const service = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const unified = {
    generate: async (input: { scriptText: string; creatorDirection: string | null; generationScope: string; model?: string | null }) => {
      const invalid = malformed(input);
      const scriptLines = input.scriptText.split(/\r?\n/u)
        .map((line) => line.trim())
        .filter((line) => line.length >= 12 && !/^\[[^\]]+\]$/u.test(line));
      const imageFocus = scriptLines[0] ?? input.scriptText.trim().slice(0, 500) ?? "Synthetic Test script focus";
      const brollFocus = scriptLines[1] ?? scriptLines[0] ?? imageFocus;
      const allowBroll = input.generationScope === "images_broll" || input.generationScope === "full_media_plan";
      return {
        plan: {
          images: invalid ? [] : [{ context_before: "", context_focus: imageFocus, context_after: "", description: "A neutral Test visual grounded in the canonical script", visual_intent: "Clarify the supplied Test idea", creator_direction: input.creatorDirection ?? "Neutral Test", style: "documentary", placement_hint: "during the supplied Test sentence", source_keys: [], source_relationship: "none" as const, source_rationale: "No external source is required." }],
          broll: invalid || !allowBroll ? [] : [{ context_before: "", context_focus: brollFocus, context_after: "", narrative_purpose: "Show the supplied Test action", placement_hint: "during the supplied Test sentence", duration_target_ms: 5000, shot_type: "tracking", motion_intent: "Track slowly across the Test scene", mood_pacing: "calm and steady", asset_category: "generated", source_keys: [], source_relationship: "none" as const, source_rationale: "No external source is required." }],
          reference_clips: [],
          reference_visuals: [],
        },
        rawResponse: { synthetic_test: true, real_provider_called: false },
        providerRequestId: `sim-browser-unified-${crypto.randomUUID()}`,
        inputTokens: 120,
        outputTokens: 60,
        totalTokens: 180,
        model: input.model ?? "gpt-5-mini",
      };
    },
  };
  const narrative = {
    interpret: async (input: { request: JsonObject; model?: string | null }) => {
      const invalid = malformed(input.request);
      const source = (input.request.source_context && typeof input.request.source_context === "object")
        ? input.request.source_context as JsonObject
        : {};
      return {
        brief: {
          narrative_purpose: "Explain the supplied Test moment",
          central_message: invalid ? "appropriate context" : "The canonical Test moment is understandable on sight",
          primary_subjects: ["Test host", "source material"],
          relationship_or_action: "The host points to the supplied source material",
          emotional_tone: "calm confidence",
          visual_mode: "documentary" as const,
          setting: "A quiet Test recording desk",
          composition: "The host is framed beside the visible source material",
          essential_visual_evidence: ["host", "source document", "recording desk"],
          avoid: ["brand logos", "unrelated people", "dramatic weather"],
          source_context: { before: String(source.before ?? ""), focus: String(source.focus ?? "Synthetic Test focus"), after: String(source.after ?? "") },
        },
        rawResponse: { synthetic_test: true, real_provider_called: false },
        providerRequestId: `sim-browser-narrative-${crypto.randomUUID()}`,
        inputTokens: 120, outputTokens: 60, totalTokens: 180,
        model: input.model ?? "gpt-5-mini",
      };
    },
  };
  const motion = {
    interpret: async (input: { request: JsonObject; model?: string | null }) => ({
      brief: {
        narrative_purpose: "Show the supplied Test idea changing over time",
        central_message: "A visible movement clarifies the canonical Test moment",
        visible_subjects: ["Test host", "source material"],
        action_over_time: malformed(input.request) ? "static image" : "The camera tracks as the host moves from the desk toward the source material",
        camera_behavior: "The camera tracks slowly and pans toward the source material",
        start_frame: "A wide view of the Test desk",
        end_frame: "A close view of the source material",
        target_duration: "5 seconds",
        pacing: "slow and steady",
        setting: "A quiet Test recording room",
        mood: "calm confidence",
        continuity: "Keep the host, desk, and lighting consistent",
        must_include: ["visible movement", "source material"],
        avoid: ["fast cuts", "camera shake"],
        loopability: "The closing pan can return to the opening angle",
      },
      rawResponse: { synthetic_test: true, real_provider_called: false },
      providerRequestId: `sim-browser-motion-${crypto.randomUUID()}`,
      inputTokens: 120, outputTokens: 60, totalTokens: 180,
      model: input.model ?? "gpt-5-mini",
    }),
  };

  const providerFetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = typeof init?.body === "string" ? init.body : "";
    const invalid = body.includes("[CERT MALFORMED]");
    const requestId = `sim-browser-${crypto.randomUUID()}`;
    const response = (payload: unknown) => Response.json(payload, { headers: { "x-request-id": requestId } });
    const searchableBody = body.replaceAll('\\"', '"');
    const segmentIds = [...searchableBody.matchAll(/"segment_id"\s*:\s*"([^"]+)"/gu)]
      .map((match) => match[1]!)
      .filter((id) => Boolean(id) && id !== "...");
    if (body.includes("hammer_shorts_proposals")) {
      return response({ id: requestId, output_text: invalid ? "not-json" : JSON.stringify({ proposals: [{ proposal_id: "browser-proposal-1", rank: 1, first_segment_id: segmentIds[0] ?? "fixture-segment-1", last_segment_id: segmentIds.at(-1) ?? "fixture-segment-8", rationale: "A complete synthetic Test thought", goal_fit: "Works as a standalone Test clip" }] }), usage: { input_tokens: 120, output_tokens: 60 } });
    }
    if (body.includes("segment_id") || body.includes("cleaned_text")) {
      return response({ id: requestId, choices: [{ message: { content: invalid ? JSON.stringify({ changes: [] }) : JSON.stringify({ changes: [{ segment_id: segmentIds[0] ?? "fixture-segment-1", cleaned_text: "This is the cleaned synthetic Test sentence." }] }) } }], usage: { prompt_tokens: 120, completion_tokens: 60 } });
    }
    if (body.includes("research_artifact")) {
      return response({ id: requestId, choices: [{ message: { content: invalid ? "" : "The supplied synthetic Test source supports the requested research synthesis." } }], usage: { prompt_tokens: 120, completion_tokens: 60 } });
    }
    if (body.includes("metadata") || body.includes("tags")) {
      return response({ id: requestId, choices: [{ message: { content: invalid ? JSON.stringify({ title: "", description: "", tags: [] }) : JSON.stringify({ title: "Synthetic Test Episode", description: "Synthetic metadata created without a paid provider.", tags: ["test", "podcast"] }) } }], usage: { prompt_tokens: 120, completion_tokens: 60 } });
    }
    return response({ id: requestId, choices: [{ message: { content: invalid ? "" : "The supplied synthetic Test source supports the requested research synthesis." } }], usage: { prompt_tokens: 120, completion_tokens: 60 } });
  }) as typeof fetch;

  const hearth: Partial<HearthRuntimeConfig> = {
    textApiKey: "synthetic-browser-boundary",
    apiKey: "synthetic-browser-boundary",
    model: "gpt-5.3",
    configuredBillingMode: "forge",
    supabaseUrl,
    supabaseServiceRoleKey: serviceRoleKey,
    supabaseRpcKey: anonKey,
    openAiTextGate: gate,
    openAiProviderFetch: providerFetch,
    resolveUserIdForAccessToken: async (token) => {
      const user = await service.auth.getUser(token);
      return user.data.user?.id ?? null;
    },
    researchRuntime: { run: async () => { throw new Error("Paid search is excluded from browser certification"); } },
    researchSourceExtractor: async ({ url, sourceId }) => ({
      sourceId, sourceType: "web_article", ingestMode: "metadata_only", title: "Supplied synthetic Test source",
      publisher: "Fixture", author: "Test", url, originalUrl: url, resolvedUrl: url,
      canonicalUrl: url, domain: "fixture.invalid", publishedAt: "2026-09-01T00:00:00.000Z",
      updatedAt: null, retrievedAt: new Date().toISOString(), warnings: [], transcriptAvailable: false,
      snippet: "Synthetic Test source content.", extractedText: "Synthetic Test source content.",
      transcript: null, transcriptSegments: null, transcriptMeta: null, attributedQuotes: [],
      extractionStatus: "extracted", extractionError: null, provenance: null,
    }),
  };
  return {
    hearth,
    hammer: { runtimeConfig: hearth as HearthRuntimeConfig, openAiTextGate: gate, openAiProviderFetch: providerFetch },
    tongs: { openAiTextGate: gate, unifiedVisualPlanProvider: unified, narrativeInterpretationProvider: narrative, brollMotionInterpretationProvider: motion },
  };
}
