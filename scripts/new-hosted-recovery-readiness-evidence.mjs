import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  buildRecoveryReadinessEvidence,
  writePrivateRecoveryReadinessEvidence,
} from "./lib/hosted-recovery-readiness-evidence.mjs";

const valueArguments = new Set([
  "project-ref",
  "backup-kind",
  "verified-at",
  "latest-restorable-at",
  "recovery-operator",
  "restore-authorizer",
  "owner-approval-reference",
  "output-name",
]);
const flagArguments = new Set([
  "attest-dashboard-verified",
  "acknowledge-restore-scope",
  "acknowledge-unrelated-data-impact",
]);

function parseArguments(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--") continue;
    if (!token.startsWith("--")) throw new Error(`argument_invalid:${token}`);
    const name = token.slice(2);
    if (flagArguments.has(name)) {
      parsed[name] = true;
      continue;
    }
    if (!valueArguments.has(name)) throw new Error(`argument_unknown:${name}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`argument_value_missing:${name}`);
    parsed[name] = value;
    index += 1;
  }
  return parsed;
}

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArguments(process.argv.slice(2));
const evidence = buildRecoveryReadinessEvidence({
  projectRef: args["project-ref"],
  backupKind: args["backup-kind"],
  verifiedAt: args["verified-at"],
  latestRestorableAt: args["latest-restorable-at"],
  recoveryOperator: args["recovery-operator"],
  restoreAuthorizer: args["restore-authorizer"],
  ownerApprovalReference: args["owner-approval-reference"],
  dashboardVerifiedAttestation: args["attest-dashboard-verified"] === true,
  restoreScopeAcknowledged: args["acknowledge-restore-scope"] === true,
  unrelatedDataImpactAcknowledged: args["acknowledge-unrelated-data-impact"] === true,
});
const receipt = writePrivateRecoveryReadinessEvidence({
  repositoryRoot,
  outputName: args["output-name"],
  evidence,
});

process.stdout.write(`${JSON.stringify({
  ok: true,
  schema: "forge.hosted-recovery-readiness-evidence-created.v1",
  outputPath: receipt.outputPath,
  evidenceSha256: receipt.evidenceSha256,
  credentialAccessed: false,
  databaseOperationPerformed: false,
})}\n`);
