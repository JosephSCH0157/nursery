import { readFileSync } from "node:fs";
import { validateHostedState, validateOperatorAuthorization, validateRecoveryEvidence } from "./lib/hammer-first-transcription-421-hosted-deployment-policy.mjs";

const args = process.argv.slice(2);
const value = name => { const i=args.indexOf(name); return i>=0 ? args[i+1] : undefined; };
const action=value("--action");
const operator=value("--operator");
const authorization=value("--authorization");
const recoveryPath=value("--recovery");
const statePath=value("--state");
const localOnly=args.includes("--local-only");
if(!new Set(["Preflight","Apply"]).has(action)) throw new Error("action_invalid");
const recovery=JSON.parse(readFileSync(recoveryPath,"utf8"));
const recoveryResult=validateRecoveryEvidence(recovery);
const operatorResult=validateOperatorAuthorization({action,operator,authorization});
let hosted=null;
if(!localOnly) hosted=validateHostedState(JSON.parse(readFileSync(statePath,"utf8")),{action,operator,authorization});
process.stdout.write(JSON.stringify({ok:true,schema:"forge.hammer-first-transcription-421-hosted-deployment-policy.v1",action,operator:operatorResult.operator,recoveryEvidenceSha256:recoveryResult.evidenceSha256,hostedStateVerified:hosted!==null,credentialsReturned:false,customerDataReturned:false}));
