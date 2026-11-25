[CmdletBinding()]
param(
 [Parameter(Mandatory)][string]$Package,
 [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$ApprovalSha256,
 [switch]$ExecuteApprovedAcquisition
)
$ErrorActionPreference='Stop'
# Windows PowerShell launched by pwsh must not import incompatible pwsh modules.
if($PSVersionTable.PSEdition -eq 'Desktop'){$env:PSModulePath=Join-Path $PSHOME 'Modules'}
$secret=$null; $pointer=[IntPtr]::Zero; $bytes=$null; $process=$null
try {
 $node=(Get-Command node -CommandType Application | Select-Object -First 1).Source
 $script=Join-Path $PSScriptRoot 'acquire-h444-evidence.mjs'
 # No credentials are requested unless the reviewed package passes offline checks.
 & $node --max-old-space-size=768 $script --check --package $Package --approval-sha256 $ApprovalSha256
 if($LASTEXITCODE -ne 0){throw 'package invalid'}
 if(-not $ExecuteApprovedAcquisition){exit 0}
 $secret=Read-Host 'Approved acquisition credential (v4: Credential001 / entry 01; private pipe only)' -AsSecureString
 $pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
 $bytes=[Text.Encoding]::UTF8.GetBytes([Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer))
 if($bytes.Length -eq 0 -or $bytes.Length -gt 2048){throw 'credential length'}
 $info=New-Object Diagnostics.ProcessStartInfo
 $info.FileName=$node; $info.UseShellExecute=$false; $info.CreateNoWindow=$true
 $info.RedirectStandardInput=$true; $info.RedirectStandardOutput=$true; $info.RedirectStandardError=$true
 # Windows argv quoting: reject quotes/newlines, retain literal spaces in paths.
 if($script -match '["\r\n]' -or $Package -match '["\r\n]'){throw 'argument format'}
 $info.Arguments='--max-old-space-size=768 "'+$script+'" --acquire --package "'+[IO.Path]::GetFullPath($Package)+'" --approval-sha256 '+$ApprovalSha256
 $keep=@('SystemRoot','WINDIR','PATH','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA','ProgramFiles')
 foreach($name in @($info.EnvironmentVariables.Keys)){if($name -notin $keep){$info.EnvironmentVariables.Remove($name)}}
 $process=New-Object Diagnostics.Process; $process.StartInfo=$info
 if(-not $process.Start()){throw 'process start'}
 $stdout=$process.StandardOutput.ReadToEndAsync(); $stderr=$process.StandardError.ReadToEndAsync()
 $process.StandardInput.BaseStream.Write($bytes,0,$bytes.Length); $process.StandardInput.Close()
 [Array]::Clear($bytes,0,$bytes.Length)
 if(-not $process.WaitForExit(660000)){$process.Kill();throw 'supervisor timeout'}
 if($process.ExitCode -ne 0){throw 'acquisition held'}
 [Console]::Out.Write($stdout.Result)
} catch {
 [Console]::Error.WriteLine('H444 acquisition stopped; retain attempt/ciphertext and reconcile before any retry.');exit 1
} finally {
 if($bytes){[Array]::Clear($bytes,0,$bytes.Length)}
 if($pointer -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)}
 if($secret){$secret.Dispose()}
 if($process){$process.Dispose()}
}
