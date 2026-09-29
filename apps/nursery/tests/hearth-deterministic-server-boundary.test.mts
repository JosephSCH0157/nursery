import assert from "node:assert/strict";
import test from "node:test";
import { createHearthAiHandler } from "../server/hearth/create-hearth-ai-handler";
import type { HearthRuntimeConfig } from "../server/hearth/hearth-runtime-config";
import type { HearthDeterministicAction } from "../../hearth/src/lib/hearth-deterministic-cleanup";

const ACTIONS: HearthDeterministicAction[] = [
  "format_only",
  "punctuation_cleanup",
  "grammar_cleanup",
  "deduplicate",
  "rambling_cleanup",
  "structural_cleanup",
];

test("stale or direct deterministic requests stop before provider and all accounting gates", async () => {
  const gateCalls: string[] = [];
  let providerCalls = 0;
  let userResolutionCalls = 0;
  const config: HearthRuntimeConfig = {
    textApiKey: "must-not-be-used",
    imageApiKey: null,
    researchApiKey: null,
    apiKey: "must-not-be-used",
    model: "gpt-5.3",
    sttModel: "gpt-4o-mini-transcribe",
    configuredBillingMode: "forge",
    initialTokenBalance: 0,
    supabaseUrl: null,
    supabaseServiceRoleKey: null,
    supabaseRpcKey: null,
    sttBucket: "forge-workpieces",
    disableForgeLaneAi: true,
    disableUserKeys: false,
    disableExpensiveAiActions: true,
    disableCdcGeneration: false,
    openAiTextGate: {
      async rpc(name: string) {
        gateCalls.push(name);
        throw new Error(`unexpected accounting RPC: ${name}`);
      },
    },
    resolveUserIdForAccessToken: async () => {
      userResolutionCalls += 1;
      throw new Error("unexpected identity/finance resolution");
    },
    openAiProviderFetch: async () => {
      providerCalls += 1;
      throw new Error("unexpected provider submission");
    },
  };
  const handler = createHearthAiHandler(config);

  for (const action of ACTIONS) {
    const outputs: string[] = [];
    for (const lane of ["forge", "byo"] as const) {
      const response = await handler(new Request("http://localhost/api/hearth/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lane,
          messages: [{ role: "user", content: action }],
          user_authored_text: action,
          explicit_action: { kind: "deterministic", action },
          episode_context: {
            episodeId: "episode-direct",
            workspaceId: null,
            title: "Direct boundary",
            titleVariants: { A: "", B: "", C: "" },
            outline: "",
            body: "[s1]\ni'm ready  , now.\nSame line.\nSame line.\n[/s1]",
            tonePreset: null,
            sources: [],
            sparks: [],
          },
          paid_execution: { malformed: true },
          spending_acceptance: { malformed: true },
        }),
      }));
      const payload = await response.json() as Record<string, any>;
      assert.equal(response.status, 200, `${action}/${lane}: ${JSON.stringify(payload)}`);
      assert.equal(payload.deterministic_action, action);
      assert.equal(payload.total_tokens, null);
      assert.equal(payload.turn_result.decision.mode, "deterministic_cleanup");
      outputs.push(String(payload.script_text));
    }
    assert.equal(outputs[0], outputs[1], `${action} must be funding-lane invariant`);
  }

  assert.deepEqual(gateCalls, []);
  assert.equal(providerCalls, 0);
  assert.equal(userResolutionCalls, 0);
});

test("a substantive rewrite without a structured deterministic marker remains outside the free boundary", async () => {
  let providerCalls = 0;
  const handler = createHearthAiHandler({
    textApiKey: "unused",
    imageApiKey: null,
    researchApiKey: null,
    apiKey: "unused",
    model: "gpt-5.3",
    sttModel: "gpt-4o-mini-transcribe",
    configuredBillingMode: "forge",
    initialTokenBalance: 0,
    supabaseUrl: null,
    supabaseServiceRoleKey: null,
    supabaseRpcKey: null,
    sttBucket: "forge-workpieces",
    disableForgeLaneAi: true,
    disableUserKeys: false,
    disableExpensiveAiActions: false,
    disableCdcGeneration: false,
    openAiProviderFetch: async () => {
      providerCalls += 1;
      throw new Error("should be blocked before provider");
    },
  });
  const response = await handler(new Request("http://localhost/api/hearth/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      lane: "forge",
      messages: [{ role: "user", content: "Rewrite this and make it warmer." }],
      user_authored_text: "Rewrite this and make it warmer.",
      episode_context: {
        episodeId: "episode-ai",
        workspaceId: null,
        title: "AI boundary",
        titleVariants: { A: "", B: "", C: "" },
        outline: "",
        body: "Existing draft.",
        tonePreset: null,
        sources: [],
        sparks: [],
      },
    }),
  }));
  assert.equal(response.status, 503);
  assert.equal(providerCalls, 0);
});
