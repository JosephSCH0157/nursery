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

# Advance the established migration-425 certifier through the immutable
# migration-427 Hammer renewal and then to this migration-428 successor.
$source=Replace-Exact $source "`$targetMigration='20261029172356'" "`$targetMigration='20261031123320'" 'target version'
$source=Replace-Exact $source "`$targetMigrationFile='20261029172356_hammer_owner_funded_first_transcription.sql'" "`$targetMigrationFile='20261031123320_forge_beta_admission_foundation.sql'" 'target file'
$source=Replace-Exact $source '$predecessorHistoryRows=424' '$predecessorHistoryRows=427' 'predecessor row count'
$source=Replace-Exact $source '$successorHistoryRows=425' '$successorHistoryRows=428' 'successor row count'
$source=Replace-Exact $source "'20261029154824')" "'20261029154824','20261029172356','20261030090719','20261030224605')" 'predecessor pending list'
$source=Replace-Exact $source "docs/database/baseline/v1-hammer-owner-funded-first-transcription/successor-catalog-fingerprint.json" "docs/database/baseline/v1-account-admission-authority/successor-catalog-fingerprint.json" 'catalog path'
$source=Replace-Exact $source "'9452f6e722d60c8e440cd432655305156534a09b293d5a37060a105d794a6488'" "'17409cfb561112cb9889758019b16f1e961c56d356abab7bcba957111feb483f'" 'migration hash' 2
$source=Replace-Exact $source "'supabase/tests/hammer_owner_funded_first_transcription_contract.sql'))" "'supabase/tests/hammer_owner_funded_first_transcription_contract.sql','supabase/tests/hammer_owner_sponsorship_reservation_compatibility_contract.sql','supabase/tests/hammer_owner_sponsorship_authority_renewal_contract.sql','supabase/tests/account_admission_authority.sql'))" 'database contract test list'
$source=Replace-Exact $source "(Join-Path `$repo 'packages/tongs/tests/hammer-brad-first-transcription-authority-bundle.test.mjs')" "(Join-Path `$repo 'packages/tongs/tests/hammer-brad-first-transcription-authority-bundle.test.mjs') (Join-Path `$repo 'packages/tongs/tests/hammer-owner-sponsorship-authority-renewal.test.mjs')" 'migration contract test list'
$source=Replace-Exact $source 'Hammer owner-funded first-transcription migration' 'Forge account-admission authority migration' 'migration label' 3
$source=Replace-Exact $source 'hammer-owner-funded-first-transcription' 'account-admission-authority' 'result label' 4

$scriptsLiteral=$PSScriptRoot.Replace("'","''")
$source=$source.Replace('$PSScriptRoot',"'$scriptsLiteral'")
$temporaryPath=Join-Path ([IO.Path]::GetTempPath()) ('forge-account-admission-428-'+[guid]::NewGuid().ToString('N')+'.ps1')
try{
  [IO.File]::WriteAllText($temporaryPath,$source,[Text.UTF8Encoding]::new($false))
  $arguments=@('-NoProfile','-File',$temporaryPath,'-RepositoryRoot',$repo)
  if($CliPreflightOnly){$arguments+='-CliPreflightOnly'}
  if($MaterializeSuccessorCatalog){$arguments+='-MaterializeSuccessorCatalog'}
  & pwsh @arguments
  if($LASTEXITCODE -ne 0){throw 'Migration 428 historical successor certification failed.'}
} finally {
  if(Test-Path -LiteralPath $temporaryPath){Remove-Item -LiteralPath $temporaryPath -Force}
}
