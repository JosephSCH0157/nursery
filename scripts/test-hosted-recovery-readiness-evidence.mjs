import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildRecoveryReadinessEvidence,
  PRIVATE_EVIDENCE_DIRECTORY,
  writePrivateRecoveryReadinessEvidence,
} from "./lib/hosted-recovery-readiness-evidence.mjs";

const now = new Date("2026-10-28T12:00:00.000Z");
const goodInput = () => ({
  projectRef: "wtvdjndyxegudufrompx",
  backupKind: "daily",
  verifiedAt: "2026-10-28T11:55:00.000Z",
  latestRestorableAt: "2026-10-28T06:27:08.354Z",
  recoveryOperator: "named-recovery-operator",
  restoreAuthorizer: "named-restore-authorizer",
  ownerApprovalReference: "approved-change-window-reference",
  dashboardVerifiedAttestation: true,
  restoreScopeAcknowledged: true,
  unrelatedDataImpactAcknowledged: true,
});

test("builds the exact validated recovery-readiness contract", () => {
  const evidence = buildRecoveryReadinessEvidence(goodInput(), now);
  assert.equal(evidence.schema, "forge.hosted-recovery-readiness.v1");
  assert.equal(evidence.dashboard_verified, true);
  assert.equal(evidence.latest_restorable_at, "2026-10-28T06:27:08.354Z");
});

test("a timestamp alone never claims Dashboard verification", () => {
  const input = goodInput();
  input.dashboardVerifiedAttestation = false;
  assert.throws(() => buildRecoveryReadinessEvidence(input, now), /dashboard_verification_attestation_required/);
});

for (const [name, change, expected] of [
  ["recovery operator", input => { input.recoveryOperator = ""; }, /recovery_operator_missing/],
  ["restore authorizer", input => { input.restoreAuthorizer = ""; }, /restore_authorizer_missing/],
  ["change-window reference", input => { input.ownerApprovalReference = ""; }, /owner_approval_reference_missing/],
  ["restore-scope acknowledgment", input => { input.restoreScopeAcknowledged = false; }, /restore_scope_acknowledgement_required/],
  ["unrelated-data acknowledgment", input => { input.unrelatedDataImpactAcknowledged = false; }, /unrelated_data_impact_acknowledgement_required/],
]) test(`rejects a missing ${name}`, () => {
  const input = goodInput();
  change(input);
  assert.throws(() => buildRecoveryReadinessEvidence(input, now), expected);
});

test("writes once only beneath the repository Git-private evidence directory", () => {
  const repositoryRoot = mkdtempSync(join(tmpdir(), "forge-recovery-evidence-test-"));
  try {
    mkdirSync(join(repositoryRoot, ".git"));
    const evidence = buildRecoveryReadinessEvidence(goodInput(), now);
    const result = writePrivateRecoveryReadinessEvidence({
      repositoryRoot,
      outputName: "hammer-h2c-review.json",
      evidence,
    });
    assert.equal(result.outputPath, join(repositoryRoot, PRIVATE_EVIDENCE_DIRECTORY, "hammer-h2c-review.json"));
    assert.deepEqual(JSON.parse(readFileSync(result.outputPath, "utf8")), evidence);
    assert.throws(() => writePrivateRecoveryReadinessEvidence({
      repositoryRoot,
      outputName: "hammer-h2c-review.json",
      evidence,
    }), /EEXIST/);
    assert.throws(() => writePrivateRecoveryReadinessEvidence({
      repositoryRoot,
      outputName: "../escape.json",
      evidence,
    }), /output_name_invalid/);
  } finally {
    rmSync(repositoryRoot, { recursive: true, force: true });
  }
});

test("the helper has no credential, network, child-process, or database execution path", () => {
  const source = readFileSync(new URL("./new-hosted-recovery-readiness-evidence.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /SUPABASE_DB_PASSWORD|forge-managed-credential|child_process|\bfetch\s*\(|https?:\/\/|execute_sql|db push/i);
});
