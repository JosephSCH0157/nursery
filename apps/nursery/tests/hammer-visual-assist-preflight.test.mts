import assert from "node:assert/strict";
import http from "node:http";
import { createHammerPrepMiddleware } from "../scripts/mw-hammer-prep";

type CaseDef = {
  label: string;
  decision: "ALLOW" | "SOFT_DENY" | "HARD_DENY";
  reasonCode: string | null;
  expectedStatus: number;
  expectedMessageIncludes: string | null;
};

const TEST_USER_ID = "a1111111-1111-4111-8111-111111111111";
const TEST_ORG_ID = "a2222222-2222-4222-8222-222222222222";
const TEST_WORKSPACE_ID = "a3333333-3333-4333-8333-333333333333";
const TEST_WORKPIECE_ID = "a4444444-4444-4444-8444-444444444444";

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
  process.env.OPENAI_API_KEY = "test-openai-key";
  process.env.TONGS_SUPABASE_URL = "https://example.supabase.co";
  process.env.TONGS_SUPABASE_ANON_KEY = "test-anon-key";

  const calls: Array<{ url: string; body: unknown }> = [];
  const middleware = createHammerPrepMiddleware();
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
      throw new Error(`Unexpected fetch url in visual preflight test: ${url}`);
    }) as typeof fetch;

    const response = await fetch(`${server.origin}/api/hammer/editorial/visual-assist-preflight`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forge-user-authorization": "Bearer test-user-access-token",
      },
      body: JSON.stringify({
        workspace_id: TEST_WORKSPACE_ID,
        workpiece_id: TEST_WORKPIECE_ID,
      }),
    });
    const payload = await response.json();

    assert.equal(response.status, caseDef.expectedStatus, `${caseDef.label}: status mismatch`);
    if (caseDef.expectedStatus === 200) {
      assert.equal(payload?.ok, true, `${caseDef.label}: expected ok=true`);
    } else {
      assert.equal(payload?.ok, false, `${caseDef.label}: expected ok=false`);
      if (caseDef.expectedMessageIncludes) {
        const message = String(payload?.error?.message ?? "");
        assert.equal(message.includes(caseDef.expectedMessageIncludes), true, `${caseDef.label}: message mismatch`);
      }
    }

    const policyCall = calls.find((call) => call.url.endsWith("/rest/v1/rpc/resolve_ai_access_policy"));
    assert(policyCall, `${caseDef.label}: missing policy call`);
    assert.equal((policyCall?.body as Record<string, unknown>)?.p_tool, "hammer", `${caseDef.label}: tool mismatch`);
    assert.equal((policyCall?.body as Record<string, unknown>)?.p_action, "chat", `${caseDef.label}: action mismatch`);
    assert.equal((policyCall?.body as Record<string, unknown>)?.p_feature, "research_flows", `${caseDef.label}: feature mismatch`);
  } finally {
    globalThis.fetch = originalFetch;
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
  });
  await runCase({
    label: "soft-deny",
    decision: "SOFT_DENY",
    reasonCode: "PERSONAL_AI_REQUIRED_NOT_CONFIGURED",
    expectedStatus: 403,
    expectedMessageIncludes: "Configure a personal AI connection and retry.",
  });
  await runCase({
    label: "hard-deny",
    decision: "HARD_DENY",
    reasonCode: "MEMBERSHIP_REQUIRED_STUDIO_OR_FOUNDER",
    expectedStatus: 403,
    expectedMessageIncludes: "Studio or Founder entitlement",
  });
  console.log("Hammer visual assist preflight tests passed.");
}

main().catch((error) => {
  console.error("Hammer visual assist preflight tests failed:", error);
  process.exit(1);
});
