import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,mkdtempSync,rmSync,existsSync} from 'node:fs';
import {execFileSync,spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {STORAGE_RELEASES,PROJECT,PAYLOAD,releaseFor,validateStorageAuthorization,validateStorageState,validateStorageRecovery} from './lib/storage-hosted-release-contract.mjs';
const NOW=new Date('2026-11-12T02:00:00Z');
const hash=v=>createHash('sha256').update(v).digest('hex');
const state=(r,post=false)=>({projectRef:PROJECT,lineage:'historical-v1',financialMode:'test',certifiedPayloadCommit:PAYLOAD,payloadProvenanceOk:true,
 migrationSha256:r.sha256,databasePasswordAvailable:true,installedCount:r.number-(post?0:1),hostedHead:post?r.version:r.predecessor,pendingVersions:post?[]:[r.version],storageStage:r.stage-(post?0:1),storageContractOk:true,predecessorVerified:true,protectedAuthoritySha256:'a'.repeat(64)});
function recovery(r){
 const obs={schema:'forge.supabase-management-backup-observation.v1',project_ref:PROJECT,endpoint:`/v1/projects/${PROJECT}/database/backups`,http_status:200,observed_at:'2026-11-12T01:59:00.000Z',response_date:'2026-11-12T01:58:59.000Z',response_sha256:'a'.repeat(64),backup_id:'synthetic-backup',backup_status:'COMPLETED',backup_timestamp:'2026-11-12T00:00:00.000Z',recovery_method:'daily_physical_backup',pitr_enabled:false};
 const evidence={schema:'forge.hosted-recovery-readiness.v2',verification_source:'supabase_management_api',project_ref:PROJECT,backup_kind:'daily',verified_at:obs.observed_at,latest_restorable_at:obs.backup_timestamp,recovery_operator:'synthetic recovery operator',restore_authorizer:'synthetic authorizer',owner_approval_reference:`FORGE-STORAGE-${r.number}:WINDOW-01`,restore_scope_acknowledged:true,unrelated_data_impact_acknowledged:true,management_api:{endpoint:obs.endpoint,backup_id:obs.backup_id,backup_status:obs.backup_status,backup_timestamp:obs.backup_timestamp,recovery_method:obs.recovery_method,response_sha256:obs.response_sha256,observed_at:obs.observed_at}};
 return {evidence,obs};
}
for(const r of STORAGE_RELEASES){
 const wrapper=readFileSync(`scripts/invoke-storage-billing-${r.number}-hosted-deployment.ps1`,'utf8');
 test(`${r.number}: leading SQL comment remains one positional argument`,()=>{
  const start=wrapper.indexOf('function Read-LinkedCsv('),end=wrapper.indexOf('function Assert-StaticPrerequisites',start);
  const sql="-- Read-only contract\nselect '--not-an-option' as evidence;";
  const q=s=>"'"+s.replaceAll("'","''")+"'";
  const code=`$ErrorActionPreference='Stop';$repo='synthetic-workdir';
function Invoke-Supabase { param([string[]]$Arguments) $script:captured=$Arguments; @{StandardOutput='synthetic'} }
function ConvertFrom-ForgeSupabaseCsv { param($StandardOutput,$ExpectedColumns,$Context) }
${wrapper.slice(start,end)}
$null=Read-LinkedCsv ${q(sql)} @('evidence') 'fixture';ConvertTo-Json -Compress -InputObject $script:captured`;
  const args=JSON.parse(execFileSync('pwsh',['-NoProfile','-Command',code],{encoding:'utf8'}));
  assert.deepEqual(args,['db','query','--linked','--agent=no','--output','csv','--workdir','synthetic-workdir','--',sql]);
 });
 test(`${r.number}: fixed payload and exact pre/post state`,()=>{
  assert.equal(hash(readFileSync(`supabase/migrations/${r.filename}`)),r.sha256);
  assert.equal(validateStorageState(r,state(r),{action:'Preflight',operator:'fixture'}),true);
  assert.equal(validateStorageState(r,state(r,true),{action:'PostVerify',operator:'fixture'}),true);
  for(const key of [r.version,r.predecessor,r.sha256,PAYLOAD])assert.ok(wrapper.includes(key));
 });
 test(`${r.number}: project, history, pending set, mode, contracts and provenance fail closed`,()=>{
  for(const [field,value] of Object.entries({projectRef:'wrong',lineage:'baseline-v1',financialMode:'live',certifiedPayloadCommit:'0'.repeat(40),payloadProvenanceOk:false,migrationSha256:'0'.repeat(64),databasePasswordAvailable:false,installedCount:r.number,hostedHead:r.version,pendingVersions:[r.version,'20990101000000'],storageStage:r.stage,storageContractOk:false,predecessorVerified:false,protectedAuthoritySha256:'bad'})) {
   assert.throws(()=>validateStorageState(r,{...state(r),[field]:value},{action:'Preflight',operator:'fixture'}),field);
  }
  assert.throws(()=>validateStorageState(r,{...state(r),pendingVersions:[]},{action:'Apply',operator:'fixture'}));
  assert.throws(()=>validateStorageState(r,{...state(r,true),storageContractOk:false},{action:'PostVerify',operator:'fixture'}));
 });
 test(`${r.number}: explicit target authorization, not cross-version`,()=>{
  const token=`FORGE-STORAGE-${r.number}:${PROJECT}:${r.version}:synthetic-not-valid-for-production`;
  validateStorageAuthorization(r,{action:'Apply',operator:'fixture',authorization:token,authorizationSha256:hash(token)});
  for(const authorization of ['',token.replace(r.version,'wrong'),'unscoped-token'])assert.throws(()=>validateStorageAuthorization(r,{action:'Apply',operator:'fixture',authorization,authorizationSha256:hash(authorization)}));
  assert.throws(()=>validateStorageAuthorization(r,{action:'Apply',operator:'fixture',authorization:token,authorizationSha256:'0'.repeat(64)}));
  assert.throws(()=>validateStorageAuthorization(r,{action:'Apply',operator:'',authorization:token,authorizationSha256:hash(token)}));
 });
 test(`${r.number}: fresh API-correlated recovery and independent owner reference`,()=>{
  const {evidence,obs}=recovery(r);assert.match(validateStorageRecovery(r,evidence,NOW,obs).recoveryUseKey,/^[a-f0-9]{64}$/);
  for(const mutate of [e=>e.project_ref='wrong',e=>e.owner_approval_reference='FORGE-STORAGE-440:wrong',e=>e.verified_at='2020-01-01T00:00:00Z',e=>e.restore_authorizer='',e=>e.restore_scope_acknowledged=false,e=>e.management_api.backup_id='wrong']){const e=structuredClone(evidence);mutate(e);assert.throws(()=>validateStorageRecovery(r,e,NOW,obs));}
  assert.throws(()=>validateStorageRecovery(r,evidence,NOW,{...obs,http_status:403}));
 });
 test(`${r.number}: read-only Preflight, bounded Apply and no automatic retry`,()=>{
  assert.match(wrapper,/Invoke-WithForgeManagedDatabaseCredential/);
  assert.match(wrapper,/New-TrustedRecoveryApiObservation/);
  assert.match(wrapper,/Assert-ForgeSupabaseDryRunPlan.*ExpectedMigrationFiles/);
  const dry=wrapper.indexOf('Assert-ForgeSupabaseDryRunPlan'),pre=wrapper.indexOf("if($Action -eq 'Preflight'){return"),consume=wrapper.indexOf('Register-ApplyAuthorizationUse $AuthorizationSha256 $state.protectedAuthoritySha256'),push=wrapper.indexOf("Invoke-Supabase @('db','push','--linked','--workdir',$releaseWorkdir,'--agent=no')");
  assert.ok(dry<pre && pre<consume && consume<push);
  assert.match(wrapper,/Assert-PostApply \$protected/);
  assert.match(wrapper,/original Apply authorization commitment/);
  assert.match(wrapper,/protected_authority_sha256/);
  assert.doesNotMatch(wrapper,/--include-all|migration['"]?\s*,\s*['"]repair|db['"]?\s*,\s*['"]reset/);
 });
 test(`${r.number}: unknown Apply outcome is inspected, never replayed`,()=>{
  const start=wrapper.indexOf('function Assert-PostApply('),end=wrapper.indexOf("if($Action -eq 'Apply'",start),fn=wrapper.slice(start,end);
  const code=`$ErrorActionPreference='Stop';$targetVersion='${r.version}';$currentHead=$targetVersion;$currentFingerprint='${'a'.repeat(64)}';
function Get-HostedState { @{installedCount=${r.number};hostedHead=$currentHead;pendingVersions=@()} }
function Get-ProtectedAuthorityFingerprint { $currentFingerprint }
function Invoke-Policy { param($State,$Observation,$Action) if($Action -ne 'PostVerify'){throw 'Unexpected write action'} }
${fn}
$null=Assert-PostApply ('a'*64);
$currentHead='${r.predecessor}';$denied=$false;try{$null=Assert-PostApply ('a'*64)}catch{$denied=$true};if(-not $denied){throw 'Uninstalled target accepted'};
$currentHead=$targetVersion;$currentFingerprint='${'b'.repeat(64)}';$denied=$false;try{$null=Assert-PostApply ('a'*64)}catch{$denied=$true};if(-not $denied){throw 'Changed financial authority accepted'};
'PASS'`;
  assert.equal(execFileSync('pwsh',['-NoProfile','-Command',code],{encoding:'utf8'}).trim(),'PASS');
 });
 test(`${r.number}: durable attempt marker survives interruption and cannot be reused`,()=>{
  const start=wrapper.indexOf('function Register-ApplyAuthorizationUse('),end=wrapper.indexOf('function Assert-PostApply',start),fn=wrapper.slice(start,end);
  const dir=mkdtempSync(join(tmpdir(),'forge-storage-authorization-test-'));
  try{
   const q=s=>"'"+s.replaceAll("'","''")+"'";
   const program=`$ErrorActionPreference='Stop';$repo=${q(dir)};$projectRef=${q(PROJECT)};$targetVersion=${q(r.version)};$certifiedPayloadCommit=${q(PAYLOAD)};$Operator='synthetic';${fn}\nRegister-ApplyAuthorizationUse ('a'*64) ('b'*64);$denied=$false;try{Register-ApplyAuthorizationUse ('a'*64) ('b'*64)}catch{$denied=$true};if(-not $denied){throw 'Replay permitted'}; Get-Content -Raw (Join-Path $repo '.git/forge-private-evidence/used/storage-billing-${r.number}-authorization-${'a'.repeat(64)}.json')`;
   const receipt=JSON.parse(execFileSync('pwsh',['-NoProfile','-Command',program],{encoding:'utf8'}));
   assert.equal(receipt.target_version,r.version);assert.equal(receipt.protected_authority_sha256,'b'.repeat(64));assert.equal(receipt.project_ref,PROJECT);
  }finally{rmSync(dir,{recursive:true,force:true});}
 });
}
test('unsupported migration cannot select another executor',()=>assert.throws(()=>releaseFor('20261111054816')));
test('PowerShell AST is valid for all fixed wrappers',()=>{
 execFileSync('pwsh',['-NoProfile','-Command',`$errors=@();Get-ChildItem scripts/invoke-storage-billing-*-hosted-deployment.ps1|ForEach-Object{$t=$null;$e=$null;[System.Management.Automation.Language.Parser]::ParseFile($_.FullName,[ref]$t,[ref]$e)|Out-Null;$errors+=@($e)};if($errors.Count){throw ($errors|Out-String)}`]);
});

test('pinned Supabase CLI parses comment-led SQL only after option boundary (no connection)',()=>{
 const cli=existsSync('node_modules/.bin/supabase')?'node_modules/.bin/supabase':'supabase';
 assert.equal(execFileSync(cli,['--version'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim(),'2.84.2');
 const sql="-- Read-only contract\nselect '--linked' as evidence;";
 const rejected=spawnSync(cli,['db','query','--help',sql],{encoding:'utf8'});
 assert.notEqual(rejected.status,0);assert.match(rejected.stderr,/unknown flag/);
 const accepted=spawnSync(cli,['db','query','--help','--',sql],{encoding:'utf8'});
 assert.equal(accepted.status,0,accepted.stderr);assert.match(accepted.stdout,/Usage:/);
});
