[CmdletBinding()]
param(
  [switch]$ResumeCertifiedBase,
  [switch]$SkipLinkedFingerprint,
  [switch]$CertifyHearthHistoricalBoundaryOnly,
  [switch]$CertifyOwnerAuthorityBoundaryOnly,
  [string]$SupabaseWorkdir,
  [string]$ProjectId = 'nursery'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$projectWorkdir = if ([string]::IsNullOrWhiteSpace($SupabaseWorkdir)) {
  $repoRoot
} else {
  [System.IO.Path]::GetFullPath((Join-Path $repoRoot $SupabaseWorkdir))
}
if (-not $projectWorkdir.StartsWith($repoRoot,[System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Supabase workdir must remain inside the canonical repository.'
}
$sourceMigrationsDir = [System.IO.Path]::GetFullPath((Join-Path $repoRoot 'supabase/migrations'))
$migrationsDir = [System.IO.Path]::GetFullPath((Join-Path $projectWorkdir 'supabase/migrations'))
$fixturePath = Join-Path $repoRoot 'supabase/tests/fixtures/mid_september_historical_preconditions.sql'
$generatedIdentityFixturePath = Join-Path $repoRoot 'supabase/tests/fixtures/mid_september_historical_generated_identity.sql'
$realizedLossFixturePath = Join-Path $repoRoot 'supabase/tests/fixtures/mid_september_historical_realized_loss_events.sql'
$realizedLossCleanupPath = Join-Path $repoRoot 'supabase/tests/fixtures/mid_september_historical_realized_loss_cleanup.sql'
$customerCanaryFixturePath = Join-Path $repoRoot 'supabase/tests/fixtures/mid_september_historical_customer_canary_authority.sql'
$certificationPath = Join-Path $repoRoot 'supabase/tests/mid_september_migration_replay_certification.sql'
$framingCertificationPath = Join-Path $repoRoot 'supabase/tests/hearth_framing_pack_generation.sql'
$visualPlanCertificationPath = Join-Path $repoRoot 'supabase/tests/visual_unified_plan_test_product.sql'
$thumbnailDirectionCertificationPath = Join-Path $repoRoot 'supabase/tests/hearth_thumbnail_direction_generation.sql'
$hearthHistoricalFixturePath = Join-Path $repoRoot 'supabase/tests/fixtures/post_20261011860000_hearth_historical_domain_prerequisites.sql'
$hearthHistoricalCertificationPath = Join-Path $repoRoot 'supabase/tests/hearth_remaining_owner_authority.sql'
$ownerPrincipalFixturePath = Join-Path $repoRoot 'supabase/tests/fixtures/post_20261011930000_owner_principal_prerequisite.sql'
$accountAuthorityCertificationPath = Join-Path $repoRoot 'supabase/tests/account_authority_classifications.sql'
$transitionOwnerAuthorityCertificationPath = Join-Path $repoRoot 'supabase/tests/transition_owner_authority.sql'
$exclusionManifestPath = Join-Path $repoRoot 'supabase/tests/fixtures/mid_september_replay_exclusions.json'
$historicalFundingSelectorSourcePath = Join-Path $sourceMigrationsDir '20261011140000_tongs_unified_financial_environment.sql'
$historicalFundingSelectorSourceSha256 = '4334055af650823d1aa2a5df928f4bc80b208f29f77e1dfe0e96e42f8e77b052'
$historicalReconciliationSourcePath = Join-Path $sourceMigrationsDir '20261003120000_tongs_openai_cost_reconciliation_connection.sql'
$historicalReconciliationSourceSha256 = '9c07e382772c3e2b9ee63b14a677496b1ee07d08022c02a9672a42cc0c16e0ea'
$historicalReconciliationSourceLength = 47053
$historicalReconciliationSourceLfCount = 549

$heldMigrationNames = @(
  '20260916110806_tongs_forge_credit_economy.sql',
  '20260916113132_tongs_standard_customer_luna_catalog.sql',
  '20260916113500_tongs_settled_customer_price_quote.sql',
  '20260916113753_tongs_standard_customer_aggregate_admission.sql',
  '20260916114619_tongs_standard_customer_certification_aggregate.sql',
  '20260916114739_tongs_standard_customer_certification_scope_price.sql',
  '20260916114943_tongs_aggregate_financial_environment_selection.sql',
  '20260916115105_tongs_deposit_fee_allocation_catchup.sql',
  '20260916130700_tongs_standard_customer_rollout.sql',
  '20260916130706_tongs_beta_credit_controls.sql',
  '20260916130712_tongs_credit_pack_purchase_availability.sql',
  '20260916131208_tongs_internal_quote_credit_units.sql',
  '20260916131632_tongs_normal_customer_provider_authority.sql',
  '20260916132017_tongs_credit_pack_availability_caller_role.sql',
  '20260916154851_standard_customer_hearth_research.sql',
  '20260916160541_standard_customer_hearth_research_failure_loss.sql',
  '20260916161021_standard_customer_hearth_research_full_failure_exposure.sql',
  '20260916162248_customer_operation_relief_balance_restoration.sql',
  '20260916180205_tongs_existing_openai_funding_handle_environment.sql',
  '20260916181807_settled_openai_replay_relief_safety.sql',
  '20260916184248_customer_operation_relief_corrections.sql',
  '20260916184526_customer_operation_relief_canonical_binding_evidence.sql',
  '20260916195559_openai_failure_loss_environment_isolation.sql',
  '20260916202804_operator_controlled_openai_failure_loss.sql',
  '20260917012316_openai_realized_loss_corrections.sql',
  '20260917012424_hearth_script_generation_test_canary.sql',
  '20260917012533_hearth_script_canary_private_table_hardening.sql',
  '20260917024621_hearth_script_paid_result_persistence_boundary.sql',
  '20260917094105_hearth_script_proposal_lifecycle.sql',
  '20260917095336_hearth_script_proposal_legacy_supersession.sql',
  '20260917225047_tongs_hearth_creator_readiness_authority.sql',
  '20260918055813_hearth_optional_review_persistence.sql',
  '20261011460000_reassert_settled_customer_price_quote.sql',
  '20261011470000_reassert_standard_customer_aggregate_admission.sql'
)
$newForwardMigrationNames = @(
  '20261011480000_hearth_title_generation_test_product.sql',
  '20261011490000_hearth_title_generation_episode_titles_v2.sql',
  '20261011500000_hearth_tag_generation_test_product.sql',
  '20261011510000_hearth_tag_validation_evidence_v2.sql',
  '20261011520000_hearth_framing_pack_generation_test_product.sql',
  '20261011530000_visual_unified_plan_test_product.sql',
  '20261011540000_visual_unified_plan_canary_repair.sql',
  '20261011550000_visual_unified_plan_v5_compatibility_authority.sql',
  '20261011560000_visual_unified_plan_v5_canary_risk_authorization.sql',
  '20261011570000_visual_unified_plan_transport_lease_recovery.sql',
  '20261011580000_visual_plan_submission_unknown_concurrency_repair.sql',
  '20261011590000_visual_plan_submission_unknown_paid_scope_concurrency_repair.sql',
  '20261011600000_visual_plan_reference_visual_state_repair.sql',
  '20261011610000_visual_plan_reconciliation_replay_path_repair.sql',
  '20261011620000_hearth_thumbnail_direction_generation_test_product.sql'
)
$allHeldMigrationNames = @($heldMigrationNames) + @($newForwardMigrationNames)
# Later forward migrations are held too so the reset stops at the certified base, then replay after the restored slice.
$lastManifestMigrationName = $newForwardMigrationNames[-1]
$trailingForwardMigrationNames = @(
  Get-ChildItem -LiteralPath $sourceMigrationsDir -Filter '*.sql' -File |
    Where-Object { [string]::CompareOrdinal($_.Name, $lastManifestMigrationName) -gt 0 } |
    Sort-Object Name |
    ForEach-Object Name
)
$stagedMigrationNames = @($allHeldMigrationNames) + @($trailingForwardMigrationNames)
$postCheckpointBoundaryName = '20261011710000_reference_visual_source_transition_authority_reassert.sql'
$trailingThroughCheckpointNames = @($trailingForwardMigrationNames | Where-Object { [string]::CompareOrdinal($_, $postCheckpointBoundaryName) -le 0 })
$trailingAfterCheckpointNames = @($trailingForwardMigrationNames | Where-Object { [string]::CompareOrdinal($_, $postCheckpointBoundaryName) -gt 0 })
$postCheckpointFixturePath = Join-Path $repoRoot 'supabase/tests/fixtures/post_checkpoint_paid_execution_prerequisites.sql'
$coordinatedCutoverFixturePath = Join-Path $repoRoot 'supabase/tests/fixtures/post_20261011470000_coordinated_cutover_rollout_prerequisites.sql'
$coordinatedCutoverFixtureBoundaryName = '20261011470000_reassert_standard_customer_aggregate_admission.sql'
$hearthHistoricalFixtureBoundaryName = '20261011860000_owner_hearth_result_fingerprint_authority_fix.sql'
$hearthHistoricalMigrationName = '20261011870000_grandfather_historical_hearth_authority.sql'
$ownerAuthorityFixtureBoundaryName = '20261011930000_credential_lifecycle_activation_ordering.sql'
$canonicalOwnerAuthorityMigrationName = '20261011940000_canonical_account_owner_authority.sql'
$transitionOwnerAuthorityBoundaryName = '20261011960000_transition_owner_authority_service_role_gate.sql'
$ownerPersistenceBoundaryName = '20261011980000_owner_unified_visual_plan_captured_failure_recovery.sql'
$trailingThroughHearthFixtureBoundaryNames = @($trailingAfterCheckpointNames | Where-Object { [string]::CompareOrdinal($_, $hearthHistoricalFixtureBoundaryName) -le 0 })
$trailingThroughOwnerAuthorityBoundaryNames = @($trailingAfterCheckpointNames | Where-Object {
  [string]::CompareOrdinal($_, $hearthHistoricalMigrationName) -gt 0 -and
  [string]::CompareOrdinal($_, $ownerAuthorityFixtureBoundaryName) -le 0
})
$trailingAfterOwnerAuthorityBoundaryNames = @($trailingAfterCheckpointNames | Where-Object { [string]::CompareOrdinal($_, $ownerAuthorityFixtureBoundaryName) -gt 0 })
$canonicalOwnerAuthorityMigrationNames = @($trailingAfterOwnerAuthorityBoundaryNames | Where-Object { [string]::CompareOrdinal($_, $canonicalOwnerAuthorityMigrationName) -le 0 })
$transitionOwnerAuthorityMigrationNames = @($trailingAfterOwnerAuthorityBoundaryNames | Where-Object {
  [string]::CompareOrdinal($_, $canonicalOwnerAuthorityMigrationName) -gt 0 -and
  [string]::CompareOrdinal($_, $transitionOwnerAuthorityBoundaryName) -le 0
})
$ownerPersistenceMigrationNames = @($trailingAfterOwnerAuthorityBoundaryNames | Where-Object {
  [string]::CompareOrdinal($_, $transitionOwnerAuthorityBoundaryName) -gt 0 -and
  [string]::CompareOrdinal($_, $ownerPersistenceBoundaryName) -le 0
})
$trailingAfterOwnerPersistenceBoundaryNames = @($trailingAfterOwnerAuthorityBoundaryNames | Where-Object { [string]::CompareOrdinal($_, $ownerPersistenceBoundaryName) -gt 0 })

function Invoke-CheckedCommand {
  param(
    [Parameter(Mandatory=$true)][string]$Program,
    [Parameter(Mandatory=$true)][string[]]$Arguments
  )
  & $Program @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Program failed with exit code $LASTEXITCODE"
  }
}

function Test-DisposableReplayTargetIdentity {
  param(
    [Parameter(Mandatory=$true)][string]$DatabaseScheme,
    [Parameter(Mandatory=$true)][string]$DatabaseHost,
    [Parameter(Mandatory=$true)][string]$ContainerName,
    [Parameter(Mandatory=$true)][string]$ExpectedContainerName,
    [Parameter(Mandatory=$true)][string]$ContainerProjectLabel,
    [Parameter(Mandatory=$true)][string]$ExpectedProjectId
  )
  return $DatabaseScheme -in @('postgres','postgresql') -and
    $DatabaseHost -in @('127.0.0.1','localhost','::1') -and
    $ContainerName -eq $ExpectedContainerName -and
    $ContainerProjectLabel -eq $ExpectedProjectId
}

function Invoke-SupabaseJsonQuery {
  param(
    [Parameter(Mandatory=$true)][ValidateSet('local','linked')][string]$Target,
    [Parameter(Mandatory=$true)][string]$Sql
  )
  $tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
  $queryPath = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempFileName())
  if (-not $queryPath.StartsWith($tempRoot,[System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'Temporary query file escaped the operating-system temp directory.'
  }
  try {
    [System.IO.File]::WriteAllText(
      $queryPath,
      $Sql,
      [System.Text.UTF8Encoding]::new($false)
    )
    $arguments = @('supabase','db','query',"--$Target",'--output','json','--file',$queryPath,'--workdir',$projectWorkdir)
    $raw = (& npx @arguments) -join "`n"
    if ($LASTEXITCODE -ne 0) {
      throw "Supabase $Target query failed"
    }
    return ($raw | ConvertFrom-Json)
  }
  finally {
    if (Test-Path -LiteralPath $queryPath -PathType Leaf) {
      Remove-Item -LiteralPath $queryPath
    }
  }
}

function Invoke-LocalPsqlScript {
  param(
    [Parameter(Mandatory=$true)][string]$Path,
    [Parameter(Mandatory=$true)][string]$DatabaseContainer
  )
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Local SQL script is missing: $Path"
  }
  Get-Content -LiteralPath $Path -Raw |
    & docker exec -i $DatabaseContainer psql --no-psqlrc --set ON_ERROR_STOP=1 --username postgres --dbname postgres
  if ($LASTEXITCODE -ne 0) {
    throw "Local psql execution failed with exit code $LASTEXITCODE"
  }
}

function Invoke-LocalPsqlScriptExpectFailure {
  param(
    [Parameter(Mandatory=$true)][string]$Path,
    [Parameter(Mandatory=$true)][string]$DatabaseContainer,
    [Parameter(Mandatory=$true)][string]$ExpectedMessage
  )
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Local SQL script is missing: $Path"
  }
  $output = @(
    Get-Content -LiteralPath $Path -Raw |
      & docker exec -i $DatabaseContainer psql --no-psqlrc --set ON_ERROR_STOP=1 --username postgres --dbname postgres 2>&1
  )
  $exitCode = $LASTEXITCODE
  if ($exitCode -eq 0 -or ($output -join "`n") -notlike "*$ExpectedMessage*") {
    throw "Local SQL negative check did not fail closed with the expected message (exit $exitCode)."
  }
}

function Assert-HistoricalFundingSelectorSourceBytes {
  if (-not (Test-Path -LiteralPath $historicalFundingSelectorSourcePath -PathType Leaf)) {
    throw "Historical funding-selector source is missing: $historicalFundingSelectorSourcePath"
  }
  $actualSha256 = (Get-FileHash -LiteralPath $historicalFundingSelectorSourcePath -Algorithm SHA256).Hash.ToLowerInvariant()
  $sourceText = [System.IO.File]::ReadAllText($historicalFundingSelectorSourcePath)
  $crlfCount = [regex]::Matches($sourceText,"`r`n").Count
  $bareLfCount = [regex]::Matches($sourceText,"(?<!`r)`n").Count
  $bareCrCount = [regex]::Matches($sourceText,"`r(?!`n)").Count
  if ($actualSha256 -ne $historicalFundingSelectorSourceSha256 -or
      $crlfCount -ne 0 -or $bareLfCount -ne 1595 -or $bareCrCount -ne 0) {
    throw "Historical funding-selector source bytes drifted; expected sha256=$historicalFundingSelectorSourceSha256 with LF-only newlines (1595 LF), actual sha256=$actualSha256, CRLF=$crlfCount, LF=$bareLfCount, CR=$bareCrCount. Restore the committed migration bytes before replay; normalization is intentionally not automatic."
  }
}

function Assert-HistoricalReconciliationSourceBytes {
  param(
    [Parameter(Mandatory=$true)][string]$Path
  )
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Historical reconciliation source is missing: $Path"
  }
  $sourceBytes = [System.IO.File]::ReadAllBytes($Path)
  $actualSha256 = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
  $sourceText = [System.Text.Encoding]::UTF8.GetString($sourceBytes)
  $crlfCount = [regex]::Matches($sourceText,"`r`n").Count
  $bareLfCount = [regex]::Matches($sourceText,"(?<!`r)`n").Count
  $bareCrCount = [regex]::Matches($sourceText,"`r(?!`n)").Count
  if ($actualSha256 -ne $historicalReconciliationSourceSha256 -or
      $sourceBytes.Length -ne $historicalReconciliationSourceLength -or
      $crlfCount -ne 0 -or
      $bareLfCount -ne $historicalReconciliationSourceLfCount -or
      $bareCrCount -ne 0) {
    throw "Historical reconciliation source bytes drifted; expected sha256=$historicalReconciliationSourceSha256, length=$historicalReconciliationSourceLength, LF=$historicalReconciliationSourceLfCount, CRLF=0, CR=0; actual sha256=$actualSha256, length=$($sourceBytes.Length), LF=$bareLfCount, CRLF=$crlfCount, CR=$bareCrCount. Restore the exact committed migration bytes before replay; normalization is intentionally not automatic."
  }
}

function Assert-HistoricalReconciliationNegativePreflight {
  param(
    [Parameter(Mandatory=$true)][string]$Path,
    [Parameter(Mandatory=$true)][string]$Label,
    [Parameter(Mandatory=$true)][string]$ExpectedMessage
  )
  try {
    Assert-HistoricalReconciliationSourceBytes -Path $Path
  }
  catch {
    if ($_.Exception.Message -like "*$ExpectedMessage*") {
      Write-Host "Historical reconciliation byte preflight rejected $Label as expected."
      return
    }
    throw
  }
  throw "Historical reconciliation byte preflight unexpectedly accepted $Label."
}

function Test-HistoricalReconciliationSourceNegativePreflights {
  $sourceBytes = [System.IO.File]::ReadAllBytes($historicalReconciliationSourcePath)
  $sourceText = [System.Text.Encoding]::UTF8.GetString($sourceBytes)
  $crlfPath = [System.IO.Path]::GetTempFileName()
  $mixedPath = [System.IO.Path]::GetTempFileName()
  $semanticPath = [System.IO.Path]::GetTempFileName()
  $missingPath = "$semanticPath.missing"
  try {
    [System.IO.File]::WriteAllText(
      $crlfPath,
      $sourceText.Replace("`n","`r`n"),
      [System.Text.UTF8Encoding]::new($false)
    )
    $firstLf = $sourceText.IndexOf("`n",[System.StringComparison]::Ordinal)
    if ($firstLf -lt 0) {
      throw 'Historical reconciliation source contains no LF for the mixed-newline negative proof.'
    }
    [System.IO.File]::WriteAllText(
      $mixedPath,
      $sourceText.Substring(0,$firstLf) + "`r`n" + $sourceText.Substring($firstLf + 1),
      [System.Text.UTF8Encoding]::new($false)
    )
    $semanticBytes = [byte[]]$sourceBytes.Clone()
    $semanticBytes[0] = if ($semanticBytes[0] -eq 98) { 99 } else { 98 }
    [System.IO.File]::WriteAllBytes($semanticPath,$semanticBytes)

    Assert-HistoricalReconciliationNegativePreflight -Path $crlfPath -Label 'CRLF-converted input' -ExpectedMessage 'Historical reconciliation source bytes drifted'
    Assert-HistoricalReconciliationNegativePreflight -Path $mixedPath -Label 'mixed-newline input' -ExpectedMessage 'Historical reconciliation source bytes drifted'
    Assert-HistoricalReconciliationNegativePreflight -Path $semanticPath -Label 'one-byte semantic mutation' -ExpectedMessage 'Historical reconciliation source bytes drifted'
    Assert-HistoricalReconciliationNegativePreflight -Path $missingPath -Label 'missing source input' -ExpectedMessage 'Historical reconciliation source is missing'
  }
  finally {
    foreach ($temporaryPath in @($crlfPath,$mixedPath,$semanticPath)) {
      if (Test-Path -LiteralPath $temporaryPath -PathType Leaf) {
        Remove-Item -LiteralPath $temporaryPath
      }
    }
  }
}

Push-Location $repoRoot
try {
  Assert-HistoricalReconciliationSourceBytes -Path $historicalReconciliationSourcePath
  Test-HistoricalReconciliationSourceNegativePreflights
  Assert-HistoricalFundingSelectorSourceBytes
  Invoke-CheckedCommand -Program 'docker' -Arguments @('info','--format','{{.ServerVersion}}') | Out-Null

  # CLI warnings about optional stopped services are written to stderr even
  # when the local database is healthy; they must not abort JSON status read.
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $statusRaw = (& npx supabase status -o json --workdir $projectWorkdir 2>$null) -join "`n"
  }
  finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  if ($LASTEXITCODE -ne 0) {
    throw 'The local Supabase stack is unavailable. Start it manually before running this certification.'
  }
  $status = $statusRaw | ConvertFrom-Json
  $databaseUri = [uri]$status.DB_URL
  $expectedDatabaseContainer = "supabase_db_$ProjectId"
  $databaseContainers = @(
    & docker ps --filter "label=com.supabase.cli.project=$ProjectId" --filter 'name=supabase_db_' --format '{{.Names}}'
  )
  if ($LASTEXITCODE -ne 0 -or $databaseContainers.Count -ne 1 -or
      $databaseContainers[0] -ne $expectedDatabaseContainer) {
    throw "Refusing historical fixture: expected exactly the disposable database container $expectedDatabaseContainer."
  }
  $databaseContainer = $databaseContainers[0]
  $containerProjectLabel = (& docker inspect --format '{{ index .Config.Labels "com.supabase.cli.project" }}' $databaseContainer) -join ''
  if ($LASTEXITCODE -ne 0 -or -not (Test-DisposableReplayTargetIdentity `
      -DatabaseScheme $databaseUri.Scheme `
      -DatabaseHost $databaseUri.Host `
      -ContainerName $databaseContainer `
      -ExpectedContainerName $expectedDatabaseContainer `
      -ContainerProjectLabel $containerProjectLabel `
      -ExpectedProjectId $ProjectId)) {
    throw "Refusing historical fixture: local database target identity is invalid (host=$($databaseUri.Host), container=$databaseContainer, project=$containerProjectLabel)."
  }
  $wrongHostAccepted = Test-DisposableReplayTargetIdentity `
    -DatabaseScheme $databaseUri.Scheme -DatabaseHost 'db.production.invalid' `
    -ContainerName $databaseContainer -ExpectedContainerName $expectedDatabaseContainer `
    -ContainerProjectLabel $containerProjectLabel -ExpectedProjectId $ProjectId
  $wrongContainerAccepted = Test-DisposableReplayTargetIdentity `
    -DatabaseScheme $databaseUri.Scheme -DatabaseHost $databaseUri.Host `
    -ContainerName 'supabase_db_wrong' -ExpectedContainerName $expectedDatabaseContainer `
    -ContainerProjectLabel $containerProjectLabel -ExpectedProjectId $ProjectId
  $wrongProjectAccepted = Test-DisposableReplayTargetIdentity `
    -DatabaseScheme $databaseUri.Scheme -DatabaseHost $databaseUri.Host `
    -ContainerName $databaseContainer -ExpectedContainerName $expectedDatabaseContainer `
    -ContainerProjectLabel 'wrong-project' -ExpectedProjectId $ProjectId
  if ($wrongHostAccepted -or $wrongContainerAccepted -or $wrongProjectAccepted) {
    throw 'Disposable replay target guard accepted a wrong host, container, or project identity.'
  }

  if (-not (Test-Path -LiteralPath $fixturePath -PathType Leaf) -or
      -not (Test-Path -LiteralPath $generatedIdentityFixturePath -PathType Leaf) -or
      -not (Test-Path -LiteralPath $realizedLossFixturePath -PathType Leaf) -or
      -not (Test-Path -LiteralPath $realizedLossCleanupPath -PathType Leaf) -or
      -not (Test-Path -LiteralPath $customerCanaryFixturePath -PathType Leaf) -or
      -not (Test-Path -LiteralPath $postCheckpointFixturePath -PathType Leaf) -or
      -not (Test-Path -LiteralPath $coordinatedCutoverFixturePath -PathType Leaf) -or
      -not (Test-Path -LiteralPath $hearthHistoricalFixturePath -PathType Leaf) -or
      -not (Test-Path -LiteralPath $hearthHistoricalCertificationPath -PathType Leaf) -or
      -not (Test-Path -LiteralPath $ownerPrincipalFixturePath -PathType Leaf) -or
      -not (Test-Path -LiteralPath $accountAuthorityCertificationPath -PathType Leaf) -or
      -not (Test-Path -LiteralPath $transitionOwnerAuthorityCertificationPath -PathType Leaf) -or
      -not (Test-Path -LiteralPath $certificationPath -PathType Leaf) -or
      -not (Test-Path -LiteralPath $framingCertificationPath -PathType Leaf) -or
      -not (Test-Path -LiteralPath $visualPlanCertificationPath -PathType Leaf) -or
      -not (Test-Path -LiteralPath $thumbnailDirectionCertificationPath -PathType Leaf) -or
      -not (Test-Path -LiteralPath $exclusionManifestPath -PathType Leaf)) {
    throw 'Historical fixture or certification SQL is missing.'
  }
  if ($heldMigrationNames.Count -ne 34 -or
      ($heldMigrationNames | Sort-Object -Unique).Count -ne 34 -or
      $newForwardMigrationNames.Count -ne 15 -or
      ($allHeldMigrationNames | Sort-Object -Unique).Count -ne 49) {
    throw 'Historical replay manifest must contain 34 historical and 15 forward migration files.'
  }
  $exclusionManifest = Get-Content -LiteralPath $exclusionManifestPath -Raw | ConvertFrom-Json
  $manifestMigrations = @($exclusionManifest.migrations)
  if ($exclusionManifest.schema -ne 'forge.local-migration-replay-exclusions.v1' -or
      (Compare-Object ($allHeldMigrationNames | Sort-Object) ($manifestMigrations | Sort-Object))) {
    throw 'Disposable exclusion manifest and phased replay manifest differ.'
  }

  $tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
  $holdDirectory = Join-Path $tempRoot ('forge-mid-september-replay-' + [guid]::NewGuid().ToString('N'))
  [void](New-Item -ItemType Directory -Path $holdDirectory)
  $holdDirectory = [System.IO.Path]::GetFullPath($holdDirectory)
  if (-not $holdDirectory.StartsWith($tempRoot,[System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'Temporary hold directory escaped the operating-system temp directory.'
  }

  try {
    foreach ($name in $stagedMigrationNames) {
      $source = [System.IO.Path]::GetFullPath((Join-Path $sourceMigrationsDir $name))
      $working = [System.IO.Path]::GetFullPath((Join-Path $migrationsDir $name))
      $destination = [System.IO.Path]::GetFullPath((Join-Path $holdDirectory $name))
      if (-not $source.StartsWith($sourceMigrationsDir + [System.IO.Path]::DirectorySeparatorChar,[System.StringComparison]::OrdinalIgnoreCase) -or
          -not $working.StartsWith($migrationsDir + [System.IO.Path]::DirectorySeparatorChar,[System.StringComparison]::OrdinalIgnoreCase) -or
          -not $destination.StartsWith($holdDirectory + [System.IO.Path]::DirectorySeparatorChar,[System.StringComparison]::OrdinalIgnoreCase) -or
          -not (Test-Path -LiteralPath $source -PathType Leaf)) {
        throw "Historical replay manifest path is invalid or missing: $name"
      }
      if (Test-Path -LiteralPath $working -PathType Leaf) {
        Move-Item -LiteralPath $working -Destination $destination
      } elseif ($migrationsDir -ne $sourceMigrationsDir) {
        Copy-Item -LiteralPath $source -Destination $destination
      } else {
        throw "Historical replay migration is missing from the working directory: $name"
      }
    }

    $boundarySql = @"
select json_build_object(
  'base_complete',exists(
    select 1 from supabase_migrations.schema_migrations
    where version='20261011150000'
  ),
  'backfill_absent',not exists(
    select 1 from supabase_migrations.schema_migrations
    where version='20260916110806'
  ),
  'latest',(select max(version) from supabase_migrations.schema_migrations)
) as boundary;
"@

    if (-not $ResumeCertifiedBase) {
      Write-Host 'Resetting the disposable local database without the backfilled migration slice...'
      & npx supabase db reset --local --no-seed --workdir $projectWorkdir
      $resetExitCode = $LASTEXITCODE
      if ($resetExitCode -ne 0) {
        $boundaryResult = $null
        for ($attempt = 1; $attempt -le 12 -and $null -eq $boundaryResult; $attempt++) {
          try {
            $boundaryResult = Invoke-SupabaseJsonQuery -Target local -Sql $boundarySql
          }
          catch {
            if ($attempt -eq 12) { throw }
            Start-Sleep -Seconds 5
          }
        }
        $boundary = $boundaryResult.rows[0].boundary
        if (-not $boundary.base_complete -or -not $boundary.backfill_absent -or
            [string]$boundary.latest -ne '20261011150000') {
          throw "Local reset failed before reaching the certified base boundary (exit $resetExitCode)."
        }
        Write-Warning "Supabase reset returned exit $resetExitCode after reaching the certified base boundary; continuing with the healthy local database."
      }
    }
    else {
      Write-Host 'Resuming from an explicitly requested certified local base boundary...'
      $boundaryResult = $null
      for ($attempt = 1; $attempt -le 12 -and $null -eq $boundaryResult; $attempt++) {
        try {
          $boundaryResult = Invoke-SupabaseJsonQuery -Target local -Sql $boundarySql
        }
        catch {
          if ($attempt -eq 12) { throw }
          Start-Sleep -Seconds 5
        }
      }
      $boundary = $boundaryResult.rows[0].boundary
      if (-not $boundary.base_complete -or -not $boundary.backfill_absent -or
          [string]$boundary.latest -ne '20261011150000') {
        throw 'Resume was requested, but the local database is not at the certified base boundary.'
      }
    }

    $historicalStateSql = @"
select json_build_object(
  'platform_operator_count',(select count(*) from tongs.platform_operators),
  'bounded_luna_policy_count',(select count(*) from tongs.private_pricing_policies where policy_code='owner-openai-hearth-chat-luna-bounded-pilot'),
  'bounded_luna_revision_count',(select count(*) from tongs.private_pricing_revisions revision join tongs.private_pricing_policies policy on policy.id=revision.policy_id where policy.policy_code='owner-openai-hearth-chat-luna-bounded-pilot'),
  'historical_catalog_count',(select count(*) from tongs.openai_text_model_catalog_revisions where id='89000000-0000-4000-8000-000000000003')
) as state;
"@
    $historicalState = Invoke-SupabaseJsonQuery -Target local -Sql $historicalStateSql
    $historicalStateJson = $historicalState.rows[0].state | ConvertTo-Json -Compress
    Write-Host "Pre-fixture replay state: $historicalStateJson"
    if ($historicalState.rows[0].state.bounded_luna_policy_count -ne 0 -or
        $historicalState.rows[0].state.bounded_luna_revision_count -ne 0 -or
        $historicalState.rows[0].state.historical_catalog_count -ne 0) {
      throw 'Disposable base unexpectedly contains the lived-in historical Luna prerequisite.'
    }

    $fixtureSql = Get-Content -LiteralPath $fixturePath -Raw
    $guardedFixtureSql = "set forge.local_historical_replay = 'mid-september-v1';`n$fixtureSql"
    $guardedFixturePath = Join-Path $holdDirectory 'guarded-mid-september-fixture.sql'
    [System.IO.File]::WriteAllText(
      $guardedFixturePath,
      $guardedFixtureSql,
      [System.Text.UTF8Encoding]::new($false)
    )
    Write-Host 'Injecting the guarded local historical preconditions...'
    try {
      Invoke-LocalPsqlScript -Path $guardedFixturePath -DatabaseContainer $databaseContainer
    }
    finally {
      if (Test-Path -LiteralPath $guardedFixturePath -PathType Leaf) {
        Remove-Item -LiteralPath $guardedFixturePath
      }
    }

    Write-Host 'Applying the first restored migration at its historical boundary...'
    $firstBackfillName = $heldMigrationNames[0]
    $firstHeldPath = [System.IO.Path]::GetFullPath((Join-Path $holdDirectory $firstBackfillName))
    $firstRestoredPath = [System.IO.Path]::GetFullPath((Join-Path $migrationsDir $firstBackfillName))
    if (-not (Test-Path -LiteralPath $firstHeldPath -PathType Leaf) -or
        (Test-Path -LiteralPath $firstRestoredPath)) {
      throw 'The first historical backfill migration is not staged for isolated replay.'
    }
    Move-Item -LiteralPath $firstHeldPath -Destination $firstRestoredPath
    Invoke-CheckedCommand -Program 'npx' -Arguments @(
      'supabase','migration','up','--local','--include-all',
      '--workdir',$projectWorkdir
    )

    $generatedIdentitySql = Get-Content -LiteralPath $generatedIdentityFixturePath -Raw
    $guardedGeneratedIdentitySql = "set forge.local_historical_replay = 'mid-september-v1';`n$generatedIdentitySql"
    $guardedGeneratedIdentityPath = Join-Path $holdDirectory 'guarded-mid-september-generated-identity.sql'
    [System.IO.File]::WriteAllText(
      $guardedGeneratedIdentityPath,
      $guardedGeneratedIdentitySql,
      [System.Text.UTF8Encoding]::new($false)
    )
    Write-Host 'Reproducing the historical generated Luna revision identity...'
    try {
      Invoke-LocalPsqlScript -Path $guardedGeneratedIdentityPath -DatabaseContainer $databaseContainer
    }
    finally {
      if (Test-Path -LiteralPath $guardedGeneratedIdentityPath -PathType Leaf) {
        Remove-Item -LiteralPath $guardedGeneratedIdentityPath
      }
    }

    if ($heldMigrationNames[13] -ne '20260916132017_tongs_credit_pack_availability_caller_role.sql' -or
        $heldMigrationNames[14] -ne '20260916154851_standard_customer_hearth_research.sql' -or
        $heldMigrationNames[-1] -ne $coordinatedCutoverFixtureBoundaryName) {
      throw 'Coordinated-cutover historical replay boundary changed.'
    }
    Write-Host 'Applying the historical slice and reassertions through the coordinated-cutover boundary...'
    foreach ($index in @(1..13) + @(32..33)) {
      $heldPath = [System.IO.Path]::GetFullPath((Join-Path $holdDirectory $heldMigrationNames[$index]))
      $restoredPath = [System.IO.Path]::GetFullPath((Join-Path $migrationsDir $heldMigrationNames[$index]))
      if (-not (Test-Path -LiteralPath $heldPath -PathType Leaf) -or
          (Test-Path -LiteralPath $restoredPath)) {
        throw "Historical pre-correction migration is not staged: $($heldMigrationNames[$index])"
      }
      Move-Item -LiteralPath $heldPath -Destination $restoredPath
    }
    Invoke-CheckedCommand -Program 'npx' -Arguments @(
      'supabase','migration','up','--local','--include-all',
      '--workdir',$projectWorkdir
    )

    $coordinatedCutoverBoundary = Invoke-SupabaseJsonQuery -Target local -Sql @"
select json_build_object(
  'latest',(select max(version) from supabase_migrations.schema_migrations),
  'expected_revision_one_routes',(
    select count(*) from tongs.openai_text_rollout_revisions
    where revision=1 and mode='inactive' and funding_scope='all'
      and cost_policy_revision_id is null and route_code<>'hearth.chat_completion'
  ),
  'later_expected_route_revisions',(
    select count(*) from tongs.openai_text_rollout_revisions
    where route_code in (
      'anvil.realtime_transcription','hammer.transcript_cleanup','hammer.transcript_prep',
      'hammer.transcript_regeneration','hearth.research_synthesis','hearth.speech_transcription',
      'motion.broll_interpretation','quench.metadata','shorts.discovery',
      'visual.narrative_interpretation','visual.unified_plan'
    ) and revision>1
  )
) as boundary;
"@
    $coordinatedCutoverBoundaryState = $coordinatedCutoverBoundary.rows[0].boundary
    if ([string]$coordinatedCutoverBoundaryState.latest -ne '20261011470000' -or
        $coordinatedCutoverBoundaryState.expected_revision_one_routes -ne 11 -or
        $coordinatedCutoverBoundaryState.later_expected_route_revisions -ne 0) {
      throw "Coordinated-cutover replay boundary changed: $($coordinatedCutoverBoundaryState | ConvertTo-Json -Compress)"
    }

    Write-Host 'Confirming a missing coordinated-cutover replay marker fails closed...'
    Invoke-LocalPsqlScriptExpectFailure `
      -Path $coordinatedCutoverFixturePath `
      -DatabaseContainer $databaseContainer `
      -ExpectedMessage 'local coordinated-cutover replay guard is missing'

    $wrongMarkerCoordinatedCutoverPath = Join-Path $holdDirectory 'wrong-marker-coordinated-cutover.sql'
    [System.IO.File]::WriteAllText(
      $wrongMarkerCoordinatedCutoverPath,
      "set forge.local_historical_replay = 'wrong-marker';`n" +
        (Get-Content -LiteralPath $coordinatedCutoverFixturePath -Raw),
      [System.Text.UTF8Encoding]::new($false)
    )
    try {
      Write-Host 'Confirming an incorrect coordinated-cutover replay marker fails closed...'
      Invoke-LocalPsqlScriptExpectFailure `
        -Path $wrongMarkerCoordinatedCutoverPath `
        -DatabaseContainer $databaseContainer `
        -ExpectedMessage 'local coordinated-cutover replay guard is missing'
    }
    finally {
      if (Test-Path -LiteralPath $wrongMarkerCoordinatedCutoverPath -PathType Leaf) {
        Remove-Item -LiteralPath $wrongMarkerCoordinatedCutoverPath
      }
    }

    $wrongDatabaseCoordinatedCutoverPath = Join-Path $holdDirectory 'wrong-database-coordinated-cutover.sql'
    [System.IO.File]::WriteAllText(
      $wrongDatabaseCoordinatedCutoverPath,
      "set forge.local_historical_replay = 'coordinated-cutover-rollouts-v1';`n" +
        ((Get-Content -LiteralPath $coordinatedCutoverFixturePath -Raw) -replace
          "current_database\(\) <> 'postgres'","current_database() <> 'wrong_database'"),
      [System.Text.UTF8Encoding]::new($false)
    )
    try {
      Write-Host 'Confirming an incorrect coordinated-cutover database identity fails closed...'
      Invoke-LocalPsqlScriptExpectFailure `
        -Path $wrongDatabaseCoordinatedCutoverPath `
        -DatabaseContainer $databaseContainer `
        -ExpectedMessage 'coordinated-cutover replay requires database postgres'
    }
    finally {
      if (Test-Path -LiteralPath $wrongDatabaseCoordinatedCutoverPath -PathType Leaf) {
        Remove-Item -LiteralPath $wrongDatabaseCoordinatedCutoverPath
      }
    }

    $wrongBoundaryCoordinatedCutoverPath = Join-Path $holdDirectory 'wrong-boundary-coordinated-cutover.sql'
    [System.IO.File]::WriteAllText(
      $wrongBoundaryCoordinatedCutoverPath,
      "set forge.local_historical_replay = 'coordinated-cutover-rollouts-v1';`n" +
        ((Get-Content -LiteralPath $coordinatedCutoverFixturePath -Raw) -replace '20261011470000','20261011460000'),
      [System.Text.UTF8Encoding]::new($false)
    )
    try {
      Write-Host 'Confirming an incorrect coordinated-cutover migration boundary fails closed...'
      Invoke-LocalPsqlScriptExpectFailure `
        -Path $wrongBoundaryCoordinatedCutoverPath `
        -DatabaseContainer $databaseContainer `
        -ExpectedMessage 'local coordinated-cutover replay requires the exact 20261011460000 boundary'
    }
    finally {
      if (Test-Path -LiteralPath $wrongBoundaryCoordinatedCutoverPath -PathType Leaf) {
        Remove-Item -LiteralPath $wrongBoundaryCoordinatedCutoverPath
      }
    }

    $wrongOperatorCoordinatedCutoverPath = Join-Path $holdDirectory 'wrong-operator-coordinated-cutover.sql'
    [System.IO.File]::WriteAllText(
      $wrongOperatorCoordinatedCutoverPath,
      "set forge.local_historical_replay = 'coordinated-cutover-rollouts-v1';`n" +
        ((Get-Content -LiteralPath $coordinatedCutoverFixturePath -Raw) -replace
          'fe000000-0000-4000-8000-000000000001','fe000000-0000-4000-8000-000000000099'),
      [System.Text.UTF8Encoding]::new($false)
    )
    try {
      Write-Host 'Confirming an unexpected coordinated-cutover operator identity fails closed...'
      Invoke-LocalPsqlScriptExpectFailure `
        -Path $wrongOperatorCoordinatedCutoverPath `
        -DatabaseContainer $databaseContainer `
        -ExpectedMessage 'local coordinated-cutover replay requires the exact synthetic operator identity'
    }
    finally {
      if (Test-Path -LiteralPath $wrongOperatorCoordinatedCutoverPath -PathType Leaf) {
        Remove-Item -LiteralPath $wrongOperatorCoordinatedCutoverPath
      }
    }

    $guardedCoordinatedCutoverPath = Join-Path $holdDirectory 'guarded-coordinated-cutover.sql'
    [System.IO.File]::WriteAllText(
      $guardedCoordinatedCutoverPath,
      "set forge.local_historical_replay = 'coordinated-cutover-rollouts-v1';`n" +
        (Get-Content -LiteralPath $coordinatedCutoverFixturePath -Raw),
      [System.Text.UTF8Encoding]::new($false)
    )
    Write-Host 'Injecting the guarded coordinated-cutover rollout prerequisites...'
    try {
      Invoke-LocalPsqlScript -Path $guardedCoordinatedCutoverPath -DatabaseContainer $databaseContainer
    }
    finally {
      if (Test-Path -LiteralPath $guardedCoordinatedCutoverPath -PathType Leaf) {
        Remove-Item -LiteralPath $guardedCoordinatedCutoverPath
      }
    }

    $coordinatedCutoverState = Invoke-SupabaseJsonQuery -Target local -Sql @"
select json_build_object(
  'revision_one_count',(select count(*) from tongs.openai_text_rollout_revisions where revision=1 and route_code<>'hearth.chat_completion'),
  'revision_two_halt_count',(select count(*) from tongs.openai_text_rollout_revisions where revision=2 and mode='halt_new' and funding_scope='forge' and cost_policy_revision_id is null),
  'hammer_mode',(select mode from tongs.openai_text_rollout_revisions where route_code='hammer.transcript_cleanup' order by revision desc limit 1),
  'hammer_scopes',(select count(*) from tongs.customer_paid_execution_scope_authorizations where route_code='hammer.transcript_cleanup')
) as authority;
"@
    $coordinatedCutoverAuthority = $coordinatedCutoverState.rows[0].authority
    if ($coordinatedCutoverAuthority.revision_one_count -ne 11 -or
        $coordinatedCutoverAuthority.revision_two_halt_count -ne 11 -or
        $coordinatedCutoverAuthority.hammer_mode -ne 'halt_new' -or
        $coordinatedCutoverAuthority.hammer_scopes -ne 0) {
      throw "Coordinated-cutover rollout authority changed: $($coordinatedCutoverAuthority | ConvertTo-Json -Compress)"
    }

    Write-Host 'Applying the remaining historical slice through operator-controlled failure loss...'
    for ($index = 14; $index -le 23; $index++) {
      $heldPath = [System.IO.Path]::GetFullPath((Join-Path $holdDirectory $heldMigrationNames[$index]))
      $restoredPath = [System.IO.Path]::GetFullPath((Join-Path $migrationsDir $heldMigrationNames[$index]))
      if (-not (Test-Path -LiteralPath $heldPath -PathType Leaf) -or
          (Test-Path -LiteralPath $restoredPath)) {
        throw "Historical post-cutover migration is not staged: $($heldMigrationNames[$index])"
      }
      Move-Item -LiteralPath $heldPath -Destination $restoredPath
    }
    Invoke-CheckedCommand -Program 'npx' -Arguments @(
      'supabase','migration','up','--local','--include-all',
      '--workdir',$projectWorkdir
    )

    $guardedRealizedLossPath = Join-Path $holdDirectory 'guarded-mid-september-realized-loss-events.sql'
    [System.IO.File]::WriteAllText(
      $guardedRealizedLossPath,
      "set forge.local_historical_replay = 'mid-september-v1';`n" +
        (Get-Content -LiteralPath $realizedLossFixturePath -Raw),
      [System.Text.UTF8Encoding]::new($false)
    )
    Write-Host 'Injecting temporary realized-loss event identities without customer financial rows...'
    try {
      Invoke-LocalPsqlScript -Path $guardedRealizedLossPath -DatabaseContainer $databaseContainer
    }
    finally {
      if (Test-Path -LiteralPath $guardedRealizedLossPath -PathType Leaf) {
        Remove-Item -LiteralPath $guardedRealizedLossPath
      }
    }

    $correctionIndex = 24
    $correctionHeldPath = [System.IO.Path]::GetFullPath((Join-Path $holdDirectory $heldMigrationNames[$correctionIndex]))
    $correctionRestoredPath = [System.IO.Path]::GetFullPath((Join-Path $migrationsDir $heldMigrationNames[$correctionIndex]))
    if (-not (Test-Path -LiteralPath $correctionHeldPath -PathType Leaf) -or
        (Test-Path -LiteralPath $correctionRestoredPath)) {
      throw 'The realized-loss correction migration is not staged for isolated replay.'
    }
    Move-Item -LiteralPath $correctionHeldPath -Destination $correctionRestoredPath

    $guardedRealizedLossCleanupPath = Join-Path $holdDirectory 'guarded-mid-september-realized-loss-cleanup.sql'
    [System.IO.File]::WriteAllText(
      $guardedRealizedLossCleanupPath,
      "set forge.local_historical_replay = 'mid-september-v1';`n" +
        (Get-Content -LiteralPath $realizedLossCleanupPath -Raw),
      [System.Text.UTF8Encoding]::new($false)
    )
    try {
      Write-Host 'Applying the exact realized-loss correction migration...'
      Invoke-CheckedCommand -Program 'npx' -Arguments @(
        'supabase','migration','up','--local','--include-all',
        '--workdir',$projectWorkdir
      )
    }
    finally {
      Write-Host 'Removing the temporary realized-loss bridge rows...'
      try {
        Invoke-LocalPsqlScript -Path $guardedRealizedLossCleanupPath -DatabaseContainer $databaseContainer
      }
      finally {
        if (Test-Path -LiteralPath $guardedRealizedLossCleanupPath -PathType Leaf) {
          Remove-Item -LiteralPath $guardedRealizedLossCleanupPath
        }
      }
    }

    $guardedCustomerCanaryPath = Join-Path $holdDirectory 'guarded-mid-september-customer-canary-authority.sql'
    [System.IO.File]::WriteAllText(
      $guardedCustomerCanaryPath,
      "set forge.local_historical_replay = 'mid-september-v1';`n" +
        (Get-Content -LiteralPath $customerCanaryFixturePath -Raw),
      [System.Text.UTF8Encoding]::new($false)
    )
    Write-Host 'Injecting the local normal-customer Test authority required by the canary...'
    try {
      Invoke-LocalPsqlScript -Path $guardedCustomerCanaryPath -DatabaseContainer $databaseContainer
    }
    finally {
      if (Test-Path -LiteralPath $guardedCustomerCanaryPath -PathType Leaf) {
        Remove-Item -LiteralPath $guardedCustomerCanaryPath
      }
    }

    Write-Host 'Applying the restored backfilled slice and forward migrations through the post-checkpoint boundary...'
    foreach ($name in @($allHeldMigrationNames) + @($trailingThroughCheckpointNames)) {
      $heldPath = [System.IO.Path]::GetFullPath((Join-Path $holdDirectory $name))
      $restoredPath = [System.IO.Path]::GetFullPath((Join-Path $migrationsDir $name))
      if (Test-Path -LiteralPath $heldPath -PathType Leaf) {
        if (Test-Path -LiteralPath $restoredPath) {
          throw "Cannot restore held migration because its destination exists: $name"
        }
        Move-Item -LiteralPath $heldPath -Destination $restoredPath
      }
    }
    Invoke-CheckedCommand -Program 'npx' -Arguments @(
      'supabase','migration','up','--local','--include-all',
      '--workdir',$projectWorkdir
    )

    $guardedPostCheckpointPath = Join-Path $holdDirectory 'guarded-post-checkpoint-paid-execution-prerequisites.sql'
    [System.IO.File]::WriteAllText(
      $guardedPostCheckpointPath,
      "set forge.local_historical_replay = 'post-checkpoint-v1';`n" +
        (Get-Content -LiteralPath $postCheckpointFixturePath -Raw),
      [System.Text.UTF8Encoding]::new($false)
    )
    Write-Host 'Injecting the guarded local post-checkpoint paid-execution prerequisites...'
    try {
      Invoke-LocalPsqlScript -Path $guardedPostCheckpointPath -DatabaseContainer $databaseContainer
    }
    finally {
      if (Test-Path -LiteralPath $guardedPostCheckpointPath -PathType Leaf) {
        Remove-Item -LiteralPath $guardedPostCheckpointPath
      }
    }

    Write-Host 'Applying forward migrations through the Hearth historical-fixture boundary...'
    foreach ($name in $trailingThroughHearthFixtureBoundaryNames) {
      $heldPath = [System.IO.Path]::GetFullPath((Join-Path $holdDirectory $name))
      $restoredPath = [System.IO.Path]::GetFullPath((Join-Path $migrationsDir $name))
      if (-not (Test-Path -LiteralPath $heldPath -PathType Leaf) -or (Test-Path -LiteralPath $restoredPath)) {
        throw "Pre-Hearth historical migration is not staged: $name"
      }
      Move-Item -LiteralPath $heldPath -Destination $restoredPath
    }
    Invoke-CheckedCommand -Program 'npx' -Arguments @(
      'supabase','migration','up','--local','--include-all',
      '--workdir',$projectWorkdir
    )

    $guardedHearthHistoricalPath = Join-Path $holdDirectory 'guarded-hearth-historical-domain-prerequisites.sql'
    [System.IO.File]::WriteAllText(
      $guardedHearthHistoricalPath,
      "set forge.local_historical_replay = 'hearth-historical-domain-v1';`n" +
        (Get-Content -LiteralPath $hearthHistoricalFixturePath -Raw),
      [System.Text.UTF8Encoding]::new($false)
    )
    Write-Host 'Injecting synthetic, disposable-only Hearth historical domain prerequisites...'
    try {
      Invoke-LocalPsqlScript -Path $guardedHearthHistoricalPath -DatabaseContainer $databaseContainer
    }
    finally {
      if (Test-Path -LiteralPath $guardedHearthHistoricalPath -PathType Leaf) {
        Remove-Item -LiteralPath $guardedHearthHistoricalPath
      }
    }

    $hearthHistoricalHeldPath = [System.IO.Path]::GetFullPath((Join-Path $holdDirectory $hearthHistoricalMigrationName))
    $hearthHistoricalRestoredPath = [System.IO.Path]::GetFullPath((Join-Path $migrationsDir $hearthHistoricalMigrationName))
    if (-not (Test-Path -LiteralPath $hearthHistoricalHeldPath -PathType Leaf) -or
        (Test-Path -LiteralPath $hearthHistoricalRestoredPath)) {
      throw 'The historical Hearth authority migration is not staged at its exact boundary.'
    }
    Move-Item -LiteralPath $hearthHistoricalHeldPath -Destination $hearthHistoricalRestoredPath
    Write-Host 'Applying the unchanged historical Hearth authority migration...'
    Invoke-CheckedCommand -Program 'npx' -Arguments @(
      'supabase','migration','up','--local','--include-all',
      '--workdir',$projectWorkdir
    )
    Write-Host 'Running historical Hearth authority assertions...'
    Write-Host 'Confirming a missing replay marker cannot select disposable expectations...'
    Invoke-LocalPsqlScriptExpectFailure `
      -Path $hearthHistoricalCertificationPath `
      -DatabaseContainer $databaseContainer `
      -ExpectedMessage 'existing customer authority counts changed for production historical mode'

    $wrongMarkerHearthHistoricalCertificationPath = Join-Path $holdDirectory 'wrong-marker-hearth-historical-authority-certification.sql'
    [System.IO.File]::WriteAllText(
      $wrongMarkerHearthHistoricalCertificationPath,
      "set forge.local_historical_replay = 'wrong-marker';`n" +
        (Get-Content -LiteralPath $hearthHistoricalCertificationPath -Raw),
      [System.Text.UTF8Encoding]::new($false)
    )
    Write-Host 'Confirming an incorrect replay marker cannot select disposable expectations...'
    try {
      Invoke-LocalPsqlScriptExpectFailure `
        -Path $wrongMarkerHearthHistoricalCertificationPath `
        -DatabaseContainer $databaseContainer `
        -ExpectedMessage 'existing customer authority counts changed for production historical mode'
    }
    finally {
      if (Test-Path -LiteralPath $wrongMarkerHearthHistoricalCertificationPath -PathType Leaf) {
        Remove-Item -LiteralPath $wrongMarkerHearthHistoricalCertificationPath
      }
    }

    $guardedHearthHistoricalCertificationPath = Join-Path $holdDirectory 'guarded-hearth-historical-authority-certification.sql'
    [System.IO.File]::WriteAllText(
      $guardedHearthHistoricalCertificationPath,
      "set forge.local_historical_replay = 'hearth-historical-domain-v1';`n" +
        (Get-Content -LiteralPath $hearthHistoricalCertificationPath -Raw),
      [System.Text.UTF8Encoding]::new($false)
    )
    try {
      Invoke-LocalPsqlScript -Path $guardedHearthHistoricalCertificationPath -DatabaseContainer $databaseContainer
    }
    finally {
      if (Test-Path -LiteralPath $guardedHearthHistoricalCertificationPath -PathType Leaf) {
        Remove-Item -LiteralPath $guardedHearthHistoricalCertificationPath
      }
    }

    Write-Host 'Applying through the next independent owner-authority boundary...'
    foreach ($name in $trailingThroughOwnerAuthorityBoundaryNames) {
      $heldPath = [System.IO.Path]::GetFullPath((Join-Path $holdDirectory $name))
      $restoredPath = [System.IO.Path]::GetFullPath((Join-Path $migrationsDir $name))
      if (-not (Test-Path -LiteralPath $heldPath -PathType Leaf) -or (Test-Path -LiteralPath $restoredPath)) {
        throw "Post-Hearth historical migration is not staged: $name"
      }
      Move-Item -LiteralPath $heldPath -Destination $restoredPath
    }
    Invoke-CheckedCommand -Program 'npx' -Arguments @(
      'supabase','migration','up','--local','--include-all',
      '--workdir',$projectWorkdir
    )

    $ownerBoundary = Invoke-SupabaseJsonQuery -Target local -Sql @"
select json_build_object(
  'latest',(select max(version) from supabase_migrations.schema_migrations),
  'enabled_owner_principals',(select count(*) from tongs.owner_testing_principals where status='enabled'),
  'owner_principal_events',(select count(*) from tongs.owner_testing_principal_events),
  'canonical_authority_absent',(to_regclass('tongs.account_authority_classifications') is null
    and to_regclass('tongs.account_authority_classification_events') is null),
  'next_migration','$($trailingAfterOwnerAuthorityBoundaryNames[0])'
) as boundary;
"@
    $ownerBoundaryState = $ownerBoundary.rows[0].boundary
    if ([string]$ownerBoundaryState.latest -ne '20261011930000' -or
        $ownerBoundaryState.enabled_owner_principals -ne 0 -or
        $ownerBoundaryState.owner_principal_events -ne 0 -or
        -not $ownerBoundaryState.canonical_authority_absent -or
        [string]$ownerBoundaryState.next_migration -ne '20261011940000_canonical_account_owner_authority.sql') {
      throw "Owner-authority replay boundary changed: $($ownerBoundaryState | ConvertTo-Json -Compress)"
    }
    if ($CertifyHearthHistoricalBoundaryOnly) {
      Write-Host 'Hearth historical replay boundary certification passed.'
      return
    }

    Write-Host 'Confirming a missing owner-principal replay marker fails closed...'
    Invoke-LocalPsqlScriptExpectFailure `
      -Path $ownerPrincipalFixturePath `
      -DatabaseContainer $databaseContainer `
      -ExpectedMessage 'local owner-principal replay guard is missing'

    $wrongMarkerOwnerPrincipalFixturePath = Join-Path $holdDirectory 'wrong-marker-owner-principal-prerequisite.sql'
    [System.IO.File]::WriteAllText(
      $wrongMarkerOwnerPrincipalFixturePath,
      "set forge.local_historical_replay = 'wrong-marker';`n" +
        (Get-Content -LiteralPath $ownerPrincipalFixturePath -Raw),
      [System.Text.UTF8Encoding]::new($false)
    )
    Write-Host 'Confirming an incorrect owner-principal replay marker fails closed...'
    try {
      Invoke-LocalPsqlScriptExpectFailure `
        -Path $wrongMarkerOwnerPrincipalFixturePath `
        -DatabaseContainer $databaseContainer `
        -ExpectedMessage 'local owner-principal replay guard is missing'
    }
    finally {
      if (Test-Path -LiteralPath $wrongMarkerOwnerPrincipalFixturePath -PathType Leaf) {
        Remove-Item -LiteralPath $wrongMarkerOwnerPrincipalFixturePath
      }
    }

    $guardedOwnerPrincipalFixturePath = Join-Path $holdDirectory 'guarded-owner-principal-prerequisite.sql'
    [System.IO.File]::WriteAllText(
      $guardedOwnerPrincipalFixturePath,
      "set forge.local_historical_replay = 'owner-principal-historical-v1';`n" +
        (Get-Content -LiteralPath $ownerPrincipalFixturePath -Raw),
      [System.Text.UTF8Encoding]::new($false)
    )
    Write-Host 'Injecting the synthetic disposable-only owner principal prerequisite...'
    try {
      Invoke-LocalPsqlScript -Path $guardedOwnerPrincipalFixturePath -DatabaseContainer $databaseContainer
      Write-Host 'Confirming pre-existing principal records fail closed...'
      Invoke-LocalPsqlScriptExpectFailure `
        -Path $guardedOwnerPrincipalFixturePath `
        -DatabaseContainer $databaseContainer `
        -ExpectedMessage 'local owner-principal replay requires zero legacy principal records'
    }
    finally {
      if (Test-Path -LiteralPath $guardedOwnerPrincipalFixturePath -PathType Leaf) {
        Remove-Item -LiteralPath $guardedOwnerPrincipalFixturePath
      }
    }

    if ($canonicalOwnerAuthorityMigrationNames.Count -ne 1 -or
        $canonicalOwnerAuthorityMigrationNames[0] -ne $canonicalOwnerAuthorityMigrationName) {
      throw 'Canonical owner-authority migration boundary changed.'
    }
    foreach ($name in $canonicalOwnerAuthorityMigrationNames) {
      $heldPath = [System.IO.Path]::GetFullPath((Join-Path $holdDirectory $name))
      $restoredPath = [System.IO.Path]::GetFullPath((Join-Path $migrationsDir $name))
      if (-not (Test-Path -LiteralPath $heldPath -PathType Leaf) -or (Test-Path -LiteralPath $restoredPath)) {
        throw "Canonical owner-authority migration is not staged: $name"
      }
      Move-Item -LiteralPath $heldPath -Destination $restoredPath
    }
    Write-Host 'Applying the unchanged canonical owner-authority migration...'
    Invoke-CheckedCommand -Program 'npx' -Arguments @(
      'supabase','migration','up','--local','--include-all',
      '--workdir',$projectWorkdir
    )

    $postCanonicalBoundaryFixturePath = Join-Path $holdDirectory 'post-canonical-owner-principal-prerequisite.sql'
    [System.IO.File]::WriteAllText(
      $postCanonicalBoundaryFixturePath,
      "set forge.local_historical_replay = 'owner-principal-historical-v1';`n" +
        (Get-Content -LiteralPath $ownerPrincipalFixturePath -Raw),
      [System.Text.UTF8Encoding]::new($false)
    )
    Write-Host 'Confirming the applied migration boundary rejects fixture reuse...'
    try {
      Invoke-LocalPsqlScriptExpectFailure `
        -Path $postCanonicalBoundaryFixturePath `
        -DatabaseContainer $databaseContainer `
        -ExpectedMessage 'local owner-principal replay requires the exact 20261011930000 boundary'
    }
    finally {
      if (Test-Path -LiteralPath $postCanonicalBoundaryFixturePath -PathType Leaf) {
        Remove-Item -LiteralPath $postCanonicalBoundaryFixturePath
      }
    }

    $canonicalOwnerState = Invoke-SupabaseJsonQuery -Target local -Sql @"
select json_build_object(
  'legacy_principals',(select count(*) from tongs.owner_testing_principals
    where user_id='fe000000-0000-4000-8000-000000000001' and status='enabled' and revision=1),
  'legacy_events',(select count(*) from tongs.owner_testing_principal_events
    where id='fe130000-0000-4000-8000-000000000001'
      and user_id='fe000000-0000-4000-8000-000000000001' and status='enabled' and revision=1),
  'canonical_owners',(select count(*) from tongs.account_authority_classifications
    where user_id='fe000000-0000-4000-8000-000000000001' and account_class='owner' and revision=1),
  'canonical_events',(select count(*) from tongs.account_authority_classification_events
    where user_id='fe000000-0000-4000-8000-000000000001' and account_class='owner' and revision=1
      and evidence->>'legacy_event_id'='fe130000-0000-4000-8000-000000000001'
      and evidence->>'migration_source'='20261011940000_canonical_account_owner_authority')
) as authority;
"@
    $canonicalOwner = $canonicalOwnerState.rows[0].authority
    if ($canonicalOwner.legacy_principals -ne 1 -or $canonicalOwner.legacy_events -ne 1 -or
        $canonicalOwner.canonical_owners -ne 1 -or $canonicalOwner.canonical_events -ne 1) {
      throw "Canonical owner backfill is not exact: $($canonicalOwner | ConvertTo-Json -Compress)"
    }
    Write-Host 'Running canonical account-authority assertions...'
    Invoke-LocalPsqlScript -Path $accountAuthorityCertificationPath -DatabaseContainer $databaseContainer

    if ($transitionOwnerAuthorityMigrationNames.Count -ne 2 -or
        $transitionOwnerAuthorityMigrationNames[-1] -ne $transitionOwnerAuthorityBoundaryName) {
      throw 'Dual-read owner-authority migration boundary changed.'
    }
    Write-Host 'Applying the unchanged dual-read owner-authority migrations...'
    foreach ($name in $transitionOwnerAuthorityMigrationNames) {
      $heldPath = [System.IO.Path]::GetFullPath((Join-Path $holdDirectory $name))
      $restoredPath = [System.IO.Path]::GetFullPath((Join-Path $migrationsDir $name))
      if (-not (Test-Path -LiteralPath $heldPath -PathType Leaf) -or (Test-Path -LiteralPath $restoredPath)) {
        throw "Transition owner-authority migration is not staged: $name"
      }
      Move-Item -LiteralPath $heldPath -Destination $restoredPath
    }
    Invoke-CheckedCommand -Program 'npx' -Arguments @(
      'supabase','migration','up','--local','--include-all',
      '--workdir',$projectWorkdir
    )
    Write-Host 'Running dual-read transition owner-authority assertions...'
    Invoke-LocalPsqlScript -Path $transitionOwnerAuthorityCertificationPath -DatabaseContainer $databaseContainer

    $dualReadOwnerState = Invoke-SupabaseJsonQuery -Target local -Sql @"
with role_set as (
  select set_config('request.jwt.claim.role','service_role',false)
)
select tongs.resolve_transition_owner_authority('fe000000-0000-4000-8000-000000000001') as authority
from role_set;
"@
    $dualReadOwner = $dualReadOwnerState.rows[0].authority
    if (-not $dualReadOwner.eligible -or $dualReadOwner.state -ne 'eligible' -or
        $dualReadOwner.authority_mode -ne 'canonical_legacy_dual_read' -or
        -not $dualReadOwner.same_user -or $dualReadOwner.account_authority_revision -ne 1 -or
        $dualReadOwner.legacy_principal_revision -ne 1) {
      throw "Synthetic dual-read owner agreement failed: $($dualReadOwner | ConvertTo-Json -Compress)"
    }

    if ($ownerPersistenceMigrationNames.Count -ne 2 -or
        $ownerPersistenceMigrationNames[-1] -ne $ownerPersistenceBoundaryName) {
      throw 'Owner-persistence migration boundary changed.'
    }
    Write-Host 'Applying through the owner-persistence replay boundary...'
    foreach ($name in $ownerPersistenceMigrationNames) {
      $heldPath = [System.IO.Path]::GetFullPath((Join-Path $holdDirectory $name))
      $restoredPath = [System.IO.Path]::GetFullPath((Join-Path $migrationsDir $name))
      if (-not (Test-Path -LiteralPath $heldPath -PathType Leaf) -or (Test-Path -LiteralPath $restoredPath)) {
        throw "Owner-persistence migration is not staged: $name"
      }
      Move-Item -LiteralPath $heldPath -Destination $restoredPath
    }
    Invoke-CheckedCommand -Program 'npx' -Arguments @(
      'supabase','migration','up','--local','--include-all',
      '--workdir',$projectWorkdir
    )
    $ownerPersistenceBoundary = Invoke-SupabaseJsonQuery -Target local -Sql @"
select json_build_object(
  'latest',(select max(version) from supabase_migrations.schema_migrations),
  'legacy_principals',(select count(*) from tongs.owner_testing_principals where status='enabled'),
  'canonical_owners',(select count(*) from tongs.account_authority_classifications where account_class='owner'),
  'next_migration','$($trailingAfterOwnerPersistenceBoundaryNames[0])'
) as boundary;
"@
    $ownerPersistenceState = $ownerPersistenceBoundary.rows[0].boundary
    if ([string]$ownerPersistenceState.latest -ne '20261011980000' -or
        $ownerPersistenceState.legacy_principals -ne 1 -or
        $ownerPersistenceState.canonical_owners -ne 1 -or
        [string]$ownerPersistenceState.next_migration -ne '20261012000000_allow_zero_beat_unified_broll_plan.sql') {
      throw "Owner-persistence replay boundary changed: $($ownerPersistenceState | ConvertTo-Json -Compress)"
    }
    if ($CertifyOwnerAuthorityBoundaryOnly) {
      Write-Host 'Owner-principal replay boundary certification passed through 20261011980000.'
      return
    }

    Write-Host 'Applying the remaining forward migrations through current head...'
    foreach ($name in $trailingAfterOwnerPersistenceBoundaryNames) {
      $heldPath = [System.IO.Path]::GetFullPath((Join-Path $holdDirectory $name))
      $restoredPath = [System.IO.Path]::GetFullPath((Join-Path $migrationsDir $name))
      if (-not (Test-Path -LiteralPath $heldPath -PathType Leaf) -or (Test-Path -LiteralPath $restoredPath)) {
        throw "Post-owner-authority migration is not staged: $name"
      }
      Move-Item -LiteralPath $heldPath -Destination $restoredPath
    }
    Invoke-CheckedCommand -Program 'npx' -Arguments @(
      'supabase','migration','up','--local','--include-all',
      '--workdir',$projectWorkdir
    )
  }
  finally {
    foreach ($name in $stagedMigrationNames) {
      $held = [System.IO.Path]::GetFullPath((Join-Path $holdDirectory $name))
      $restored = [System.IO.Path]::GetFullPath((Join-Path $migrationsDir $name))
      if (Test-Path -LiteralPath $held -PathType Leaf) {
        if (Test-Path -LiteralPath $restored) {
          throw "Cannot restore held migration because its destination exists: $name"
        }
        Move-Item -LiteralPath $held -Destination $restored
      }
    }
    $remaining = @(Get-ChildItem -LiteralPath $holdDirectory -Force)
    if ($remaining.Count -ne 0) {
      throw "Historical replay hold directory is not empty: $holdDirectory"
    }
    Remove-Item -LiteralPath $holdDirectory
  }

  Write-Host 'Running local integrity assertions...'
  Invoke-LocalPsqlScript -Path $certificationPath -DatabaseContainer $databaseContainer
  Write-Host 'Running Framing Pack database assertions...'
  Invoke-LocalPsqlScript -Path $framingCertificationPath -DatabaseContainer $databaseContainer
  Invoke-LocalPsqlScript -Path $visualPlanCertificationPath -DatabaseContainer $databaseContainer
  Write-Host 'Running Thumbnail Directions database assertions...'
  Invoke-LocalPsqlScript -Path $thumbnailDirectionCertificationPath -DatabaseContainer $databaseContainer

  $fingerprintSql = (Get-Content -LiteralPath $certificationPath -Raw) -replace '(?s)^do \$\$.*?end \$\$;\s*',''
  if ($SkipLinkedFingerprint) {
    Write-Warning 'Linked fingerprint comparison skipped by request; no linked query was made.'
    Write-Host 'Local fixture-assisted migration replay passed.'
    return
  }
  $localFingerprint = Invoke-SupabaseJsonQuery -Target local -Sql $fingerprintSql
  $linkedFingerprint = Invoke-SupabaseJsonQuery -Target linked -Sql $fingerprintSql
  $localCanonical = $localFingerprint.rows[0].fingerprint | ConvertTo-Json -Depth 20 -Compress
  $linkedCanonical = $linkedFingerprint.rows[0].fingerprint | ConvertTo-Json -Depth 20 -Compress
  if ($localCanonical -ne $linkedCanonical) {
    throw "Local and linked migration fingerprints differ.`nLOCAL:  $localCanonical`nLINKED: $linkedCanonical"
  }

  Write-Host 'Local and linked fingerprints match.'
  Write-Host 'Local fixture-assisted migration replay passed.'
}
finally {
  Pop-Location
}
