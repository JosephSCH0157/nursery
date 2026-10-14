import assert from "node:assert/strict";
import test from "node:test";

import { resolveVerifiedZeroSupportingCost } from "../server/billing/paid-json-openai-route";

const RESERVATION_ID = "2163fc54-baff-4b6d-a3d7-f1f0e8ff1174";

test("Hammer accepts only exact authoritative verified-zero supporting-cost evidence", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const resolved = await resolveVerifiedZeroSupportingCost({
    gate: {
      async rpc(name, args) {
        calls.push({ name, args });
        return {
          data: {
            authoritative: true,
            amount_micros: 0,
            evidence: {
              authority_kind: "immutable_verified_zero_supporting_cost_inventory",
              cost_policy_revision_id: "40010000-0000-4000-8000-000000000301",
            },
          },
          error: null,
        };
      },
    },
    routeCode: "hammer.transcript_cleanup",
    reservationId: RESERVATION_ID,
    credentialFunding: "forge",
  });
  assert.deepEqual(calls, [{
    name: "resolve_openai_text_verified_zero_supporting_cost",
    args: { p_reservation_id: RESERVATION_ID },
  }]);
  assert.deepEqual(resolved, {
    amountMicros: 0,
    authoritative: true,
    evidence: {
      authority_kind: "immutable_verified_zero_supporting_cost_inventory",
      cost_policy_revision_id: "40010000-0000-4000-8000-000000000301",
    },
  });
});

test("missing, contradictory, and incomplete Hammer authority remain unresolved", async () => {
  for (const data of [
    null,
    { authoritative: false, amount_micros: null },
    { authoritative: true, amount_micros: 1, evidence: { authority_kind: "wrong" } },
    { authoritative: true, amount_micros: 0, evidence: {} },
  ]) {
    const resolved = await resolveVerifiedZeroSupportingCost({
      gate: { rpc: async () => ({ data, error: null }) },
      routeCode: "hammer.transcript_cleanup",
      reservationId: RESERVATION_ID,
      credentialFunding: "forge",
    });
    assert.equal(resolved, undefined);
  }
  assert.equal(await resolveVerifiedZeroSupportingCost({
    gate: { rpc: async () => ({ data: null, error: { message: "authority unavailable" } }) },
    routeCode: "hammer.transcript_cleanup",
    reservationId: RESERVATION_ID,
    credentialFunding: "forge",
  }), undefined);
});

test("non-Hammer and customer-direct routes never acquire verified-zero authority", async () => {
  let calls = 0;
  const gate = { rpc: async () => {
    calls += 1;
    return { data: { authoritative: true, amount_micros: 0, evidence: { unsafe: true } }, error: null };
  } };
  assert.equal(await resolveVerifiedZeroSupportingCost({
    gate,
    routeCode: "hearth.tag_generation",
    reservationId: RESERVATION_ID,
    credentialFunding: "forge",
  }), undefined);
  assert.equal(await resolveVerifiedZeroSupportingCost({
    gate,
    routeCode: "hammer.transcript_cleanup",
    reservationId: RESERVATION_ID,
    credentialFunding: "byo_customer",
  }), undefined);
  assert.equal(calls, 0);
});
