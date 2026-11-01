import { readFileSync } from "node:fs";
import {
  validateHostedState,
  validateOperatorAuthorization,
  validatePostVerifyState,
  validateRecoveryEvidence,
} from "./lib/forge-account-admission-authority-428-hosted-deployment-policy.mjs";

const values = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const key = process.argv[index];
  if (key === "--local-only") {
    values.set(key, true);
    continue;
  }
  values.set(key, process.argv[++index]);
}

const action = values.get("--action");
const operator = values.get("--operator");
const authorization = values.get("--authorization");

if (action === "PostVerify") {
  const state = JSON.parse(readFileSync(values.get("--state"), "utf8"));
  validatePostVerifyState(state);
  process.stdout.write(`${JSON.stringify({
    ok: true,
    schema: "forge.account-admission-authority-428-hosted-policy.v1",
    customerDataReturned: false,
    credentialsReturned: false,
  })}\n`);
  process.exit(0);
}

const evidence = JSON.parse(readFileSync(values.get("--recovery"), "utf8"));
const apiObservationPath = values.get("--api-observation");
const apiObservation = apiObservationPath ? JSON.parse(readFileSync(apiObservationPath, "utf8")) : undefined;
const recovery = validateRecoveryEvidence(evidence, new Date(), apiObservation);
validateOperatorAuthorization({ action, operator, authorization });
if (!values.get("--local-only")) {
  const state = JSON.parse(readFileSync(values.get("--state"), "utf8"));
  validateHostedState(state, { action, operator, authorization });
}

process.stdout.write(`${JSON.stringify({
  ok: true,
  schema: "forge.account-admission-authority-428-hosted-policy.v1",
  recoveryEvidenceSha256: recovery.evidenceSha256,
  recoveryUseKey: recovery.recoveryUseKey,
  recoveryVerificationSource: recovery.verificationSource,
  customerDataReturned: false,
  credentialsReturned: false,
})}\n`);
