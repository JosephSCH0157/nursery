[CmdletBinding()]
param([string]$RepositoryRoot)

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'lib/ForgeGate5D.psm1') -Force
$repo = [IO.Path]::GetFullPath($(if ($RepositoryRoot) { $RepositoryRoot } else { Split-Path -Parent $PSScriptRoot }))
$runId = [guid]::NewGuid().ToString('N')
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) "forge-gate5d-read-only-test-$runId"
$contractPath = Join-Path $tempRoot 'forge-gate5d-contract.json'
$responsePath = Join-Path $tempRoot 'forge-gate5d-response.json'
$attestationRoot = Join-Path ([IO.Path]::GetTempPath()) "forge-gate5d-attestation-$runId"
$attestationPath = Join-Path $attestationRoot 'owner-attestation.json'
$adapter = Join-Path $repo 'scripts/export-gate5d-authentic-history-read-only.ps1'
$payload = $null
$roundTrip = $null
$checks = [Collections.Generic.List[string]]::new()
$environmentNames=@('FORGE_GATE5D_DATABASE_READ_TOKEN','SUPABASE_ACCESS_TOKEN','SUPABASE_DB_PASSWORD','SUPABASE_DB_URL','DATABASE_URL','DIRECT_URL')
$savedEnvironment=@{}

function Expect-Failure([scriptblock]$Action,[string]$Pattern,[string]$Forbidden='gate5d-dedicated-secret-sentinel') {
  try { & $Action | Out-Null; throw "Expected failure matching $Pattern" }
  catch {
    if ($_.Exception.Message -notmatch $Pattern) { throw }
    if ($_.Exception.Message -match [regex]::Escape($Forbidden)) { throw 'Dedicated adapter failure leaked confidential content.' }
  }
}

function Set-SyntheticScopedToken([string]$Value) {
  [Environment]::SetEnvironmentVariable('FORGE_GATE5D_DATABASE_READ_TOKEN',$Value,'Process')
}

try {
  foreach($name in $environmentNames){$savedEnvironment[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
  New-ForgeGate5DRestrictedDirectory -Path $tempRoot | Out-Null
  New-ForgeGate5DRestrictedDirectory -Path $attestationRoot | Out-Null
  $contract = Get-ForgeGate5DContract -RepositoryRoot $repo
  $manifest = Get-Content -LiteralPath (Join-Path $repo 'docs/database/baseline/v1-gate1/historical-migrations.sha256.json') -Raw | ConvertFrom-Json
  $versions = @($manifest.migrations | Select-Object -First 411 | ForEach-Object { [string]$_.version })
  $lines = for ($i=0; $i -lt $versions.Count; $i++) {
    $record = [object[]]::new(6)
    $record[0]=$versions[$i]
    $record[1]=if($i -eq 7){$null}else{,@("select $i", "multiline`nπ", "gate5d-dedicated-secret-sentinel", ('x' * 13000))}
    $record[2]="dedicated_$i"
    $record[3]=if($i % 17 -eq 0){'synthetic@example.invalid'}else{$null}
    $record[4]=if($i % 19 -eq 0){"dedicated-$i"}else{$null}
    $record[5]=if($i % 3 -eq 0){$null}else{,@("rollback $i")}
    ConvertTo-Json -InputObject $record -Compress -Depth 10
  }
  $payload = [Text.UTF8Encoding]::new($false).GetBytes(($lines -join "`n"))
  $testContract = $contract | ConvertTo-Json -Depth 20 | ConvertFrom-Json
  $testContract.history.hashes.allColumns = Get-ForgeGate5DSha256Hex -Bytes $payload
  foreach($property in @('version','statements','name','createdBy','idempotencyKey','rollback')){
    $testContract.history.hashes.$property=Get-ForgeGate5DSha256Hex -Bytes ([Text.Encoding]::UTF8.GetBytes("dedicated-$property"))
  }
  [IO.File]::WriteAllText($contractPath,($testContract|ConvertTo-Json -Depth 20),[Text.UTF8Encoding]::new($false))

  function Write-MockResponse([hashtable]$Overrides,[switch]$ExtraField) {
    $envelope=[ordered]@{
      transaction_read_only='on';columns=@($testContract.history.columns);row_count=411
      min_version=$testContract.history.minimumVersion;max_version=$testContract.history.maximumVersion
      all_columns_sha256=$testContract.history.hashes.allColumns;version_sha256=$testContract.history.hashes.version
      statements_sha256=$testContract.history.hashes.statements;name_sha256=$testContract.history.hashes.name
      created_by_sha256=$testContract.history.hashes.createdBy;idempotency_key_sha256=$testContract.history.hashes.idempotencyKey
      rollback_sha256=$testContract.history.hashes.rollback;payload_base64=[Convert]::ToBase64String($payload)
    }
    foreach($key in $Overrides.Keys){$envelope[$key]=$Overrides[$key]}
    if($ExtraField){$envelope.unexpected='blocked'}
    $json=ConvertTo-Json -InputObject @([ordered]@{gate5d_history_export=$envelope}) -Compress -Depth 20
    [IO.File]::WriteAllText($responsePath,$json,[Text.UTF8Encoding]::new($false))
  }

  Write-MockResponse @{}
  $largeResponseBytes=(Get-Item -LiteralPath $responsePath).Length
  if($largeResponseBytes -lt 7000000 -or $largeResponseBytes -gt 12582912){throw 'Large synthetic response is outside the approved bounded-success range.'}
  $result=& $adapter -ProjectRef ('a'*20) -SyntheticTest -SyntheticContractPath $contractPath -SyntheticResponsePath $responsePath -RepositoryRoot $repo|ConvertFrom-Json
  if(-not $result.ok -or $result.hostedRequestMade -or $result.endpoint -ne '/v1/projects/{ref}/database/query/read-only' -or
     ($result.requestProperties -join ',') -ne 'query,parameters' -or -not $result.singleSelect){throw 'Dedicated adapter mock result changed.'}
  $ciphertext=[IO.File]::ReadAllBytes((Join-Path $result.capsuleDirectory 'history.dpapi'))
  if([Text.Encoding]::UTF8.GetString($ciphertext) -match 'gate5d-dedicated-secret-sentinel'){throw 'Dedicated adapter wrote plaintext.'}
  $unprotected=Unprotect-ForgeGate5DCapsule -Directory $result.capsuleDirectory
  $roundTrip=$unprotected.Payload
  if((Get-ForgeGate5DSha256Hex -Bytes $roundTrip) -cne [string]$testContract.history.hashes.allColumns){throw 'Dedicated adapter capsule round-trip failed.'}
  Remove-ForgeGate5DCapsule -Directory $result.capsuleDirectory
  $checks.Add('dedicated-adapter-large-mock-six-column-dpapi-round-trip')

  Expect-Failure { & $adapter -ProjectRef ('a'*20) -SyntheticTest -SyntheticContractPath $contractPath -SyntheticResponsePath $responsePath -SyntheticFailureInjection AfterResponseRead -RepositoryRoot $repo } 'interrupted export'
  $interruptedCapsules=@(Get-ChildItem -LiteralPath ([IO.Path]::GetTempPath()) -Directory -Filter 'forge-gate5d-read-only-*' -ErrorAction SilentlyContinue|Where-Object{$_.FullName -cne $tempRoot})
  if($interruptedCapsules.Count){throw 'Interrupted exporter left a capsule directory.'}
  $checks.Add('interrupted-export-no-capsule-cleanup')

  Write-MockResponse @{transaction_read_only='off'}
  Expect-Failure { & $adapter -ProjectRef ('a'*20) -SyntheticTest -SyntheticContractPath $contractPath -SyntheticResponsePath $responsePath -RepositoryRoot $repo } 'transaction'
  Write-MockResponse @{row_count=410}
  Expect-Failure { & $adapter -ProjectRef ('a'*20) -SyntheticTest -SyntheticContractPath $contractPath -SyntheticResponsePath $responsePath -RepositoryRoot $repo } 'count or version'
  Write-MockResponse @{} -ExtraField
  Expect-Failure { & $adapter -ProjectRef ('a'*20) -SyntheticTest -SyntheticContractPath $contractPath -SyntheticResponsePath $responsePath -RepositoryRoot $repo } 'missing or unexpected'
  [IO.File]::WriteAllText($responsePath,'{malformed gate5d-dedicated-secret-sentinel',[Text.UTF8Encoding]::new($false))
  Expect-Failure { & $adapter -ProjectRef ('a'*20) -SyntheticTest -SyntheticContractPath $contractPath -SyntheticResponsePath $responsePath -RepositoryRoot $repo } 'malformed'
  [IO.File]::WriteAllText($responsePath,('{"oversized":"'+('x'*12582913)+'"}'),[Text.UTF8Encoding]::new($false))
  Expect-Failure { & $adapter -ProjectRef ('a'*20) -SyntheticTest -SyntheticContractPath $contractPath -SyntheticResponsePath $responsePath -RepositoryRoot $repo } 'size bound'
  $checks.Add('read-only-count-shape-malformed-and-oversized-response-rejection')

  Expect-Failure { & $adapter -ProjectRef ('a'*20) -RepositoryRoot $repo } 'Authentic export is disabled'
  Expect-Failure { & $adapter -ProjectRef ('a'*20) -SyntheticTest -SyntheticContractPath $contractPath -SyntheticResponsePath $responsePath -AuthorizeAuthenticExport -RepositoryRoot $repo } 'forbidden'
  foreach($name in $environmentNames){[Environment]::SetEnvironmentVariable($name,$null,'Process')}
  Set-SyntheticScopedToken 'legacy-token'
  Expect-Failure { & $adapter -ProjectRef ('a'*20) -ScopeAttestationPath $contractPath -AuthorizeAuthenticExport -RepositoryRoot $repo } 'scoped Supabase PAT'
  if([Environment]::GetEnvironmentVariable('FORGE_GATE5D_DATABASE_READ_TOKEN','Process')){throw 'Legacy-token failure did not clear the process credential.'}
  $scoped='sbp_fc_gate5d_stage1c_synthetic'
  Set-SyntheticScopedToken $scoped
  [Environment]::SetEnvironmentVariable('SUPABASE_ACCESS_TOKEN','forbidden-broader-token','Process')
  Expect-Failure { & $adapter -ProjectRef ('a'*20) -ScopeAttestationPath $contractPath -AuthorizeAuthenticExport -RepositoryRoot $repo } 'Broader Supabase'
  if([Environment]::GetEnvironmentVariable('FORGE_GATE5D_DATABASE_READ_TOKEN','Process')){throw 'Broader-credential failure did not clear the process credential.'}
  [Environment]::SetEnvironmentVariable('SUPABASE_ACCESS_TOKEN',$null,'Process')
  $projectHash=Get-ForgeGate5DSha256Hex -Bytes ([Text.Encoding]::UTF8.GetBytes(('a'*20)))
  $attestation=[ordered]@{
    schema='forge.gate5d-scoped-token-attestation.v1'
    tokenSha256=Get-ForgeGate5DSha256Hex -Bytes ([Text.Encoding]::UTF8.GetBytes($scoped))
    projectRefSha256=$projectHash;projectRefSha256Allowlist=@($projectHash)
    permissions=@('database_read','database_write');verifiedAtUtc=[DateTimeOffset]::UtcNow.ToString('o')
    tokenExpiresAtUtc=[DateTimeOffset]::UtcNow.AddHours(1).ToString('o')
  }
  [IO.File]::WriteAllText($attestationPath,($attestation|ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
  Set-SyntheticScopedToken $scoped
  Expect-Failure { & $adapter -ProjectRef ('a'*20) -ScopeAttestationPath $attestationPath -AuthorizeAuthenticExport -RepositoryRoot $repo } 'attestation'
  $attestation.permissions=@('database_read');$attestation.projectRefSha256=('0'*64)
  [IO.File]::WriteAllText($attestationPath,($attestation|ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
  Set-SyntheticScopedToken $scoped
  Expect-Failure { & $adapter -ProjectRef ('a'*20) -ScopeAttestationPath $attestationPath -AuthorizeAuthenticExport -RepositoryRoot $repo } 'attestation'
  $attestation.projectRefSha256=$projectHash;$attestation.verifiedAtUtc=[DateTimeOffset]::UtcNow.AddDays(-2).ToString('o')
  [IO.File]::WriteAllText($attestationPath,($attestation|ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
  Set-SyntheticScopedToken $scoped
  Expect-Failure { & $adapter -ProjectRef ('a'*20) -ScopeAttestationPath $attestationPath -AuthorizeAuthenticExport -RepositoryRoot $repo } 'stale'
  $attestation.verifiedAtUtc=[DateTimeOffset]::UtcNow.ToString('o');$attestation.tokenExpiresAtUtc=[DateTimeOffset]::UtcNow.AddMinutes(-1).ToString('o')
  [IO.File]::WriteAllText($attestationPath,($attestation|ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
  Set-SyntheticScopedToken $scoped
  Expect-Failure { & $adapter -ProjectRef ('a'*20) -ScopeAttestationPath $attestationPath -AuthorizeAuthenticExport -RepositoryRoot $repo } 'expired'
  if([Environment]::GetEnvironmentVariable('FORGE_GATE5D_DATABASE_READ_TOKEN','Process')){throw 'Expired-token failure did not clear the process credential.'}
  $checks.Add('dedicated-token-broader-credential-project-permission-freshness-expiration-and-cleanup-guards')
  $source=Get-Content -LiteralPath $adapter -Raw
  if($source -match '(?i)\b(Query|Sql|Endpoint|Uri)Override\b|supabase\s+(login|link|db\s+dump)' -or
     -not $source.Contains('https://api.supabase.com/v1/projects/$ProjectRef/database/query/read-only',[StringComparison]::Ordinal)){
    throw 'Dedicated adapter exposes an override or privileged fallback.'
  }
  $checks.Add('fixed-endpoint-authentic-gate-and-no-privileged-fallback')
}
finally {
  foreach($name in $environmentNames){[Environment]::SetEnvironmentVariable($name,$savedEnvironment[$name],'Process')}
  if($payload){[Array]::Clear($payload,0,$payload.Length)}
  if($roundTrip){[Array]::Clear($roundTrip,0,$roundTrip.Length)}
  if(Test-Path -LiteralPath $tempRoot){Remove-ForgeGate5DCapsule -Directory $tempRoot}
  if(Test-Path -LiteralPath $attestationRoot){Remove-ForgeGate5DCapsule -Directory $attestationRoot}
}

[pscustomobject]@{
  ok=$true;schema='forge.gate5d-stage1c-read-only-adapter-test.v1';syntheticOnly=$true
  hostedRequestMade=$false;largeResponseBytes=$largeResponseBytes;maximumResponseBytes=12582912;checks=@($checks)
  cleanupVerified=(-not(Test-Path -LiteralPath $tempRoot) -and -not(Test-Path -LiteralPath $attestationRoot))
}|ConvertTo-Json -Depth 5 -Compress
