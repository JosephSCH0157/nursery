import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

import { createNetlifyHammerFunction } from "../netlify/functions/_hammer-handler";
import hammerPaid, { config as hammerPaidConfig } from "../netlify/functions/hammer-paid";
import unavailable, { config as unavailableConfig } from "../netlify/functions/openai-unavailable";
import { createHammerPrepMiddleware, type HammerPrepMiddlewareOptions } from "../scripts/mw-hammer-prep";
import { buildHammerShortsPaidRequestIdentity, type HammerShortsDiscoveryBody } from "../scripts/hammer-shorts-discovery";
import { HAMMER_PRODUCTION_TEXT_ROUTES } from "../server/hammer/create-hammer-paid-handler";
import type { HearthRuntimeConfig } from "../server/hearth/hearth-runtime-config";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";
const WORKSPACE_ID = "33333333-3333-4333-8333-333333333333";
const WORKPIECE_ID = "44444444-4444-4444-8444-444444444444";

function runtimeConfig(overrides: Partial<HearthRuntimeConfig> = {}): HearthRuntimeConfig {
  return {
    textApiKey: "fixture-provider-key",
    apiKey: "fixture-provider-key",
    model: "gpt-5.3",
    sttModel: "gpt-4o-mini-transcribe",
    configuredBillingMode: "forge",
    initialTokenBalance: 0,
    supabaseUrl: null,
    supabaseServiceRoleKey: null,
    supabaseRpcKey: null,
    sttBucket: "fixture",
    disableForgeLaneAi: false,
    disableUserKeys: false,
    disableExpensiveAiActions: false,
    disableCdcGeneration: false,
    ...overrides,
  };
}

function cleanupBody(operationId = "hammer-cleanup:fixture") {
  return {
    operation_id: operationId,
    workspace_id: WORKSPACE_ID,
    workpiece_id: WORKPIECE_ID,
    segment_ids: ["segment-1"],
    segments: [{
      segment_id: "segment-1",
      start_sec: 0,
      end_sec: 3,
      speaker: "S1",
      text: "um this is the fixture transcript",
    }],
  };
}

const shortsBody: HammerShortsDiscoveryBody = {
  workspace_id: WORKSPACE_ID,
  parent_workpiece_id: WORKPIECE_ID,
  basis_lock_id: "55555555-5555-4555-8555-555555555555",
  basis_fingerprint: "a".repeat(64),
  goal: "standalone",
  duration_preset: "about_30s",
  minimum_duration_sec: 20,
  maximum_duration_sec: 40,
  target_candidate_count: 4,
  operation_id: "hammer-shorts-discovery:fixture",
  output_segments: [{
    segment_id: "segment-1",
    text: "A sufficiently interesting fixture moment.",
    source_start_sec: 0,
    source_end_sec: 30,
    output_start_sec: 0,
    output_end_sec: 30,
  }],
};

function request(pathname: string, body: unknown, authenticated = true): Request {
  return new Request(`https://fixture.invalid${pathname}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(authenticated ? { "x-forge-user-authorization": "Bearer fixture-user-token" } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function localResponse(options: HammerPrepMiddlewareOptions, input: Request): Promise<Response> {
  const middleware = createHammerPrepMiddleware(options);
  const server = http.createServer((req, res) => middleware(req, res, () => {
    res.statusCode = 404;
    res.end();
  }));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("fixture server did not bind");
    const url = new URL(input.url);
    url.host = `127.0.0.1:${address.port}`;
    url.protocol = "http:";
    return await fetch(new Request(url, input));
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function installSupabaseFixtureFetch(): { restore(): void; providerCalls(): number } {
  const originalFetch = globalThis.fetch;
  let providerCallCount = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.endsWith("/auth/v1/user")) {
      return Response.json({ id: USER_ID });
    }
    if (url.includes("/rest/v1/workspaces?id=eq.")) {
      return Response.json([{ org_id: ORG_ID }]);
    }
    if (url.endsWith("/rest/v1/rpc/resolve_ai_access_policy")) {
      return Response.json([{ decision_type: "ALLOW", reason_code: null }]);
    }
    if (url.startsWith("https://api.openai.com/")) {
      providerCallCount += 1;
      throw new Error("provider execution must remain halted");
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  return {
    restore: () => { globalThis.fetch = originalFetch; },
    providerCalls: () => providerCallCount,
  };
}

test("production routing exposes only Hammer JSON routes and leaves media prep and Quench halted", async () => {
  assert.deepEqual(hammerPaidConfig.path, [...HAMMER_PRODUCTION_TEXT_ROUTES]);
  assert.deepEqual(unavailableConfig.path, [
    "/api/hammer/prep/transcript",
    "/api/quench/metadata/assist",
  ]);
  for (const pathname of unavailableConfig.path) {
    const response = await unavailable(request(pathname, {}));
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, "paid_execution_unavailable");
  }
});

test("local and production transports use the same unauthorized Hammer contract without service work", async () => {
  const options = { runtimeConfig: runtimeConfig() };
  const input = request(HAMMER_PRODUCTION_TEXT_ROUTES[0], cleanupBody(), false);
  const [local, production] = await Promise.all([
    localResponse(options, input.clone()),
    createNetlifyHammerFunction(options)(input.clone(), { deploy: { context: "deploy-preview" } }),
  ]);
  assert.equal(production.status, 401);
  assert.equal(production.status, local.status);
  assert.deepEqual(await production.json(), await local.json());
});

test("production Hammer transport preserves operation identity and halt authority before provider execution", async () => {
  const fixtureFetch = installSupabaseFixtureFetch();
  const gateCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const options: HammerPrepMiddlewareOptions = {
    runtimeConfig: runtimeConfig({
      supabaseUrl: "https://fixture.supabase.co",
      supabaseServiceRoleKey: "fixture-service-key",
      supabaseRpcKey: "fixture-anon-key",
    }),
    openAiTextGate: {
      rpc: async (name: string, args: Record<string, unknown>) => {
        gateCalls.push({ name, args });
        if (name === "read_openai_execution_requirement") {
          return { data: { mode: "halt_new" }, error: null };
        }
        if (name === "read_existing_openai_text_funding_handle") {
          return { data: null, error: null };
        }
        return { data: null, error: { message: `unexpected RPC: ${name}` } };
      },
    },
    openAiProviderFetch: async () => {
      throw new Error("provider execution must remain halted");
    },
  };
  const handler = createNetlifyHammerFunction(options);
  try {
    for (const [pathname, body] of [
      [HAMMER_PRODUCTION_TEXT_ROUTES[0], cleanupBody()],
      [HAMMER_PRODUCTION_TEXT_ROUTES[1], shortsBody],
      [HAMMER_PRODUCTION_TEXT_ROUTES[1], { ...shortsBody }],
    ] as const) {
      const response = await handler(request(pathname, body), { deploy: { context: "production" } });
      const payload = await response.json();
      assert.equal(response.status, 423);
      assert.equal(payload.error.code, "paid_execution_halted");
      assert.deepEqual(Object.keys(payload.error).sort(), ["code", "message"]);
    }
    assert.equal(fixtureFetch.providerCalls(), 0);
    const requirements = gateCalls.filter((call) => call.name === "read_openai_execution_requirement");
    assert.equal(requirements.length, 3);
    const existing = gateCalls.filter((call) => call.name === "read_existing_openai_text_funding_handle");
    assert.equal(existing.length, 3);
    const shortsIdentity = await buildHammerShortsPaidRequestIdentity(shortsBody, "gpt-5.3");
    assert.deepEqual(
      existing.slice(1).map((call) => ({
        operationId: call.args.p_operation_id,
        fingerprint: call.args.p_request_fingerprint,
      })),
      [
        { operationId: shortsBody.operation_id, fingerprint: shortsIdentity.operationFingerprint },
        { operationId: shortsBody.operation_id, fingerprint: shortsIdentity.operationFingerprint },
      ],
    );
  } finally {
    fixtureFetch.restore();
  }
});

test("missing production paid authority cannot fall through to a provider", async () => {
  const fixtureFetch = installSupabaseFixtureFetch();
  let providerCalls = 0;
  const handler = createNetlifyHammerFunction({
    runtimeConfig: runtimeConfig({
      supabaseUrl: "https://fixture.supabase.co",
      supabaseRpcKey: "fixture-anon-key",
    }),
    openAiProviderFetch: async () => {
      providerCalls += 1;
      throw new Error("provider execution must not occur");
    },
  });
  try {
    const response = await handler(request(HAMMER_PRODUCTION_TEXT_ROUTES[0], cleanupBody()), {
      deploy: { context: "production" },
    });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, "paid_execution_unavailable");
    assert.equal(providerCalls, 0);
    assert.equal(fixtureFetch.providerCalls(), 0);
  } finally {
    fixtureFetch.restore();
  }
});

test("missing production pricing authority fails closed before provider execution", async () => {
  const fixtureFetch = installSupabaseFixtureFetch();
  let providerCalls = 0;
  const handler = createNetlifyHammerFunction({
    runtimeConfig: runtimeConfig({
      supabaseUrl: "https://fixture.supabase.co",
      supabaseServiceRoleKey: "fixture-service-key",
      supabaseRpcKey: "fixture-anon-key",
    }),
    openAiTextGate: {
      rpc: async (name: string) => {
        if (name === "read_openai_execution_requirement") return { data: { mode: "enforce" }, error: null };
        if (name === "read_existing_openai_text_funding_handle") return { data: null, error: null };
        return { data: null, error: { message: "pricing_not_configured" } };
      },
    },
    openAiProviderFetch: async () => {
      providerCalls += 1;
      throw new Error("provider execution must not occur");
    },
  });
  try {
    const response = await handler(request(HAMMER_PRODUCTION_TEXT_ROUTES[0], cleanupBody()), {
      deploy: { context: "production" },
    });
    const payload = await response.json();
    assert.equal(response.status, 503);
    assert.equal(payload.error.code, "pricing_not_configured");
    assert.deepEqual(Object.keys(payload.error).sort(), ["code", "message"]);
    assert.equal(providerCalls, 0);
    assert.equal(fixtureFetch.providerCalls(), 0);
  } finally {
    fixtureFetch.restore();
  }
});

test("the deployed Hammer function rejects routes outside its explicit allowlist", async () => {
  const response = await hammerPaid(request("/api/quench/metadata/assist", {}), {
    deploy: { context: "deploy-preview" },
  });
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error.code, "not_found");
});
