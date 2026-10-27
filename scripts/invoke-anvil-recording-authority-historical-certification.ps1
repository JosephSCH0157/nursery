[CmdletBinding()]
param(
  [ValidateSet('ToolingPreflight','Authentic')][string]$Mode='ToolingPreflight',
  [ValidatePattern('^[a-z0-9]{20}$')][string]$ProjectRef,
  [string]$ScopeAttestationPath,
  [switch]$AuthorizeAuthenticHistoryTransfer,
  [string]$RepositoryRoot
)

$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath($(if($RepositoryRoot){$RepositoryRoot}else{Split-Path -Parent $PSScriptRoot}))
Import-Module (Join-Path $PSScriptRoot 'lib/ForgeGate5D.psm1') -Force
$capsuleDirectory=$null
$attestationDirectory=$null
$hostedRequestMade=$false
$completed=$false

function Get-NurseryInventory {
  [pscustomobject]@{
    containers=@(docker ps -a --filter 'label=com.supabase.cli.project=nursery' --format '{{.ID}}|{{.Names}}'|Sort-Object)
    volumes=@(docker volume ls --filter 'label=com.supabase.cli.project=nursery' --format '{{.Name}}'|Sort-Object)
    networks=@(docker network ls --filter 'label=com.supabase.cli.project=nursery' --format '{{.ID}}|{{.Name}}'|Sort-Object)
  }
}

function Test-SameInventory($Before,$After) {
  return (($Before.containers-join "`n") -ceq ($After.containers-join "`n") -and
          ($Before.volumes-join "`n") -ceq ($After.volumes-join "`n") -and
          ($Before.networks-join "`n") -ceq ($After.networks-join "`n"))
}

try {
  $cli=(& supabase --version 2>$null|Select-Object -First 1).Trim()
  if($cli -cne '2.84.2'){throw "Supabase CLI 2.84.2 is required; found $cli."}
  & docker info *> $null
  if($LASTEXITCODE -ne 0){throw 'Docker Desktop is unavailable. Start it manually.'}

  & (Join-Path $PSScriptRoot 'verify-historical-migration-manifest.ps1') -RepositoryRoot $repo|Out-Null
  & (Join-Path $PSScriptRoot 'verify-canonical-database-artifacts.ps1') -RepositoryRoot $repo|Out-Null
  & (Join-Path $PSScriptRoot 'verify-pre-slice-a-fixture.ps1') -RepositoryRoot $repo|Out-Null
  & (Join-Path $PSScriptRoot 'verify-database-documentation-contract.ps1') -RepositoryRoot $repo|Out-Null
  & (Join-Path $PSScriptRoot 'verify-forge-database-entrypoints.ps1') -RepositoryRoot $repo|Out-Null
  & (Join-Path $PSScriptRoot 'verify-gate5d-authentic-history-tooling.ps1') -RepositoryRoot $repo|Out-Null

  $protectedDiff=git -C $repo diff --name-only HEAD -- supabase/migrations database/canonical-baseline-v1 database/historical-pre-slice-a-v1 docs/database/baseline/v1-gate1/historical-migrations.sha256.json
  if($protectedDiff){throw 'Frozen database evidence differs from HEAD.'}
  $nurseryBefore=Get-NurseryInventory

  if($Mode -eq 'ToolingPreflight'){
    if($ProjectRef -or $ScopeAttestationPath -or $AuthorizeAuthenticHistoryTransfer){throw 'Authentic inputs are forbidden during tooling preflight.'}
    if(-not[string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable('FORGE_GATE5D_DATABASE_READ_TOKEN','Process'))){throw 'A real Gate 5D token must not be loaded during tooling preflight.'}
    $adapter=& (Join-Path $PSScriptRoot 'certify-anvil-recording-authority-historical-successor.ps1') -CliPreflightOnly -RepositoryRoot $repo|ConvertFrom-Json
    if(-not $adapter.ok -or $adapter.capsuleAccessed){throw 'Recording-authority successor tooling preflight failed.'}
    & node (Join-Path $PSScriptRoot 'test-anvil-recording-authority-historical-successor.mjs')|Out-Null
    if($LASTEXITCODE -ne 0){throw 'Recording-authority successor static tests failed.'}
  } else {
    if(-not $AuthorizeAuthenticHistoryTransfer){throw 'Authentic history transfer requires a separate explicit owner authorization switch.'}
    if(-not $ProjectRef -or -not $ScopeAttestationPath){throw 'Authentic history transfer requires the reviewed project and owner attestation.'}
    $attestationDirectory=Split-Path -Parent ([IO.Path]::GetFullPath($ScopeAttestationPath))
    $export=& (Join-Path $PSScriptRoot 'export-gate5d-authentic-history-read-only.ps1') -ProjectRef $ProjectRef -ScopeAttestationPath $ScopeAttestationPath -AuthorizeAuthenticExport -RepositoryRoot $repo|ConvertFrom-Json
    $hostedRequestMade=[bool]$export.hostedRequestMade
    if(-not $export.ok -or -not $hostedRequestMade -or $export.rowCount -ne 411){throw 'Authentic read-only export did not satisfy the frozen contract.'}
    $capsuleDirectory=[string]$export.capsuleDirectory
    $twoLane=& (Join-Path $PSScriptRoot 'certify-anvil-recording-authority-historical-successor.ps1') -ExternalCapsuleDirectory $capsuleDirectory -AuthorizeExternalAuthenticCapsule -RepositoryRoot $repo|ConvertFrom-Json
    if(-not $twoLane.ok -or -not $twoLane.authenticHistory -or $twoLane.successorHistoryRows -ne 419 -or @($twoLane.lanes).Count -ne 2){throw 'Recording-authority authentic two-lane certification failed.'}
  }

  $nurseryAfter=Get-NurseryInventory
  if(-not(Test-SameInventory $nurseryBefore $nurseryAfter)){throw 'Existing Nursery resources changed during Gate 5F certification.'}
  $completed=$true
  [pscustomobject]@{
    ok=$true;schema='forge.recording-authority-historical-coordinator-result.v1';mode=$Mode;cliVersion=$cli
    hostedRequestMade=$hostedRequestMade;confidentialDataReturned=$false
    nurseryResourcesUnchanged=$true;adapter=$(if($Mode -eq 'ToolingPreflight'){$adapter}else{$null});twoLane=$twoLane
  }|ConvertTo-Json -Depth 14 -Compress
}
catch {
  if($_.Exception.Message -match 'token|authorization|attestation|credential|export|response|payload|capsule|history|migration|catalog|lineage|cleanup|Nursery|Docker|Supabase CLI|frozen|contract|Stage A|two-lane') { throw }
  throw 'Recording-authority historical certification failed; confidential details are suppressed.'
}
finally {
  [Environment]::SetEnvironmentVariable('FORGE_GATE5D_DATABASE_READ_TOKEN',$null,'Process')
  if($capsuleDirectory -and (Test-Path -LiteralPath $capsuleDirectory)){Remove-ForgeGate5DCapsule -Directory $capsuleDirectory}
  if($attestationDirectory -and (Test-Path -LiteralPath $attestationDirectory)){
    $full=[IO.Path]::GetFullPath($attestationDirectory);$temp=[IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    if(-not $full.StartsWith($temp,[StringComparison]::OrdinalIgnoreCase) -or (Split-Path -Leaf $full) -notlike 'forge-gate5d-attestation-*'){
      throw 'Refusing unsafe Gate 5F attestation cleanup target.'
    }
    Remove-ForgeGate5DCapsule -Directory $full
  }
  $capsuleDirectory=$null;$ScopeAttestationPath=$null
}
