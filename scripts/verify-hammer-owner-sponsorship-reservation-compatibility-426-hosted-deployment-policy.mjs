import { readFileSync } from "node:fs";
import {
  validateHostedState, validateOperatorAuthorization, validateRecoveryEvidence,
} from "./lib/hammer-owner-sponsorship-reservation-compatibility-426-hosted-deployment-policy.mjs";

const values = new Map();
for (let index=2; index<process.argv.length; index+=1) {
  const key=process.argv[index];
  if (key === "--local-only") { values.set(key, true); continue; }
  values.set(key, process.argv[++index]);
}
const action=values.get("--action");
const operator=values.get("--operator");
const authorization=values.get("--authorization");
const evidence=JSON.parse(readFileSync(values.get("--recovery"),"utf8"));
const recovery=validateRecoveryEvidence(evidence);
validateOperatorAuthorization({action,operator,authorization});
if (!values.get("--local-only")) {
  const state=JSON.parse(readFileSync(values.get("--state"),"utf8"));
  validateHostedState(state,{action,operator,authorization});
}
process.stdout.write(`${JSON.stringify({ok:true,schema:"forge.hammer-owner-sponsorship-reservation-compatibility-426-hosted-policy.v1",recoveryEvidenceSha256:recovery.evidenceSha256,customerDataReturned:false,credentialsReturned:false})}\n`);
