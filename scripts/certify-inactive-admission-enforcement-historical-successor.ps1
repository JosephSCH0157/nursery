[CmdletBinding()]
param(
  [string]$RepositoryRoot = (Split-Path -Parent $PSScriptRoot),
  [switch]$CliPreflightOnly,
  [switch]$MaterializeSuccessorCatalog
)

$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath($RepositoryRoot)
$sourcePath=Join-Path $PSScriptRoot 'certify-hammer-owner-funded-first-transcription-historical-successor.ps1'
$source=Get-Content -LiteralPath $sourcePath -Raw

function Replace-Exact([string]$Text,[string]$Old,[string]$New,[string]$Label,[int]$ExpectedCount=1){
  $count=([regex]::Matches($Text,[regex]::Escape($Old))).Count
  if($count -ne $ExpectedCount){throw "Expected $ExpectedCount $Label predecessor contract marker(s); found $count."}
  return $Text.Replace($Old,$New)
}

$source=Replace-Exact $source "`$targetMigration='20261029172356'" "`$targetMigration='20261101201817'" 'target version'
$source=Replace-Exact $source "`$targetMigrationFile='20261029172356_hammer_owner_funded_first_transcription.sql'" "`$targetMigrationFile='20261101201817_forge_inactive_admission_enforcement.sql'" 'target file'
$source=Replace-Exact $source '$predecessorHistoryRows=424' '$predecessorHistoryRows=429' 'predecessor row count'
$source=Replace-Exact $source '$successorHistoryRows=425' '$successorHistoryRows=430' 'successor row count'
$source=Replace-Exact $source "'20261029154824')" "'20261029154824','20261029172356','20261030090719','20261030224605','20261031123320','20261101084703')" 'predecessor pending list'
$source=Replace-Exact $source 'docs/database/baseline/v1-hammer-owner-funded-first-transcription/successor-catalog-fingerprint.json' 'docs/database/baseline/v1-inactive-admission-enforcement/successor-catalog-fingerprint.json' 'catalog path'
$source=Replace-Exact $source "'9452f6e722d60c8e440cd432655305156534a09b293d5a37060a105d794a6488'" "'ed35a3138ba4b15f63a50b5b8e8624ad45dcb9fdd2a6a9d990d52db42017c1bb'" 'migration hash' 2
$source=Replace-Exact $source "'supabase/tests/hammer_owner_funded_first_transcription_contract.sql'))" "'supabase/tests/hammer_owner_funded_first_transcription_contract.sql','supabase/tests/hammer_owner_sponsorship_reservation_compatibility_contract.sql','supabase/tests/hammer_owner_sponsorship_authority_renewal_contract.sql','supabase/tests/account_admission_authority.sql','supabase/tests/beta_invitation_provisioning.sql','supabase/tests/account_admission_enforcement_inactive.sql'))" 'database contract test list'
$source=Replace-Exact $source "(Join-Path `$repo 'packages/tongs/tests/hammer-brad-first-transcription-authority-bundle.test.mjs')" "(Join-Path `$repo 'packages/tongs/tests/hammer-brad-first-transcription-authority-bundle.test.mjs') (Join-Path `$repo 'packages/tongs/tests/hammer-owner-sponsorship-authority-renewal.test.mjs') (Join-Path `$repo 'packages/tongs/tests/inactive-admission-enforcement-migration-contract.test.mjs')" 'migration contract test list'
$parityPredecessor="Invoke-PsqlFile `$container (Join-Path `$repo 'supabase/tests/public_slice_a_catalog_parity.sql')"
$paritySuccessor=@'
$successorParityPath=Join-Path $workdir 'inactive-admission-enforcement-public-slice-a-catalog-parity.sql'
& (Join-Path $repo 'scripts/new-beta-invitation-public-slice-a-parity.ps1') -OutputPath $successorParityPath -RepositoryRoot $repo | Out-Null
Invoke-PsqlFile $container $successorParityPath
'@
$source=Replace-Exact $source $parityPredecessor $paritySuccessor.Trim() 'public Slice A successor parity invocation'
$source=Replace-Exact $source 'Hammer owner-funded first-transcription migration' 'Forge inactive admission-enforcement migration' 'migration label' 3
$source=Replace-Exact $source 'hammer-owner-funded-first-transcription' 'inactive-admission-enforcement' 'result label' 4

$scriptsLiteral=$PSScriptRoot.Replace("'","''")
$source=$source.Replace('$PSScriptRoot',"'$scriptsLiteral'")
$temporaryPath=Join-Path ([IO.Path]::GetTempPath()) ('forge-inactive-admission-enforcement-430-'+[guid]::NewGuid().ToString('N')+'.ps1')
try{
  [IO.File]::WriteAllText($temporaryPath,$source,[Text.UTF8Encoding]::new($false))
  $arguments=@('-NoProfile','-File',$temporaryPath,'-RepositoryRoot',$repo)
  if($CliPreflightOnly){$arguments+='-CliPreflightOnly'}
  if($MaterializeSuccessorCatalog){$arguments+='-MaterializeSuccessorCatalog'}
  & pwsh @arguments
  if($LASTEXITCODE -ne 0){throw 'Inactive admission-enforcement historical successor certification failed.'}
} finally {
  if(Test-Path -LiteralPath $temporaryPath){Remove-Item -LiteralPath $temporaryPath -Force}
}
