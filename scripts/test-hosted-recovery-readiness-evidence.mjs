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
import {
  buildManagementApiBackupObservation,
  buildManagementApiRecoveryEvidence,
  validateHostedRecoveryEvidence,
} from "./lib/hosted-recovery-readiness-policy.mjs";
import { collectManagementApiBackupObservation } from "./collect-hosted-recovery-readiness-evidence.mjs";

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

test("the documented pnpm argument separator is accepted", () => {
  const source = readFileSync(new URL("./new-hosted-recovery-readiness-evidence.mjs", import.meta.url), "utf8");
  assert.match(source, /if \(token === "--"\) continue/);
});

const apiNow = new Date("2026-11-01T18:54:51.202Z");
const apiResponse = JSON.stringify({
  region: "us-east-1",
  walg_enabled: true,
  pitr_enabled: false,
  backups: [{ id: 2133034324, is_physical_backup: true, status: "COMPLETED", inserted_at: "2026-11-01T06:28:20.071Z" }],
});
const apiObservation = () => buildManagementApiBackupObservation({
  projectRef: "wtvdjndyxegudufrompx",
  responseText: apiResponse,
  responseDate: "2026-11-01T18:54:50.000Z",
  observedAt: apiNow.toISOString(),
}, apiNow);
const apiEvidence = () => buildManagementApiRecoveryEvidence({
  projectRef: "wtvdjndyxegudufrompx",
  recoveryOperator: "same authorized owner",
  restoreAuthorizer: "same authorized owner",
  ownerApprovalReference: "FORGE-ADMISSION-S2A-429:api-window-a",
  restoreScopeAcknowledged: true,
  unrelatedDataImpactAcknowledged: true,
}, apiObservation(), apiNow);

test("authenticated project-bound API evidence satisfies the shared recovery contract", () => {
  const result = validateHostedRecoveryEvidence(apiEvidence(), {
    projectRef: "wtvdjndyxegudufrompx",
    approvalPrefix: "FORGE-ADMISSION-S2A-429:",
    targetVersion: "20261101084703",
    apiObservation: apiObservation(),
    now: apiNow,
  });
  assert.equal(result.verificationSource, "supabase_management_api");
  assert.match(result.recoveryUseKey, /^[0-9a-f]{64}$/);
});

test("caller-authored API claims fail without a fresh independent observation", () => {
  assert.throws(() => validateHostedRecoveryEvidence(apiEvidence(), {
    projectRef: "wtvdjndyxegudufrompx",
    approvalPrefix: "FORGE-ADMISSION-S2A-429:",
    targetVersion: "20261101084703",
    now: apiNow,
  }), /observation_required/);
});

test("API recovery evidence rejects wrong projects, stale backups, and missing authorities", () => {
  const wrong = apiObservation();
  wrong.project_ref = "wrong-project";
  assert.throws(() => validateHostedRecoveryEvidence(apiEvidence(), {
    projectRef: "wtvdjndyxegudufrompx", approvalPrefix: "FORGE-ADMISSION-S2A-429:", targetVersion: "20261101084703", apiObservation: wrong, now: apiNow,
  }), /management_api_project/);
  const staleResponse = JSON.stringify({
    pitr_enabled: false,
    backups: [{ id: 1, is_physical_backup: true, status: "COMPLETED", inserted_at: "2026-10-29T06:00:00.000Z" }],
  });
  assert.throws(() => buildManagementApiBackupObservation({
    projectRef: "wtvdjndyxegudufrompx", responseText: staleResponse, responseDate: apiNow.toISOString(), observedAt: apiNow.toISOString(),
  }, apiNow), /backup_stale/);
  const missing = apiEvidence();
  missing.recovery_operator = "";
  assert.throws(() => validateHostedRecoveryEvidence(missing, {
    projectRef: "wtvdjndyxegudufrompx", approvalPrefix: "FORGE-ADMISSION-S2A-429:", targetVersion: "20261101084703", apiObservation: apiObservation(), now: apiNow,
  }), /recovery_operator_missing/);
  const missingRestoreAuthority = apiEvidence();
  missingRestoreAuthority.restore_authorizer = "";
  assert.throws(() => validateHostedRecoveryEvidence(missingRestoreAuthority, {
    projectRef: "wtvdjndyxegudufrompx", approvalPrefix: "FORGE-ADMISSION-S2A-429:", targetVersion: "20261101084703", apiObservation: apiObservation(), now: apiNow,
  }), /restore_authorizer_missing/);
});

test("collector authenticates a read-only project-bound GET and returns no token", async () => {
  let request;
  const observation = await collectManagementApiBackupObservation({
    projectRef: "wtvdjndyxegudufrompx",
    accessToken: "fixture-secret",
    now: apiNow,
    fetchImplementation: async (url, init) => {
      request = { url, init };
      return new Response(apiResponse, { status: 200, headers: { date: "Sat, 01 Nov 2026 18:54:50 GMT" } });
    },
  });
  assert.equal(request.url, "https://api.supabase.com/v1/projects/wtvdjndyxegudufrompx/database/backups");
  assert.equal(request.init.method, "GET");
  assert.equal(request.init.headers.Authorization, "Bearer fixture-secret");
  assert.doesNotMatch(JSON.stringify(observation), /fixture-secret/);
});
