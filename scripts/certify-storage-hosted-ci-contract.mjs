import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {STORAGE_RELEASES} from './lib/storage-hosted-release-contract.mjs';
// Only the existing GitHub-owned guarded baseline. Never a hosted target or an
// environment-variable supplied connection string.
assert.equal(process.env.GITHUB_ACTIONS,'true');
assert.equal(process.env.RUNNER_ENVIRONMENT,'github-hosted');
assert.ok(process.env.RUNNER_TEMP);
const container='supabase_db_nursery';
const query=q=>execFileSync('docker',['exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],{input:`begin read only;${q};commit;`,encoding:'utf8'}).trim();
const provenance=JSON.parse(query("select json_build_object('lineage',(select lineage from forge_meta.database_lineage where singleton),'head',(select max(version) from supabase_migrations.schema_migrations),'versions',(select json_agg(version order by version) from supabase_migrations.schema_migrations where version>='20261111180013'))"));
assert.equal(provenance.lineage,'baseline-v1');assert.equal(provenance.head,STORAGE_RELEASES.at(-1).version);
assert.deepEqual(provenance.versions,STORAGE_RELEASES.map(r=>r.version));
const sql=readFileSync('supabase/tests/storage_billing_hosted_release_contract.sql','utf8').trim().replace(/;$/,'');
const contract=JSON.parse(query(`select row_to_json(s) from (${sql}) s`));
assert.equal(contract.storage_stage,4);assert.equal(contract.storage_contract_ok,true);assert.equal(contract.financial_mode,'test');
assert.equal(query("select current_setting('transaction_read_only')"),'on');
console.log(JSON.stringify({result:'PASS',provenance,contract,readOnly:true,historicalStateEquivalence:false}));
