import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateScriptTags } from "@forge/shared/script-tags";
import { coalesceScriptTextIntoOps, refreshMyAiCredits, requestHearthChatReply, resolveForgeUserAccessToken, resolveScriptTextFromChatPayload } from "../src/lib/hearth-chat-api";
import {
  isHearthAiCreditAdmissionDepleted,
  parseHearthAiStatusResponse,
  type HearthOp,
} from "../src/lib/hearth-ai-runtime-contract";
import { resolveOwnerChatCapabilityMessage } from "../src/hooks/useChatWorkspace";
import { isOwnerChatCapabilityBlocked, resolveHearthAttachmentStatusLabel } from "../src/views/surfaces/ChatSurface";

function assertMaxSpeakerSpokenLines(script: string, maxLines: number): void {
  let insideSpeaker = false;
  let count = 0;
  for (const line of script.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (/^\[(?:s1|s2|g1|g2)\]$/i.test(trimmed)) {
      insideSpeaker = true;
      count = 0;
      continue;
    }
    if (/^\[\/(?:s1|s2|g1|g2)\]$/i.test(trimmed)) {
      assert.ok(count <= maxLines, `speaker block had ${count} spoken lines:\n${script}`);
      insideSpeaker = false;
      count = 0;
      continue;
    }
    if (insideSpeaker && trimmed && !/^\[(?:beat|pause|reflective pause)\]$/i.test(trimmed)) count += 1;
  }
}

function installCustomerFundingRefreshHarness(payload: unknown) {
  const originalFetch = globalThis.fetch;
  const originalWindow = (globalThis as { window?: unknown }).window;
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const jwtHeader = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const jwtPayload = Buffer.from(JSON.stringify({
    sub: "55555555-5555-4555-8555-555555555555",
    exp: Math.floor(Date.now() / 1000) + 3600,
  })).toString("base64url");
  const storage = new Map<string, string>([["forge-auth", `${jwtHeader}.${jwtPayload}.sig`]]);
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
      removeItem: (key: string) => void storage.delete(key),
      clear: () => void storage.clear(),
      key: (index: number) => Array.from(storage.keys())[index] ?? null,
      get length() { return storage.size; },
    },
    __forgeSupabaseUrl: "https://supabase.example.test",
    __forgeSupabaseAnonKey: "anon-test-key",
  };
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, init });
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return {
    requests,
    restore: () => {
      globalThis.fetch = originalFetch;
      (globalThis as { window?: unknown }).window = originalWindow;
    },
  };
}

function customerFundingV4(betaEligible = true): Record<string, unknown> {
  return {
    contract_version: "forge.customer-funding.v4",
    credit_contract: "forge.credit-economy.v1",
    active_environment: "test",
    active_spendable: {
      purchased: { available_credit_units: 11, provider_execution_eligible: true },
      allowances: { available_entitlement_units: 7, provider_execution_eligible: true },
      beta_grants: { available_credit_units: 5, provider_execution_eligible: betaEligible },
    },
  };
}

async function refreshFundingPayload(payload: unknown) {
  const harness = installCustomerFundingRefreshHarness(payload);
  try {
    return { result: await refreshMyAiCredits(), requests: harness.requests };
  } finally {
    harness.restore();
  }
}

test("customer funding v4 projects authoritative active spendable credits", async () => {
  const { result, requests } = await refreshFundingPayload(customerFundingV4());
  assert.equal(result.ok, true);
  assert.equal(result.runtime.billingMode, "forge");
  assert.equal(result.runtime.tokenBalance, 23);
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.url, "https://supabase.example.test/rest/v1/rpc/read_my_customer_funding");
  assert.equal(requests[0]?.init?.method, "POST");
  assert.equal(requests[0]?.init?.body, "{}");
});

test("customer funding v4 includes beta credits only when canonical authority marks them eligible", async () => {
  const { result } = await refreshFundingPayload(customerFundingV4(false));
  assert.equal(result.ok, true);
  assert.equal(result.runtime.tokenBalance, 18);
});

test("customer funding v2 projection remains compatible", async () => {
  const { result } = await refreshFundingPayload({
    contract_version: "forge.customer-funding.v2",
    active_spendable: {
      purchased: { available_credit_units: "11" },
      allowances: { available_entitlement_units: "7" },
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.runtime.tokenBalance, 18);
});

test("customer funding contracts fail closed on unknown, malformed, or missing authority", async () => {
  const invalidPayloads: unknown[] = [
    { ...customerFundingV4(), contract_version: "forge.customer-funding.v5" },
    { ...customerFundingV4(), credit_contract: "forge.credit-economy.unknown" },
    { ...customerFundingV4(), active_spendable: null },
    {
      ...customerFundingV4(),
      active_spendable: {
        purchased: { available_credit_units: -1 },
        allowances: { available_entitlement_units: 7 },
        beta_grants: { available_credit_units: 5, provider_execution_eligible: true },
      },
    },
    {
      ...customerFundingV4(),
      active_spendable: {
        purchased: { available_credit_units: 11, provider_execution_eligible: true },
        allowances: { available_entitlement_units: 7, provider_execution_eligible: true },
        beta_grants: { available_credit_units: 5 },
      },
    },
    {
      ...customerFundingV4(),
      active_spendable: {
        purchased: { available_credit_units: 11 },
        allowances: { available_entitlement_units: 7, provider_execution_eligible: true },
        beta_grants: { available_credit_units: 5, provider_execution_eligible: true },
      },
    },
    {
      contract_version: "forge.customer-funding.v2",
      active_spendable: {
        purchased: {},
        allowances: { available_entitlement_units: 7 },
      },
    },
  ];
  for (const payload of invalidPayloads) {
    const { result } = await refreshFundingPayload(payload);
    assert.equal(result.ok, true);
    assert.equal(result.runtime.billingMode, "forge");
    assert.equal(result.runtime.tokenBalance, null);
  }
});

test("chat completion and script repair consume the refreshed authoritative projection", () => {
  const chatRuntime = readFileSync(new URL("../src/hooks/useChatWorkspace.ts", import.meta.url), "utf8");
  const scriptRepair = readFileSync(new URL("../src/hooks/useHearthScriptRepairActions.ts", import.meta.url), "utf8");
  for (const source of [chatRuntime, scriptRepair]) {
    assert.match(source, /const refreshedCredits = await args\.refreshMyAiCredits\(\)/);
    assert.match(source, /args\.setAiTokenBalance\(refreshedCredits\.runtime\.tokenBalance\)/);
  }
});

test("resolveScriptTextFromChatPayload promotes canonical assistant text into script text", () => {
  const ops: HearthOp[] = [];
  const assistantText = [
    "[s1]",
    "- Open with the basic fact.",
    "- Frame the episode as a media-framing comparison.",
    "[/s1]",
    "",
    "[s2]",
    "- Close with the practical takeaway.",
    "[/s2]",
  ].join("\n");

  const result = resolveScriptTextFromChatPayload({
    assistantText,
    ops,
    scriptText: undefined,
  });

  assert.equal(result, assistantText);
});

test("resolveScriptTextFromChatPayload extracts canonical script from wrapped assistant prose", () => {
  const ops: HearthOp[] = [];
  const result = resolveScriptTextFromChatPayload({
    assistantText: [
      "Here is the panel-ready bullet script:",
      "",
      "[s1]",
      "- Hook.",
      "[/s1]",
      "",
      "[s2]",
      "- Close.",
      "[/s2]",
      "",
      "Use Step mode in Anvil.",
    ].join("\n"),
    ops,
    scriptText: undefined,
  });

  assert.equal(result, ["[s1]", "- Hook.", "[/s1]", "", "[s2]", "- Close.", "[/s2]"].join("\n"));
});

test("resolveScriptTextFromChatPayload does not promote ordinary assistant prose", () => {
  const result = resolveScriptTextFromChatPayload({
    assistantText: "This is a great angle. Want me to turn it into a bullet script?",
    ops: [],
    scriptText: undefined,
  });

  assert.equal(result, undefined);
});

test("resolveScriptTextFromChatPayload respects an existing body op", () => {
  const result = resolveScriptTextFromChatPayload({
    assistantText: "[s1]\n- Alternate draft\n[/s1]",
    ops: [{ op: "set_body", value: "[s1]\nExisting draft\n[/s1]" }],
    scriptText: undefined,
  });

  assert.equal(result, undefined);
});

test("ChatSurface attachment chip status labels are stable", () => {
  assert.equal(resolveHearthAttachmentStatusLabel("uploading"), "Uploading...");
  assert.equal(resolveHearthAttachmentStatusLabel("reading"), "Reading file...");
  assert.equal(resolveHearthAttachmentStatusLabel("attached"), "Attached");
  assert.equal(resolveHearthAttachmentStatusLabel("failed"), "Failed");
});

test("coalesceScriptTextIntoOps shapes set_body proposals before review display", () => {
  const blobScript = [
    "[s1]",
    "Alright. I want to talk about voting rights. And I want to talk about racism. Here is the thesis. If we actually want to end racism, we have to stop governing through race. Not stop noticing reality. Not stop enforcing fairness. But stop using race as the steering wheel for public policy.",
    "[/s1]",
  ].join("\n");

  const ops = coalesceScriptTextIntoOps([{ op: "set_body", value: blobScript }], undefined);
  const body = ops.find((op) => op.op === "set_body")?.value ?? "";

  assert.notEqual(body, blobScript);
  assert.equal(validateScriptTags(body).ok, true);
  assert.ok((body.match(/\[s1\]/g) ?? []).length >= 1);
  assertMaxSpeakerSpokenLines(body, 8);
});

test("owner chat readiness preserves distinct unavailable and unknown states", () => {
  const unavailable = parseHearthAiStatusResponse({
    billing_mode: "forge",
    token_balance: 99,
    owner_chat_capability: {
      status: "unavailable",
      reason_code: "owner_runtime_unavailable",
    },
  }, "forge");
  assert.deepEqual(unavailable.owner_chat_capability, {
    status: "unavailable",
    reason_code: "owner_runtime_unavailable",
  });
  assert.equal(isOwnerChatCapabilityBlocked({ status: "unavailable", reasonCode: "owner_runtime_unavailable" }), true);
  assert.equal(isOwnerChatCapabilityBlocked({ status: "unknown", reasonCode: "owner_controls_unavailable" }), true);
  assert.equal(isOwnerChatCapabilityBlocked({ status: "available", reasonCode: null }), false);
  assert.equal(isOwnerChatCapabilityBlocked({ status: "not_required", reasonCode: null }), false);
  assert.equal(
    resolveOwnerChatCapabilityMessage({ status: "unavailable", reasonCode: "owner_runtime_unavailable" }),
    "Private owner AI is unavailable in this runtime. Saved Hearth content and non-AI tools remain available.",
  );
  assert.equal(
    resolveOwnerChatCapabilityMessage({ status: "unknown", reasonCode: "owner_controls_unavailable" }),
    "Hearth couldn’t verify private owner AI availability. Saved content and non-AI tools remain available.",
  );
});

test("owner funding admission bypasses only active owner state", () => {
  const depleted = (ownerFundingStatus: "active" | "not_owner" | "blocked" | "unknown", tokenBalance = 0) => (
    isHearthAiCreditAdmissionDepleted({
      billingMode: "forge",
      tokenBalance,
      ownerFundingStatus,
    })
  );

  assert.equal(depleted("active"), false);
  assert.equal(depleted("not_owner"), true);
  assert.equal(depleted("blocked"), true);
  assert.equal(depleted("unknown"), true);
  assert.equal(depleted("not_owner", 1), false);
  assert.equal(isHearthAiCreditAdmissionDepleted({
    billingMode: "byo",
    tokenBalance: 0,
    ownerFundingStatus: "not_owner",
  }), false);

  const parsed = parseHearthAiStatusResponse({
    billing_mode: "forge",
    token_balance: 0,
    owner_funding_status: "active",
    owner_chat_capability: {
      status: "unavailable",
      reason_code: "owner_runtime_unavailable",
    },
  }, "forge");
  assert.equal(parsed.token_balance, 0);
  assert.equal(parsed.owner_funding_status, "active");
  assert.equal(parsed.owner_chat_capability?.status, "unavailable");

  const forged = parseHearthAiStatusResponse({
    billing_mode: "forge",
    token_balance: 0,
    owner_funding_status: "forged-owner",
  }, "forge");
  assert.equal(forged.owner_funding_status, undefined);
});

test("request authentication never borrows another Supabase environment's token", async () => {
  const originalWindow = (globalThis as { window?: unknown }).window;
  const foreignToken = `${Buffer.from("{}").toString("base64url")}.${Buffer.from(JSON.stringify({ sub: "foreign", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.sig`;
  const storage = new Map([["sb-another-project-auth-token", foreignToken]]);
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      key: (index: number) => Array.from(storage.keys())[index] ?? null,
      get length() { return storage.size; },
    },
  };
  try {
    assert.equal(await resolveForgeUserAccessToken(), null);
  } finally {
    (globalThis as { window?: unknown }).window = originalWindow;
  }
});

test("requestHearthChatReply includes attachment context metadata in payload", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = (globalThis as { window?: unknown }).window;
  let capturedBody: Record<string, unknown> | null = null;

  const storage = new Map<string, string>();
  const jwtHeader = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const jwtPayload = Buffer.from(JSON.stringify({
    sub: "55555555-5555-4555-8555-555555555555",
    exp: Math.floor(Date.now() / 1000) + 3600,
  })).toString("base64url");
  storage.set("forge-auth", `${jwtHeader}.${jwtPayload}.sig`);
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
      removeItem: (key: string) => void storage.delete(key),
      clear: () => void storage.clear(),
      key: (index: number) => Array.from(storage.keys())[index] ?? null,
      get length() {
        return storage.size;
      },
    },
    __forgeSupabaseUrl: "https://supabase.example.test",
    __forgeSupabaseAnonKey: "anon-test-key",
  };

  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/rest/v1/workspaces")) {
      return new Response(JSON.stringify([{ org_id: "44444444-4444-4444-8444-444444444444" }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (url.includes("/rest/v1/rpc/resolve_ai_access_policy")) {
      return new Response(JSON.stringify([{ decision_type: "ALLOW", reason_code: null }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (url.includes("/api/ai-keys/status")) {
      return new Response(JSON.stringify({
        ok: true,
        provider: "openai",
        connected: false,
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (url.includes("/api/hearth/chat")) {
      capturedBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return new Response(JSON.stringify({
        ok: true,
        turn_result: {
          decision: {
            mode: "production_action",
            requiresArtifact: true,
            allowsMutation: false,
            retrievalScope: "active_episode_only",
            requestedArtifact: "production",
            reasons: ["explicit_ui_action"],
          },
          assistantMessage: "Ready.",
          artifact: { kind: "production", action: "seo", value: "Ready." },
          operations: [],
          validation: { ok: true, failureKind: "none", message: null },
          persistence: "pending",
        },
        assistant_text: "Ready.",
        ops: [],
        script_text: null,
        tag_audit: null,
        billing_mode: "forge",
        token_balance: 42,
        total_tokens: 10,
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const result = await requestHearthChatReply(
      [{ role: "user", content: "Use my attachments" }],
      {
        episodeId: "11111111-1111-4111-8111-111111111111",
        workspaceId: "22222222-2222-4222-8222-222222222222",
        title: "Episode",
        titleVariants: { A: "", B: "", C: "" },
        outline: "",
        body: "",
        tonePreset: null,
        sources: [],
        sparks: [],
      },
      {
        userAuthoredText: "Use my attachments",
        explicitAction: { kind: "production", action: "seo" },
        outputPreference: "full_script",
        productionAction: "seo",
        productionScriptVersion: 7,
        attachmentContext: {
          includeEpisodeAttachments: true,
          attachmentIds: ["33333333-3333-4333-8333-333333333333"],
        },
      },
    );

    assert.equal(result.ok, true);
    assert.ok(capturedBody);
    const submittedBody = capturedBody as unknown as Record<string, unknown>;
    const attachmentContext = submittedBody.attachment_context as Record<string, unknown> | undefined;
    assert.ok(attachmentContext);
    assert.equal(attachmentContext?.include_episode_attachments, true);
    assert.deepEqual(attachmentContext?.attachment_ids, ["33333333-3333-4333-8333-333333333333"]);
    assert.equal(submittedBody.production_action, "seo");
    assert.equal(submittedBody.production_script_version, 7);
    assert.equal(submittedBody.user_authored_text, "Use my attachments");
    assert.deepEqual(submittedBody.explicit_action, { kind: "production", action: "seo" });
    assert.equal(submittedBody.output_preference, "full_script");
  } finally {
    globalThis.fetch = originalFetch;
    (globalThis as { window?: unknown }).window = originalWindow;
  }
});

test("coalesceScriptTextIntoOps shapes script_text before adding a body proposal", () => {
  const blobScript = [
    "[s1]",
    "This is the point. It lands hard. Then the next idea needs room. The audience needs to breathe before the argument turns.",
    "[/s1]",
  ].join("\n");

  const ops = coalesceScriptTextIntoOps([], blobScript);
  const body = ops.find((op) => op.op === "set_body")?.value ?? "";

  assert.notEqual(body, blobScript);
  assert.equal(validateScriptTags(body).ok, true);
  assertMaxSpeakerSpokenLines(body, 8);
});
