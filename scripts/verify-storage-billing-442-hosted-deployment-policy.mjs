import {readFileSync} from 'node:fs';
import {releaseFor,validateStorageState,validateStorageRecovery} from './lib/storage-hosted-release-contract.mjs';
const r=releaseFor('20261111185031');
const argv=process.argv.slice(2);const args=Object.fromEntries(argv.reduce((a,v,i)=>{if(v.startsWith('--'))a.push([v.slice(2),argv[i+1]]);return a;},[]));
const options={action:args.action,operator:args.operator,authorization:args.authorization,authorizationSha256:args['authorization-sha256']};
validateStorageState(r,JSON.parse(readFileSync(args.state,'utf8')),options);
let recoveryUseKey;
if(args.action!=='PostVerify')recoveryUseKey=validateStorageRecovery(r,JSON.parse(readFileSync(args.recovery,'utf8')),new Date(),JSON.parse(readFileSync(args.observation,'utf8'))).recoveryUseKey;
console.log(JSON.stringify({ok:true,action:args.action,recoveryUseKey}));
