[CmdletBinding()]
param(
  [ValidateSet('permissive','restrictive')]
  [string]$DefaultPrivilegeMode = 'permissive',
  [string]$RepositoryRoot = (Split-Path -Parent $PSScriptRoot),
  [ValidateSet('aggregate-envelope','recovery','financial-environment','aggregate-attempt','owner-hearth-aggregate-enforcement','provider-alignment','hammer-renewal-compatibility')]
  [string]$CatalogStage = 'owner-hearth-aggregate-enforcement',
  [switch]$SkipHammerRealDatabaseIntegration,
  [switch]$MaterializeSuccessorCatalog
)

$ErrorActionPreference = 'Stop'
if ($IsWindows) {
  $supabaseExecutable = (Get-Command supabase.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
  $env:PATH = (Split-Path -Parent $supabaseExecutable) + [IO.Path]::PathSeparator + $env:PATH
}
$requiredCliVersion = '2.84.2'
$repo = [IO.Path]::GetFullPath($RepositoryRoot)
$sourceWorkdir = Join-Path $repo 'database/canonical-baseline-v1'
$temporaryRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd([IO.Path]::DirectorySeparatorChar)
$workdir = Join-Path $temporaryRoot ("forge-baseline-v1-cert-{0}" -f [guid]::NewGuid().ToString('N'))
$projectId = 'forge-baseline-v1-' + [guid]::NewGuid().ToString('N').Substring(0,12)
$portBase = Get-Random -Minimum 58000 -Maximum 59000
$started = $false

function Invoke-Supabase([string[]]$Arguments) {
  & supabase @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Supabase command failed ($LASTEXITCODE): supabase $($Arguments -join ' ')"
  }
}

function Copy-BaselineMigrations {
  foreach ($migration in (Get-ChildItem -LiteralPath (Join-Path $sourceWorkdir 'supabase/migrations') -Filter '*.sql' -File)) {
    Copy-Item -LiteralPath $migration.FullName -Destination (Join-Path $workdir 'supabase/migrations')
  }
  foreach ($migration in (Get-ChildItem -LiteralPath (Join-Path $repo 'supabase/migrations') -Filter '*.sql' -File | Sort-Object Name)) {
    if ($migration.BaseName -match '^(?<version>\d{8,14})_' -and
        $Matches.version -ge '20261022000000' -and
        ($CatalogStage -in @('aggregate-attempt','owner-hearth-aggregate-enforcement','provider-alignment','hammer-renewal-compatibility') -or
          ($CatalogStage -eq 'financial-environment' -and $Matches.version -le '20261103234636') -or
          ($CatalogStage -eq 'recovery' -and $Matches.version -le '20261103193845') -or
          ($CatalogStage -eq 'aggregate-envelope' -and $Matches.version -le '20261103185024'))) {
      Copy-Item -LiteralPath $migration.FullName -Destination (Join-Path $workdir 'supabase/migrations')
    }
  }
}


# Operational predecessor fixtures require a precise installed head. Validate
# the complete assembled tail first, then hold back ALL later migration files.
function Hold-CatalogStageSuffix {
  $head = if ($CatalogStage -eq 'aggregate-attempt') { '20261104003358' } else { '20261104071802' }
  foreach ($file in @(Get-ChildItem -LiteralPath (Join-Path $workdir 'supabase/migrations') -Filter '*.sql' -File)) {
    if ($file.BaseName.Substring(0,14) -gt $head) { Remove-Item -LiteralPath $file.FullName }
  }
  Assert-CatalogStageMigrationPrefix
}

function Get-FileSha256([string]$Path) {
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Assert-CatalogStageMigrationPrefix {
  $baselineSource = Join-Path $sourceWorkdir 'supabase/migrations'
  $target = Join-Path $workdir 'supabase/migrations'
  $baselineNames = @(Get-ChildItem -LiteralPath $baselineSource -Filter '*.sql' -File | Sort-Object Name | ForEach-Object Name)
  $stageMaximum = if ($CatalogStage -eq 'hammer-renewal-compatibility') {
    # Provider alignment and renewal compatibility are installed only after
    # their guarded disposable prerequisites.  The initial prefix ends at the
    # reviewed owner-Hearth enforcement migration.
    '20261104071802'
  } elseif ($CatalogStage -eq 'provider-alignment') {
    # The provider-alignment migration is deliberately installed only after
    # its guarded disposable authority fixture.  Before that fixture, the
    # exact expected prefix ends at the reviewed owner-Hearth repair.
    '20261104071802'
  } elseif ($CatalogStage -eq 'financial-environment') {
    '20261103234636'
  } elseif ($CatalogStage -eq 'recovery') {
    '20261103193845'
  } elseif ($CatalogStage -eq 'aggregate-envelope') {
    '20261103185024'
  } elseif ($CatalogStage -eq 'aggregate-attempt') {
    '20261104003358'
  } elseif ($CatalogStage -eq 'owner-hearth-aggregate-enforcement') {
    '20261104071802'
  } else {
    '99999999999999'
  }
  $tailFiles = @(Get-ChildItem -LiteralPath (Join-Path $repo 'supabase/migrations') -Filter '*.sql' -File | Sort-Object Name | Where-Object {
    $_.BaseName -match '^(?<version>\d{8,14})_' -and $Matches.version -ge '20261022000000' -and $Matches.version -le $stageMaximum
  })
  $expectedNames = @($baselineNames + @($tailFiles | ForEach-Object Name))
  $actualNames = @(Get-ChildItem -LiteralPath $target -Filter '*.sql' -File | Sort-Object Name | ForEach-Object Name)
  if (($expectedNames -join "`n") -ne ($actualNames -join "`n")) {
    throw "Catalog-stage migration prefix differs for $CatalogStage."
  }
  foreach ($name in $baselineNames) {
    if ((Get-FileSha256 (Join-Path $baselineSource $name)) -ne (Get-FileSha256 (Join-Path $target $name))) {
      throw "Catalog-stage baseline bytes differ: $name"
    }
  }
  foreach ($migration in $tailFiles) {
    if ((Get-FileSha256 $migration.FullName) -ne (Get-FileSha256 (Join-Path $target $migration.Name))) {
      throw "Catalog-stage shared-tail bytes differ: $($migration.Name)"
    }
  }
}

function Assert-CatalogStageDatabaseHistory([string]$Container) {
  $expected = @(Get-ChildItem -LiteralPath (Join-Path $workdir 'supabase/migrations') -Filter '*.sql' -File | Sort-Object Name | ForEach-Object {
    if ($_.BaseName -match '^(?<version>\d{8,14})_') { $Matches.version }
  })
  $actual = @(& docker exec $Container psql -X -A -t -U postgres -d postgres -c 'select version from supabase_migrations.schema_migrations order by version')
  if ($LASTEXITCODE -ne 0) { throw 'Unable to read disposable catalog-stage migration history.' }
  $actual = @($actual | ForEach-Object { $_.Trim() } | Where-Object { $_ })
  if (($expected -join "`n") -ne ($actual -join "`n")) {
    throw "Disposable catalog-stage migration history differs for $CatalogStage."
  }
  $lineage = @(& docker exec $Container psql -X -A -t -U postgres -d postgres -c "select lineage from forge_meta.database_lineage where singleton is true")
  $lineage = @($lineage | ForEach-Object { $_.Trim() } | Where-Object { $_ })
  if ($LASTEXITCODE -ne 0 -or $lineage.Count -ne 1 -or $lineage[0] -ne 'baseline-v1') {
    throw 'Disposable catalog-stage database lineage is not baseline-v1.'
  }
}

try {
  $actualCliVersion = (& supabase --version 2>$null | Select-Object -First 1).Trim()
  if ($actualCliVersion -ne $requiredCliVersion) {
    throw "Supabase CLI $requiredCliVersion is required; found $actualCliVersion."
  }
  & (Join-Path $repo 'scripts/verify-canonical-database-artifacts.ps1') -RepositoryRoot $repo | Out-Null
  & docker info *> $null
  if ($LASTEXITCODE -ne 0) {
    throw 'Docker Desktop is unavailable. Start it manually; this script will not start or repair it.'
  }

  New-Item -ItemType Directory -Path (Join-Path $workdir 'supabase/migrations') -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $sourceWorkdir '.forge-database-lineage.json') -Destination $workdir
  $config = Get-Content -LiteralPath (Join-Path $sourceWorkdir 'supabase/config.toml') -Raw
  $config = $config.Replace('project_id = "forge-canonical-baseline-v1"', "project_id = `"$projectId`"")
  $config = $config.Replace('port = 55321', "port = $portBase")
  $config = $config.Replace('port = 55322', "port = $($portBase + 1)")
  $config = $config.Replace('shadow_port = 55320', "shadow_port = $($portBase + 2)")
  [IO.File]::WriteAllText((Join-Path $workdir 'supabase/config.toml'), $config, [Text.UTF8Encoding]::new($false))

  if ($DefaultPrivilegeMode -eq 'permissive') {
    Copy-BaselineMigrations
    if ($CatalogStage -in @('aggregate-attempt','owner-hearth-aggregate-enforcement','provider-alignment','hammer-renewal-compatibility')) {
      & (Join-Path $repo 'scripts/verify-supabase-lineage.ps1') -Lineage baseline -Workdir $workdir -DatabaseTarget none -Mode bootstrap -RepositoryRoot $repo | Out-Null
      Hold-CatalogStageSuffix
    } else {
      Assert-CatalogStageMigrationPrefix
    }
    Invoke-Supabase @('start','--workdir',$workdir,'--ignore-health-check','--agent=no')
    $started = $true
  }
  else {
    # Start the Supabase platform with no Forge migration, establish a restrictive
    # ambient default-privilege state, then apply the unmodified baseline through
    # the normal CLI migration runner.
    Invoke-Supabase @('start','--workdir',$workdir,'--ignore-health-check','--agent=no')
    $started = $true
    $restrictiveSql = @'
do $restrictive_defaults$
begin
  execute 'alter default privileges for role postgres revoke all on tables from anon, authenticated, service_role';
  execute 'alter default privileges for role postgres revoke all on sequences from anon, authenticated, service_role';
  execute 'alter default privileges for role postgres revoke all on functions from anon, authenticated, service_role';
  execute 'alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated, service_role';
  execute 'alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated, service_role';
  execute 'alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated, service_role';
end
$restrictive_defaults$
'@
    Invoke-Supabase @('db','query','--local','--workdir',$workdir,'--agent=no',$restrictiveSql)
    Copy-BaselineMigrations
    if ($CatalogStage -in @('aggregate-attempt','owner-hearth-aggregate-enforcement','provider-alignment','hammer-renewal-compatibility')) {
      & (Join-Path $repo 'scripts/verify-supabase-lineage.ps1') -Lineage baseline -Workdir $workdir -DatabaseTarget none -Mode bootstrap -RepositoryRoot $repo | Out-Null
      Hold-CatalogStageSuffix
    } else {
      Assert-CatalogStageMigrationPrefix
    }
    Invoke-Supabase @('migration','up','--local','--workdir',$workdir,'--yes')
  }

  Assert-CatalogStageMigrationPrefix
  Assert-CatalogStageDatabaseHistory -Container "supabase_db_$projectId"
  Invoke-Supabase @('db','query','--local','--workdir',$workdir,'--agent=no',"notify pgrst, 'reload schema';")
  if ($DefaultPrivilegeMode -eq 'restrictive') {
    # This lane intentionally starts PostgREST before the tongs schema exists.
    # Restart only the disposable lane's REST container after applying the
    # baseline so certification does not depend on PostgREST reconnect backoff.
    & docker restart "supabase_rest_$projectId" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Unable to restart the disposable PostgREST container.' }
  }

  $container = "supabase_db_$projectId"
  if ($CatalogStage -in @('aggregate-attempt','owner-hearth-aggregate-enforcement','provider-alignment','hammer-renewal-compatibility')) {
    if ($container -ne "supabase_db_$projectId" -or
        $projectId -notmatch '^forge-baseline-v1-[0-9a-f]{12}$' -or
        -not $workdir.StartsWith($temporaryRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
      throw 'Owner-Hearth policy fixture host identity is not the exact disposable certification environment.'
    }
    $fixture = Join-Path $repo 'supabase/tests/fixtures/canonical_owner_hearth_aggregate_policy_prerequisites.sql'
    $fixtureTarget = '/tmp/canonical_owner_hearth_aggregate_policy_prerequisites.sql'
    & docker cp $fixture "${container}:$fixtureTarget"
    if ($LASTEXITCODE -ne 0) { throw 'Unable to copy the owner-Hearth aggregate-policy fixture.' }
    & docker exec $container psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres `
      -c "select set_config('forge.owner_hearth_policy_fixture','disposable-baseline-v1',false);" -f $fixtureTarget
    if ($LASTEXITCODE -ne 0) { throw 'Owner-Hearth aggregate-policy fixture failed.' }
  }
  if ($CatalogStage -in @('provider-alignment','hammer-renewal-compatibility')) {
    $fixture = Join-Path $repo 'supabase/tests/fixtures/canonical_luna_provider_alignment_authority.sql'
    $fixtureTarget = '/tmp/canonical_luna_provider_alignment_authority.sql'
    & docker cp $fixture "${container}:$fixtureTarget"
    if ($LASTEXITCODE -ne 0) { throw 'Unable to copy the Luna provider-alignment authority fixture.' }
    & docker exec $container psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres `
      -c "select set_config('forge.provider_alignment_fixture','disposable-baseline-v1',false);" -f $fixtureTarget
    if ($LASTEXITCODE -ne 0) { throw 'Luna provider-alignment authority fixture failed.' }
    Copy-Item -LiteralPath (Join-Path $repo 'supabase/migrations/20261104143249_align_provider_requests_and_luna_financial_authority.sql') `
      -Destination (Join-Path $workdir 'supabase/migrations')
    Invoke-Supabase @('migration','up','--local','--workdir',$workdir,'--yes')

  }
  if ($CatalogStage -eq 'hammer-renewal-compatibility') {
    Copy-Item -LiteralPath (Join-Path $repo 'supabase/migrations/20261104212918_hammer_canary_renewal_tooling_compatibility.sql') `
      -Destination (Join-Path $workdir 'supabase/migrations')
    Invoke-Supabase @('migration','up','--local','--workdir',$workdir,'--yes')
  }
  if ($CatalogStage -in @('aggregate-attempt','owner-hearth-aggregate-enforcement','provider-alignment','hammer-renewal-compatibility')) {
    # Check the exact installed stage before restoring the pending suffix. Full
    # lineage preflight then verifies canonical bytes and a chronological DB
    # prefix without applying migrations outside this frozen catalog contract.
    Assert-CatalogStageDatabaseHistory -Container $container
    Copy-BaselineMigrations
    & (Join-Path $repo 'scripts/verify-supabase-lineage.ps1') -Lineage baseline -Workdir $workdir -DatabaseTarget local -Mode preflight -RepositoryRoot $repo | Out-Null
  }
  $successorParityPath = Join-Path $workdir 'account-admission-activation-preparation-public-slice-a-catalog-parity.sql'
  & (Join-Path $repo 'scripts/new-beta-invitation-public-slice-a-parity.ps1') -OutputPath $successorParityPath -RepositoryRoot $repo | Out-Null
  foreach ($test in @(
    $successorParityPath,
    'supabase/tests/public_slice_a_security_behavior.sql',
    'supabase/tests/gate6o_episode_storage_tier_contract.sql'
    'supabase/tests/gate6p_storage_bucket_contract.sql'
    'supabase/tests/hammer_first_transcription_activation_contract.sql'
    'supabase/tests/hammer_brad_first_transcription_authority_bundle_contract.sql'
    'supabase/tests/hammer_transcription_integrated_recovery_contract.sql'
    'supabase/tests/shared_spending_quote_financial_environment.sql'
    'supabase/tests/hammer_aggregate_attempt_smallint_signature.sql'
    'supabase/tests/hammer_transcription_real_database_integration.sql'
    'supabase/tests/aggregate_paid_execution_connection.sql'
    'supabase/tests/owner_funded_hearth_activation.sql'
    'supabase/tests/owner_hearth_aggregate_admission_enforcement.sql'
    'supabase/tests/provider_request_financial_alignment.sql'
    'supabase/tests/runway_success_financial_finalization.sql'
    'supabase/tests/runway_paid_execution_boundary.sql'
    'supabase/tests/luna_canary_canonical_tenant_setup.sql'
    'supabase/tests/customer_hearth_luna_current_denial.sql'
    'supabase/tests/account_admission_authority.sql'
    'supabase/tests/beta_invitation_provisioning.sql'
    'supabase/tests/account_admission_enforcement_inactive.sql'
    'supabase/tests/account_admission_activation_preparation_inactive.sql'
  )) {
    if ($test -eq 'supabase/tests/hammer_transcription_integrated_recovery_contract.sql' -and $CatalogStage -eq 'aggregate-envelope') { continue }
    if ($test -eq 'supabase/tests/shared_spending_quote_financial_environment.sql' -and $CatalogStage -notin @('financial-environment','aggregate-attempt','owner-hearth-aggregate-enforcement','provider-alignment')) { continue }
    if ($test -in @('supabase/tests/hammer_aggregate_attempt_smallint_signature.sql','supabase/tests/hammer_transcription_real_database_integration.sql') -and $CatalogStage -ne 'aggregate-attempt') { continue }
    if ($test -in @('supabase/tests/aggregate_paid_execution_connection.sql','supabase/tests/owner_funded_hearth_activation.sql','supabase/tests/runway_success_financial_finalization.sql') -and $CatalogStage -ne 'aggregate-attempt') { continue }
    if ($test -eq 'supabase/tests/owner_hearth_aggregate_admission_enforcement.sql' -and $CatalogStage -ne 'owner-hearth-aggregate-enforcement') { continue }
    if ($test -eq 'supabase/tests/provider_request_financial_alignment.sql' -and $CatalogStage -notin @('provider-alignment','hammer-renewal-compatibility')) { continue }
    if ($test -in @('supabase/tests/runway_paid_execution_boundary.sql','supabase/tests/luna_canary_canonical_tenant_setup.sql') -and $CatalogStage -ne 'owner-hearth-aggregate-enforcement') { continue }
    if ($test -eq 'supabase/tests/customer_hearth_luna_current_denial.sql' -and $CatalogStage -notin @('provider-alignment','hammer-renewal-compatibility')) { continue }
    if ($test -eq 'supabase/tests/hammer_transcription_real_database_integration.sql' -and $SkipHammerRealDatabaseIntegration) { continue }
    $source = if ([IO.Path]::IsPathFullyQualified($test)) { $test } else { Join-Path $repo $test }
    $target = '/tmp/' + [IO.Path]::GetFileName($test)
    & docker cp $source "${container}:$target"
    if ($LASTEXITCODE -ne 0) { throw "Unable to copy $test into the disposable database." }
    if ($test -eq 'supabase/tests/hammer_transcription_real_database_integration.sql') {
      & docker exec $container psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres `
        -c "select set_config('forge.hammer_real_db_certification','disposable-baseline-v1',false), set_config('request.jwt.claim.role','service_role',false);" -f $target
    }
    elseif ($test -eq 'supabase/tests/runway_paid_execution_boundary.sql') {
      & docker exec $container psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres `
        -c "select set_config('forge.runway_boundary_certification','disposable-baseline-v1',false);" -f $target
    }
    elseif ($test -eq 'supabase/tests/luna_canary_canonical_tenant_setup.sql') {
      # The historical successful-execution canary remains in its isolated harness.
      & docker exec $container psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres `
        -c "select set_config('forge.luna_canary_certification','disposable-baseline-v1',false);" -f $target
    }
    elseif ($test -eq 'supabase/tests/customer_hearth_luna_current_denial.sql') {
      $tenantSource = Join-Path $repo 'supabase/tests/luna_canary_canonical_tenant_setup.sql'
      $tenantTarget = '/tmp/luna_canary_canonical_tenant_setup.sql'
      & docker cp $tenantSource "$($container):$tenantTarget"
      if ($LASTEXITCODE -ne 0) { throw 'Unable to copy Luna canonical tenant proof.' }
      # One connection preserves the original-state snapshot across both rollbacks.
      & docker exec $container psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres `
        -c "select set_config('forge.luna_canary_certification','disposable-baseline-v1',false), set_config('forge.luna_current_denial_certification','disposable-baseline-v1',false);" `
        -f $tenantTarget -f $target `
        -c "select pg_temp.assert_luna_original_state(); drop table pg_temp.luna_original_state;"
    }
    else {
      & docker exec $container psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -f $target
    }
    if ($LASTEXITCODE -ne 0) { throw "Database test failed: $test" }
  }

  $savedContainer = $env:SUPABASE_DB_CONTAINER
  try {
    $env:SUPABASE_DB_CONTAINER = $container
    & node (Join-Path $repo 'scripts/verify-barstock-persistence-db.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'Bar Stock successor lifecycle certification failed.' }
  }
  finally { $env:SUPABASE_DB_CONTAINER = $savedContainer }

  & (Join-Path $repo 'scripts/test-canonical-baseline-v1-data-api.ps1') -Workdir $workdir
  if ($LASTEXITCODE -ne 0) { throw 'Disposable Data API behavior test failed.' }

  $actualFingerprint = Join-Path $workdir 'canonical-application-catalog-fingerprint.json'
  $successorFingerprint = if ($CatalogStage -eq 'hammer-renewal-compatibility') {
    Join-Path $repo 'docs/database/baseline/v1-hammer-canary-renewal-tooling-compatibility/successor-catalog-fingerprint.json'
  } elseif ($CatalogStage -eq 'aggregate-envelope') {
    Join-Path $repo 'docs/database/baseline/v1-hammer-assemblyai-aggregate-envelope-alignment/successor-catalog-fingerprint.json'
  } elseif ($CatalogStage -eq 'recovery') {
    Join-Path $repo 'docs/database/baseline/v1-hammer-transcription-integrated-recovery/successor-catalog-fingerprint.json'
  } elseif ($CatalogStage -eq 'financial-environment') {
    Join-Path $repo 'docs/database/baseline/v1-shared-spending-quote-financial-environment/successor-catalog-fingerprint.json'
  } elseif ($CatalogStage -eq 'aggregate-attempt') {
    Join-Path $repo 'docs/database/baseline/v1-hammer-aggregate-attempt-smallint-signature/successor-catalog-fingerprint.json'
  } elseif ($CatalogStage -eq 'owner-hearth-aggregate-enforcement') {
    Join-Path $repo 'docs/database/baseline/v1-owner-hearth-aggregate-admission-enforcement/successor-catalog-fingerprint.json'
  } else {
    Join-Path $repo 'docs/database/baseline/v1-provider-request-financial-alignment/successor-catalog-fingerprint.json'
  }
  Push-Location $workdir
  try {
    if ($MaterializeSuccessorCatalog) {
      if ($DefaultPrivilegeMode -ne 'permissive') { throw 'Successor catalog materialization is permitted only in the permissive lane.' }
      if (Test-Path -LiteralPath $successorFingerprint) { throw 'Successor catalog evidence already exists; refusing to overwrite it.' }
      $null = & (Join-Path $repo 'scripts/capture-canonical-baseline-v1-catalog.ps1') -Target local -OutputPath $successorFingerprint -ExtensionCompatibilityPath (Join-Path $repo 'docs/database/baseline/v1-gate3/wrappers-extension-compatibility.json') -RepositoryRoot $repo | ConvertFrom-Json
      $catalogResult = & node (Join-Path $repo 'scripts/normalize-canonical-catalog-for-production.mjs') --catalog $successorFingerprint --compatibility (Join-Path $repo 'docs/database/baseline/v1-gate3/wrappers-extension-compatibility.json') --output $successorFingerprint | ConvertFrom-Json
    }
    else {
      $catalogResult = & (Join-Path $repo 'scripts/capture-canonical-baseline-v1-catalog.ps1') -Target local -OutputPath $actualFingerprint -ExpectedPath $successorFingerprint -ExtensionCompatibilityPath (Join-Path $repo 'docs/database/baseline/v1-gate3/wrappers-extension-compatibility.json') -RepositoryRoot $repo | ConvertFrom-Json
    }
  }
  finally { Pop-Location }

  [pscustomobject]@{
    ok = $true
    schema = "forge.$CatalogStage-baseline-successor-certification.v1"
    cliVersion = $actualCliVersion
    defaultPrivilegeMode = $DefaultPrivilegeMode
    catalogObjectCount = $catalogResult.objectCount
    catalogContractSha256 = $catalogResult.contractSha256
    approvedEnvironmentalDifferences = @($catalogResult.approvedEnvironmentalDifferences)
    workdir = $workdir
    projectId = $projectId
  } | ConvertTo-Json -Compress
}
finally {
  if ($started) {
    & supabase stop --workdir $workdir --no-backup --yes --agent=no *> $null
  }
  $resolved = [IO.Path]::GetFullPath($workdir)
  if ($resolved.StartsWith($temporaryRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -and
      [IO.Path]::GetFileName($resolved).StartsWith('forge-baseline-v1-cert-', [StringComparison]::Ordinal)) {
    if (Test-Path -LiteralPath $resolved) { Remove-Item -LiteralPath $resolved -Recurse -Force }
  }
}
