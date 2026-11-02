import { readFileSync } from "node:fs";
import {
  validateActivationAction,
  validateActivationRecoveryEvidence,
} from "./lib/forge-account-admission-activation-policy.mjs";

function parse(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key?.startsWith("--")) throw new Error("activation_policy_argument_invalid");
    const value = argv[++index];
    if (!value) throw new Error("activation_policy_argument_missing");
    result[key.slice(2)] = value;
  }
  return result;
}

const args = parse(process.argv.slice(2));
const action = args.action;
const state = args.state ? JSON.parse(readFileSync(args.state, "utf8")) : null;
const recovery = args.recovery ? JSON.parse(readFileSync(args.recovery, "utf8")) : null;
const observation = args["api-observation"] ? JSON.parse(readFileSync(args["api-observation"], "utf8")) : null;
if (!state) throw new Error("activation_state_required");
let recoveryResult = null;
if (new Set(["Preflight", "Activate"]).has(action)) {
  if (!recovery || !observation) throw new Error("activation_recovery_evidence_required");
  recoveryResult = validateActivationRecoveryEvidence(recovery, new Date(), observation);
}
const result = validateActivationAction(state, {
  action,
  operator: args.operator,
  authorization: args.authorization,
});
process.stdout.write(`${JSON.stringify({
  ok: true,
  schema: "forge.account-admission-activation-policy-receipt.v1",
  ...result,
  recoveryUseKey: recoveryResult?.recoveryUseKey ?? null,
  customerDataReturned: false,
  credentialsReturned: false,
})}\n`);
