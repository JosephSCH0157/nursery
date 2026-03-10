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

test("createHearthAiHandler keeps chat error semantics when api key is missing", async () => {
  const handler = createHearthAiHandler(buildConfig({ apiKey: null }));
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
  assert.equal(payload.error, "Missing OPENAI_API_KEY in server env");
  assert.equal(payload.billing_mode, "forge");
});

test("createHearthAiHandler keeps stt error semantics when api key is missing", async () => {
  const handler = createHearthAiHandler(buildConfig({ apiKey: null }));
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
  assert.equal(payload.error, "Missing OPENAI_API_KEY in server env");
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
