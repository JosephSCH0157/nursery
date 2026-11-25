import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

test('actual v3 adapter and B1 capture pin catalog context while legacy query stays unchanged',()=>{
 const script=String.raw`
$ErrorActionPreference='Stop'
$repo=$env:FORGE_OFFLINE_TEST_ROOT
function Extract([string]$File,[string]$Name){
 $t=$null;$e=$null;$ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $repo $File),[ref]$t,[ref]$e)
 if($e){throw 'Parse failure'}
 $fn=$ast.Find({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $Name},$true)
 $fn.Extent.Text
}
. ([scriptblock]::Create((Extract 'scripts/storage-authentic-db-adapter.ps1' 'Query')))
function Invoke-ForgeSupabaseCli {param($Arguments) $script:sent=$Arguments[-1];[pscustomobject]@{StandardOutput='fixture'}}
function ConvertFrom-ForgeSupabaseCsv {param($StandardOutput,$ExpectedColumns,$Context) @()}
$Action='Catalog';$logical=$true;$intervention=$true;$Workdir='SYNTHETIC_ONLY'
Query 'SELECT 1' @('one')
if($script:sent -notmatch 'set local search_path=pg_catalog;' -or $script:sent -notmatch 'read only'){throw 'v3 adapter context'}
foreach($logical in @($false,$true)){$intervention=$false;Query 'SELECT 1' @('one');if($script:sent -match 'search_path'){throw 'legacy context changed'}}
. ([scriptblock]::Create((Extract 'scripts/certify-storage-full-tail-baseline-stage.ps1' 'CaptureFinalCatalog')))
$IncludeConvergence=$true;$helper=Join-Path $repo 'scripts/lib/forge-storage-full-tail.mjs';$Lane='synthetic'
$EvidenceDirectory=Join-Path ([IO.Path]::GetTempPath()) ('forge-catalog-context-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $EvidenceDirectory|Out-Null
function Sql([string]$Text){
 if($Text -notmatch 'SET LOCAL search_path=pg_catalog;' -or $Text -notmatch 'REPEATABLE READ READ ONLY' -or $Text -notmatch "'base64'"){throw 'B1 context or byte transport'}
 $rows=@(1..4|ForEach-Object{@{category='fixture';identity="object$_";canonical='snowman ☃'}})|ConvertTo-Json -Compress
 [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($rows))
}
try{
 $path=Join-Path $EvidenceDirectory 'catalog.json';CaptureFinalCatalog $path
 $c=Get-Content $path -Raw|ConvertFrom-Json
 if($c.objectCount -ne 4 -or $c.schema -cne 'forge.canonical-baseline-application-catalog-fingerprint.v1'){throw 'B1 catalog shape'}
 'PASS catalog context'
}finally{
 $resolved=[IO.Path]::GetFullPath($EvidenceDirectory)
 if(-not $resolved.StartsWith([IO.Path]::GetFullPath([IO.Path]::GetTempPath())) -or (Split-Path $resolved -Leaf) -notlike 'forge-catalog-context-*'){throw 'Cleanup scope'}
 Remove-Item -LiteralPath $resolved -Recurse -Force
}
`;
 const output=execFileSync('pwsh',['-NoProfile','-Command',script],{encoding:'utf8',timeout:30000,env:{...process.env,FORGE_OFFLINE_TEST_ROOT:process.cwd()}});
 assert.match(output,/PASS catalog context/);
});

for(const stage of [447,448])test('actual B1 Apply function enforces the exact '+stage+' dry-run and installed prefix without database access', () => {
  let script = String.raw`
$ErrorActionPreference='Stop'
$repo=$env:FORGE_OFFLINE_TEST_ROOT
$tokens=$null;$errors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $repo 'scripts/certify-storage-full-tail-baseline-stage.ps1'),[ref]$tokens,[ref]$errors)
if($errors){throw 'Parser errors'}
$function=$ast.Find({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Apply'},$true)
. ([scriptblock]::Create($function.Extent.Text))
$contract=Get-Content (Join-Path $repo 'docs/database/certification/storage-full-tail-446.json') -Raw|ConvertFrom-Json
$admission=Get-Content (Join-Path $repo 'docs/database/certification/storage-admission-447.json') -Raw|ConvertFrom-Json
$contract.migrations=@($contract.migrations)+@($admission.migration)
$EvidenceDirectory=Join-Path ([IO.Path]::GetTempPath()) ('forge-offline-447-apply-'+[guid]::NewGuid().ToString('N'))
$Workdir=$EvidenceDirectory;$Lane='synthetic-only'
New-Item -ItemType Directory -Path $EvidenceDirectory | Out-Null
$script:pushes=0;$script:mode='good'
function supabase {
 $global:LASTEXITCODE=0
 if(($args -join ' ') -match '^db push --local --dry-run'){
  if($script:mode -eq 'extra-pending'){'20261113214832'}
  '20261120161347'
 }elseif(($args -join ' ') -match '^migration up --local'){
  $script:pushes++
  if($script:mode -eq 'apply-failure'){$global:LASTEXITCODE=1}
 }else{throw 'Unexpected CLI command'}
}
function Sql([string]$Text){
 if($Text -match 'string_agg'){
  if($script:mode -eq 'wrong-prefix'){return '20261120161347'}
  return ((@('20261021020814')+@($contract.migrations|Where-Object version -ge '20261022000000'|ForEach-Object version)) -join ',')
 }
 if($Text -match 'forge_meta.database_lineage'){
  if($script:mode -eq 'wrong-lineage'){return 'historical-v1'}
  return 'baseline-v1'
 }
 throw 'Unexpected SQL'
}
try{
 Apply '20261113214832' '20261120161347'
 if($script:pushes -ne 1){throw 'Expected one simulated application'}
 foreach($case in @('extra-pending','apply-failure','wrong-prefix','wrong-lineage')){
  $script:mode=$case;$before=$script:pushes;$failed=$false
  try{Apply '20261113214832' '20261120161347'}catch{$failed=$true}
  if(-not $failed){throw "Accepted $case"}
  if($case -eq 'extra-pending' -and $script:pushes -ne $before){throw 'Applied unexpected pending set'}
 }
 'PASS synthetic B1 447 Apply guards'
}finally{
 $resolved=[IO.Path]::GetFullPath($EvidenceDirectory)
 if(-not $resolved.StartsWith([IO.Path]::GetFullPath([IO.Path]::GetTempPath())) -or (Split-Path $resolved -Leaf) -notlike 'forge-offline-447-apply-*'){throw 'Cleanup scope'}
 Remove-Item -LiteralPath $resolved -Recurse -Force
}
`;
  if(stage===448)script=script.replaceAll('20261113214832','20261120161347').replace(/'20261120161347'\r?\n }elseif/,"'20261125023622'\n }elseif");
  if(stage===448){script=script.replaceAll("Apply '20261120161347' '20261120161347'","Apply '20261120161347' '20261125023622'").replace("$contract.migrations=@($contract.migrations)+@($admission.migration)","$convergence=Get-Content (Join-Path $repo 'docs/database/certification/quench-acl-convergence-448.json') -Raw|ConvertFrom-Json\n$contract.migrations=@($contract.migrations)+@($admission.migration)+@($convergence.migration)");}
  const output = execFileSync('pwsh', ['-NoProfile', '-Command', script], {
    encoding: 'utf8', timeout: 30000, env: {...process.env, FORGE_OFFLINE_TEST_ROOT: process.cwd()},
  });
  assert.match(output, /PASS synthetic B1 447 Apply guards/);
});

for(const action of ['Apply447','Apply448'])test(action+' database adapter rejects the production target before reading approval or credentials', () => {
  assert.throws(() => execFileSync('pwsh', ['-NoProfile', '-File', 'scripts/storage-authentic-db-adapter.ps1',
    '-Lineage', 'historical', '-Action', action, '-TargetProject', 'wtvdjndyxegudufrompx',
    '-Workdir', 'not-a-workdir', '-ApprovalPath', 'not-an-approval', '-ApprovalSha256', 'a'.repeat(64)],
  {encoding: 'utf8', timeout: 30000, stdio: 'pipe'}), /Production target forbidden/);
});
