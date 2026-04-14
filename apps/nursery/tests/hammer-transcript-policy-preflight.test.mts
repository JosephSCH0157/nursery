import assert from "node:assert/strict";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import fsPromises from "node:fs/promises";
import { createHammerPrepMiddleware } from "../scripts/mw-hammer-prep";

type CaseDef = {
  label: string;
  decision: "ALLOW" | "SOFT_DENY" | "HARD_DENY";
  reasonCode: string | null;
  expectedStatus: number;
  expectedErrorCode: string | null;
  expectedMessageIncludes: string | null;
  expectOpenAiCalled: boolean;
  openAiBehavior?: "ok" | "empty" | "timeout";
  includeAuthHeader?: boolean;
  requestOverride?: Record<string, unknown>;
};

type FetchCall = {
  url: string;
  method: string;
  headers: Headers;
  body: unknown;
};

const TEST_USER_ID = "11111111-1111-4111-8111-111111111111";
const TEST_ORG_ID = "22222222-2222-4222-8222-222222222222";
const TEST_WORKSPACE_ID = "33333333-3333-4333-8333-333333333333";
const TEST_WORKPIECE_ID = "44444444-4444-4444-8444-444444444444";

function toUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
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
  const calls: FetchCall[] = [];

  process.env.OPENAI_API_KEY = "test-openai-key";
  process.env.TONGS_SUPABASE_URL = "https://example.supabase.co";
  process.env.TONGS_SUPABASE_ANON_KEY = "test-anon-key";
  if (caseDef.openAiBehavior === "timeout") {
    process.env.HAMMER_OPENAI_TRANSCRIBE_TIMEOUT_MS = "1";
  } else {
    delete process.env.HAMMER_OPENAI_TRANSCRIBE_TIMEOUT_MS;
  }

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

  const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "hammer-transcript-preflight-"));
  try {
    const mediaName = "source.wav";
    await fsPromises.writeFile(path.join(tempRoot, mediaName), Buffer.from("fake-audio-bytes"));

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = toUrl(input);
      if (url.startsWith(server.origin)) {
        return originalFetch(input, init);
      }
      const method = (init?.method ?? "GET").toUpperCase();
      const headers = new Headers(init?.headers ?? {});
      let body: unknown = null;
      if (typeof init?.body === "string") {
        try {
          body = JSON.parse(init.body);
        } catch {
          body = init.body;
        }
      }
      calls.push({ url, method, headers, body });

      if (url.includes("/tongs/workpieces/") && url.includes("/read-file")) {
        return new Response(Buffer.from("fake-audio-bytes"), {
          status: 200,
          headers: {
            "content-type": "audio/wav",
            "content-length": "9999999999",
          },
        });
      }
      if (url.endsWith("/auth/v1/user")) {
        return jsonResponse(200, { id: TEST_USER_ID });
      }
      if (url.includes("/rest/v1/workspaces?id=eq.")) {
        return jsonResponse(200, [{ org_id: TEST_ORG_ID }]);
      }
      if (url.endsWith("/rest/v1/rpc/resolve_ai_policy")) {
        return jsonResponse(200, [{ decision_type: caseDef.decision, reason_code: caseDef.reasonCode }]);
      }
      if (url === "https://api.openai.com/v1/audio/transcriptions") {
        if (caseDef.openAiBehavior === "timeout") {
          return await new Promise<Response>((resolve, reject) => {
            const signal = init?.signal;
            if (signal?.aborted) {
              reject(new Error("aborted"));
              return;
            }
            signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
          });
        }
        if (caseDef.openAiBehavior === "empty") {
          return jsonResponse(200, { text: "", segments: [] });
        }
        return jsonResponse(200, {
          text: "hello",
          segments: [{ id: "seg_1", start: 0, end: 1, text: "hello", speaker: "speaker_1" }],
        });
      }
      throw new Error(`Unexpected fetch url in test: ${url}`);
    }) as typeof fetch;

    const includeAuthHeader = caseDef.includeAuthHeader ?? true;
    const response = await fetch(`${server.origin}/api/hammer/prep/transcript`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(includeAuthHeader ? { "x-forge-user-authorization": "Bearer test-user-access-token" } : {}),
      },
      body: JSON.stringify({
        workspace_id: TEST_WORKSPACE_ID,
        workpiece_id: TEST_WORKPIECE_ID,
        media_kind: "recording_audio",
        local_root_abs: tempRoot,
        local_relpath: mediaName,
        mime_type: "audio/wav",
        ...(caseDef.requestOverride ?? {}),
      }),
    });

    const payload = await response.json();
    assert.equal(response.status, caseDef.expectedStatus, `${caseDef.label}: status mismatch`);
    assert.equal(Boolean(payload?.ok), caseDef.expectedStatus === 200, `${caseDef.label}: ok flag mismatch`);
    if (caseDef.expectedStatus !== 200) {
      assert.equal(String(payload?.error?.code ?? ""), String(caseDef.expectedErrorCode ?? ""), `${caseDef.label}: error.code mismatch`);
      assert.equal(typeof payload?.meta?.timestamp, "string", `${caseDef.label}: meta.timestamp missing`);
      assert.equal(typeof payload?.meta?.client_request_id, "string", `${caseDef.label}: meta.client_request_id missing`);
    }
    if (caseDef.expectedMessageIncludes) {
      const message = String(payload?.error?.message ?? "");
      assert.equal(message.includes(caseDef.expectedMessageIncludes), true, `${caseDef.label}: message mismatch`);
    }

    if (includeAuthHeader) {
      const rpcCall = calls.find((call) => call.url.endsWith("/rest/v1/rpc/resolve_ai_policy"));
      assert(rpcCall, `${caseDef.label}: missing resolve_ai_policy call`);
      assert.equal((rpcCall?.body as Record<string, unknown>)?.p_tool, "hammer", `${caseDef.label}: tool mismatch`);
      assert.equal((rpcCall?.body as Record<string, unknown>)?.p_feature, "heavy_tasks", `${caseDef.label}: feature mismatch`);
      assert.equal((rpcCall?.body as Record<string, unknown>)?.p_action, "stt", `${caseDef.label}: action mismatch`);
      assert.equal(
        (rpcCall?.body as Record<string, unknown>)?.p_workspace_id,
        TEST_WORKSPACE_ID,
        `${caseDef.label}: workspace mismatch`,
      );
      assert.equal(
        (rpcCall?.body as Record<string, unknown>)?.p_org_id,
        TEST_ORG_ID,
        `${caseDef.label}: org mismatch`,
      );
      assert.equal(
        (rpcCall?.body as Record<string, unknown>)?.p_user_id,
        TEST_USER_ID,
        `${caseDef.label}: user mismatch`,
      );
    }

    const openAiCalls = calls.filter((call) => call.url === "https://api.openai.com/v1/audio/transcriptions");
    assert.equal(openAiCalls.length > 0, caseDef.expectOpenAiCalled, `${caseDef.label}: openai call expectation mismatch`);
  } finally {
    globalThis.fetch = originalFetch;
    await fsPromises.rm(tempRoot, { recursive: true, force: true });
    await server.close();
  }
}

async function main(): Promise<void> {
  await runCase({
    label: "allow",
    decision: "ALLOW",
    reasonCode: null,
    expectedStatus: 200,
    expectedErrorCode: null,
    expectedMessageIncludes: null,
    expectOpenAiCalled: true,
    openAiBehavior: "ok",
  });

  await runCase({
    label: "soft-deny",
    decision: "SOFT_DENY",
    reasonCode: "PERSONAL_AI_REQUIRED_NOT_CONFIGURED",
    expectedStatus: 403,
    expectedErrorCode: "POLICY_DENIED",
    expectedMessageIncludes: "Configure a personal AI connection and retry.",
    expectOpenAiCalled: false,
  });

  await runCase({
    label: "hard-deny",
    decision: "HARD_DENY",
    reasonCode: "MEMBERSHIP_REQUIRED_STUDIO_OR_FOUNDER",
    expectedStatus: 403,
    expectedErrorCode: "POLICY_DENIED",
    expectedMessageIncludes: "Studio or Founder entitlement",
    expectOpenAiCalled: false,
  });

  await runCase({
    label: "auth-required",
    decision: "ALLOW",
    reasonCode: null,
    expectedStatus: 401,
    expectedErrorCode: "AUTH_REQUIRED",
    expectedMessageIncludes: "Sign in required",
    expectOpenAiCalled: false,
    includeAuthHeader: false,
  });

  await runCase({
    label: "source-too-large",
    decision: "ALLOW",
    reasonCode: null,
    expectedStatus: 413,
    expectedErrorCode: "SOURCE_TOO_LARGE",
    expectedMessageIncludes: "exceeds",
    expectOpenAiCalled: false,
    requestOverride: {
      local_root_abs: null,
      local_relpath: null,
      canonical_workpiece_path: "recordings/example.wav",
    },
  });

  await runCase({
    label: "normalize-empty",
    decision: "ALLOW",
    reasonCode: null,
    expectedStatus: 502,
    expectedErrorCode: "NORMALIZE_EMPTY",
    expectedMessageIncludes: "without usable segments",
    expectOpenAiCalled: true,
    openAiBehavior: "empty",
  });

  await runCase({
    label: "openai-timeout",
    decision: "ALLOW",
    reasonCode: null,
    expectedStatus: 504,
    expectedErrorCode: "OPENAI_TIMEOUT",
    expectedMessageIncludes: "timed out",
    expectOpenAiCalled: true,
    openAiBehavior: "timeout",
  });

  console.log("Hammer transcript policy preflight tests passed.");
}

main().catch((error) => {
  console.error("Hammer transcript policy preflight tests failed:", error);
  process.exit(1);
});
