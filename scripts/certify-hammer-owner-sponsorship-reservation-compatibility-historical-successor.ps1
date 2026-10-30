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

$source=Replace-Exact $source "`$targetMigration='20261029172356'" "`$targetMigration='20261030090719'" 'target version'
$source=Replace-Exact $source "`$targetMigrationFile='20261029172356_hammer_owner_funded_first_transcription.sql'" "`$targetMigrationFile='20261030090719_hammer_owner_sponsorship_reservation_compatibility.sql'" 'target file'
$source=Replace-Exact $source '$predecessorHistoryRows=424' '$predecessorHistoryRows=425' 'predecessor row count'
$source=Replace-Exact $source '$successorHistoryRows=425' '$successorHistoryRows=426' 'successor row count'
$source=Replace-Exact $source "'20261029154824')" "'20261029154824','20261029172356')" 'predecessor pending list'
$source=Replace-Exact $source "docs/database/baseline/v1-hammer-owner-funded-first-transcription/successor-catalog-fingerprint.json" "docs/database/baseline/v1-hammer-owner-sponsorship-reservation-compatibility/successor-catalog-fingerprint.json" 'catalog path'
$source=Replace-Exact $source "'9452f6e722d60c8e440cd432655305156534a09b293d5a37060a105d794a6488'" "'de27e8ff38279fdb6c9d33cb45a4cd53d6e5189427fb6aab81ebfd120226b27c'" 'migration hash' 2
$source=Replace-Exact $source "'supabase/tests/hammer_owner_funded_first_transcription_contract.sql'))" "'supabase/tests/hammer_owner_funded_first_transcription_contract.sql','supabase/tests/hammer_owner_sponsorship_reservation_compatibility_contract.sql'))" 'database contract test list'

$scriptsLiteral=$PSScriptRoot.Replace("'","''")
$source=$source.Replace('$PSScriptRoot',"'$scriptsLiteral'")
$temporaryPath=Join-Path ([IO.Path]::GetTempPath()) ('forge-hammer-owner-sponsorship-426-'+[guid]::NewGuid().ToString('N')+'.ps1')
try{
  [IO.File]::WriteAllText($temporaryPath,$source,[Text.UTF8Encoding]::new($false))
  $arguments=@('-NoProfile','-File',$temporaryPath,'-RepositoryRoot',$repo)
  if($CliPreflightOnly){$arguments+='-CliPreflightOnly'}
  if($MaterializeSuccessorCatalog){$arguments+='-MaterializeSuccessorCatalog'}
  & pwsh @arguments
  if($LASTEXITCODE -ne 0){throw 'Migration 426 historical successor certification failed.'}
} finally {
  if(Test-Path -LiteralPath $temporaryPath){Remove-Item -LiteralPath $temporaryPath -Force}
}
