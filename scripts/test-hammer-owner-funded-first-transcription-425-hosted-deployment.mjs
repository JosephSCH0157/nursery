import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  APPLY_AUTHORIZATION, FORGE_PROJECT_REF, TARGET_SHA256, TARGET_VERSION,
  validateHostedState, validateOperatorAuthorization, validateRecoveryEvidence,
} from "./lib/hammer-owner-funded-first-transcription-425-hosted-deployment-policy.mjs";

const goodState = () => ({ projectRef: FORGE_PROJECT_REF, lineage: "historical-v1", installedCount: 424,
  hostedHead: "20261029154824", pendingVersions: [TARGET_VERSION], migrationSha256: TARGET_SHA256,
  databasePasswordAvailable: true });
const goodRecovery = () => ({ schema: "forge.hosted-recovery-readiness.v1", project_ref: FORGE_PROJECT_REF,
  dashboard_verified: true, backup_kind: "daily", verified_at: "2026-10-28T16:00:00.000Z",
  latest_restorable_at: "2026-10-28T12:00:00.000Z", recovery_operator: "platform-owner",
  restore_authorizer: "forge-owner", owner_approval_reference: "APPLY-HAMMER-OWNER-FUNDED-FIRST-TRANSCRIPTION-425",
  restore_scope_acknowledged: true, unrelated_data_impact_acknowledged: true });

test("exact 424 to 425 deployment state is accepted", () => {
  assert.doesNotThrow(() => validateHostedState(goodState(), { action: "Apply", authorization: APPLY_AUTHORIZATION, operator: "operator" }));
  assert.doesNotThrow(() => validateRecoveryEvidence(goodRecovery(), new Date("2026-10-28T16:30:00Z")));
});
for (const [name, mutate] of [
  ["project", s => s.projectRef="other"], ["lineage", s => s.lineage="baseline-v1"],
  ["count", s => s.installedCount=419], ["head", s => s.hostedHead="20261027030139"],
  ["sha", s => s.migrationSha256="0".repeat(64)], ["pending", s => s.pendingVersions=[]],
  ["extra pending", s => s.pendingVersions.push("20261030000000")], ["password", s => s.databasePasswordAvailable=false],
]) test(`rejects wrong ${name}`, () => { const state=goodState(); mutate(state); assert.throws(() => validateHostedState(state,{action:"Apply",authorization:APPLY_AUTHORIZATION,operator:"operator"})); });

test("rejects missing operator authorization", () => assert.throws(() => validateHostedState(goodState(), { action:"Apply", operator:"operator" })));
test("local authorization rejects Apply before hosted credential access", () => {
  assert.throws(() => validateOperatorAuthorization({ action:"Apply", operator:"operator" }), /operator_authorization/);
  assert.deepEqual(validateOperatorAuthorization({ action:"Apply", operator:"operator", authorization:APPLY_AUTHORIZATION }), { operator:"operator" });
});
test("rejects missing or stale recovery evidence", () => {
  assert.throws(() => validateRecoveryEvidence(null));
  assert.throws(() => validateRecoveryEvidence(goodRecovery(), new Date("2026-10-30T16:30:00Z")));
});
test("entrypoint permits only the exact linked tail push", () => {
  const source=readFileSync(new URL("./invoke-hammer-owner-funded-first-transcription-425-hosted-deployment.ps1",import.meta.url),"utf8");
  assert.match(source,/APPLY-HAMMER-OWNER-FUNDED-FIRST-TRANSCRIPTION-425/);
  assert.match(source,/@\('db','push','--linked','--workdir',\$repo,'--agent=no'\)/);
  assert.match(source,/@\('db','push','--linked','--dry-run','--workdir',\$repo,'--agent=no'\)/);
  assert.doesNotMatch(source,/--include-all|migration['"]?\s*,?['"]?repair|insert\s+into\s+supabase_migrations/i);
  assert.match(source,/Assert-PostApply/);
  assert.match(source,/public_execute_denied/);
  assert.match(source,/authenticated_execute_denied/);
  assert.match(source,/service_execute_granted/);
  assert.match(source,/installer_hardened/);
  assert.match(source,/financial_environment/);
  assert.match(source,/owner_authority_rows/);
  assert.match(source,/assemblyai_owner_budget_rows/);
  assert.match(source,/Invoke-WithForgeManagedDatabaseCredential/);
  const localPolicy=source.indexOf("--local-only");
  const credentialRead=source.indexOf("Invoke-WithForgeManagedDatabaseCredential -Operation",localPolicy);
  assert.ok(localPolicy>=0 && credentialRead>localPolicy);
});
