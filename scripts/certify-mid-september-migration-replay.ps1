[CmdletBinding()]
param(
  [switch]$ResumeCertifiedBase,
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
$exclusionManifestPath = Join-Path $repoRoot 'supabase/tests/fixtures/mid_september_replay_exclusions.json'

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
  '20261011610000_visual_plan_reconciliation_replay_path_repair.sql'
)
$allHeldMigrationNames = @($heldMigrationNames) + @($newForwardMigrationNames)

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

Push-Location $repoRoot
try {
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
  if ($databaseUri.Scheme -notin @('postgres','postgresql') -or
      $databaseUri.Host -notin @('127.0.0.1','localhost','::1')) {
    throw "Refusing historical fixture: Supabase DB_URL is not loopback-local ($($databaseUri.Host))."
  }
  $expectedDatabaseContainer = "supabase_db_$ProjectId"
  $databaseContainers = @(
    & docker ps --filter "label=com.supabase.cli.project=$ProjectId" --filter 'name=supabase_db_' --format '{{.Names}}'
  )
  if ($LASTEXITCODE -ne 0 -or $databaseContainers.Count -ne 1 -or
      $databaseContainers[0] -ne $expectedDatabaseContainer) {
    throw "Refusing historical fixture: expected exactly the disposable database container $expectedDatabaseContainer."
  }
  $databaseContainer = $databaseContainers[0]

  if (-not (Test-Path -LiteralPath $fixturePath -PathType Leaf) -or
      -not (Test-Path -LiteralPath $generatedIdentityFixturePath -PathType Leaf) -or
      -not (Test-Path -LiteralPath $realizedLossFixturePath -PathType Leaf) -or
      -not (Test-Path -LiteralPath $realizedLossCleanupPath -PathType Leaf) -or
      -not (Test-Path -LiteralPath $customerCanaryFixturePath -PathType Leaf) -or
      -not (Test-Path -LiteralPath $certificationPath -PathType Leaf) -or
      -not (Test-Path -LiteralPath $framingCertificationPath -PathType Leaf) -or
      -not (Test-Path -LiteralPath $visualPlanCertificationPath -PathType Leaf) -or
      -not (Test-Path -LiteralPath $exclusionManifestPath -PathType Leaf)) {
    throw 'Historical fixture or certification SQL is missing.'
  }
  if ($heldMigrationNames.Count -ne 34 -or
      ($heldMigrationNames | Sort-Object -Unique).Count -ne 34 -or
      $newForwardMigrationNames.Count -ne 14 -or
      ($allHeldMigrationNames | Sort-Object -Unique).Count -ne 48) {
    throw 'Historical replay manifest must contain 34 historical and 14 forward migration files.'
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
    foreach ($name in $allHeldMigrationNames) {
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

    Write-Host 'Applying the historical slice through operator-controlled failure loss...'
    for ($index = 1; $index -le 23; $index++) {
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
  }
  finally {
    foreach ($name in $allHeldMigrationNames) {
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

  Write-Host 'Applying the restored backfilled slice, readiness migrations, and forward reassertions...'
  Invoke-CheckedCommand -Program 'npx' -Arguments @(
    'supabase','migration','up','--local','--include-all',
    '--workdir',$projectWorkdir
  )

  Write-Host 'Running local integrity assertions...'
  Invoke-LocalPsqlScript -Path $certificationPath -DatabaseContainer $databaseContainer
  Write-Host 'Running Framing Pack database assertions...'
  Invoke-LocalPsqlScript -Path $framingCertificationPath -DatabaseContainer $databaseContainer
  Invoke-LocalPsqlScript -Path $visualPlanCertificationPath -DatabaseContainer $databaseContainer

  $fingerprintSql = (Get-Content -LiteralPath $certificationPath -Raw) -replace '(?s)^do \$\$.*?end \$\$;\s*',''
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
