[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$OutputPath,
  [string]$RepositoryRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference='Stop'
$sourcePath=Join-Path ([IO.Path]::GetFullPath($RepositoryRoot)) 'supabase/tests/public_slice_a_catalog_parity.sql'
$source=Get-Content -LiteralPath $sourcePath -Raw
$old="('public.handle_new_user()','654de3745cc64b79795168d6800a0c3c')"
$new="('public.handle_new_user()','d0bade4f9d8fd07572f67ba262b0b3b3')"
$count=([regex]::Matches($source,[regex]::Escape($old))).Count
if($count -ne 1){throw "Expected exactly one immutable handle_new_user predecessor fingerprint; found $count."}
$successor=$source.Replace($old,$new)
$resolved=[IO.Path]::GetFullPath($OutputPath)
if(-not (Test-Path -LiteralPath (Split-Path -Parent $resolved) -PathType Container)){
  throw 'Successor parity output parent does not exist.'
}
[IO.File]::WriteAllText($resolved,$successor,[Text.UTF8Encoding]::new($false))
[pscustomobject]@{
  ok=$true
  schema='forge.beta-invitation-public-slice-a-parity-adapter.v1'
  predecessorFingerprint='654de3745cc64b79795168d6800a0c3c'
  successorFingerprint='d0bade4f9d8fd07572f67ba262b0b3b3'
  output=$resolved
} | ConvertTo-Json -Compress
