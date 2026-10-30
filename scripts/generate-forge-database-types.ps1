[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidateSet('baseline')][string]$Lineage,
  [string]$OutputPath = 'apps/nursery/src/lib/supabase/database.types.ts',
  [ValidateSet('public', 'tongs')][string]$Schema = 'public',
  [string]$RepositoryRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath($RepositoryRoot)
$temporaryRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd([IO.Path]::DirectorySeparatorChar)
$workdir = Join-Path $temporaryRoot ("forge-types-{0}" -f [guid]::NewGuid().ToString('N'))
$projectId = 'forge-types-' + [guid]::NewGuid().ToString('N').Substring(0,12)
$apiPort = Get-Random -Minimum 57000 -Maximum 57900
$started = $false

try {
  & (Join-Path $PSScriptRoot 'new-forge-database-workdir.ps1') -OutputPath $workdir -ProjectId $projectId -ApiPort $apiPort -Lineage baseline -RepositoryRoot $repo | Out-Null
  & (Join-Path $PSScriptRoot 'invoke-forge-database.ps1') -Lineage baseline -Action Start -Workdir $workdir -RepositoryRoot $repo | Out-Null
  $started = $true
  & (Join-Path $PSScriptRoot 'invoke-forge-database.ps1') -Lineage baseline -Action Types -Workdir $workdir -OutputPath (Join-Path $repo $OutputPath) -Schema $Schema -RepositoryRoot $repo
}
finally {
  if ($started) {
    & supabase stop --workdir $workdir --no-backup --yes --agent=no *> $null
  }
  $resolved = [IO.Path]::GetFullPath($workdir)
  if ($resolved.StartsWith($temporaryRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -and
      [IO.Path]::GetFileName($resolved).StartsWith('forge-types-', [StringComparison]::Ordinal) -and
      (Test-Path -LiteralPath $resolved)) {
    Remove-Item -LiteralPath $resolved -Recurse -Force
  }
}
