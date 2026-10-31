import assert from "node:assert/strict";
import { test } from "node:test";
import { readCurrentHammerAssemblyAiCapacityEvidence } from "../scripts/mw-hammer-prep";
import { fingerprintHammerAssemblyAiCapacityEvidence } from "@forge/tongs/server/hammer-assemblyai-resource-policy";

const now = new Date("2026-10-31T01:00:00.000Z");
const identity = {
  userId: "71daf61b-57b3-4e5f-a8c8-64befecb5950",
  workspaceId: "cc5478ff-37be-403e-824c-467fa7da061e",
  workpieceId: "21d16d6a-905b-491e-8761-028789612ae5",
  canonicalRecordingId: "4cc846e3-187c-46d9-8733-e7402488236c",
  recordingRevisionId: "9c991aa7-f551-4f03-a4d6-41eb40ef81ec",
};
const evidenceWithoutHash = {
  checkedAt: "2026-10-31T00:59:00.000Z",
  expiresAt: "2026-11-01T00:59:00.000Z",
  netlify: { plan: "pro" as const, remainingCreditsMicrounits: 2_700_900_000 },
  supabase: {
    plan: "pro" as const,
    spendCapEnabled: true as const,
    remainingUncachedEgressBytes: 249_323_500_000,
    remainingDatabaseBytes: 7_962_989_421,
  },
  activeHammerOperationCount: 0 as const,
};
const capacityRow = {
  evidence_sha256: fingerprintHammerAssemblyAiCapacityEvidence(evidenceWithoutHash),
  checked_at: evidenceWithoutHash.checkedAt,
  expires_at: evidenceWithoutHash.expiresAt,
  netlify_plan: "pro",
  netlify_remaining_credit_microunits: evidenceWithoutHash.netlify.remainingCreditsMicrounits,
  supabase_plan: "pro",
  supabase_spend_cap_enabled: true,
  supabase_remaining_uncached_egress_bytes: evidenceWithoutHash.supabase.remainingUncachedEgressBytes,
  supabase_remaining_database_bytes: evidenceWithoutHash.supabase.remainingDatabaseBytes,
  observed_active_hammer_operations: 0,
};

function client(rows: Record<string, { data: unknown; error: unknown }>) {
  const filters: Array<[string, string, unknown]> = [];
  return {
    filters,
    schema(name: string) {
      assert.equal(name, "tongs");
      return {
        from(table: string) {
          const builder = {
            select() { return builder; },
            eq(column: string, value: unknown) { filters.push([table, column, value]); return builder; },
            lte() { return builder; },
            gt() { return builder; },
            order() { return builder; },
            limit() { return builder; },
            async maybeSingle() { return rows[table]; },
            then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
              return Promise.resolve(rows[table]).then(resolve, reject);
            },
          };
          return builder;
        },
      };
    },
  };
}

test("Hammer reads and verifies the current exact-recording capacity authority", async () => {
  const fake = client({
    hammer_first_transcription_activation_authorities: { data: { id: "activation-1", capacity_authority_id: "capacity-1" }, error: null },
    hammer_first_transcription_activation_revocations: { data: [], error: null },
    hammer_first_transcription_capacity_authorities: { data: capacityRow, error: null },
  });
  const evidence = await readCurrentHammerAssemblyAiCapacityEvidence(fake as never, identity, now);
  assert.equal(evidence.evidenceSha256, capacityRow.evidence_sha256);
  assert.equal(evidence.activeHammerOperationCount, 0);
  assert.ok(fake.filters.some(([, column, value]) => column === "recording_revision_id" && value === identity.recordingRevisionId));
});

test("Hammer accepts equivalent PostgreSQL timestamptz serialization", async () => {
  const fake = client({
    hammer_first_transcription_activation_authorities: { data: { id: "activation-1", capacity_authority_id: "capacity-1" }, error: null },
    hammer_first_transcription_activation_revocations: { data: [], error: null },
    hammer_first_transcription_capacity_authorities: {
      data: {
        ...capacityRow,
        checked_at: "2026-10-31T00:59:00+00:00",
        expires_at: "2026-11-01T00:59:00+00:00",
      },
      error: null,
    },
  });
  const evidence = await readCurrentHammerAssemblyAiCapacityEvidence(fake as never, identity, now);
  assert.equal(evidence.evidenceSha256, capacityRow.evidence_sha256);
});

test("missing, stale, or drifted database capacity authority fails closed", async () => {
  await assert.rejects(
    readCurrentHammerAssemblyAiCapacityEvidence(client({
      hammer_first_transcription_activation_authorities: { data: null, error: null },
    }) as never, identity, now),
    /active_hammer_capacity_authority_unavailable/,
  );
  await assert.rejects(
    readCurrentHammerAssemblyAiCapacityEvidence(client({
      hammer_first_transcription_activation_authorities: { data: { id: "activation-1", capacity_authority_id: "capacity-1" }, error: null },
      hammer_first_transcription_activation_revocations: { data: [], error: null },
      hammer_first_transcription_capacity_authorities: { data: { ...capacityRow, expires_at: "2026-10-31T00:00:00.000Z" }, error: null },
    }) as never, identity, now),
    /Capacity evidence/,
  );
  await assert.rejects(
    readCurrentHammerAssemblyAiCapacityEvidence(client({
      hammer_first_transcription_activation_authorities: { data: { id: "activation-1", capacity_authority_id: "capacity-1" }, error: null },
      hammer_first_transcription_activation_revocations: { data: [{ id: "revocation-1" }], error: null },
    }) as never, identity, now),
    /active_hammer_capacity_authority_revoked/,
  );
});
