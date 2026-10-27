import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  APPLY_AUTHORIZATION,
  FORGE_PROJECT_REF,
  TARGET_SHA256,
  TARGET_VERSION,
  validateHostedState,
  validateOperatorAuthorization,
  validateRecoveryEvidence,
} from "./lib/anvil-419-hosted-deployment-policy.mjs";

const goodState = () => ({ projectRef: FORGE_PROJECT_REF, lineage: "historical-v1", installedCount: 418,
  hostedHead: "20261025080943", pendingVersions: [TARGET_VERSION], migrationSha256: TARGET_SHA256,
  databasePasswordAvailable: true });
const goodRecovery = () => ({ schema: "forge.hosted-recovery-readiness.v1", project_ref: FORGE_PROJECT_REF,
  dashboard_verified: true, backup_kind: "daily", verified_at: "2026-10-27T16:00:00.000Z",
  latest_restorable_at: "2026-10-27T12:00:00.000Z", recovery_operator: "platform-owner",
  restore_authorizer: "forge-owner", owner_approval_reference: "owner-change-window-419",
  restore_scope_acknowledged: true, unrelated_data_impact_acknowledged: true });

test("exact 418 to 419 deployment state is accepted", () => {
  assert.doesNotThrow(() => validateHostedState(goodState(), { action: "Apply", authorization: APPLY_AUTHORIZATION, operator: "operator" }));
  assert.doesNotThrow(() => validateRecoveryEvidence(goodRecovery(), new Date("2026-10-27T16:30:00Z")));
});
for (const [name, mutate] of [
  ["project", s => s.projectRef="other"], ["lineage", s => s.lineage="baseline-v1"],
  ["count", s => s.installedCount=417], ["head", s => s.hostedHead="20261024164519"],
  ["sha", s => s.migrationSha256="0".repeat(64)], ["pending", s => s.pendingVersions=[]],
  ["extra pending", s => s.pendingVersions.push("20261028000000")], ["password", s => s.databasePasswordAvailable=false],
]) test(`rejects wrong ${name}`, () => { const state=goodState(); mutate(state); assert.throws(() => validateHostedState(state,{action:"Apply",authorization:APPLY_AUTHORIZATION,operator:"operator"})); });

test("rejects missing operator authorization", () => assert.throws(() => validateHostedState(goodState(), { action:"Apply", operator:"operator" })));
test("local authorization rejects Apply before hosted credential access", () => {
  assert.throws(() => validateOperatorAuthorization({ action:"Apply", operator:"operator" }), /operator_authorization/);
  assert.deepEqual(validateOperatorAuthorization({ action:"Apply", operator:"operator", authorization:APPLY_AUTHORIZATION }), { operator:"operator" });
});
test("rejects missing or stale recovery evidence", () => {
  assert.throws(() => validateRecoveryEvidence(null));
  assert.throws(() => validateRecoveryEvidence(goodRecovery(), new Date("2026-10-29T16:30:00Z")));
});

test("actual entrypoint is bounded to normal linked migration push", () => {
  const source=readFileSync(new URL("./invoke-anvil-419-hosted-deployment.ps1",import.meta.url),"utf8");
  assert.match(source,/APPLY-ANVIL-419/);
  assert.match(source,/@\('db','push','--linked','--workdir',\$repo,'--agent=no'\)/);
  assert.match(source,/@\('db','push','--linked','--dry-run','--workdir',\$repo,'--agent=no'\)/);
  assert.doesNotMatch(source,/--include-all|migration['\"]?\s*,?['\"]?repair|insert\s+into\s+supabase_migrations/i);
  assert.match(source,/Assert-PostApply/);
  assert.match(source,/Invoke-WithForgeManagedDatabaseCredential/);
  assert.doesNotMatch(source,/SUPABASE_DB_PASSWORD is required/);
  const localPolicy = source.indexOf("--local-only");
  const credentialRead = source.indexOf("Invoke-WithForgeManagedDatabaseCredential -Operation", localPolicy);
  assert.ok(localPolicy >= 0 && credentialRead > localPolicy, "local policy must run before managed credential access");
});

test("managed credential provider covers retrieval, missing credential, and cleanup", () => {
  const source=readFileSync(new URL("./lib/forge-managed-credential.ps1",import.meta.url),"utf8");
  assert.match(source,/WindowsCredentialNative\]::Read/);
  assert.match(source,/finally\s*\{[\s\S]*SetEnvironmentVariable\('SUPABASE_DB_PASSWORD', \$null, 'Process'\)/);
  assert.match(source,/Forge database credential is not enrolled/);
});
