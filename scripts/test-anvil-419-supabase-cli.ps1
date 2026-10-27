$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib/forge-supabase-cli.ps1')

function Assert-True([bool]$Condition, [string]$Message) { if (-not $Condition) { throw $Message } }
function Assert-Throws([scriptblock]$Operation, [string]$Pattern) {
  try { & $Operation; throw 'Expected operation to fail.' }
  catch { if ($_.Exception.Message -notmatch $Pattern) { throw "Unexpected error: $($_.Exception.Message)" } }
}

$pwsh = (Get-Process -Id $PID).Path
$separated = Invoke-ForgeSupabaseCli -Executable $pwsh -Arguments @(
  '-NoProfile','-Command',
  '[Console]::Out.WriteLine("lineage"); [Console]::Out.WriteLine("historical-v1"); [Console]::Error.WriteLine("update warning")'
)
Assert-True ($separated.ExitCode -eq 0) 'Successful CLI exit code was not preserved.'
Assert-True ($separated.StandardError -match 'update warning') 'CLI stderr was not captured independently.'
$lineageRows = @(ConvertFrom-ForgeSupabaseCsv -StandardOutput $separated.StandardOutput -ExpectedColumns @('lineage') -Context 'lineage')
Assert-True ($lineageRows.Count -eq 1 -and $lineageRows[0].lineage -ceq 'historical-v1') 'Valid lineage CSV was not parsed exactly once.'

$multiple = @(ConvertFrom-ForgeSupabaseCsv -StandardOutput "lineage`nhistorical-v1`nhistorical-v1`n" -ExpectedColumns @('lineage') -Context 'lineage')
Assert-Throws { if ($multiple.Count -ne 1) { throw 'Hosted lineage singleton is unavailable.' } } 'singleton'
Assert-Throws { ConvertFrom-ForgeSupabaseCsv -StandardOutput "lineage`n" -ExpectedColumns @('lineage') -Context 'lineage' } 'no CSV data rows'
Assert-Throws { ConvertFrom-ForgeSupabaseCsv -StandardOutput "wrong`nhistorical-v1`n" -ExpectedColumns @('lineage') -Context 'lineage' } 'unexpected CSV header'
$malformed = "lineage`n" + [char]34 + "unterminated`n"
Assert-Throws { ConvertFrom-ForgeSupabaseCsv -StandardOutput $malformed -ExpectedColumns @('lineage') -Context 'lineage' } 'malformed CSV'

$secret = 'fixture-secret-never-emit'
Assert-Throws {
  Invoke-ForgeSupabaseCli -Executable $pwsh -Arguments @(
    '-NoProfile','-Command',
    "[Console]::Error.WriteLine('password=$secret'); exit 7"
  )
} '^Supabase command failed \(exit 7; diagnostics: authentication_or_permission\)\. Output withheld\.$'

[pscustomobject]@{
  ok = $true
  schema = 'forge.anvil-419-supabase-cli-certification.v1'
  stdoutStderrSeparated = $true
  strictCsv = $true
  nonzeroExitFailsClosed = $true
  stderrExcludedFromData = $true
  secretReturned = $false
} | ConvertTo-Json -Compress
