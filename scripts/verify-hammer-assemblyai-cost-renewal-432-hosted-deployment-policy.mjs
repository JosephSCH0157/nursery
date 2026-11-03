import { readFileSync } from "node:fs";
import {
  validateHostedState,
  validateOperatorAuthorization,
  validateRecoveryEvidence,
} from "./lib/hammer-assemblyai-cost-renewal-432-hosted-deployment-policy.mjs";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) args.set(process.argv[index], process.argv[index + 1]);
const action = args.get("--action");
const recovery = JSON.parse(readFileSync(args.get("--recovery"), "utf8"));
const options = { action, operator: args.get("--operator"), authorization: args.get("--authorization") };
const recoveryResult = validateRecoveryEvidence(recovery);
if (args.has("--local-only")) {
  validateOperatorAuthorization(options);
} else {
  validateHostedState(JSON.parse(readFileSync(args.get("--state"), "utf8")), options);
}
process.stdout.write(`${JSON.stringify({ ok: true, action, recoveryEvidenceSha256: recoveryResult.evidenceSha256 })}\n`);
