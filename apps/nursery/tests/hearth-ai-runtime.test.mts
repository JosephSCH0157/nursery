import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import {
  HEARTH_AI_ROUTES,
  type EpisodeContext,
} from "../../hearth/src/lib/hearth-ai-runtime-contract";
import { validateScriptTags } from "@forge/shared/script-tags";
import hearthChatStatusFunction from "../netlify/functions/hearth-chat-status";
import {
  createHearthAiHandler,
  sanitizeHearthUserFacingOutput,
  shouldUseWorkspaceContext,
} from "../server/hearth/create-hearth-ai-handler";
import type { HearthRuntimeConfig } from "../server/hearth/hearth-runtime-config";
import { resolveHearthRuntimeConfig } from "../server/hearth/hearth-runtime-config";
import { createHearthResearchRuntime } from "../server/hearth/hearth-research-runtime";
import { mwHearthChatApi } from "../scripts/mw-hearth-chat-api";
import "./hearth-youtube-source-ingest.test.mts";

const HEARTH_FORBIDDEN_USER_FACING_TERMS = [
  /\bTongs\b/i,
  /\bworkspace artifact\b/i,
  /\bartifact matches\b/i,
  /\bscope note\b/i,
  /\breliable anchor\b/i,
  /\bresolve it through\b/i,
  /\bcross-project\b/i,
  /\binternal reference\b/i,
  /\bstyle corpus\b/i,
  /\benrichment\b/i,
];

function assertNoHearthInternalLeakage(text: string): void {
  for (const pattern of HEARTH_FORBIDDEN_USER_FACING_TERMS) {
    assert.doesNotMatch(text, pattern);
  }
}

function assertMaxSpeakerSpokenLines(script: string, maxLines: number): void {
  let activeSpeaker: string | null = null;
  let contentLineCount = 0;
  for (const rawLine of script.split(/\r?\n/)) {
    const line = rawLine.trim();
    const open = line.match(/^\[(s1|s2|g1|g2)\]$/i)?.[1]?.toLowerCase() ?? null;
    const close = line.match(/^\[\/(s1|s2|g1|g2)\]$/i)?.[1]?.toLowerCase() ?? null;
    if (open) {
      activeSpeaker = open;
      contentLineCount = 0;
      continue;
    }
    if (close) {
      assert.equal(close, activeSpeaker);
      assert.ok(contentLineCount <= maxLines, `speaker block exceeded ${maxLines} spoken lines: ${contentLineCount}`);
      activeSpeaker = null;
      contentLineCount = 0;
      continue;
    }
    if (activeSpeaker && line && !/^\[(?:beat|pause|reflective pause)\]$/i.test(line)) contentLineCount += 1;
  }
}

function buildConfig(overrides: Partial<HearthRuntimeConfig> = {}): HearthRuntimeConfig {
  return {
    textApiKey: null,
    imageApiKey: null,
    researchApiKey: null,
    apiKey: null,
    model: "gpt-5.3",
    sttModel: "gpt-4o-mini-transcribe",
    configuredBillingMode: "forge",
    initialTokenBalance: 42,
    supabaseUrl: null,
    supabaseServiceRoleKey: null,
    supabaseRpcKey: null,
    sttBucket: "forge-workpieces",
    disableForgeLaneAi: false,
    disableUserKeys: false,
    disableExpensiveAiActions: false,
    disableCdcGeneration: false,
    ...overrides,
  };
}

const RESEARCH_ENV_KEYS = [
  "HEARTH_RESEARCH_API_KEY",
  "HEARTH_RESEARCH_BRAVE_API_KEY",
  "BRAVE_SEARCH_API_KEY",
  "BRAVE_API_KEY",
] as const;

function snapshotResearchEnv(): Partial<Record<(typeof RESEARCH_ENV_KEYS)[number], string>> {
  const snapshot: Partial<Record<(typeof RESEARCH_ENV_KEYS)[number], string>> = {};
  for (const key of RESEARCH_ENV_KEYS) {
    if (process.env[key] != null) snapshot[key] = process.env[key];
  }
  return snapshot;
}

function clearResearchEnv(): void {
  for (const key of RESEARCH_ENV_KEYS) {
    delete process.env[key];
  }
}

function restoreResearchEnv(snapshot: Partial<Record<(typeof RESEARCH_ENV_KEYS)[number], string>>): void {
  clearResearchEnv();
  for (const key of RESEARCH_ENV_KEYS) {
    if (snapshot[key] != null) process.env[key] = snapshot[key];
  }
}

test("research runtime distinguishes rate limiting from provider failure", async () => {
  const runtime = createHearthResearchRuntime({ braveApiKey: "brave-test-key" });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("rate limited", { status: 429 });
  try {
    const result = await runtime.run({
      request: {
        query: "OpenAI official documentation",
        intent: "background",
        recencyPreference: "none",
        maxSources: 1,
        requireDates: false,
        requireFullExtraction: false,
      },
      brief: { schema: "forge.hearth.research-brief.v1", workspaceId: null, workpieceId: "readiness-test", briefFingerprint: "rate-limit-test", creatorRequest: "OpenAI official documentation", episodeTitle: "", goals: ["OpenAI official documentation"], queries: ["OpenAI official documentation"], sourcePriorities: [] },
    });
    assert.equal(result.providerStatus, "provider_rate_limited");
    assert.equal(result.runtimeStatus, "error");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("research runtime distinguishes cancellation", async () => {
  const runtime = createHearthResearchRuntime({ braveApiKey: "brave-test-key" });
  const controller = new AbortController();
  controller.abort();
  const result = await runtime.run({
    request: {
      query: "OpenAI official documentation",
      intent: "background",
      recencyPreference: "none",
      maxSources: 1,
      requireDates: false,
      requireFullExtraction: false,
    },
    brief: { schema: "forge.hearth.research-brief.v1", workspaceId: null, workpieceId: "readiness-test", briefFingerprint: "cancel-test", creatorRequest: "OpenAI official documentation", episodeTitle: "", goals: ["OpenAI official documentation"], queries: ["OpenAI official documentation"], sourcePriorities: [] },
    signal: controller.signal,
  });
  assert.equal(result.providerStatus, "request_cancelled");
  assert.equal(result.runtimeStatus, "error");
});

function buildEpisodeContext(overrides: Partial<EpisodeContext> = {}): EpisodeContext {
  const defaults: EpisodeContext = {
    episodeId: "episode-1",
    workspaceId: null,
    title: "Test Episode",
    titleVariants: { A: "", B: "", C: "" },
    outline: "",
    body: "",
    tonePreset: null,
    sources: [],
    sparks: [],
  };
  return {
    ...defaults,
    ...overrides,
    titleVariants: {
      ...defaults.titleVariants,
      ...(overrides.titleVariants ?? {}),
    },
    sources: overrides.sources ?? defaults.sources,
    sparks: overrides.sparks ?? defaults.sparks,
  };
}

function researchArtifactFromPrompt(init: RequestInit | undefined, text: string, status: "complete" | "partial" = "complete") {
  const body = JSON.parse(String(init?.body ?? "{}")) as { messages?: Array<{ content?: string }> };
  const prompt = body.messages?.[0]?.content ?? "";
  const lines = prompt.split("\n");
  const marker = lines.indexOf("Canonical research runtime result:");
  assert.ok(marker >= 0);
  const result = JSON.parse(lines[marker + 1] ?? "{}") as { brief?: { briefFingerprint?: string; workpieceId?: string }; evidence?: Array<{ sourceId?: string; state?: string }> };
  const sourceId = result.evidence?.find((entry) => entry.state === "inspected")?.sourceId;
  assert.ok(result.brief?.briefFingerprint && result.brief.workpieceId && sourceId);
  return {
    briefFingerprint: result.brief.briefFingerprint,
    workpieceId: result.brief.workpieceId,
    status,
    findings: [{ text, status: "reported_claim", sourceIds: [sourceId] }],
    uncertainties: status === "partial" ? ["One source could not be inspected."] : [],
    editorialInterpretation: [],
  };
}

test("createHearthAiHandler returns cheap status snapshots", async () => {
  const handler = createHearthAiHandler(buildConfig({ configuredBillingMode: "forge", initialTokenBalance: 17 }));
  const response = await handler(new Request(`http://localhost${HEARTH_AI_ROUTES.chatStatus}?lane=byo`));
  assert.equal(response.status, 200);

  const payload = await response.json();
  assert.deepEqual(payload, {
    ok: true,
    billing_mode: "byo",
    token_balance: null,
  });
});

test("createHearthAiHandler keeps chat error semantics when text api key is missing", async () => {
  const handler = createHearthAiHandler(buildConfig({ textApiKey: null, apiKey: null }));
  const response = await handler(new Request(`http://localhost${HEARTH_AI_ROUTES.chat}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: "Draft this" }],
      episode_context: buildEpisodeContext(),
      lane: "forge",
      behavior: "careful",
    }),
  }));

  assert.equal(response.status, 500);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.error, "Missing OPENAI_TEXT_API_KEY (or OPENAI_API_KEY) in server env");
  assert.equal(payload.billing_mode, "forge");
});

test("createHearthAiHandler keeps stt error semantics when text api key is missing", async () => {
  const handler = createHearthAiHandler(buildConfig({ textApiKey: null, apiKey: null }));
  const response = await handler(new Request(`http://localhost${HEARTH_AI_ROUTES.stt}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      workpiece_id: "workpiece-1",
      storage_key: "workpieces/workpiece-1/stt/audio.webm",
      lane: "forge",
    }),
  }));

  assert.equal(response.status, 500);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.error, "Missing OPENAI_TEXT_API_KEY (or OPENAI_API_KEY) in server env");
  assert.equal(payload.billing_mode, "forge");
});

test("createHearthAiHandler returns infrastructure error for ai key status when service role is missing", async () => {
  const handler = createHearthAiHandler(buildConfig({ supabaseUrl: null, supabaseServiceRoleKey: null }));
  const response = await handler(new Request(`http://localhost${HEARTH_AI_ROUTES.aiKeysStatus}`));
  assert.equal(response.status, 500);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.error, "Supabase service role is not configured.");
});

test("createHearthAiHandler enforces POST for ai key connect/disconnect routes", async () => {
  const handler = createHearthAiHandler(buildConfig());
  const connect = await handler(new Request(`http://localhost${HEARTH_AI_ROUTES.aiKeysConnect}`, { method: "GET" }));
  const disconnect = await handler(new Request(`http://localhost${HEARTH_AI_ROUTES.aiKeysDisconnect}`, { method: "GET" }));

  assert.equal(connect.status, 405);
  assert.equal(disconnect.status, 405);
  assert.equal((await connect.json()).error, "Method not allowed");
  assert.equal((await disconnect.json()).error, "Method not allowed");
});

test("Vite middleware status route matches direct handler output", async () => {
  const priorBillingMode = process.env.HEARTH_AI_BILLING_MODE;
  const priorBalance = process.env.HEARTH_AI_TOKEN_BALANCE;

  process.env.HEARTH_AI_BILLING_MODE = "forge";
  process.env.HEARTH_AI_TOKEN_BALANCE = "29";

  const middleware = mwHearthChatApi();
  const server = createServer((req, res) => {
    middleware(req, res, (error) => {
      if (error) {
        res.statusCode = 500;
        res.end(String(error));
        return;
      }
      res.statusCode = 404;
      res.end("not found");
    });
  });

  try {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${address.port}${HEARTH_AI_ROUTES.chatStatus}?lane=forge`;

    const direct = await createHearthAiHandler(resolveHearthRuntimeConfig())(new Request(url));
    const directJson = await direct.json();

    const adapted = await fetch(url);
    assert.equal(adapted.status, direct.status);
    const adaptedJson = await adapted.json();

    assert.deepEqual(adaptedJson, directJson);
  } finally {
    server.close();
    await once(server, "close");
    if (priorBillingMode == null) delete process.env.HEARTH_AI_BILLING_MODE;
    else process.env.HEARTH_AI_BILLING_MODE = priorBillingMode;
    if (priorBalance == null) delete process.env.HEARTH_AI_TOKEN_BALANCE;
    else process.env.HEARTH_AI_TOKEN_BALANCE = priorBalance;
  }
});

test("Netlify status function matches direct handler output", async () => {
  const direct = await createHearthAiHandler(resolveHearthRuntimeConfig())(
    new Request(`http://localhost${HEARTH_AI_ROUTES.chatStatus}?lane=forge`),
  );
  const directJson = await direct.json();

  const deployed = await hearthChatStatusFunction(
    new Request("http://localhost/.netlify/functions/hearth-chat-status?lane=forge"),
  );
  assert.equal(deployed.status, direct.status);
  const deployedJson = await deployed.json();

  assert.deepEqual(deployedJson, directJson);
});

test("createHearthAiHandler sends collaborator-style system prompt to upstream model", async () => {
  const handler = createHearthAiHandler(buildConfig({ textApiKey: "test-key" }));
  const originalFetch = globalThis.fetch;
  let capturedSystemPrompt = "";

  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url !== "https://api.openai.com/v1/chat/completions") {
      throw new Error(`Unexpected fetch URL: ${url}`);
    }

    const rawBody = init?.body;
    const body = JSON.parse(String(rawBody)) as {
      messages?: Array<{ role?: string; content?: string }>;
    };
    capturedSystemPrompt = body.messages?.[0]?.content ?? "";

    return new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify({
              assistantText: "That version lands better. I tightened the middle.",
              ops: [],
              script_text: null,
              tag_audit: null,
            }),
          },
        },
      ],
      usage: { total_tokens: 123 },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const response = await handler(new Request(`http://localhost${HEARTH_AI_ROUTES.chat}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "I've got too many directions and none of them are landing." }],
        episode_context: buildEpisodeContext(),
        lane: "byo",
        behavior: "careful",
      }),
    }));

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.match(capturedSystemPrompt, /smart producer \+ trusted writing partner \+ calm friend in the room/i);
    assert.match(capturedSystemPrompt, /Avoid assistant filler and stale lead-ins/i);
    assert.match(capturedSystemPrompt, /Ask fewer follow-up questions/i);
    assert.match(capturedSystemPrompt, /Voice examples \(style calibration\)/i);
    assert.match(capturedSystemPrompt, /Agreement is not the default/i);
    assert.match(capturedSystemPrompt, /Critique style: firm, calm, constructive/i);
    assert.match(capturedSystemPrompt, /Attack the work, never the person/i);
    assert.match(capturedSystemPrompt, /strategic pushback/i);
    assert.match(capturedSystemPrompt, /Use calibrated bluntness/i);
    assert.match(capturedSystemPrompt, /Momentum bias \(default\)/i);
    assert.match(capturedSystemPrompt, /one concrete best next move/i);
    assert.match(capturedSystemPrompt, /Prefer one high-confidence direction over multiple options/i);
    assert.match(capturedSystemPrompt, /Unless user explicitly asks for analysis-only/i);
    assert.match(capturedSystemPrompt, /Fastest upgrade:/i);
    assert.match(capturedSystemPrompt, /HEARTH COLLABORATOR IDENTITY/i);
    assert.match(capturedSystemPrompt, /seasoned creative producer and editor/i);
    assert.match(capturedSystemPrompt, /trusted collaborator in the room/i);
    assert.match(capturedSystemPrompt, /Never open with filler phrases such as/i);
    assert.match(capturedSystemPrompt, /sound like speaking, not formatting/i);
    assert.match(capturedSystemPrompt, /Emotional intelligence adaptation/i);
    assert.match(capturedSystemPrompt, /Closing behavior: prefer endings that move the work forward/i);
    assert.match(capturedSystemPrompt, /PROJECT KNOWLEDGE ACCESS/i);
    assert.match(capturedSystemPrompt, /Do not default to documentation mode/i);
    assert.match(capturedSystemPrompt, /Base recommendations on project reality/i);
    assert.match(capturedSystemPrompt, /If a precise answer needs specific files\/modules, provide a where-to-look hint/i);
    assert.match(capturedSystemPrompt, /PERFORMANCE & RELEASE AWARENESS/i);
    assert.match(capturedSystemPrompt, /Assume most creative work is intended for real audiences/i);
    assert.match(capturedSystemPrompt, /Scripts do not exist in isolation; they may become episodes/i);
    assert.match(capturedSystemPrompt, /Optimization moment triggers/i);
    assert.match(capturedSystemPrompt, /Creator Optimization Pass, Release Prep Pack, or Performance Upgrade/i);
    assert.match(capturedSystemPrompt, /Prefer one high-impact suggestion over large option dumps/i);
    assert.match(capturedSystemPrompt, /Never block or override creator style/i);
    assert.match(capturedSystemPrompt, /EXECUTIVE PRODUCER BEHAVIOR/i);
    assert.match(capturedSystemPrompt, /showrunner-minded collaborator/i);
    assert.match(capturedSystemPrompt, /Offer upgrades as optional suggestions, not requirements/i);
    assert.match(capturedSystemPrompt, /Do not moralize about style/i);
    assert.match(capturedSystemPrompt, /Trigger conditions for executive-producer behavior/i);
    assert.match(capturedSystemPrompt, /Offer first, do not auto-dump optimization lists/i);
    assert.match(capturedSystemPrompt, /Want a performance pass before recording/i);
    assert.match(capturedSystemPrompt, /RELEASE PREP PACK/i);
    assert.match(capturedSystemPrompt, /generate a named Release Prep Pack/i);
    assert.match(capturedSystemPrompt, /Title set: 3-7 click-optimized but honest options/i);
    assert.match(capturedSystemPrompt, /Short-form hook \(<=20s\)/i);
    assert.match(capturedSystemPrompt, /Do not overwrite primary script by default/i);
    assert.match(capturedSystemPrompt, /suggest real screen captures over synthetic visuals/i);
    assert.match(capturedSystemPrompt, /CONTINUITY & PRESENCE/i);
    assert.match(capturedSystemPrompt, /Assume you have been present throughout the session/i);
    assert.match(capturedSystemPrompt, /Do NOT fabricate history/i);
    assert.match(capturedSystemPrompt, /Anti-restart rule/i);
    assert.match(capturedSystemPrompt, /Do not behave as if each message is a new conversation/i);
    assert.match(capturedSystemPrompt, /Occasionally acknowledge progress or effort when meaningful/i);
    assert.match(capturedSystemPrompt, /HEARTH OUTPUT CONTRACT FOR ANVIL SCRIPT GENERATION/i);
    assert.match(capturedSystemPrompt, /Formatting is NOT optional/i);
    assert.match(capturedSystemPrompt, /If you produce a blob, the output is invalid and must be regenerated/i);
    assert.match(capturedSystemPrompt, /Maximum 3 lines per speaker block/i);
    assert.match(capturedSystemPrompt, /No paragraph-style writing/i);
    assert.match(capturedSystemPrompt, /If ANY of these fail, you must regenerate the output/i);
    assert.match(capturedSystemPrompt, /Rebuild the script\. Do NOT preserve paragraph structure/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createHearthAiHandler rejects unusable production output before successful billing", async () => {
  const handler = createHearthAiHandler(buildConfig({
    textApiKey: "test-key",
    configuredBillingMode: "byo",
  }));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url === "https://api.openai.com/v1/chat/completions") {
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ assistantText: "SEO_TITLES:\nSAFE: Title A\nSPICY: Title B\nBALANCED_1: Title C", ops: [] }) } }],
        usage: { prompt_tokens: 40, completion_tokens: 12, total_tokens: 52 },
      }), { status: 200, headers: { "content-type": "application/json", "x-request-id": "req-invalid-production" } });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };
  try {
    const response = await handler(new Request(`http://localhost${HEARTH_AI_ROUTES.chat}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "Generate Titles for Script Version 1." }],
        episode_context: buildEpisodeContext(),
        lane: "byo",
        behavior: "careful",
        production_action: "seo",
        production_script_version: 1,
      }),
    }));
    const payload = await response.json();
    assert.equal(response.status, 502);
    assert.equal(payload.ok, false);
    assert.equal(payload.code, "invalid_production_output");
    assert.equal(payload.billable_tokens, 0);
    assert.match(payload.error, /three usable titles/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createHearthAiHandler repairs malformed thumbnail production output once before billing", async () => {
  const handler = createHearthAiHandler(buildConfig({ textApiKey: "test-key", configuredBillingMode: "byo" }));
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    const assistantText = calls === 1
      ? "Research outcome: Live retrieval was unavailable. Here are five thumbnail ideas."
      : [
          "THUMBNAIL_STRATEGY",
          "Episode promise: Explain the approved episode without exaggeration.",
          "Intended viewer: Curious documentary viewers.",
          "Curiosity mechanism: Reveal a surprising contrast.",
          "Editorial positioning: Practical and evidence-led.",
          "Truthful connection: Every visual maps to the approved script.",
          "Prohibited exaggerations: No invented outcomes.",
          ...Array.from({ length: 5 }, (_, index) => [
            `THUMBNAIL_0${index + 1}`,
            `Headline: Distinct direction ${index + 1}`,
            `Subject: Distinct subject ${index + 1}`,
            `Focal action: Distinct action ${index + 1}`,
            `Composition: Distinct composition ${index + 1}`,
            `Emotional tone: Restrained curiosity ${index + 1}`,
            `Visual hierarchy: Subject, context, detail ${index + 1}`,
            `Title compatibility: Clear negative space ${index + 1}`,
            `Integrity rationale: Supported by the approved script ${index + 1}`,
            `Render direction: Clean base artwork without text ${index + 1}`,
            `Mood/style: Documentary realism ${index + 1}`,
          ].join("\n")),
        ].join("\n");
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        assistantText,
        ops: [],
      }) } }],
      usage: { prompt_tokens: 40, completion_tokens: 12, total_tokens: 52 },
    }), { status: 200, headers: { "content-type": "application/json", "x-request-id": "req-invalid-thumbnails" } });
  };
  try {
    const response = await handler(new Request(`http://localhost${HEARTH_AI_ROUTES.chat}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "Use the approved script as the only source and generate five thumbnail concepts." }],
        episode_context: buildEpisodeContext(),
        lane: "byo",
        production_action: "thumbnails",
        production_script_version: 1,
      }),
    }));
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(calls, 2);
    assert.match(payload.assistant_text, /THUMBNAIL_05/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createHearthAiHandler does not route thumbnail production contracts through research", async () => {
  const handler = createHearthAiHandler(buildConfig({ textApiKey: "test-key", configuredBillingMode: "byo" }));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify({
      assistantText: [
        "THUMBNAIL_STRATEGY",
        "Episode promise: Explain the approved episode without exaggeration.",
        "Intended viewer: Curious beginning podcasters.",
        "Curiosity mechanism: Reveal an unexpected production tradeoff.",
        "Editorial positioning: Practical and evidence-led.",
        "Truthful connection: Every visual maps to the approved script.",
        "Prohibited exaggerations: No guaranteed growth or invented outcomes.",
        ...Array.from({ length: 5 }, (_, index) => [
          `THUMBNAIL_0${index + 1}`,
          `Headline: Distinct headline ${index + 1}`,
          `Subject: Distinct subject ${index + 1}`,
          `Focal action: Distinct focal action ${index + 1}`,
          `Composition: Distinct visual composition ${index + 1}`,
          `Emotional tone: Documentary tension ${index + 1}`,
          `Visual hierarchy: One subject, one focal action, clear negative space ${index + 1}`,
          `Title compatibility: Supports canonical title option ${index + 1}`,
          `Integrity rationale: Depicts only claims supported by the approved script ${index + 1}`,
          `Render direction: Clean provider-neutral artwork with no text ${index + 1}`,
          `Mood/style: Documentary style ${index + 1}`,
        ].join("\n")),
      ].join("\n\n"),
      ops: [],
    }) } }],
    usage: { prompt_tokens: 40, completion_tokens: 100, total_tokens: 140 },
  }), { status: 200, headers: { "content-type": "application/json" } });
  try {
    const response = await handler(new Request(`http://localhost${HEARTH_AI_ROUTES.chat}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "Use the approved script as the only source and generate five thumbnail concepts." }],
        episode_context: buildEpisodeContext(),
        lane: "byo",
        production_action: "thumbnails",
        production_script_version: 1,
      }),
    }));
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.doesNotMatch(String(payload.assistant_text), /Research outcome:/i);
    assert.match(String(payload.assistant_text), /THUMBNAIL_05/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createHearthAiHandler isolates production generation from chat history and attachments", async () => {
  const handler = createHearthAiHandler(buildConfig({ textApiKey: "test-key", configuredBillingMode: "byo" }));
  const originalFetch = globalThis.fetch;
  let upstreamMessages: Array<{ role?: string; content?: string }> = [];
  globalThis.fetch = async (_input, init) => {
    const request = JSON.parse(String(init?.body ?? "{}")) as { messages?: Array<{ role?: string; content?: string }> };
    upstreamMessages = request.messages ?? [];
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        assistantText: "SEO_TITLES:\nSAFE: First title\nSPICY: Second title\nBALANCED_1: Third title\nSHORT_DESCRIPTION:\nA concise summary.\nLONG_DESCRIPTION:\nA detailed episode description.",
        ops: [],
      }) } }],
      usage: { prompt_tokens: 40, completion_tokens: 12, total_tokens: 52 },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const response = await handler(new Request(`http://localhost${HEARTH_AI_ROUTES.chat}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: [
          { role: "user", content: `Old production prompt ${"duplicate script ".repeat(500)}` },
          { role: "assistant", content: "Old response" },
          { role: "user", content: "Generate Titles for approved Script Version 4." },
        ],
        episode_context: buildEpisodeContext(),
        lane: "byo",
        production_action: "seo",
        production_script_version: 4,
        attachment_context: { include_episode_attachments: true },
      }),
    }));
    assert.equal(response.status, 200);
    assert.equal(upstreamMessages.length, 2);
    assert.equal(upstreamMessages[0]?.role, "system");
    assert.equal(upstreamMessages[1]?.content, "Generate Titles for approved Script Version 4.");
    assert.doesNotMatch(upstreamMessages.map((message) => message.content ?? "").join("\n"), /duplicate script/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createHearthAiHandler recovers production arrays that are outside assistantText", async () => {
  const handler = createHearthAiHandler(buildConfig({ textApiKey: "test-key", configuredBillingMode: "byo" }));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify({
      assistantText: "Generated the requested options.",
      titles: ["First real title", "Second real title", "Third real title", "Fourth real title", "Fifth real title"],
      short_description: "A concise summary.",
      long_description: "A detailed episode description.",
      ops: [],
    }) } }],
    usage: { prompt_tokens: 40, completion_tokens: 12, total_tokens: 52 },
  }), { status: 200, headers: { "content-type": "application/json" } });
  try {
    const response = await handler(new Request(`http://localhost${HEARTH_AI_ROUTES.chat}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "Generate Titles for approved Script Version 4." }],
        episode_context: buildEpisodeContext(),
        lane: "byo",
        production_action: "seo",
        production_script_version: 4,
      }),
    }));
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.match(payload.assistant_text, /SAFE: First real title/);
    assert.match(payload.assistant_text, /BALANCED_1: Third real title/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createHearthAiHandler repairs one malformed production response before billing success", async () => {
  const handler = createHearthAiHandler(buildConfig({ textApiKey: "test-key", configuredBillingMode: "byo" }));
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    const assistantText = calls === 1
      ? "I generated some ideas, but they are not in the requested structure."
      : "SEO_TITLES:\nSAFE: First repaired title\nSPICY: Second repaired title\nBALANCED_1: Third repaired title\nBALANCED_2: Fourth repaired title\nBALANCED_3: Fifth repaired title\nSHORT_DESCRIPTION:\nA concise summary.\nLONG_DESCRIPTION:\nA detailed episode description.";
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ assistantText, ops: [] }) } }],
      usage: { prompt_tokens: 40, completion_tokens: 12, total_tokens: 52 },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const response = await handler(new Request(`http://localhost${HEARTH_AI_ROUTES.chat}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "Generate Titles for approved Script Version 4." }],
        episode_context: buildEpisodeContext(),
        lane: "byo",
        production_action: "seo",
        production_script_version: 4,
      }),
    }));
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(calls, 2);
    assert.match(payload.assistant_text, /SAFE: First repaired title/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createHearthAiHandler shapes returned script blobs into Anvil output contract format", async () => {
  const handler = createHearthAiHandler(buildConfig({ textApiKey: "test-key" }));
  const originalFetch = globalThis.fetch;
  const blobScript = "[s1]\nThis paragraph is too long for the teleprompter and it keeps going as if Hearth were writing an article. It has a second point buried in the same wall of text, and that point needs to land clearly for Anvil instead of hiding in a blob.\n[/s1]";

  globalThis.fetch = async (_input, _init) => {
    return new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify({
              assistantText: "I rebuilt it for Anvil.",
              ops: [{ op: "set_body", value: blobScript }],
              script_text: blobScript,
              tag_audit: null,
            }),
          },
        },
      ],
      usage: { total_tokens: 91 },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const response = await handler(new Request(`http://localhost${HEARTH_AI_ROUTES.chat}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "Fix this script for recording." }],
        episode_context: buildEpisodeContext(),
        lane: "byo",
        behavior: "careful",
      }),
    }));

    assert.equal(response.status, 200);
    const payload = await response.json();
    const scriptText = String(payload.script_text ?? "");
    const setBody = payload.ops?.find((op: { op?: string }) => op.op === "set_body")?.value;

    assert.equal(payload.ok, true);
    assert.equal(scriptText, setBody);
    assert.notEqual(scriptText, blobScript);
    assert.equal(validateScriptTags(scriptText).ok, true);
    assert.match(scriptText, /^\[s1\]$/m);
    assert.match(scriptText, /^\[\/s1\]$/m);
    const spokenLines = scriptText.split(/\r?\n/).filter((line) => line.trim() && !/^\[.*\]$/.test(line.trim()));
    assert.equal(spokenLines.length, 2, `recording shape should split at semantic sentence boundaries: ${JSON.stringify(scriptText)}`);
    assert.ok(spokenLines.every((line) => /[.!?]["'”’]?$/.test(line.trim())));
    assertMaxSpeakerSpokenLines(scriptText, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createHearthAiHandler asks fewer clarify gates for directional requests", async () => {
  const handler = createHearthAiHandler(buildConfig({ textApiKey: "test-key" }));
  const originalFetch = globalThis.fetch;
  let openAiCalled = false;

  globalThis.fetch = async (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url !== "https://api.openai.com/v1/chat/completions") {
      throw new Error(`Unexpected fetch URL: ${url}`);
    }
    openAiCalled = true;

    return new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify({
              assistantText: "There's something here. I'd anchor it to one sharp claim, then build out.",
              ops: [],
              script_text: null,
              tag_audit: null,
            }),
          },
        },
      ],
      usage: { total_tokens: 88 },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const response = await handler(new Request(`http://localhost${HEARTH_AI_ROUTES.chat}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "I have a rough idea on creator burnout and where to take it next." }],
        episode_context: buildEpisodeContext(),
        lane: "byo",
        behavior: "careful",
      }),
    }));

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.gate, undefined);
    assert.equal(openAiCalled, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createHearthAiHandler keeps clarify gate for very short ambiguous asks", async () => {
  const handler = createHearthAiHandler(buildConfig({ textApiKey: "test-key" }));
  const originalFetch = globalThis.fetch;
  let openAiCalled = false;

  globalThis.fetch = async () => {
    openAiCalled = true;
    throw new Error("OpenAI should not be called during clarify gate");
  };

  try {
    const response = await handler(new Request(`http://localhost${HEARTH_AI_ROUTES.chat}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "episode about burnout?" }],
        episode_context: buildEpisodeContext(),
        lane: "byo",
        behavior: "careful",
      }),
    }));

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.gate, "clarify");
    assert.match(String(payload.assistant_text), /Quick unblock before I draft/i);
    assert.equal(openAiCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createHearthAiHandler keeps opinion interpretation conversational without workspace resolver language", async () => {
  const handler = createHearthAiHandler(buildConfig({ textApiKey: "test-key" }));
  const originalFetch = globalThis.fetch;
  let openAiCalled = false;

  globalThis.fetch = async (_input, _init) => {
    openAiCalled = true;
    return new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify({
              assistantText: "That interpretation is pointed, and it can work as an opinion spine. I would sharpen the distinction: the stronger claim is not that courts think any mention of race is racist, but that they are getting more suspicious of race as the organizing explanation for district lines.",
              ops: [],
              script_text: null,
              tag_audit: null,
            }),
          },
        },
      ],
      usage: { total_tokens: 67 },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    assert.equal(shouldUseWorkspaceContext("My interpretation is that courts are moving toward the idea that any use of race in districting is racist."), false);
    const response = await handler(new Request(`http://localhost${HEARTH_AI_ROUTES.chat}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: [{
          role: "user",
          content: "My interpretation is that courts are moving toward the idea that any use of race in districting is racist.",
        }],
        episode_context: buildEpisodeContext(),
        lane: "byo",
        behavior: "careful",
      }),
    }));

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.gate, undefined);
    assert.equal(openAiCalled, true);
    const assistantText = String(payload.assistant_text ?? "");
    assertNoHearthInternalLeakage(assistantText);
    assert.match(assistantText, /interpretation|courts|race|district/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createHearthAiHandler pressure-tests episode framing without workspace lookup language", async () => {
  const handler = createHearthAiHandler(buildConfig({ textApiKey: "test-key" }));
  const originalFetch = globalThis.fetch;
  let openAiCalled = false;

  globalThis.fetch = async (_input, _init) => {
    openAiCalled = true;
    return new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify({
              assistantText: "The framing works, but I would make the verb sharper: the vote is the visible ceremony, while the real fight is the earlier sorting of incentives, maps, and legal definitions.",
              ops: [],
              script_text: null,
              tag_audit: null,
            }),
          },
        },
      ],
      usage: { total_tokens: 67 },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    assert.equal(shouldUseWorkspaceContext("Does this framing work for the episode? The argument is that the vote is often the ceremony, not the decision."), false);
    const response = await handler(new Request(`http://localhost${HEARTH_AI_ROUTES.chat}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: [{
          role: "user",
          content: "Does this framing work for the episode? The argument is that the vote is often the ceremony, not the decision.",
        }],
        episode_context: buildEpisodeContext(),
        lane: "byo",
        behavior: "careful",
      }),
    }));

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(openAiCalled, true);
    const assistantText = String(payload.assistant_text ?? "");
    assertNoHearthInternalLeakage(assistantText);
    assert.match(assistantText, /framing works|vote|ceremony|decision/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createHearthAiHandler still allows explicit current draft requests", async () => {
  const handler = createHearthAiHandler(buildConfig({ textApiKey: "test-key" }));
  const originalFetch = globalThis.fetch;
  let openAiCalled = false;

  globalThis.fetch = async (_input, _init) => {
    openAiCalled = true;
    return new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify({
              assistantText: "Using the current draft, I would tighten the title toward the central tension: The Vote Was Never the Fight.",
              ops: [{ op: "set_title", value: "The Vote Was Never the Fight" }],
              script_text: null,
              tag_audit: null,
            }),
          },
        },
      ],
      usage: { total_tokens: 72 },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    assert.equal(shouldUseWorkspaceContext("Use the current episode draft and help me tighten the title."), true);
    const response = await handler(new Request(`http://localhost${HEARTH_AI_ROUTES.chat}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "Use the current episode draft and help me tighten the title." }],
        episode_context: buildEpisodeContext({
          title: "Districting and the Vote",
          body: "The vote is often the ceremony, not the decision.",
        }),
        lane: "byo",
        behavior: "careful",
      }),
    }));

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(openAiCalled, true);
    assertNoHearthInternalLeakage(String(payload.assistant_text ?? ""));
    assert.equal(payload.ops?.[0]?.op, "set_title");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("sanitizeHearthUserFacingOutput removes internal workspace/tool leakage", () => {
  const sanitized = sanitizeHearthUserFacingOutput(
    "Scope note: This sounds like a reference to another workspace artifact, but I do not have a reliable anchor yet. I will resolve it through Tongs.",
  );

  assertNoHearthInternalLeakage(sanitized);
  assert.match(sanitized, /missing the exact context|paste the case name|line from the draft/i);
});

test("createHearthAiHandler sanitizes framing pack replies to remove internal scope/system leakage", async () => {
  const handler = createHearthAiHandler(buildConfig({ textApiKey: "test-key" }));
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (_input, _init) => {
    return new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify({
              assistantText: [
                "Scope note: I found multiple workspace artifact matches via Tongs.",
                "I can anchor this once you pick one.",
                "YOUTUBE_OPTIMIZED_CUT:",
                "- Lead with the listener pain point, then promise the practical fix.",
                "TITLE_OPTIONS:",
                "- Why This Breach Pattern Keeps Repeating",
              ].join("\n"),
              ops: [],
              script_text: null,
              tag_audit: null,
            }),
          },
        },
      ],
      usage: { total_tokens: 81 },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const response = await handler(new Request(`http://localhost${HEARTH_AI_ROUTES.chat}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: [
          {
            role: "user",
            content: [
              "Production mode request for approved Script Version 3.",
              "APPROVED_SCRIPT_TEXT: This is the approved script body.",
              "Generate a Framing Pack from this approved script.",
              "YOUTUBE_OPTIMIZED_CUT:",
              "TITLE_OPTIONS:",
              "SHORT_FORM_HOOK_20S:",
              "TONE_VARIANT_CREATOR:",
              "AUDIENCE_VARIANT:",
              "MONETIZATION_ANGLE:",
            ].join("\n"),
          },
        ],
        episode_context: buildEpisodeContext({
          title: "Cyber Incident Playbook",
          body: "Current episode script body for framing output.",
          sparks: [{ id: "spark-1", text: "Operator-first response sequencing" }],
        }),
        lane: "byo",
        behavior: "careful",
      }),
    }));

    assert.equal(response.status, 200);
    const payload = await response.json();
    const assistantText = String(payload.assistant_text ?? "");
    assert.equal(payload.ok, true);
    assert.ok(assistantText.trim().length > 0);
    assert.ok(/[A-Za-z]{8,}/.test(assistantText));
    assert.doesNotMatch(assistantText, /\bTongs\b/i);
    assert.doesNotMatch(assistantText, /\bartifact\b/i);
    assert.doesNotMatch(assistantText, /\bI found\b/i);
    assert.doesNotMatch(assistantText, /\bI can\b/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createHearthAiHandler bypasses clarify gate for short research asks and enables research-first prompt behavior", async () => {
  const priorResearchEnv = snapshotResearchEnv();
  clearResearchEnv();
  const handler = createHearthAiHandler(buildConfig({ textApiKey: "test-key" }));
  const originalFetch = globalThis.fetch;
  let openAiCalled = false;
  let capturedSystemPrompt = "";

  globalThis.fetch = async (_input, init) => {
    openAiCalled = true;
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      messages?: Array<{ role?: string; content?: string }>;
    };
    capturedSystemPrompt = body.messages?.[0]?.content ?? "";

    return new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify({
              assistantText: "Angle is strong. Here are examples grouped by bucket.",
              ops: [],
              script_text: null,
              tag_audit: null,
            }),
          },
        },
      ],
      usage: { total_tokens: 79 },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const response = await handler(new Request(`http://localhost${HEARTH_AI_ROUTES.chat}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "Find breach-related reporting examples." }],
        episode_context: buildEpisodeContext(),
        lane: "byo",
        behavior: "careful",
      }),
    }));

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.gate, undefined);
    assert.equal(openAiCalled, true);
    assert.match(capturedSystemPrompt, /Research mode behavior \(hard rule\):/i);
    assert.match(capturedSystemPrompt, /serialized research brief is the only authority/i);
    assert.match(capturedSystemPrompt, /Do not claim completion unless research_artifact contains substantive findings/i);
    assert.match(capturedSystemPrompt, /Prior conversation.*must not add research goals/i);
    assert.match(capturedSystemPrompt, /research_artifact shape:/i);
    assert.match(capturedSystemPrompt, /Canonical research runtime result:/i);
    assert.equal(payload.research_result?.mode, "knowledge_first");
    assert.equal(payload.research_result?.runtimeStatus, "partial");
    assert.equal(payload.research_result?.providerStatus, "not_configured");
    assert.match(String(payload.assistant_text ?? ""), /Live retrieval is not configured/i);
    assert.match(String(payload.assistant_text ?? ""), /No research pack was completed/i);
  } finally {
    globalThis.fetch = originalFetch;
    restoreResearchEnv(priorResearchEnv);
  }
});

test("createHearthAiHandler routes the Church Street factual canary through validated research", async () => {
  const priorResearchEnv = snapshotResearchEnv();
  clearResearchEnv();
  const handler = createHearthAiHandler(buildConfig({ textApiKey: "test-key" }));
  const originalFetch = globalThis.fetch;
  const delegatedChecklist = [
    "Heyday: late 1970s through the 1980s.",
    "Once you've got the lines from local coverage or city docs, verify the decline drivers.",
    "Working number: about $5.5 million.",
    "Pull one clean quote or line for each point and paste those lines here.",
  ].join("\n");

  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify({ assistantText: delegatedChecklist, ops: [] }) } }],
    usage: { total_tokens: 79 },
  }), { status: 200, headers: { "content-type": "application/json" } });

  try {
    const response = await handler(new Request(`http://localhost${HEARTH_AI_ROUTES.chat}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "When was Church Street's heyday, what caused its decline, and what is Orlando spending on the current redevelopment?" }],
        episode_context: buildEpisodeContext({
          episodeId: "33333333-3333-4333-8333-333333333333",
          workspaceId: "11111111-1111-4111-8111-111111111111",
          title: "Church Street Orlando",
          body: "Church Street Station heyday, decline, and current redevelopment.",
        }),
        attachment_context: { include_episode_attachments: false, attachment_ids: [] },
        lane: "byo",
        behavior: "careful",
      }),
    }));

    const payload = await response.json();
    assert.equal(response.status, 200, JSON.stringify(payload));
    assert.equal(payload.ok, true);
    assert.ok(payload.research_result, "factual canary must enter the research path");
    assert.match(String(payload.assistant_text ?? ""), /Research outcome: Failed/i);
    assert.doesNotMatch(String(payload.assistant_text ?? ""), /paste those lines here|pull one clean quote/i);
  } finally {
    globalThis.fetch = originalFetch;
    restoreResearchEnv(priorResearchEnv);
  }
});

test("createHearthAiHandler returns retrieval-backed canonical research results when provider is configured", async () => {
  const handler = createHearthAiHandler(buildConfig({
    textApiKey: "test-key",
    researchApiKey: "brave-test-key",
  }));
  const originalFetch = globalThis.fetch;
  let openAiCalled = false;

  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://api.search.brave.com/res/v1/web/search")) {
      return new Response(JSON.stringify({
        web: {
          results: [
            {
              title: "Breach report one",
              url: "https://example.com/one",
              description: "Incident one summary.",
              page_age: "2 days ago",
            },
            {
              title: "Breach report two",
              url: "https://example.org/two",
              description: "Incident two summary.",
              page_age: "2026-03-15",
            },
          ],
        },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url === "https://example.com/one") {
      return new Response("<html><head><title>One</title></head><body><p>First incident details.</p></body></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }
    if (url === "https://example.org/two") {
      return new Response("Second incident details in plain text.", {
        status: 200,
        headers: { "content-type": "text/plain" },
      });
    }
    if (url === "https://api.openai.com/v1/chat/completions") {
      openAiCalled = true;
      return new Response(JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                assistantText: "Retrieved examples and grouped findings.",
                ops: [],
                script_text: null,
                tag_audit: null,
                research_artifact: researchArtifactFromPrompt(init, "The two inspected incident reports document distinct breach timelines and response details."),
              }),
            },
          },
        ],
        usage: { total_tokens: 92 },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  try {
    const response = await handler(new Request(`http://localhost${HEARTH_AI_ROUTES.chat}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "Find breach-related reporting examples." }],
        episode_context: buildEpisodeContext(),
        lane: "byo",
        behavior: "careful",
      }),
    }));

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(openAiCalled, true);
    assert.equal(payload.research_result?.mode, "retrieval_first");
    assert.equal(payload.research_result?.runtimeStatus, "ok");
    assert.equal(payload.research_result?.sources?.length, 2);
    assert.equal(payload.research_result?.sources?.[0]?.url, "https://example.com/one");
    assert.equal(payload.research_result?.sources?.[0]?.extractionStatus, "extracted");
    assert.equal(typeof payload.research_result?.sources?.[0]?.publishedAt, "string");
    assert.equal(payload.research_result?.sources?.[1]?.url, "https://example.org/two");
    assert.equal(payload.research_result?.sources?.[1]?.extractionStatus, "extracted");
    assert.match(String(payload.research_result?.synthesis?.summary ?? ""), /Retrieved 2 source/);
    assert.match(String(payload.assistant_text ?? ""), /Research outcome: Complete/i);
    assert.match(String(payload.assistant_text ?? ""), /Validated findings/i);
    assert.match(String(payload.assistant_text ?? ""), /References/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createHearthAiHandler accepts BRAVE_API_KEY as a research provider alias", async () => {
  const priorResearchEnv = snapshotResearchEnv();
  clearResearchEnv();
  process.env.BRAVE_API_KEY = "brave-alias-test-key";
  const handler = createHearthAiHandler(buildConfig({
    textApiKey: "test-key",
    researchApiKey: null,
  }));
  const originalFetch = globalThis.fetch;
  let braveToken: string | undefined;

  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://api.search.brave.com/res/v1/web/search")) {
      const headers = init?.headers as Record<string, string> | undefined;
      braveToken = headers?.["X-Subscription-Token"];
      return new Response(JSON.stringify({
        web: {
          results: [
            {
              title: "Alias source",
              url: "https://example.com/alias",
              description: "Alias source summary.",
              page_age: "2026-03-15",
            },
          ],
        },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url === "https://example.com/alias") {
      return new Response("Alias extraction body.", {
        status: 200,
        headers: { "content-type": "text/plain" },
      });
    }
    if (url === "https://api.openai.com/v1/chat/completions") {
      return new Response(JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                assistantText: "Alias-backed retrieval worked.",
                ops: [],
                script_text: null,
                tag_audit: null,
              }),
            },
          },
        ],
        usage: { total_tokens: 41 },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  try {
    const response = await handler(new Request(`http://localhost${HEARTH_AI_ROUTES.chat}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "Find one live source." }],
        episode_context: buildEpisodeContext(),
        lane: "byo",
        behavior: "careful",
      }),
    }));

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(braveToken, "brave-alias-test-key");
    assert.equal(payload.research_result?.mode, "retrieval_first");
    assert.equal(payload.research_result?.runtimeStatus, "ok");
  } finally {
    globalThis.fetch = originalFetch;
    restoreResearchEnv(priorResearchEnv);
  }
});

test("createHearthAiHandler strips Hearth tone instructions from live research queries", async () => {
  const handler = createHearthAiHandler(buildConfig({
    textApiKey: "test-key",
    researchApiKey: "brave-test-key",
  }));
  const originalFetch = globalThis.fetch;
  let capturedQuery: string | null = null;

  globalThis.fetch = async (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://api.search.brave.com/res/v1/web/search")) {
      capturedQuery = new URL(url).searchParams.get("q");
      return new Response(JSON.stringify({
        web: {
          results: [
            {
              title: "Clean query source",
              url: "https://example.com/clean-query",
              description: "Clean query source summary.",
              page_age: "2026-03-15",
            },
          ],
        },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url === "https://example.com/clean-query") {
      return new Response("Clean query extraction body.", {
        status: 200,
        headers: { "content-type": "text/plain" },
      });
    }
    if (url === "https://api.openai.com/v1/chat/completions") {
      return new Response(JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                assistantText: "Clean query retrieval worked.",
                ops: [],
                script_text: null,
                tag_audit: null,
              }),
            },
          },
        ],
        usage: { total_tokens: 43 },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  try {
    const response = await handler(new Request(`http://localhost${HEARTH_AI_ROUTES.chat}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: [{
          role: "user",
          content: [
            "Find strong sources I should cite for this Episode.",
            "Response tone: Sound like a capable creative operations partner.",
            "Help the user explore and expand the content before drafting.",
          ].join(" "),
        }],
        episode_context: buildEpisodeContext(),
        lane: "byo",
        behavior: "careful",
      }),
    }));

    assert.equal(response.status, 200);
    assert.match(String(capturedQuery), /Find strong sources I should cite for this Episode/i);
    assert.doesNotMatch(String(capturedQuery), /Response tone:|creative operations partner/i);
    const payload = await response.json();
    assert.equal(payload.research_result?.mode, "retrieval_first");
    assert.doesNotMatch(String(payload.research_result?.request?.query ?? ""), /Response tone:/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createHearthAiHandler expands generic episode source requests with episode context", async () => {
  const handler = createHearthAiHandler(buildConfig({
    textApiKey: "test-key",
    researchApiKey: "brave-test-key",
  }));
  const originalFetch = globalThis.fetch;
  let capturedQuery: string | null = null;

  globalThis.fetch = async (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://api.search.brave.com/res/v1/web/search")) {
      capturedQuery = new URL(url).searchParams.get("q");
      return new Response(JSON.stringify({
        web: {
          results: [
            {
              title: "Lobbying Disclosure Act guidance",
              url: "https://example.com/lobbying-guidance",
              description: "Lobbying disclosure source summary.",
              page_age: "2026-03-15",
            },
          ],
        },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url === "https://example.com/lobbying-guidance") {
      return new Response("Lobbying disclosure extraction body.", {
        status: 200,
        headers: { "content-type": "text/plain" },
      });
    }
    if (url === "https://api.openai.com/v1/chat/completions") {
      return new Response(JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                assistantText: "Context-aware source retrieval worked.",
                ops: [],
                script_text: null,
                tag_audit: null,
              }),
            },
          },
        ],
        usage: { total_tokens: 47 },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  try {
    const response = await handler(new Request(`http://localhost${HEARTH_AI_ROUTES.chat}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "Find strong sources I should cite for this Episode." }],
        episode_context: buildEpisodeContext({
          title: "Lobbying Is Not Bribery",
          outline: "Explain the Lobbying Disclosure Act, HLOGA, FEC campaign finance rules, federal bribery law, CRS, GAO, and ACA testimony.",
          body: [
            "[s1]",
            "Lobbying is legal influence, not cartoon bribery.",
            "[beat]",
            "The episode separates disclosure, campaign finance, and quid pro quo bribery.",
            "[/s1]",
          ].join("\n"),
        }),
        lane: "byo",
        behavior: "careful",
      }),
    }));

    assert.equal(response.status, 200);
    assert.match(String(capturedQuery), /Lobbying Is Not Bribery/i);
    assert.match(String(capturedQuery), /Lobbying Disclosure Act/i);
    assert.match(String(capturedQuery), /\bCRS\b/);
    assert.match(String(capturedQuery), /\bGAO\b/);
    assert.match(String(capturedQuery), /independent reporting archive data/i);
    assert.doesNotMatch(String(capturedQuery), /^\s*Find strong sources I should cite for this Episode\.\s*$/i);
    assert.doesNotMatch(String(capturedQuery), /\[s1\]|\[beat\]|Response tone:/i);
    const payload = await response.json();
    assert.equal(payload.research_result?.mode, "retrieval_first");
    assert.equal(payload.research_result?.runtimeStatus, "ok");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createHearthAiHandler treats retry live research phrasing as research intent", async () => {
  const handler = createHearthAiHandler(buildConfig({
    textApiKey: "test-key",
    researchApiKey: "brave-test-key",
  }));
  const originalFetch = globalThis.fetch;
  let braveCalled = false;

  globalThis.fetch = async (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://api.search.brave.com/res/v1/web/search")) {
      braveCalled = true;
      return new Response(JSON.stringify({
        web: {
          results: [
            {
              title: "Live research source",
              url: "https://example.com/live-research",
              description: "Live research source summary.",
              page_age: "2026-03-15",
            },
          ],
        },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url === "https://example.com/live-research") {
      return new Response("Live research extraction body.", {
        status: 200,
        headers: { "content-type": "text/plain" },
      });
    }
    if (url === "https://api.openai.com/v1/chat/completions") {
      return new Response(JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                assistantText: "Live research retry worked.",
                ops: [],
                script_text: null,
                tag_audit: null,
              }),
            },
          },
        ],
        usage: { total_tokens: 38 },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  try {
    const response = await handler(new Request(`http://localhost${HEARTH_AI_ROUTES.chat}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "please try live research one more time" }],
        episode_context: buildEpisodeContext(),
        lane: "byo",
        behavior: "careful",
      }),
    }));

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(braveCalled, true);
    assert.equal(payload.research_result?.mode, "retrieval_first");
    assert.equal(payload.research_result?.runtimeStatus, "ok");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createHearthAiHandler marks partial retrieval honestly when some sources fail extraction", async () => {
  const handler = createHearthAiHandler(buildConfig({
    textApiKey: "test-key",
    researchApiKey: "brave-test-key",
  }));
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://api.search.brave.com/res/v1/web/search")) {
      return new Response(JSON.stringify({
        web: {
          results: [
            {
              title: "Reachable source",
              url: "https://example.com/reachable",
              description: "Reachable source summary.",
              page_age: "2026-03-12",
            },
            {
              title: "Blocked source",
              url: "https://example.com/blocked",
              description: "Blocked source summary.",
              page_age: "2026-03-14",
            },
          ],
        },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url === "https://example.com/reachable") {
      return new Response("<html><head><title>Reachable</title></head><body>Readable details.</body></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }
    if (url === "https://example.com/blocked") {
      return new Response("blocked", { status: 503 });
    }
    if (url === "https://api.openai.com/v1/chat/completions") {
      return new Response(JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                assistantText: "Some sources were retrieved and one failed.",
                ops: [],
                script_text: null,
                tag_audit: null,
                research_artifact: researchArtifactFromPrompt(init, "The inspected report provides a concrete breach example with readable incident details.", "partial"),
              }),
            },
          },
        ],
        usage: { total_tokens: 74 },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  try {
    const response = await handler(new Request(`http://localhost${HEARTH_AI_ROUTES.chat}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "Find breach reports with examples." }],
        episode_context: buildEpisodeContext(),
        lane: "byo",
        behavior: "careful",
      }),
    }));

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.research_result?.mode, "partial_retrieval");
    assert.equal(payload.research_result?.runtimeStatus, "partial");
    assert.equal(payload.research_result?.sources?.[0]?.extractionStatus, "extracted");
    assert.equal(payload.research_result?.sources?.[1]?.extractionStatus, "failed");
    assert.match(
      String(payload.research_result?.synthesis?.uncertainties?.[0] ?? ""),
      /partial, failed, or skipped/i,
    );
    assert.match(String(payload.assistant_text ?? ""), /Research outcome: Partial/i);
    assert.match(String(payload.assistant_text ?? ""), /Inaccessible sources/i);
    assert.match(String(payload.assistant_text ?? ""), /http_error/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createHearthAiHandler returns no_results when provider returns no candidates", async () => {
  const handler = createHearthAiHandler(buildConfig({
    textApiKey: "test-key",
    researchApiKey: "brave-test-key",
  }));
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://api.search.brave.com/res/v1/web/search")) {
      return new Response(JSON.stringify({
        web: {
          results: [],
        },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url === "https://api.openai.com/v1/chat/completions") {
      return new Response(JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                assistantText: "No strong matches yet; here is a refinement direction.",
                ops: [],
                script_text: null,
                tag_audit: null,
              }),
            },
          },
        ],
        usage: { total_tokens: 64 },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  try {
    const response = await handler(new Request(`http://localhost${HEARTH_AI_ROUTES.chat}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "Find breach reporting from an obscure local incident." }],
        episode_context: buildEpisodeContext(),
        lane: "byo",
        behavior: "careful",
      }),
    }));

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.research_result?.mode, "retrieval_first");
    assert.equal(payload.research_result?.runtimeStatus, "no_results");
    assert.equal(payload.research_result?.sources?.length, 0);
    assert.match(String(payload.research_result?.synthesis?.summary ?? ""), /No strong retrieval results/i);
    assert.match(String(payload.assistant_text ?? ""), /No research pack was completed/i);
    assert.match(String(payload.assistant_text ?? ""), /No source candidates were returned/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createHearthAiHandler labels retrieval errors as knowledge-first fallback in research replies", async () => {
  const handler = createHearthAiHandler(buildConfig({
    textApiKey: "test-key",
    researchApiKey: "brave-test-key",
  }));
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://api.search.brave.com/res/v1/web/search")) {
      return new Response("upstream failure", { status: 502 });
    }
    if (url === "https://api.openai.com/v1/chat/completions") {
      return new Response(JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                assistantText: "Here are angles to explore next.",
                ops: [],
                script_text: null,
                tag_audit: null,
              }),
            },
          },
        ],
        usage: { total_tokens: 62 },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  try {
    const response = await handler(new Request(`http://localhost${HEARTH_AI_ROUTES.chat}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "Find recent breach reporting examples." }],
        episode_context: buildEpisodeContext(),
        lane: "byo",
        behavior: "careful",
      }),
    }));

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.research_result?.runtimeStatus, "error");
    assert.equal(payload.research_result?.mode, "knowledge_first");
    assert.equal(payload.research_result?.providerStatus, "configured_but_provider_failing");
    assert.match(String(payload.assistant_text ?? ""), /No research pack was completed/i);
    assert.match(String(payload.assistant_text ?? ""), /search provider failed during this request/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createHearthAiHandler strips internal prompt markers from research fallback replies", async () => {
  const priorResearchEnv = snapshotResearchEnv();
  clearResearchEnv();
  const handler = createHearthAiHandler(buildConfig({ textApiKey: "test-key" }));
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      messages?: Array<{ role?: string; content?: string }>;
    };
    const systemPrompt = body.messages?.[0]?.content ?? "";
    if (!/Research mode behavior \(hard rule\):/i.test(systemPrompt)) {
      throw new Error("Expected research mode prompt");
    }
    return new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify({
              assistantText: [
                "Response tone: Sound like a capable creative operations partner.",
                "The user prefers a full script when they explicitly ask for one.",
                "If helpful, ask whether they want a deeper pass.",
              ].join("\n"),
              ops: [],
              script_text: null,
              tag_audit: null,
            }),
          },
        },
      ],
      usage: { total_tokens: 61 },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const response = await handler(new Request(`http://localhost${HEARTH_AI_ROUTES.chat}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "Find breach-related reporting examples." }],
        episode_context: buildEpisodeContext(),
        lane: "byo",
        behavior: "careful",
      }),
    }));

    assert.equal(response.status, 200);
    const payload = await response.json();
    const assistantText = String(payload.assistant_text ?? "");
    assert.match(assistantText, /No research pack was completed/i);
    assert.match(assistantText, /Live retrieval is not configured/i);
    assert.doesNotMatch(assistantText, /Response tone:/i);
    assert.doesNotMatch(assistantText, /The user prefers/i);
    assert.doesNotMatch(assistantText, /If helpful, ask whether/i);
  } finally {
    globalThis.fetch = originalFetch;
    restoreResearchEnv(priorResearchEnv);
  }
});

test("createHearthAiHandler classifies creator text separately and activates listening mode", async () => {
  const handler = createHearthAiHandler(buildConfig({ textApiKey: "test-key" }));
  const originalFetch = globalThis.fetch;
  let capturedSystemPrompt = "";
  const raw = "I want to establish the scale, then cover its working life and restoration. Are you with me so far?";
  const augmented = `${raw}\n\nThe user prefers a full script when explicitly requested. Recording-ready script rules: write scripts for Anvil and perform a narrative rewrite.`;

  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { messages?: Array<{ content?: string }> };
    capturedSystemPrompt = body.messages?.[0]?.content ?? "";
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ assistantText: "I’m with you. Keep going.", ops: [], script_text: null, tag_audit: null }) } }],
      usage: { total_tokens: 24 },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    assert.equal(shouldUseWorkspaceContext(raw), false);
    assert.equal(shouldUseWorkspaceContext(augmented), true);
    const response = await handler(new Request(`http://localhost${HEARTH_AI_ROUTES.chat}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: augmented }],
        user_authored_text: raw,
        episode_context: buildEpisodeContext({ title: "Big Boy 4014" }),
        lane: "byo",
        behavior: "careful",
      }),
    }));
    assert.equal(response.status, 200);
    assert.match(capturedSystemPrompt, /Listening-turn override \(hard rule\)/i);
    assert.match(capturedSystemPrompt, /still explaining an idea/i);
    const payload = await response.json();
    assert.doesNotMatch(String(payload.assistant_text ?? ""), /possible draft match/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createHearthAiHandler acceptance prompts route to drafting flow instead of checklist gating", async () => {
  const handler = createHearthAiHandler(buildConfig({ textApiKey: "test-key" }));
  const originalFetch = globalThis.fetch;
  let openAiCallCount = 0;

  globalThis.fetch = async () => {
    openAiCallCount += 1;
    return new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify({
              assistantText: "We can tighten this and keep your voice.",
              ops: [],
              script_text: null,
              tag_audit: null,
            }),
          },
        },
      ],
      usage: { total_tokens: 66 },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const acceptancePrompts = [
    "I've got a rough idea but I don't know if there's actually a full episode in it.",
    "This script feels stiff and I'm starting to hate it.",
    "I've got too many directions and none of them are landing.",
    "Okay, now we're onto something.",
    "This section is too long but I still need the point to land.",
  ];

  try {
    for (const content of acceptancePrompts) {
      const response = await handler(new Request(`http://localhost${HEARTH_AI_ROUTES.chat}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content }],
          episode_context: buildEpisodeContext(),
          lane: "byo",
          behavior: "careful",
        }),
      }));

      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.ok, true);
      assert.equal(payload.gate, undefined, `unexpected clarify gate for prompt: ${content}`);
    }

    assert.equal(openAiCallCount, acceptancePrompts.length);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createHearthAiHandler round2 acceptance prompts route to feedback flow without clarify gate", async () => {
  const handler = createHearthAiHandler(buildConfig({ textApiKey: "test-key" }));
  const originalFetch = globalThis.fetch;
  let openAiCallCount = 0;

  globalThis.fetch = async () => {
    openAiCallCount += 1;
    return new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify({
              assistantText: "The premise is usable, but it's too safe. Here's the sharper version.",
              ops: [],
              script_text: null,
              tag_audit: null,
            }),
          },
        },
      ],
      usage: { total_tokens: 77 },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const round2Prompts = [
    "I'm thinking of doing an episode about productivity tips everyone already knows.",
    "Here's my intro and it's probably too long but I'm not sure where the drag starts.",
    "I like it the way it is.",
    "This is the core concept: burnout isn't about laziness, it's misaligned incentives.",
  ];

  try {
    for (const content of round2Prompts) {
      const response = await handler(new Request(`http://localhost${HEARTH_AI_ROUTES.chat}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content }],
          episode_context: buildEpisodeContext(),
          lane: "byo",
          behavior: "careful",
        }),
      }));

      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.ok, true);
      assert.equal(payload.gate, undefined);
    }

    assert.equal(openAiCallCount, round2Prompts.length);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createHearthAiHandler routes release prep asks to generation flow without clarify gate", async () => {
  const handler = createHearthAiHandler(buildConfig({ textApiKey: "test-key" }));
  const originalFetch = globalThis.fetch;
  let openAiCalled = false;

  globalThis.fetch = async () => {
    openAiCalled = true;
    return new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify({
              assistantText: "Release Prep Pack ready with titles, short hook, and monetization angle.",
              ops: [],
              script_text: null,
              tag_audit: null,
            }),
          },
        },
      ],
      usage: { total_tokens: 91 },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const response = await handler(new Request(`http://localhost${HEARTH_AI_ROUTES.chat}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "Run a release prep pack with titles, a shorts hook, and monetization angle." }],
        episode_context: buildEpisodeContext(),
        lane: "byo",
        behavior: "careful",
      }),
    }));

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.gate, undefined);
    assert.equal(openAiCalled, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
