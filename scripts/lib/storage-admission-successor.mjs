import assert from 'node:assert/strict';
import {readFileSync,lstatSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';

export const admissionContractPath='docs/database/certification/storage-admission-447.json';
export const admissionSuccessor=Object.freeze({
 schema:'forge.storage-admission-successor.v1',
 sourceCandidate:'930063de537619c995edcee7efbb1f1016c91c08',
 predecessor:{version:'20261113214832',historicalCount:446,baselineCount:33,
  contractPath:'docs/database/certification/storage-full-tail-446.json',
  contractSha256:'6c101ad50695d99364a593087680e13c009678fb36069da282ce8b1cdc74cde5'},
 migration:{version:'20261120161347',path:'supabase/migrations/20261120161347_storage_accounting_identity_admission.sql',
  sha256:'0b4d5a53bf73ca3f10f1b6dc90ab91ecd74c0e58c6bb0dbf714e7d3814040eda'},
 historicalCount:447,baselineCount:34,
 proposal:{path:'database/proposals/20261120161347_storage_accounting_identity_admission.sql',
  sha256:'a6dd4ff13a86acc92e933b0515e80aadeca03993f56fcdc7287258cbd7e69406'},
 catalogDelta:{added:['trigger|storage.objects.forge_storage_capacity_identity_guard'],
  changed:['function|tongs._enforce_storage_capacity()', 'trigger|storage.objects.forge_storage_capacity_statement_guard'],removed:[]},
 executionContract:'supabase/tests/storage_admission_447_contract.sql',
 executionContractSha256:'07ea6c20f716ba589d495d47535b594fc443ba8589d1c36470929614cbd4635f',
 hostedExecution:'held-no-executor',historicalCertification:'not-performed',releaseAuthorization:false,
});
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export function validateAdmissionContract(contract){assert.deepEqual(contract,admissionSuccessor,'Unreviewed Storage admission successor');return contract;}
export function readAdmissionSuccessor(root=process.cwd()){
 const contract=validateAdmissionContract(JSON.parse(readFileSync(join(root,admissionContractPath),'utf8')));
 for(const [path,hash] of [[contract.predecessor.contractPath,contract.predecessor.contractSha256],
  [contract.migration.path,contract.migration.sha256],[contract.proposal.path,contract.proposal.sha256],
  [contract.executionContract,contract.executionContractSha256]]){
  assert.ok(lstatSync(join(root,path)).isFile(),'Successor evidence must be an ordinary file');
  const bytes=readFileSync(join(root,path));
  // The existing JSON catalog has Git text checkout conversion. Pin its LF
  // Git representation without modifying that historical file on Windows.
  const canonical=path===contract.predecessor.contractPath?Buffer.from(bytes.toString('utf8').replaceAll('\r\n','\n')):bytes;
  assert.equal(sha256(canonical),hash,'Successor evidence bytes differ: '+path);
 }
 const sql=readFileSync(join(root,contract.migration.path),'utf8');
 const proposal=readFileSync(join(root,contract.proposal.path),'utf8');
 assert.equal(sql.slice(sql.indexOf('begin;')),proposal.slice(proposal.indexOf('begin;')),'Adoption must preserve the tested executable SQL');
 return {contract,sql};
}
