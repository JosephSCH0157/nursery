import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  APPLY_AUTHORIZATION, FORGE_PROJECT_REF, TARGET_SHA256, TARGET_VERSION,
  validateHostedState, validateRecoveryEvidence,
} from "./lib/hammer-assemblyai-cost-renewal-432-hosted-deployment-policy.mjs";

const state = () => ({ projectRef: FORGE_PROJECT_REF, lineage: "historical-v1", installedCount: 431, hostedHead: "20261102032722", pendingVersions: [TARGET_VERSION], migrationSha256: TARGET_SHA256, databasePasswordAvailable: true });
const recovery = () => ({ schema: "forge.hosted-recovery-readiness.v2", project_ref: FORGE_PROJECT_REF, verified_at: "2026-11-03T17:00:00Z", recovery_operator: "operator", restore_authorizer: "owner", owner_approval_reference: APPLY_AUTHORIZATION, restore_scope_acknowledged: true, unrelated_data_impact_acknowledged: true, management_api: { backup_id: "backup", backup_status: "COMPLETED" } });

test("accepts only the exact 431 to 432 state", () => {
  assert.doesNotThrow(() => validateHostedState(state(), { action: "Apply", operator: "operator", authorization: APPLY_AUTHORIZATION }));
  assert.doesNotThrow(() => validateRecoveryEvidence(recovery(), new Date("2026-11-03T17:30:00Z")));
});
for (const [name, mutate] of [["count", s => s.installedCount = 430], ["head", s => s.hostedHead = "20261101201817"], ["pending", s => s.pendingVersions = []], ["hash", s => s.migrationSha256 = "0".repeat(64)]]) {
  test(`rejects ${name}`, () => { const value = state(); mutate(value); assert.throws(() => validateHostedState(value, { action: "Apply", operator: "operator", authorization: APPLY_AUTHORIZATION })); });
}
test("wrapper permits only linked dry-run and normal push", () => {
  const source = readFileSync(new URL("./invoke-hammer-assemblyai-cost-renewal-432-hosted-deployment.ps1", import.meta.url), "utf8");
  assert.doesNotMatch(source, /--include-all|migration['"]?\s*,?['"]?repair|insert\s+into\s+supabase_migrations/i);
  assert.match(source, /20261103173603_hammer_assemblyai_aggregate_cost_evidence_renewal\.sql/);
});
