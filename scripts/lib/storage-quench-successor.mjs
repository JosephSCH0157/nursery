import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
export const convergencePath='docs/database/certification/quench-acl-convergence-448.json';
export const convergenceSuccessor=Object.freeze({
  "schema": "forge.quench-acl-convergence-successor.v1",
  "sourceCandidate": "2f896915b3eab6f3ee7e40a87835fe1d14dad802",
  "predecessor": {
    "historicalCount": 447,
    "baselineCount": 34,
    "version": "20261120161347"
  },
  "migration": {
    "version": "20261125023622",
    "path": "supabase/migrations/20261125023622_quench_public_execute_convergence.sql",
    "sha256": "89ed0357954f9a23a45dd620a1689bb044a11688419e93cb4703f295b78adde1"
  },
  "historicalCount": 448,
  "baselineCount": 35,
  "executionContract": "supabase/tests/quench_public_execute_448_contract.sql",
  "executionContractSha256": "63c8d628785df7aac059c380cbbb5d247b8d859bc2fdf15a57fc6c9c23f40d8a",
  "correctionSql": "docs/database/proposals/h444-quench-public-execute-correction.sql",
  "correctionSqlSha256": "19fa621acdc1312a4d23aba930d3de83f3b9caab87b47bfcec2c6a3ad84708e9",
  "observationSql": "docs/database/proposals/h444-quench-public-execute-observation.sql",
  "observationSqlSha256": "b88ede734880193f8d8904ed28963b76d6ced53fb7bdb3bddec2cd94cb727d96",
  "hostedExecution": "separate-owner-authorization-required",
  "releaseAuthorization": false
});
export function readConvergenceSuccessor(root=process.cwd()){
 const c=JSON.parse(readFileSync(join(root,convergencePath)));assert.deepEqual(c,convergenceSuccessor,'unreviewed_convergence_contract');
 for(const [p,h] of [[c.migration.path,c.migration.sha256],[c.executionContract,c.executionContractSha256],[c.correctionSql,c.correctionSqlSha256],[c.observationSql,c.observationSqlSha256]])assert.equal(createHash('sha256').update(readFileSync(join(root,p))).digest('hex'),h,'convergence_bytes_changed:'+p);
 return c;
}
