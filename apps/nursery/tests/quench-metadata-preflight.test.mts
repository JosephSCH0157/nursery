import assert from "node:assert/strict";
import http from "node:http";
import { createHammerPrepMiddleware } from "../scripts/mw-hammer-prep";
import type { HearthRuntimeConfig } from "../server/hearth/hearth-runtime-config";
import { QUENCH_METADATA_ASSIST_ROUTE } from "../../quench/src/core/quenchMetadataAssist.contract";

type CaseDef = {
  label: string;
  decision: "ALLOW" | "SOFT_DENY" | "HARD_DENY";
  reasonCode: string | null;
  expectedStatus: number;
  expectedMessageIncludes: string | null;
  expectOpenAiCalled: boolean;
};

const TEST_USER_ID = "a1111111-1111-4111-8111-111111111111";
const TEST_ORG_ID = "a2222222-2222-4222-8222-222222222222";
const TEST_WORKSPACE_ID = "a3333333-3333-4333-8333-333333333333";
const TEST_WORKPIECE_ID = "a4444444-4444-4444-8444-444444444444";

function runtimeConfig(overrides: Partial<HearthRuntimeConfig> = {}): HearthRuntimeConfig {
  return {
    textApiKey: "test-openai-key",
    apiKey: "test-openai-key",
    model: "gpt-5.3",
    sttModel: "gpt-4o-mini-transcribe",
    configuredBillingMode: "forge",
    initialTokenBalance: 0,
    supabaseUrl: "https://example.supabase.co",
    supabaseServiceRoleKey: null,
    supabaseRpcKey: "test-anon-key",
    sttBucket: "test",
    disableForgeLaneAi: false,
    disableUserKeys: false,
    disableExpensiveAiActions: false,
    disableCdcGeneration: false,
    ...overrides,
  };
}

function toUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function listenServer(handler: http.RequestListener): Promise<{
  origin: string;
  close: () => Promise<void>;
}> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to bind test server.");
  }
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    },
  };
}

async function runCase(caseDef: CaseDef): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalExecutionMode = process.env.FORGE_OPENAI_TEXT_EXECUTION_MODE;
  process.env.FORGE_OPENAI_TEXT_EXECUTION_MODE = "inactive";

  const calls: Array<{ url: string; body: unknown }> = [];
  const middleware = createHammerPrepMiddleware({ runtimeConfig: runtimeConfig() });
  const server = await listenServer((req, res) => {
    middleware(req, res, (error) => {
      if (error) {
        res.statusCode = 500;
        res.setHeader("content-type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ ok: false, error: { message: String(error) } }));
        return;
      }
      res.statusCode = 404;
      res.end();
    });
  });

  try {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = toUrl(input);
      if (url.startsWith(server.origin)) {
        return originalFetch(input, init);
      }

      let body: unknown = null;
      if (typeof init?.body === "string") {
        try {
          body = JSON.parse(init.body);
        } catch {
          body = init.body;
        }
      }
      calls.push({ url, body });

      if (url.endsWith("/auth/v1/user")) {
        return jsonResponse(200, { id: TEST_USER_ID });
      }
      if (url.includes("/rest/v1/workspaces?id=eq.")) {
        return jsonResponse(200, [{ org_id: TEST_ORG_ID }]);
      }
      if (url.endsWith("/rest/v1/rpc/resolve_ai_access_policy")) {
        return jsonResponse(200, [{ decision_type: caseDef.decision, reason_code: caseDef.reasonCode }]);
      }
      if (url === "https://api.openai.com/v1/chat/completions") {
        return jsonResponse(200, {
          choices: [{
            message: {
              content: JSON.stringify({
                title: "Sharper launch title",
                description: "Tighter episode summary for release pages.",
                tags: ["launch", "summary", "release"],
              }),
            },
          }],
        });
      }
      throw new Error(`Unexpected fetch url in Quench metadata test: ${url}`);
    }) as typeof fetch;

    const response = await fetch(`${server.origin}${QUENCH_METADATA_ASSIST_ROUTE}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forge-user-authorization": "Bearer test-user-access-token",
      },
      body: JSON.stringify({
        operation_id: `forge:test:quench-metadata:${caseDef.label}`,
        workspace_id: TEST_WORKSPACE_ID,
        workpiece_id: TEST_WORKPIECE_ID,
        title: "Original title",
        description: "Original description body.",
        tags: ["draft", "release"],
      }),
    });

    const payload = await response.json();
    assert.equal(response.status, caseDef.expectedStatus, `${caseDef.label}: status mismatch`);
    if (caseDef.expectedStatus === 200) {
      assert.equal(payload?.ok, true, `${caseDef.label}: expected ok=true`);
      assert.equal(typeof payload?.data?.draft?.title, "string", `${caseDef.label}: missing draft title`);
    } else {
      assert.equal(payload?.ok, false, `${caseDef.label}: expected ok=false`);
      if (caseDef.expectedMessageIncludes) {
        const message = String(payload?.error?.message ?? "");
        assert.equal(message.includes(caseDef.expectedMessageIncludes), true, `${caseDef.label}: message mismatch`);
      }
    }

    const policyCall = calls.find((call) => call.url.endsWith("/rest/v1/rpc/resolve_ai_access_policy"));
    assert(policyCall, `${caseDef.label}: missing resolve_ai_access_policy call`);
    assert.equal((policyCall?.body as Record<string, unknown>)?.p_tool, "quench", `${caseDef.label}: tool mismatch`);
    assert.equal((policyCall?.body as Record<string, unknown>)?.p_action, "chat", `${caseDef.label}: action mismatch`);
    assert.equal(
      (policyCall?.body as Record<string, unknown>)?.p_feature,
      "research_flows",
      `${caseDef.label}: feature mismatch`,
    );

    const openAiCalls = calls.filter((call) => call.url === "https://api.openai.com/v1/chat/completions");
    assert.equal(openAiCalls.length > 0, caseDef.expectOpenAiCalled, `${caseDef.label}: openai call expectation mismatch`);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalExecutionMode == null) delete process.env.FORGE_OPENAI_TEXT_EXECUTION_MODE;
    else process.env.FORGE_OPENAI_TEXT_EXECUTION_MODE = originalExecutionMode;
    await server.close();
  }
}

async function runUnfundedEnforcementCase(): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalExecutionMode = process.env.FORGE_OPENAI_TEXT_EXECUTION_MODE;
  process.env.FORGE_OPENAI_TEXT_EXECUTION_MODE = "enforce";

  const gateCalls: string[] = [];
  let openAiCalls = 0;
  const openAiTextGate = {
    async rpc(name: string, args: Record<string, unknown>) {
      gateCalls.push(name);
      switch (name) {
        case "read_openai_execution_requirement":
          return { data: { mode: "enforce" }, error: null };
        case "read_existing_openai_text_funding_handle":
          return { data: null, error: null };
        case "resolve_openai_text_model_for_funding_quote":
          return {
            data: {
              catalog_revision_id: "b1111111-1111-4111-8111-111111111111",
              catalog_revision: 1,
              model_catalog_entry_id: "b2222222-2222-4222-8222-222222222222",
              customer_selection_key: "b3333333-3333-4333-8333-333333333333",
              runtime_model_id: "gpt-5.3",
              provider_model_id: "gpt-5.3",
              display_name: "GPT-5.3",
              tradeoff_summary: "Test-only bounded metadata model.",
            },
            error: null,
          };
        case "create_customer_openai_text_quote":
          return {
            data: {
              quote_id: args.p_quote_id,
              operation_id: args.p_operation_id,
              quote_hash: "b".repeat(64),
              request_fingerprint: args.p_request_fingerprint,
              currency: "USD",
              maximum_customer_charge_micros: 10_000,
              customer_credit_units: 2,
              failure_customer_charge_micros: 0,
              funding_eligible: true,
              funding_source: "customer_deposit",
              funding_environment: "test",
              payer_kind: "personal",
              expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
            },
            error: null,
          };
        case "read_openai_text_quote_bounding_context":
          return {
            data: {
              model: "gpt-5.3",
              maximum_input_units: 32_000,
              maximum_output_units: 8_000,
              maximum_attempts: 1,
            },
            error: null,
          };
        case "bind_bounded_provider_quote_request":
          return { data: { bound: true }, error: null };
        default:
          return { data: null, error: { message: `Unexpected financial RPC: ${name}` } };
      }
    },
  };
  const middleware = createHammerPrepMiddleware({
    runtimeConfig: runtimeConfig({ supabaseServiceRoleKey: "test-service-role-key" }),
    openAiTextGate,
  });
  const server = await listenServer((req, res) => {
    middleware(req, res, (error) => {
      if (error) {
        res.statusCode = 500;
        res.end(JSON.stringify({ ok: false, error: { message: String(error) } }));
        return;
      }
      res.statusCode = 404;
      res.end();
    });
  });

  try {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = toUrl(input);
      if (url.startsWith(server.origin)) return originalFetch(input, init);
      if (url.endsWith("/auth/v1/user")) return jsonResponse(200, { id: TEST_USER_ID });
      if (url.includes("/rest/v1/workspaces?id=eq.")) return jsonResponse(200, [{ org_id: TEST_ORG_ID }]);
      if (url.endsWith("/rest/v1/rpc/resolve_ai_access_policy")) {
        return jsonResponse(200, [{ decision_type: "ALLOW", reason_code: null }]);
      }
      if (url === "https://api.openai.com/v1/chat/completions") {
        openAiCalls += 1;
        throw new Error("Unfunded Quench metadata must not reach OpenAI.");
      }
      throw new Error(`Unexpected fetch url in unfunded Quench metadata test: ${url}`);
    }) as typeof fetch;

    const response = await fetch(`${server.origin}${QUENCH_METADATA_ASSIST_ROUTE}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forge-user-authorization": "Bearer test-user-access-token",
      },
      body: JSON.stringify({
        operation_id: "forge:test:quench-metadata:unfunded",
        workspace_id: TEST_WORKSPACE_ID,
        workpiece_id: TEST_WORKPIECE_ID,
        title: "Original title",
        description: "Original description body.",
        tags: ["draft", "release"],
      }),
    });
    const payload = await response.json();
    assert.equal(response.status, 409, "unfunded enforce-mode request must require quote acceptance");
    assert.equal(payload?.ok, false);
    assert.equal(payload?.error?.code, "openai_text_quote_required");
    assert.equal(typeof payload?.error?.billing_quote?.quote_id, "string");
    assert.equal(openAiCalls, 0, "unfunded request must not call OpenAI");
    assert.deepEqual(gateCalls, [
      "read_openai_execution_requirement",
      "read_existing_openai_text_funding_handle",
      "resolve_openai_text_model_for_funding_quote",
      "create_customer_openai_text_quote",
      "read_openai_text_quote_bounding_context",
      "bind_bounded_provider_quote_request",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalExecutionMode == null) delete process.env.FORGE_OPENAI_TEXT_EXECUTION_MODE;
    else process.env.FORGE_OPENAI_TEXT_EXECUTION_MODE = originalExecutionMode;
    await server.close();
  }
}

async function main(): Promise<void> {
  await runCase({
    label: "allow",
    decision: "ALLOW",
    reasonCode: null,
    expectedStatus: 200,
    expectedMessageIncludes: null,
    expectOpenAiCalled: true,
  });
  await runCase({
    label: "soft-deny",
    decision: "SOFT_DENY",
    reasonCode: "PERSONAL_AI_REQUIRED_NOT_CONFIGURED",
    expectedStatus: 403,
    expectedMessageIncludes: "Configure a personal AI connection and retry.",
    expectOpenAiCalled: false,
  });
  await runCase({
    label: "hard-deny",
    decision: "HARD_DENY",
    reasonCode: "MEMBERSHIP_REQUIRED_STUDIO_OR_FOUNDER",
    expectedStatus: 403,
    expectedMessageIncludes: "Studio or Founder entitlement",
    expectOpenAiCalled: false,
  });
  await runUnfundedEnforcementCase();
  console.log("Quench metadata preflight tests passed.");
}

main().catch((error) => {
  console.error("Quench metadata preflight tests failed:", error);
  process.exit(1);
});

