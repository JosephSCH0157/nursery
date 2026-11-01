import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  buildManagementApiBackupObservation,
  buildManagementApiRecoveryEvidence,
  MANAGEMENT_API_BASE_URL,
  managementBackupEndpoint,
} from "./lib/hosted-recovery-readiness-policy.mjs";
import { writePrivateRecoveryReadinessEvidence } from "./lib/hosted-recovery-readiness-evidence.mjs";

const valueArguments = new Set([
  "action", "project-ref", "expected-backup-id", "recovery-operator",
  "restore-authorizer", "owner-approval-reference", "output-name",
]);
const flagArguments = new Set(["acknowledge-restore-scope", "acknowledge-unrelated-data-impact"]);

function parseArguments(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--") continue;
    if (!token.startsWith("--")) throw new Error(`argument_invalid:${token}`);
    const name = token.slice(2);
    if (flagArguments.has(name)) { parsed[name] = true; continue; }
    if (!valueArguments.has(name)) throw new Error(`argument_unknown:${name}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`argument_value_missing:${name}`);
    parsed[name] = value;
    index += 1;
  }
  return parsed;
}

export async function collectManagementApiBackupObservation({
  projectRef,
  expectedBackupId,
  accessToken,
  fetchImplementation = fetch,
  now,
}) {
  if (!accessToken?.trim()) throw new Error("management_api_access_token_missing");
  const endpoint = managementBackupEndpoint(projectRef);
  const response = await fetchImplementation(`${MANAGEMENT_API_BASE_URL}${endpoint}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    redirect: "error",
  });
  const responseText = await response.text();
  const observedNow = now ?? new Date();
  return buildManagementApiBackupObservation({
    projectRef,
    responseText,
    httpStatus: response.status,
    responseDate: response.headers.get("date"),
    observedAt: observedNow.toISOString(),
    expectedBackupId,
  }, observedNow);
}

async function main() {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const args = parseArguments(process.argv.slice(2));
  const observation = await collectManagementApiBackupObservation({
    projectRef: args["project-ref"],
    expectedBackupId: args["expected-backup-id"],
    accessToken: process.env.FORGE_SUPABASE_CAPACITY_READ_TOKEN,
  });
  if (args.action === "Observe") {
    process.stdout.write(`${JSON.stringify(observation)}\n`);
    return;
  }
  if (args.action !== "Create") throw new Error("action_invalid");
  const evidence = buildManagementApiRecoveryEvidence({
    projectRef: args["project-ref"],
    recoveryOperator: args["recovery-operator"],
    restoreAuthorizer: args["restore-authorizer"],
    ownerApprovalReference: args["owner-approval-reference"],
    restoreScopeAcknowledged: args["acknowledge-restore-scope"] === true,
    unrelatedDataImpactAcknowledged: args["acknowledge-unrelated-data-impact"] === true,
  }, observation);
  const receipt = writePrivateRecoveryReadinessEvidence({
    repositoryRoot,
    outputName: args["output-name"],
    evidence,
  });
  process.stdout.write(`${JSON.stringify({
    ok: true,
    schema: "forge.hosted-recovery-readiness-evidence-created.v2",
    outputPath: receipt.outputPath,
    evidenceSha256: receipt.evidenceSha256,
    projectRef: evidence.project_ref,
    verificationSource: evidence.verification_source,
    backupStatus: evidence.management_api.backup_status,
    latestRestorableAt: evidence.latest_restorable_at,
    credentialReturned: false,
    databaseOperationPerformed: false,
  })}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
