import { readFileSync } from "node:fs";
import process from "node:process";
import {
  FORGE_PROJECT_REF,
  TARGET_VERSION,
  validateHostedState,
  validateOperatorAuthorization,
  validateRecoveryEvidence,
} from "./lib/hammer-h2c-420-hosted-deployment-policy.mjs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const action = argument("action");
if (!new Set(["Preflight", "Apply"]).has(action)) throw new Error("action_invalid");
const recovery = JSON.parse(readFileSync(argument("recovery"), "utf8"));
const options = {
  action,
  authorization: argument("authorization"),
  operator: argument("operator"),
};
const localOnly = process.argv.includes("--local-only");
const stateResult = localOnly
  ? validateOperatorAuthorization(options)
  : validateHostedState(JSON.parse(readFileSync(argument("state"), "utf8")), options);
const recoveryResult = validateRecoveryEvidence(recovery);

process.stdout.write(`${JSON.stringify({
  ok: true,
  schema: "forge.hammer-h2c-420-hosted-deployment-preflight.v1",
  action,
  projectRef: FORGE_PROJECT_REF,
  targetVersion: TARGET_VERSION,
  operator: stateResult.operator,
  recovery: recoveryResult,
  customerDataReturned: false,
  credentialsReturned: false,
  localOnly,
})}\n`);
