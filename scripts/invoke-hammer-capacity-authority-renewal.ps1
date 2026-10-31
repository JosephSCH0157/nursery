[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidateSet('Collect','Renew')][string]$Action,
  [Parameter(Mandatory)][guid]$Operator,
  [string]$Authorization,
  [string]$OutputName=('hammer-capacity-'+(Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')+'.json'),
  [string]$RepositoryRoot=(Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath($RepositoryRoot)
. (Join-Path $PSScriptRoot 'lib/forge-managed-credential.ps1')
. (Join-Path $PSScriptRoot 'lib/forge-supabase-cli.ps1')

function Invoke-Supabase([string[]]$Arguments){Invoke-ForgeSupabaseCli -Arguments $Arguments}
function Read-Csv([string]$Sql,[string[]]$Columns,[string]$Context){
  $result=Invoke-Supabase @('db','query','--linked','--agent=no','--output','csv','--workdir',$repo,$Sql)
  @(ConvertFrom-ForgeSupabaseCsv -StandardOutput $result.StandardOutput -ExpectedColumns $Columns -Context $Context)
}
function Assert-Static {
  if((Invoke-Supabase @('--version')).StandardOutput.Trim() -cne '2.84.2'){throw 'Supabase CLI 2.84.2 is required.'}
  $linked=(Get-Content -LiteralPath (Join-Path $repo 'supabase/.temp/project-ref') -Raw).Trim()
  if($linked -cne 'wtvdjndyxegudufrompx'){throw 'Linked project does not match the pinned Forge project.'}
  $history=@(Read-Csv 'select version from supabase_migrations.schema_migrations order by version' @('version') 'hosted history')
  if($history.Count -ne 427 -or [string]$history[-1].version -cne '20261030224605'){throw 'Hosted migration 427 is required.'}
}
function New-DatabaseObservation {
  $rows=@(Read-Csv @'
select clock_timestamp() as observed_at,
  pg_database_size(current_database()) as database_used_bytes,
  (select count(*) from tongs.hammer_transcription_operations where state in ('queued','processing','submission_unknown')) as active_hammer_operation_count
'@ @('observed_at','database_used_bytes','active_hammer_operation_count') 'capacity database observation')
  if($rows.Count -ne 1){throw 'Capacity database observation is unavailable.'}
  [ordered]@{observed_at=([datetimeoffset]$rows[0].observed_at).ToUniversalTime().ToString('o');database_used_bytes=[int64]$rows[0].database_used_bytes;active_hammer_operation_count=[int]$rows[0].active_hammer_operation_count}
}
function ConvertTo-WslPath([string]$WindowsPath) {
  $match=[regex]::Match($WindowsPath,'^(?<drive>[A-Za-z]):\\(?<tail>.*)$')
  if(-not $match.Success){throw 'The Forge repository must be on a Windows drive for the governed WSL Node runner.'}
  $drive=$match.Groups['drive'].Value.ToLowerInvariant()
  $tail=$match.Groups['tail'].Value.Replace('\','/')
  "/mnt/$drive/$tail"
}
function Invoke-WslNode([string]$ScriptPath,[string[]]$Arguments) {
  $wsl=(Get-Command wsl.exe -CommandType Application -ErrorAction SilentlyContinue|Select-Object -First 1)
  if($null -eq $wsl -or [string]::IsNullOrWhiteSpace($wsl.Source)){throw 'Windows WSL executable is unavailable.'}
  $priorWslEnv=[Environment]::GetEnvironmentVariable('WSLENV','Process')
  $entries=[Collections.Generic.List[string]]::new()
  if(-not [string]::IsNullOrWhiteSpace($priorWslEnv)){
    foreach($entry in $priorWslEnv.Split(':',[StringSplitOptions]::RemoveEmptyEntries)){
      $name=$entry.Split('/')[0]
      if($name -notin @('FORGE_NETLIFY_CAPACITY_READ_TOKEN','FORGE_SUPABASE_CAPACITY_READ_TOKEN')){$entries.Add($entry)}
    }
  }
  $entries.Add('FORGE_NETLIFY_CAPACITY_READ_TOKEN')
  $entries.Add('FORGE_SUPABASE_CAPACITY_READ_TOKEN')
  [Environment]::SetEnvironmentVariable('WSLENV',($entries -join ':'),'Process')
  $start=[Diagnostics.ProcessStartInfo]::new()
  $start.FileName=$wsl.Source
  $start.UseShellExecute=$false
  $start.CreateNoWindow=$true
  $start.RedirectStandardOutput=$true
  $start.RedirectStandardError=$true
  foreach($argument in @('--distribution','Ubuntu','--exec','sh','-lc','exec "$HOME/.local/bin/node" "$@"','sh',$ScriptPath)+$Arguments){[void]$start.ArgumentList.Add($argument)}
  $process=[Diagnostics.Process]::new()
  $process.StartInfo=$start
  try{
    if(-not $process.Start()){throw 'WSL Node process did not start.'}
    $stdoutTask=$process.StandardOutput.ReadToEndAsync()
    $stderrTask=$process.StandardError.ReadToEndAsync()
    $process.WaitForExit()
    $stdout=$stdoutTask.GetAwaiter().GetResult()
    $stderr=$stderrTask.GetAwaiter().GetResult()
    if($process.ExitCode -ne 0){
      $match=[regex]::Match($stderr,'(?m)(?:forge_capacity_error=)?(managed_capacity_read_credentials_required|authenticated_api_fetch_failed|runtime_path_unavailable|runtime_path_permission_denied|private_evidence_output_already_exists|(?:netlify|supabase|capacity|hammer)_[a-z0-9_]+(?::[0-9]{3})?)')
      $diagnostic=if($match.Success){$match.Groups[1].Value}
        elseif($stderr -match '(?i)\.local/bin/node.*(?:not found|no such file)'){'node_runtime_unavailable'}
        elseif($stderr -match '(?i)(?:syntax error|unexpected token)'){'wsl_shell_invocation_invalid'}
        elseif($stderr -match '(?i)(?:wsl.*error|wsl_e_)'){'wsl_invocation_failed'}
        else{'unclassified'}
      throw "Capacity evidence WSL Node failed (exit $($process.ExitCode); diagnostic $diagnostic); response output withheld."
    }
    $stdout
  }finally{
    $process.Dispose()
    [Environment]::SetEnvironmentVariable('WSLENV',$priorWslEnv,'Process')
  }
}
function New-CapacityEvidence {
  $database=New-DatabaseObservation
  $databaseBase64=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($database|ConvertTo-Json -Compress))).TrimEnd('=').Replace('+','-').Replace('/','_')
  $scriptPath=(ConvertTo-WslPath (Join-Path $PSScriptRoot 'new-hammer-capacity-evidence.mjs'))
  $attestationPath=(ConvertTo-WslPath (Join-Path $repo 'config/hammer/supabase-capacity-control-attestation.json'))
  $receipt=Invoke-WslNode -ScriptPath $scriptPath -Arguments @('--netlify-team-slug','jschramer','--supabase-project-ref','wtvdjndyxegudufrompx','--supabase-control-attestation',$attestationPath,'--database-observation-base64',$databaseBase64,'--output-name',$OutputName)
  $receipt|ConvertFrom-Json
}

$result=Invoke-WithForgeManagedDatabaseCredential -Operation {
  Assert-Static
  $receipt=Invoke-WithForgeManagedCapacityReadCredentials -Operation {New-CapacityEvidence}
  if($Action -eq 'Collect'){return $receipt}
  if($Authorization -cne 'RENEW-HAMMER-BRAD-OWNER-SPONSORSHIP-AUTHORITY'){throw 'Exact Brad authority-renewal authorization is required.'}
  $evidenceDocument=Get-Content -LiteralPath $receipt.outputPath -Raw|ConvertFrom-Json
  $evidence=$evidenceDocument.evidence
  foreach($field in @('evidenceSha256','checkedAt','expiresAt')){if([string]::IsNullOrWhiteSpace([string]$evidence.$field)){throw "Capacity evidence $field is missing."}}
  $ids=[ordered]@{activation=[guid]::NewGuid();capacity=[guid]::NewGuid();ownerAuthority=[guid]::NewGuid();ownerBudget=[guid]::NewGuid()}
  $previous=@(Read-Csv @'
select id from tongs.hammer_first_transcription_activation_authorities
where user_id='71daf61b-57b3-4e5f-a8c8-64befecb5950'::uuid
  and workspace_id='cc5478ff-37be-403e-824c-467fa7da061e'::uuid
  and workpiece_id='21d16d6a-905b-491e-8761-028789612ae5'::uuid
  and canonical_recording_id='4cc846e3-187c-46d9-8733-e7402488236c'::uuid
  and recording_revision_id='9c991aa7-f551-4f03-a4d6-41eb40ef81ec'::uuid
order by valid_until desc limit 1
'@ @('id') 'previous Hammer activation authority')
  if($previous.Count -ne 1){throw 'The previous exact Hammer activation authority is unavailable.'}
  $previousId=[guid]$previous[0].id
  $validFrom=[datetimeoffset]::UtcNow
  $validUntil=$validFrom.AddHours(24)
  $capacityExpiry=[datetimeoffset]$evidence.expiresAt
  if($validUntil -gt $capacityExpiry){$validUntil=$capacityExpiry}
  if($validUntil -le $validFrom){throw 'Capacity evidence cannot support a renewed authority window.'}
  $sql=@"
with service_context as (
  select set_config('request.jwt.claim.role','service_role',true)
)
select tongs.renew_hammer_owner_funded_first_transcription_authority(
  '$previousId'::uuid,'$($ids.activation)'::uuid,'$($ids.capacity)'::uuid,
  '$($ids.ownerAuthority)'::uuid,'$($ids.ownerBudget)'::uuid,'$Operator'::uuid,
  '$([string]$evidence.evidenceSha256)','$([datetimeoffset]$evidence.checkedAt)'::timestamptz,'$capacityExpiry'::timestamptz,
  $([int64]$evidence.netlify.remainingCreditsMicrounits),$([int64]$evidence.supabase.remainingUncachedEgressBytes),
  $([int64]$evidence.supabase.remainingDatabaseBytes),true,'$validFrom'::timestamptz,'$validUntil'::timestamptz,
  'Automated authenticated capacity evidence renewal for the exact owner-sponsored Brad transcription.'
) as receipt from service_context;
"@
  $renewed=@(Read-Csv $sql @('receipt') 'Hammer authority renewal')
  if($renewed.Count -ne 1){throw 'Hammer authority renewal did not return a receipt.'}
  [pscustomobject]@{ok=$true;schema='forge.hammer-owner-sponsorship-capacity-renewal.v1';activationAuthorityId=[string]$ids.activation;capacityAuthorityId=[string]$ids.capacity;validUntil=$validUntil.ToUniversalTime().ToString('o');evidenceSha256=[string]$evidence.evidenceSha256;customerPaymentMicros=0;customerCreditUnits=0;providerAttemptCreated=$false;credentialReturned=$false}
}
$result|ConvertTo-Json -Compress
