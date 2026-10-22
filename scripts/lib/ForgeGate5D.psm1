Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-ForgeGate5DSha256Hex {
  param([Parameter(Mandatory)][byte[]]$Bytes)
  return [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($Bytes)).ToLowerInvariant()
}

function Get-ForgeGate5DUtf8Bytes {
  param([Parameter(Mandatory)][string]$Value)
  return [Text.UTF8Encoding]::new($false).GetBytes($Value)
}

function Get-ForgeGate5DContract {
  param([Parameter(Mandatory)][string]$RepositoryRoot)
  $path = Join-Path ([IO.Path]::GetFullPath($RepositoryRoot)) 'docs/database/baseline/v1-gate5d/authentic-history-contract.json'
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw 'Gate 5D contract is missing.' }
  $contract = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
  if ($contract.schema -ne 'forge.gate5d-authentic-history-contract.v1') { throw 'Unexpected Gate 5D contract schema.' }
  return $contract
}

function Test-ForgeGate5DHash {
  param([Parameter(Mandatory)][string]$Value)
  return $Value -cmatch '^[0-9a-f]{64}$'
}

function ConvertFrom-ForgeGate5DResponse {
  param(
    [Parameter(Mandatory)][string]$ResponseJson,
    [Parameter(Mandatory)]$Contract
  )
  try { $response = $ResponseJson | ConvertFrom-Json -Depth 20 }
  catch { throw 'Management API response was malformed; confidential response content is suppressed.' }

  $rows = @($response)
  if ($rows.Count -ne 1) { throw 'Management API response must contain exactly one aggregate row.' }
  $properties = @($rows[0].psobject.Properties.Name)
  if (($properties -join ',') -ne 'gate5d_history_export') {
    throw 'Management API response contained an unexpected shape or additional columns.'
  }
  $envelope = $rows[0].gate5d_history_export
  if ($null -eq $envelope) { throw 'Management API response omitted the export envelope.' }
  $expectedEnvelope = @(
    'transaction_read_only','columns','row_count','min_version','max_version',
    'all_columns_sha256','version_sha256','statements_sha256','name_sha256',
    'created_by_sha256','idempotency_key_sha256','rollback_sha256','payload_base64'
  )
  $actualEnvelope = @($envelope.psobject.Properties.Name)
  if ((($actualEnvelope | Sort-Object) -join ',') -ne (($expectedEnvelope | Sort-Object) -join ',')) {
    throw 'Export envelope contained missing or unexpected fields.'
  }
  if ([string]$envelope.transaction_read_only -ne 'on') { throw 'Database transaction was not read-only.' }
  $columns = @($envelope.columns)
  if (($columns -join ',') -ne (@($Contract.history.columns) -join ',')) { throw 'Migration metadata column contract changed.' }
  if ([int]$envelope.row_count -ne [int]$Contract.history.rowCount -or
      [string]$envelope.min_version -ne [string]$Contract.history.minimumVersion -or
      [string]$envelope.max_version -ne [string]$Contract.history.maximumVersion) {
    throw 'Migration metadata count or version range changed.'
  }
  $hashMap = [ordered]@{
    all_columns_sha256 = [string]$Contract.history.hashes.allColumns
    version_sha256 = [string]$Contract.history.hashes.version
    statements_sha256 = [string]$Contract.history.hashes.statements
    name_sha256 = [string]$Contract.history.hashes.name
    created_by_sha256 = [string]$Contract.history.hashes.createdBy
    idempotency_key_sha256 = [string]$Contract.history.hashes.idempotencyKey
    rollback_sha256 = [string]$Contract.history.hashes.rollback
  }
  foreach ($entry in $hashMap.GetEnumerator()) {
    $actual = [string]$envelope.($entry.Key)
    if (-not (Test-ForgeGate5DHash $actual) -or $actual -cne $entry.Value) {
      throw "Migration metadata hash contract changed for $($entry.Key)."
    }
  }
  try { $payload = [Convert]::FromBase64String([string]$envelope.payload_base64) }
  catch { throw 'Migration metadata payload was not valid base64.' }
  $payloadHash = Get-ForgeGate5DSha256Hex $payload
  if ($payloadHash -cne [string]$Contract.history.hashes.allColumns) {
    [Array]::Clear($payload, 0, $payload.Length)
    throw 'Migration metadata payload hash did not match the approved source hash.'
  }
  return [pscustomobject]@{ Payload = $payload; Envelope = $envelope; PayloadSha256 = $payloadHash }
}

function Test-ForgeGate5DPayload {
  param(
    [Parameter(Mandatory)][byte[]]$Payload,
    [Parameter(Mandatory)]$Contract,
    [Parameter(Mandatory)][string]$RepositoryRoot
  )
  $text = [Text.UTF8Encoding]::new($false, $true).GetString($Payload)
  $lines = @($text -split "`n")
  if ($lines.Count -ne [int]$Contract.history.rowCount) { throw 'History payload row count changed.' }
  $versions = [System.Collections.Generic.List[string]]::new()
  foreach ($line in $lines) {
    try { $record = @($line | ConvertFrom-Json -Depth 20) }
    catch { throw 'History payload contained malformed JSON.' }
    if ($record.Count -ne 6) { throw 'History payload record did not contain exactly six fields.' }
    if ($record[0] -isnot [string] -or [string]$record[0] -cnotmatch '^\d{8,14}$') { throw 'History payload contained an invalid version.' }
    if ($null -ne $record[1] -and $record[1] -isnot [array]) { throw 'History payload statements value was not NULL or an array.' }
    if ($null -ne $record[5] -and $record[5] -isnot [array]) { throw 'History payload rollback value was not NULL or an array.' }
    $versions.Add([string]$record[0])
  }
  if (($versions | Sort-Object -Unique).Count -ne $versions.Count) { throw 'History payload contained duplicate versions.' }
  if (($versions -join ',') -ne (($versions | Sort-Object) -join ',')) { throw 'History payload versions were not chronological.' }
  $manifest = Get-Content -LiteralPath (Join-Path $RepositoryRoot 'docs/database/baseline/v1-gate1/historical-migrations.sha256.json') -Raw | ConvertFrom-Json
  $expected = @($manifest.migrations | Select-Object -First ([int]$Contract.history.rowCount) | ForEach-Object { [string]$_.version })
  if (($versions -join ',') -ne ($expected -join ',')) { throw 'History payload did not match the frozen 411-version prefix.' }
  return [pscustomobject]@{ RowCount=$versions.Count; MinimumVersion=$versions[0]; MaximumVersion=$versions[-1] }
}

function New-ForgeGate5DRestrictedDirectory {
  param([Parameter(Mandatory)][string]$Path)
  $full = [IO.Path]::GetFullPath($Path)
  $temp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
  if (-not $full.StartsWith($temp, [StringComparison]::OrdinalIgnoreCase) -or (Split-Path -Leaf $full) -notlike 'forge-gate5d-*') {
    throw 'Capsule directory must be a unique forge-gate5d-* directory beneath the OS temporary directory.'
  }
  if (Test-Path -LiteralPath $full) { throw 'Capsule directory already exists.' }
  New-Item -ItemType Directory -Path $full | Out-Null
  $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  & icacls.exe $full '/inheritance:r' '/grant:r' "*$sid`:(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Unable to restrict the capsule directory ACL.' }
  return $full
}

function Protect-ForgeGate5DCapsule {
  param(
    [Parameter(Mandatory)][byte[]]$Payload,
    [Parameter(Mandatory)][string]$Directory,
    [Parameter(Mandatory)]$Contract,
    [Parameter(Mandatory)][string]$ProjectRefHash
  )
  if (-not (Test-ForgeGate5DHash $ProjectRefHash)) { throw 'Project reference hash is invalid.' }
  $entropy = [byte[]]::new(32)
  [Security.Cryptography.RandomNumberGenerator]::Fill($entropy)
  $protected = [Security.Cryptography.ProtectedData]::Protect($Payload, $entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser)
  $capsulePath = Join-Path $Directory 'history.dpapi'
  $manifestPath = Join-Path $Directory 'manifest.json'
  # The encrypted payload is deliberately the first filesystem write.
  [IO.File]::WriteAllBytes($capsulePath, $protected)
  $manifest = [ordered]@{
    schema = 'forge.gate5d-dpapi-capsule.v1'
    encryption = 'Windows DPAPI CurrentUser'
    projectRefSha256 = $ProjectRefHash
    payloadSha256 = (Get-ForgeGate5DSha256Hex $Payload)
    encryptedSha256 = (Get-ForgeGate5DSha256Hex $protected)
    rowCount = [int]$Contract.history.rowCount
    minimumVersion = [string]$Contract.history.minimumVersion
    maximumVersion = [string]$Contract.history.maximumVersion
    entropyBase64 = [Convert]::ToBase64String($entropy)
    createdAtUtc = [DateTime]::UtcNow.ToString('o')
  }
  [IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json -Depth 6), [Text.UTF8Encoding]::new($false))
  [Array]::Clear($protected, 0, $protected.Length)
  [Array]::Clear($entropy, 0, $entropy.Length)
  return [pscustomobject]@{ CapsulePath=$capsulePath; ManifestPath=$manifestPath; Manifest=$manifest }
}

function Unprotect-ForgeGate5DCapsule {
  param([Parameter(Mandatory)][string]$Directory)
  $manifest = Get-Content -LiteralPath (Join-Path $Directory 'manifest.json') -Raw | ConvertFrom-Json
  if ($manifest.schema -ne 'forge.gate5d-dpapi-capsule.v1' -or $manifest.encryption -ne 'Windows DPAPI CurrentUser') { throw 'Unexpected capsule contract.' }
  $protected = [IO.File]::ReadAllBytes((Join-Path $Directory 'history.dpapi'))
  if ((Get-ForgeGate5DSha256Hex $protected) -cne [string]$manifest.encryptedSha256) { throw 'Encrypted capsule hash mismatch.' }
  $entropy = [Convert]::FromBase64String([string]$manifest.entropyBase64)
  $payload = [Security.Cryptography.ProtectedData]::Unprotect($protected, $entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser)
  if ((Get-ForgeGate5DSha256Hex $payload) -cne [string]$manifest.payloadSha256) {
    [Array]::Clear($payload,0,$payload.Length)
    throw 'Decrypted capsule hash mismatch.'
  }
  [Array]::Clear($protected,0,$protected.Length)
  [Array]::Clear($entropy,0,$entropy.Length)
  return [pscustomobject]@{ Payload=$payload; Manifest=$manifest }
}

function Remove-ForgeGate5DCapsule {
  param([Parameter(Mandatory)][string]$Directory)
  $full = [IO.Path]::GetFullPath($Directory)
  $temp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
  if (-not $full.StartsWith($temp,[StringComparison]::OrdinalIgnoreCase) -or (Split-Path -Leaf $full) -notlike 'forge-gate5d-*') {
    throw 'Refusing unsafe capsule cleanup target.'
  }
  if (Test-Path -LiteralPath $full) { Remove-Item -LiteralPath $full -Recurse -Force }
  if (Test-Path -LiteralPath $full) { throw 'Capsule cleanup could not be verified.' }
}

Export-ModuleMember -Function *-ForgeGate5D*
