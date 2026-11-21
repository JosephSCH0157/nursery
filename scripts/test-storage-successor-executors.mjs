import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync,mkdirSync,writeFileSync,realpathSync} from 'node:fs';
import {execFileSync,spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import test from 'node:test';
import {STORAGE_RELEASES,PROJECT,PAYLOAD} from './lib/storage-successor-release-contract.mjs';
import {validateSuccessorPayload} from './prepare-storage-successor-hosted-workdir.mjs';
import {verifyStorageWorkdir} from './prepare-storage-successor-linked-workdir.mjs';

for(const r of STORAGE_RELEASES){
 const wrapper=readFileSync(`scripts/invoke-storage-billing-${r.number}-hosted-deployment.ps1`,'utf8');
 test(`${r.number}: Apply hold executes before repository, credentials or network access`,()=>{
  const result=spawnSync('pwsh',['-NoProfile','-File',`scripts/invoke-storage-billing-${r.number}-hosted-deployment.ps1`,'-Action','Apply','-Operator','synthetic','-RepositoryRoot','does-not-exist'],{encoding:'utf8'});
  assert.notEqual(result.status,0);assert.match(result.stderr,/storage_successor_release_hold/);
  assert.doesNotMatch(result.stderr,/Cannot find|credential|CommandNotFound/);
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

test('linked staging validates exact prefixes and rejects target, SQL, template and connection drift offline',()=>{
 const repo=realpathSync(process.cwd());const payload=validateSuccessorPayload(repo);
 const base=join(repo,'.git/forge-private-evidence/storage-successor-linked-release');
 mkdirSync(base,{recursive:true});
 for(const r of STORAGE_RELEASES){
  const dir=mkdtempSync(join(base,'synthetic-'));
  try{
   for(const p of ['supabase/migrations','supabase/templates','supabase/.temp'])mkdirSync(join(dir,p),{recursive:true});
   const names=payload.names.filter(p=>p.split('/').at(-1).split('_')[0]<=r.version);
   for(const p of names)writeFileSync(join(dir,p),payload.files.get(p));
   writeFileSync(join(dir,'supabase/config.toml'),readFileSync('supabase/config.toml'));
   const template='supabase/templates/password_changed_notification.html';
   writeFileSync(join(dir,template),payload.files.get(template));
   writeFileSync(join(dir,'supabase/.temp/project-ref'),PROJECT);
   const connection=join(dir,'supabase/.temp/pooler-url');
   const expected=`postgresql://postgres.${PROJECT}@synthetic.pooler.supabase.com:5432/postgres`;
   writeFileSync(connection,expected);
   writeFileSync(join(dir,'storage-release.json'),JSON.stringify({project:PROJECT,version:r.version,payload:PAYLOAD,files:names}));
   assert.equal(verifyStorageWorkdir(repo,r.version,dir),true);
   for(const url of [expected.replace(PROJECT,'wrong'),expected.replace('@',':synthetic-password@'),expected+'?host=wrong']){
    writeFileSync(connection,url);assert.throws(()=>verifyStorageWorkdir(repo,r.version,dir),/linked_connection_project/);
   }
   writeFileSync(connection,expected);
   const migration=join(dir,'supabase/migrations',r.filename),bytes=readFileSync(migration);
   writeFileSync(migration,'changed');assert.throws(()=>verifyStorageWorkdir(repo,r.version,dir),/staged_bytes/);writeFileSync(migration,bytes);
   writeFileSync(join(dir,template),'changed');assert.throws(()=>verifyStorageWorkdir(repo,r.version,dir),/template_bytes/);
  }finally{
   assert.equal(dirname(realpathSync(dir)),realpathSync(base));rmSync(dir,{recursive:true,force:true});
  }
 }
});
