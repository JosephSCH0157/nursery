import assert from "node:assert/strict";
import test from "node:test";
import unavailable, { config as unavailableConfig } from "../netlify/functions/openai-unavailable";
import { createAnvilWhisperHandler } from "../server/anvil/create-anvil-whisper-handler";
import { createTongsCommitApiHandlerWithService, type TongsCommitApiService } from "../../../packages/tongs/src/workpiece-commit-api";

test("the four unsupported production HTTP paths explicitly reject without any service work", async () => {
  assert.equal(unavailableConfig.path.length, 4);
  for (const path of unavailableConfig.path) {
    const response = await unavailable(new Request(`https://fixture.invalid${path}`, { method: "POST" }));
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, "paid_execution_unavailable");
  }
});

test("actual Tongs alternate planning endpoints cannot invoke a service without server authority", async () => {
  let calls = 0;
  const service = new Proxy({}, { get() { calls++; throw new Error("service should not execute"); } }) as TongsCommitApiService;
  const handler = createTongsCommitApiHandlerWithService(service, "isolated-service-authority");
  for (const path of ["visual-plan-v2/generate", "image-prompts/interpret", "broll-v2/prompt-interpret"]) {
    const response = await handler(new Request(`https://fixture.invalid/tongs/workpieces/fixture/${path}`, { method: "POST" }));
    assert.equal(response.status, 401);
  }
  assert.equal(calls, 0);
});

test("actual Anvil OpenAI HTTP handler rejects absent owner-cost authority before transcription or fallback", async () => {
  const priorFetch = globalThis.fetch;
  let providerCalls = 0;
  globalThis.fetch = async input => {
    if (String(input).includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "11111111-2222-4333-8444-555555555555" }));
    providerCalls++;
    throw new Error("unfunded transport must not execute");
  };
  try {
    const handler = createAnvilWhisperHandler({ apiKey: "fake-key", sttModel: "gpt-4o-mini-transcribe",
      configuredBillingMode: "forge", initialTokenBalance: 999999,
      supabaseUrl: "https://fixture.invalid", supabaseServiceRoleKey: "fake-service-key",
      financialEnvironment: "test",
      ownerCostGate: { rpc: async () => ({ data: null, error: { message: "owner-cost authority unavailable" } }) } });
    const body = new FormData(); body.set("file", new Blob(["fixture"], { type: "audio/webm" }), "fixture.webm");
    body.set("lane", "forge");
    body.set("operation_created_at", "2026-09-28T12:00:00.000Z");
    const response = await handler(new Request("https://fixture.invalid/api/anvil/asr/whisper", {
      method: "POST", body, headers: { authorization: "Bearer fake-token" },
    }));
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, "owner_cost_establishment_failed");
    assert.equal(providerCalls, 0);
  } finally {
    globalThis.fetch = priorFetch;
  }
});
