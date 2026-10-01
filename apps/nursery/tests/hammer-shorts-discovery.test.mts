import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../packages/tongs/src/db.types.ts";
import { buildHammerShortsPaidRequestIdentity, executeHammerShortsDiscovery, type HammerShortsDiscoveryBody } from "../scripts/hammer-shorts-discovery.ts";

const body: HammerShortsDiscoveryBody = {
  workspace_id: "11111111-1111-4111-8111-111111111111", parent_workpiece_id: "22222222-2222-4222-8222-222222222222",
  basis_lock_id: "33333333-3333-4333-8333-333333333333", basis_fingerprint: "a".repeat(64), goal: "standalone",
  duration_preset: "about_30s", minimum_duration_sec: 20, maximum_duration_sec: 40, target_candidate_count: 4,
  operation_id: "discover:test", output_segments: [
    { segment_id: "a", text: "A", source_start_sec: 0, source_end_sec: 10, output_start_sec: 0, output_end_sec: 10 },
    { segment_id: "b", text: "B", source_start_sec: 10, source_end_sec: 20, output_start_sec: 10, output_end_sec: 20 },
    { segment_id: "c", text: "C", source_start_sec: 20, source_end_sec: 30, output_start_sec: 20, output_end_sec: 30 },
  ],
};

function client(calls: Array<{ name: string; args: Record<string, unknown> }>): SupabaseClient<Database> {
  return { schema: () => ({ rpc: async (name: string, args: Record<string, unknown>) => {
    calls.push({ name, args });
    if (name === "reserve_hammer_shorts_discovery") return { data: { id: "44444444-4444-4444-8444-444444444444" }, error: null };
    if (name === "complete_hammer_shorts_discovery") return { data: { discovery: { id: "44444444-4444-4444-8444-444444444444" }, candidates: args.p_candidates }, error: null };
    if (name === "fail_hammer_shorts_discovery") return { data: { id: "44444444-4444-4444-8444-444444444444", state: "failed", failure_code: args.p_failure_code }, error: null };
    return { data: null, error: { message: "unexpected" } };
  } }) } as unknown as SupabaseClient<Database>;
}

function provider(proposals: unknown[]): typeof fetch {
  return (async () => new Response(JSON.stringify({ id: "resp_1", output_text: JSON.stringify({ proposals }) }), { status: 200, headers: { "x-request-id": "req_1" } })) as typeof fetch;
}

test("persists AI evidence separately and returns only resolved canonical candidates", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = []; const usage: string[] = [];
  const result = await executeHammerShortsDiscovery(body, { userClient: client(calls), model: "gpt-test", apiKey: "secret", policyPreflight: async () => ({ ok: true }), recordUsage: async (entry) => { usage.push(entry.status); }, fetchImpl: provider([{ proposal_id: "p1", rank: 1, first_segment_id: "a", last_segment_id: "c", rationale: "complete thought", goal_fit: "stands alone" }]) });
  assert.equal(result.status, 200);
  assert.deepEqual(usage, ["success"]);
  assert.deepEqual(calls.map((call) => call.name), ["reserve_hammer_shorts_discovery", "complete_hammer_shorts_discovery"]);
  const complete = calls[1]?.args;
  assert.equal((complete?.p_ai_proposal as Record<string, unknown>).provider_request_id, "req_1");
  assert.equal(Array.isArray(complete?.p_candidates), true);
  assert.equal((complete?.p_candidates as unknown[]).length, 1);
  assert.equal(complete?.p_outcome, "partial");
});

test("truthfully persists an empty resolved result", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const result = await executeHammerShortsDiscovery(body, { userClient: client(calls), model: "gpt-test", apiKey: "secret", policyPreflight: async () => ({ ok: true }), recordUsage: async () => undefined, fetchImpl: provider([{ proposal_id: "bad", rank: 1, first_segment_id: "missing", last_segment_id: "c", rationale: "bad", goal_fit: "bad" }]) });
  assert.equal(result.status, 200);
  assert.equal(calls[1]?.args.p_outcome, "empty");
  assert.deepEqual(calls[1]?.args.p_candidates, []);
});

test("fails closed before provider work when policy denies discovery", async () => {
  let providerCalled = false;
  const result = await executeHammerShortsDiscovery(body, { userClient: client([]), model: "gpt-test", apiKey: "secret", policyPreflight: async () => ({ ok: false, status: 403, error: "denied" }), recordUsage: async () => undefined, fetchImpl: (async () => { providerCalled = true; throw new Error("should not run"); }) as typeof fetch });
  assert.equal(result.status, 403);
  assert.equal(providerCalled, false);
});

test("records provider structured-output failures without fabricating candidates", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = []; const usage: string[] = [];
  const result = await executeHammerShortsDiscovery(body, { userClient: client(calls), model: "gpt-test", apiKey: "secret", policyPreflight: async () => ({ ok: true }), recordUsage: async (entry) => { usage.push(entry.status); }, fetchImpl: (async () => new Response(JSON.stringify({ id: "resp_bad", output_text: "not json" }), { status: 200 })) as typeof fetch });
  assert.equal(result.status, 502);
  assert.deepEqual(usage, ["error"]);
  assert.deepEqual(calls.map((call) => call.name), ["reserve_hammer_shorts_discovery", "fail_hammer_shorts_discovery"]);
  assert.equal(calls[1]?.args.p_failure_code, "validation_failed");
});

test("equivalent retries retain paid identity while intentional operation ids remain distinct", async () => {
  const first = await buildHammerShortsPaidRequestIdentity(body, "gpt-test");
  const retry = await buildHammerShortsPaidRequestIdentity({ ...body }, "gpt-test");
  const intentionalRerun = await buildHammerShortsPaidRequestIdentity({ ...body, operation_id: "discover:test:rerun" }, "gpt-test");
  assert.deepEqual(retry, first);
  assert.equal(intentionalRerun.request.request_fingerprint, first.request.request_fingerprint);
  assert.notEqual(intentionalRerun.operationFingerprint, first.operationFingerprint);
});

test("changed cost-affecting input changes the canonical paid request fingerprint", async () => {
  const first = await buildHammerShortsPaidRequestIdentity(body, "gpt-test");
  for (const changed of [
    { ...body, goal: "drive_to_full_episode" as const },
    { ...body, target_candidate_count: 3 as const },
    { ...body, minimum_duration_sec: 21 },
    { ...body, maximum_duration_sec: 41 },
    { ...body, basis_fingerprint: "b".repeat(64) },
  ]) {
    const identity = await buildHammerShortsPaidRequestIdentity(changed, "gpt-test");
    assert.notEqual(identity.request.request_fingerprint, first.request.request_fingerprint);
    assert.notEqual(identity.operationFingerprint, first.operationFingerprint);
  }
});

test("operation reuse with a conflicting paid request fingerprint fails before provider execution", async () => {
  const original = await buildHammerShortsPaidRequestIdentity(body, "gpt-test");
  let providerCalls = 0;
  const changed: HammerShortsDiscoveryBody = {
    ...body,
    goal: "drive_to_full_episode",
    paid_execution: {
      operationId: body.operation_id,
      reservationId: "55555555-5555-4555-8555-555555555555",
      requestFingerprint: original.operationFingerprint,
      fundingEnvironment: "test",
    },
  };
  const result = await executeHammerShortsDiscovery(changed, {
    userClient: client([]), model: "gpt-test", apiKey: "secret",
    policyPreflight: async () => ({ ok: true }), recordUsage: async () => undefined,
    fetchImpl: (async () => { providerCalls += 1; throw new Error("must not run"); }) as typeof fetch,
    paid: {
      gate: { rpc: async () => ({ data: null, error: { message: "must not reach paid gate" } }) },
      userId: "66666666-6666-4666-8666-666666666666",
      credentialSource: "forge_managed",
    },
  });
  assert.equal(result.status, 403);
  assert.equal(providerCalls, 0);
});

test("settled Shorts replay returns persisted result without another provider attempt", async () => {
  const identity = await buildHammerShortsPaidRequestIdentity(body, "gpt-test");
  const reservationId = "55555555-5555-4555-8555-555555555555";
  const gateCalls: string[] = [];
  let providerCalls = 0;
  const result = await executeHammerShortsDiscovery({
    ...body,
    paid_execution: {
      operationId: body.operation_id,
      reservationId,
      requestFingerprint: identity.operationFingerprint,
      fundingEnvironment: "test",
    },
  }, {
    userClient: client([]), model: "gpt-test", apiKey: "secret",
    policyPreflight: async () => ({ ok: true }), recordUsage: async () => undefined,
    fetchImpl: (async () => { providerCalls += 1; throw new Error("must not run"); }) as typeof fetch,
    paid: {
      userId: "66666666-6666-4666-8666-666666666666",
      credentialSource: "forge_managed",
      gate: { rpc: async (name: string, args: Record<string, unknown>) => {
        gateCalls.push(name);
        if (name === "resolve_openai_text_paid_execution_context") return { data: {
          operation_id: body.operation_id, reservation_id: reservationId,
          quote_id: "77777777-7777-4777-8777-777777777777", route_code: args.p_route_code,
          funding_source_type: "customer_deposit", funding_source_id: "88888888-8888-4888-8888-888888888888",
          funding_environment: "test", credential_funding: "forge", model: "gpt-test",
          maximum_input_units: 10_000, maximum_output_units: 1_000, maximum_attempts: 1,
          maximum_failure_exposure_micros: 5_000, direct_provider_ceiling_micros: 4_000,
          supporting_cost_ceiling_micros: 1_000, input_micros_per_million_tokens: 1_000,
          cached_input_micros_per_million_tokens: 500, output_micros_per_million_tokens: 2_000,
          reservation_state: "settled",
        }, error: null };
        if (name === "read_openai_text_paid_result") return { data: {
          result_json: { data: { discovery: { id: "44444444-4444-4444-8444-444444444444" }, candidates: [] }, resolution: { outcome: "empty", rejected: [] } },
          provider_request_id: "req-existing", input_units: 10, output_units: 2, customer_charge_micros: 5_000,
        }, error: null };
        return { data: {}, error: null };
      } },
    },
  });
  assert.equal(result.status, 200);
  assert.equal(providerCalls, 0);
  assert.equal(gateCalls.includes("read_openai_text_paid_result"), true);
  assert.equal(gateCalls.includes("authorize_openai_text_provider_attempt_with_aggregate"), false);
});
