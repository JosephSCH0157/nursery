[CmdletBinding()]
param([string]$RepositoryRoot = (Split-Path -Parent $PSScriptRoot))

$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath($RepositoryRoot)
$temporaryRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd([IO.Path]::DirectorySeparatorChar)
$runId = [guid]::NewGuid().ToString('N').Substring(0,12)
$projectId = "forge-g6o-browser-$runId"
$workdir = Join-Path $temporaryRoot $projectId
$started = $false
$sensitiveNames = @(
  'FORGE_BROWSER_FIXTURE_PASSWORD','TONGS_API_TOKEN','VITE_TONGS_API_TOKEN',
  'VITE_SUPABASE_ANON_KEY','SUPABASE_ANON_KEY','TONGS_SUPABASE_ANON_KEY',
  'TONGS_SERVICE_ROLE_KEY','SUPABASE_SERVICE_ROLE_KEY'
)
$managedNames = @(
  'FORGE_BROWSER_SUPABASE_WORKDIR','FORGE_BROWSER_FIXTURE_EMAIL',
  'FORGE_BROWSER_FIXTURE_MANIFEST','FORGE_BROWSER_FIXTURE_RECEIPT',
  'HEARTH_PHASE4_FIXTURE_ARTIFACT','PLAYWRIGHT_STORAGE_STATE',
  'VITE_SUPABASE_URL','SUPABASE_URL','TONGS_SUPABASE_URL'
) + $sensitiveNames
$savedEnvironment = @{}
try {
  & docker info *> $null
  if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop is unavailable. Start it manually.' }
  foreach ($name in $managedNames) { $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }

  & (Join-Path $repo 'scripts/new-forge-database-workdir.ps1') `
    -OutputPath $workdir -ProjectId $projectId -ApiPort (Get-Random -Minimum 57000 -Maximum 57900) `
    -SiteUrl 'http://127.0.0.1:5173' -Lineage baseline -RepositoryRoot $repo | Out-Null

  $password = 'Fixture-Aa1!' + [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(24)).ToLowerInvariant()
  $tongsToken = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLowerInvariant()
  [Environment]::SetEnvironmentVariable('FORGE_BROWSER_SUPABASE_WORKDIR', $workdir, 'Process')
  [Environment]::SetEnvironmentVariable('FORGE_BROWSER_FIXTURE_EMAIL', "forge-browser-$runId@example.invalid", 'Process')
  [Environment]::SetEnvironmentVariable('FORGE_BROWSER_FIXTURE_PASSWORD', $password, 'Process')
  [Environment]::SetEnvironmentVariable('TONGS_API_TOKEN', $tongsToken, 'Process')
  [Environment]::SetEnvironmentVariable('VITE_TONGS_API_TOKEN', $tongsToken, 'Process')
  [Environment]::SetEnvironmentVariable('FORGE_BROWSER_FIXTURE_MANIFEST', (Join-Path $workdir 'browser-fixtures.v1.json'), 'Process')
  [Environment]::SetEnvironmentVariable('FORGE_BROWSER_FIXTURE_RECEIPT', (Join-Path $workdir 'browser-fixtures-verification.v1.json'), 'Process')
  [Environment]::SetEnvironmentVariable('HEARTH_PHASE4_FIXTURE_ARTIFACT', (Join-Path $workdir 'hearth-phase4-fixtures.json'), 'Process')
  [Environment]::SetEnvironmentVariable('PLAYWRIGHT_STORAGE_STATE', (Join-Path $workdir 'auth-state.json'), 'Process')

  $startLog = Join-Path $workdir 'supabase-start.log'
  & (Join-Path $repo 'scripts/invoke-forge-database.ps1') -Lineage baseline -Action Start -Workdir $workdir -RepositoryRoot $repo *> $startLog
  if ($LASTEXITCODE -ne 0) { throw 'Disposable browser Supabase startup failed; sensitive local output is suppressed.' }
  $started = $true

  $statusText = (& supabase status --workdir $workdir --output json 2>$null | Out-String)
  if ($LASTEXITCODE -ne 0) { throw 'Unable to read disposable browser Supabase status.' }
  $status = $statusText | ConvertFrom-Json
  if (([uri]$status.API_URL).Host -notin @('127.0.0.1','localhost','::1')) { throw 'Disposable browser API is not local.' }
  foreach ($entry in @{
    VITE_SUPABASE_URL=$status.API_URL; SUPABASE_URL=$status.API_URL; TONGS_SUPABASE_URL=$status.API_URL;
    VITE_SUPABASE_ANON_KEY=$status.ANON_KEY; SUPABASE_ANON_KEY=$status.ANON_KEY; TONGS_SUPABASE_ANON_KEY=$status.ANON_KEY;
    TONGS_SERVICE_ROLE_KEY=$status.SERVICE_ROLE_KEY; SUPABASE_SERVICE_ROLE_KEY=$status.SERVICE_ROLE_KEY
  }.GetEnumerator()) {
    if ([string]::IsNullOrWhiteSpace([string]$entry.Value)) { throw "Disposable browser status omitted $($entry.Key)." }
    [Environment]::SetEnvironmentVariable($entry.Key, [string]$entry.Value, 'Process')
  }

  $databaseContainers = @(docker ps --filter "label=com.supabase.cli.project=$projectId" --format '{{.Names}}' |
    Where-Object { $_ -like 'supabase_db_*' })
  if ($databaseContainers.Count -ne 1) { throw 'Disposable browser database container identity is ambiguous.' }
  $databaseContainer = $databaseContainers[0]
  $migrationPath = Join-Path $repo 'supabase/migrations/20261025080943_provision_required_storage_buckets.sql'
  $contractTestPath = Join-Path $repo 'supabase/tests/gate6p_storage_bucket_contract.sql'
  & docker cp $migrationPath "${databaseContainer}:/tmp/gate6p-storage-buckets.sql" *> $null
  if ($LASTEXITCODE -ne 0) { throw 'Unable to stage the Gate 6P migration in the disposable database.' }
  & docker cp $contractTestPath "${databaseContainer}:/tmp/gate6p-storage-contract.sql" *> $null
  if ($LASTEXITCODE -ne 0) { throw 'Unable to stage the Gate 6P Storage test in the disposable database.' }

  $bucketSnapshotBefore = (& docker exec $databaseContainer psql -X -A -t -v ON_ERROR_STOP=1 -U postgres -d postgres -c `
    "select jsonb_agg(to_jsonb(bucket) order by id)::text from storage.buckets bucket where id in ('bellows-capture','forge-workpieces');" | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($bucketSnapshotBefore)) { throw 'Unable to snapshot required Storage buckets.' }
  & docker exec $databaseContainer psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -f /tmp/gate6p-storage-buckets.sql *> $null
  if ($LASTEXITCODE -ne 0) { throw 'Gate 6P repeated provisioning failed.' }
  $bucketSnapshotAfter = (& docker exec $databaseContainer psql -X -A -t -v ON_ERROR_STOP=1 -U postgres -d postgres -c `
    "select jsonb_agg(to_jsonb(bucket) order by id)::text from storage.buckets bucket where id in ('bellows-capture','forge-workpieces');" | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or $bucketSnapshotAfter -cne $bucketSnapshotBefore) { throw 'Gate 6P repeated provisioning changed a correct bucket record.' }

  & docker exec $databaseContainer psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -c `
    "update storage.buckets set public=true where id='forge-workpieces';" *> $null
  if ($LASTEXITCODE -ne 0) { throw 'Unable to prepare the visibility-conflict regression.' }
  & docker exec $databaseContainer psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -f /tmp/gate6p-storage-buckets.sql *> $null
  if ($LASTEXITCODE -eq 0) { throw 'Gate 6P accepted a public forge-workpieces bucket.' }
  $publicConflict = (& docker exec $databaseContainer psql -X -A -t -v ON_ERROR_STOP=1 -U postgres -d postgres -c `
    "select public::text from storage.buckets where id='forge-workpieces';" | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or $publicConflict -cne 'true') { throw 'Visibility-conflict failure did not roll back completely.' }
  & docker exec $databaseContainer psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -c `
    "update storage.buckets set public=false where id='forge-workpieces';" *> $null
  if ($LASTEXITCODE -ne 0) { throw 'Unable to restore the disposable visibility probe.' }

  & docker exec $databaseContainer psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -c `
    "update storage.buckets set allowed_mime_types=array['video/webm']::text[] where id='bellows-capture';" *> $null
  if ($LASTEXITCODE -ne 0) { throw 'Unable to prepare the upload-restriction conflict regression.' }
  & docker exec $databaseContainer psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -f /tmp/gate6p-storage-buckets.sql *> $null
  if ($LASTEXITCODE -eq 0) { throw 'Gate 6P accepted incompatible Bellows upload restrictions.' }
  $mimeConflict = (& docker exec $databaseContainer psql -X -A -t -v ON_ERROR_STOP=1 -U postgres -d postgres -c `
    "select array_to_string(allowed_mime_types,',') from storage.buckets where id='bellows-capture';" | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or $mimeConflict -cne 'video/webm') { throw 'Upload-restriction failure did not roll back completely.' }
  & docker exec $databaseContainer psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -c `
    "update storage.buckets set allowed_mime_types=array['video/webm','video/mp4','audio/webm','application/octet-stream']::text[] where id='bellows-capture';" *> $null
  if ($LASTEXITCODE -ne 0) { throw 'Unable to restore the disposable MIME-type probe.' }

  & docker exec $databaseContainer psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -f /tmp/gate6p-storage-contract.sql *> $null
  if ($LASTEXITCODE -ne 0) { throw 'Gate 6P Storage bucket contract failed.' }

  Push-Location $repo
  try {
    & pnpm --filter nursery test:browser-fixtures
    if ($LASTEXITCODE -ne 0) { throw 'Browser fixture authority tests failed.' }
    & pnpm --filter nursery exec tsx --test tests/browser-disposable-isolation.test.mts
    if ($LASTEXITCODE -ne 0) { throw 'Browser disposable-isolation tests failed.' }
    & pnpm gate:browser
    if ($LASTEXITCODE -ne 0) { throw 'Authenticated browser gate failed.' }
  }
  finally { Pop-Location }

  [pscustomobject]@{
    ok = $true
    schema = 'forge.gate6p-browser-certification.v1'
    projectId = $projectId
    lineage = 'baseline-v1'
    hostedRequests = 0
    paidProviderOperations = 0
  } | ConvertTo-Json -Compress
}
finally {
  if ($started) {
    & (Join-Path $repo 'scripts/invoke-forge-database.ps1') -Lineage baseline -Action Stop -Workdir $workdir -RepositoryRoot $repo *> $null
  }
  foreach ($name in $managedNames) { [Environment]::SetEnvironmentVariable($name, $savedEnvironment[$name], 'Process') }
  $password = $null
  $tongsToken = $null
  $status = $null
  $statusText = $null
  $bucketSnapshotBefore = $null
  $bucketSnapshotAfter = $null
  $resolved = [IO.Path]::GetFullPath($workdir)
  if (-not $resolved.StartsWith($temporaryRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or
      [IO.Path]::GetFileName($resolved) -notlike 'forge-g6o-browser-*') {
    throw "Unsafe Gate 6O browser cleanup target: $resolved"
  }
  if (Test-Path -LiteralPath $resolved) { Remove-Item -LiteralPath $resolved -Recurse -Force }
  if (@(docker ps -a --filter "label=com.supabase.cli.project=$projectId" -q).Count -ne 0 -or
      @(docker volume ls --filter "label=com.supabase.cli.project=$projectId" -q).Count -ne 0) {
    throw 'Gate 6O browser certification left task-owned Docker resources.'
  }
}
