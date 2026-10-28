import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { resolve, sep } from "node:path";
import {
  FORGE_PROJECT_REF,
  validateRecoveryEvidence,
} from "./hammer-h2c-420-hosted-deployment-policy.mjs";

export const PRIVATE_EVIDENCE_DIRECTORY = ".git/forge-private-evidence";

function requireString(value, name) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) throw new Error(`${name}_missing`);
  return normalized;
}

export function buildRecoveryReadinessEvidence(input, now = new Date()) {
  if (input?.projectRef !== FORGE_PROJECT_REF) throw new Error("project_ref_mismatch");
  if (input.dashboardVerifiedAttestation !== true) {
    throw new Error("dashboard_verification_attestation_required");
  }
  if (input.restoreScopeAcknowledged !== true) {
    throw new Error("restore_scope_acknowledgement_required");
  }
  if (input.unrelatedDataImpactAcknowledged !== true) {
    throw new Error("unrelated_data_impact_acknowledgement_required");
  }

  const evidence = {
    schema: "forge.hosted-recovery-readiness.v1",
    project_ref: FORGE_PROJECT_REF,
    dashboard_verified: true,
    backup_kind: requireString(input.backupKind, "backup_kind"),
    verified_at: requireString(input.verifiedAt, "verified_at"),
    latest_restorable_at: requireString(input.latestRestorableAt, "latest_restorable_at"),
    recovery_operator: requireString(input.recoveryOperator, "recovery_operator"),
    restore_authorizer: requireString(input.restoreAuthorizer, "restore_authorizer"),
    owner_approval_reference: requireString(input.ownerApprovalReference, "owner_approval_reference"),
    restore_scope_acknowledged: true,
    unrelated_data_impact_acknowledged: true,
  };

  validateRecoveryEvidence(evidence, now);
  return evidence;
}

export function writePrivateRecoveryReadinessEvidence({ repositoryRoot, outputName, evidence }) {
  const repo = resolve(requireString(repositoryRoot, "repository_root"));
  const fileName = requireString(outputName, "output_name");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\.json$/.test(fileName) || fileName.includes("..")) {
    throw new Error("output_name_invalid");
  }

  const gitDirectory = resolve(repo, ".git");
  if (!existsSync(gitDirectory) || !lstatSync(gitDirectory).isDirectory() || lstatSync(gitDirectory).isSymbolicLink()) {
    throw new Error("repository_git_directory_invalid");
  }

  const evidenceDirectory = resolve(repo, PRIVATE_EVIDENCE_DIRECTORY);
  mkdirSync(evidenceDirectory, { recursive: true, mode: 0o700 });
  if (!lstatSync(evidenceDirectory).isDirectory() || lstatSync(evidenceDirectory).isSymbolicLink()) {
    throw new Error("private_evidence_directory_invalid");
  }
  try { chmodSync(evidenceDirectory, 0o700); } catch { /* Windows ACLs remain authoritative. */ }

  const outputPath = resolve(evidenceDirectory, fileName);
  if (!outputPath.startsWith(`${evidenceDirectory}${sep}`)) throw new Error("output_path_invalid");
  const serialized = `${JSON.stringify(evidence, null, 2)}\n`;
  writeFileSync(outputPath, serialized, { encoding: "utf8", flag: "wx", mode: 0o600 });
  try { chmodSync(outputPath, 0o600); } catch { /* Windows ACLs remain authoritative. */ }

  return {
    outputPath,
    evidenceSha256: createHash("sha256").update(serialized).digest("hex"),
  };
}
