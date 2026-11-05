import { readFileSync } from "node:fs";
import {
  validateHostedState,
  validateOperatorAuthorization,
  validatePostVerifyState,
  validateRecoveryEvidence,
} from "./lib/scalable-forge-financial-admission-440-hosted-deployment-policy.mjs";

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => {
  if (value.startsWith("--")) pairs.push([value.slice(2), all[index + 1]]);
  return pairs;
}, []));
const action = args.action;
if (!new Set(["Preflight", "Apply", "PostVerify"]).has(action)) throw new Error("action_invalid");
const state = JSON.parse(readFileSync(args.state, "utf8"));
if (action === "PostVerify") {
  validatePostVerifyState(state);
  validateOperatorAuthorization({ action, operator: args.operator });
  process.stdout.write(`${JSON.stringify({ ok: true, action })}\n`);
} else {
  const recovery = JSON.parse(readFileSync(args.recovery, "utf8"));
  const observation = JSON.parse(readFileSync(args.observation, "utf8"));
  const validated = validateRecoveryEvidence(recovery, new Date(), observation);
  validateHostedState(state, { action, operator: args.operator, authorization: args.authorization, authorizationSha256: args["authorization-sha256"] });
  process.stdout.write(`${JSON.stringify({ ok: true, action, recoveryUseKey: validated.recoveryUseKey })}\n`);
}
