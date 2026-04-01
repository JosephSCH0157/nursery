import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { HEARTH_AI_ROUTES } from "../../hearth/src/lib/hearth-ai-runtime-contract";
import hearthChatStatusFunction from "../netlify/functions/hearth-chat-status";
import { createHearthAiHandler } from "../server/hearth/create-hearth-ai-handler";
import type { HearthRuntimeConfig } from "../server/hearth/hearth-runtime-config";
import { resolveHearthRuntimeConfig } from "../server/hearth/hearth-runtime-config";
import { mwHearthChatApi } from "../scripts/mw-hearth-chat-api";

function buildConfig(overrides: Partial<HearthRuntimeConfig> = {}): HearthRuntimeConfig {
  return {
    textApiKey: null,
    imageApiKey: null,
    apiKey: null,
    model: "gpt-5",
    sttModel: "gpt-4o-mini-transcribe",
    configuredBillingMode: "forge",
    initialTokenBalance: 42,
    supabaseUrl: null,
    supabaseServiceRoleKey: null,
    supabaseRpcKey: null,
    sttBucket: "forge-workpieces",
    ...overrides,
  };
}

function buildEpisodeContext() {
  return {
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
        lane: "forge",
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
        lane: "forge",
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
        lane: "forge",
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

test("createHearthAiHandler bypasses clarify gate for short research asks and enables research-first prompt behavior", async () => {
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
        lane: "forge",
        behavior: "careful",
      }),
    }));

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.gate, undefined);
    assert.equal(openAiCalled, true);
    assert.match(capturedSystemPrompt, /Research mode behavior \(hard rule\):/i);
    assert.match(capturedSystemPrompt, /Always attempt a first-pass answer before limitations/i);
    assert.match(capturedSystemPrompt, /Start with immediate known examples/i);
    assert.match(capturedSystemPrompt, /Organize examples into clear buckets\/categories/i);
    assert.match(capturedSystemPrompt, /Research response shape:/i);
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
          lane: "forge",
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
          lane: "forge",
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
        lane: "forge",
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
