[CmdletBinding()]
param(
 [Parameter(Mandatory)][ValidateSet('historical')][string]$Lineage,
 [Parameter(Mandatory)][ValidateSet('Observe','Apply445','Apply446','Catalog')][string]$Action,
 [Parameter(Mandatory)][ValidatePattern('^[a-z]{20}$')][string]$TargetProject,
 [Parameter(Mandatory)][string]$Workdir,
 [Parameter(Mandatory)][string]$ApprovalPath,
 [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$ApprovalSha256,
 [string]$RepositoryRoot=(Split-Path -Parent $PSScriptRoot)
)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'lib/forge-supabase-cli.ps1')
. (Join-Path $PSScriptRoot 'lib/forge-strict-csv-boolean.ps1')
$repo=[IO.Path]::GetFullPath($RepositoryRoot)
# The adapter has its own target/approval checks; invoking it directly must not
# bypass the Node coordinator's safety checks. Never load production credentials.
if($TargetProject -ceq 'wtvdjndyxegudufrompx'){throw 'Production target forbidden.'}
& node (Join-Path $PSScriptRoot 'certify-storage-authentic-restoration.mjs') --action Validate --approval $ApprovalPath --approval-sha256 $ApprovalSha256 --workdir $Workdir --target $TargetProject | Out-Null
if($LASTEXITCODE -ne 0){throw 'Restoration approval or package validation failed.'}
if(-not $env:SUPABASE_DB_PASSWORD){throw 'Approved restoration credential must be supplied through SUPABASE_DB_PASSWORD.'}
& (Join-Path $PSScriptRoot 'verify-supabase-lineage.ps1') -Lineage historical -Workdir $Workdir -DatabaseTarget linked -Mode preflight -RepositoryRoot $repo | Out-Null
function Query([string]$Sql,[string[]]$Columns){
 $result=Invoke-ForgeSupabaseCli -Arguments @('db','query','--linked','--agent=no','--output','csv','--workdir',$Workdir,'--',("begin transaction isolation level repeatable read read only;`n"+$Sql+"`nrollback;"))
 @(ConvertFrom-ForgeSupabaseCsv -StandardOutput $result.StandardOutput -ExpectedColumns $Columns -Context 'Restoration certification')
}
if($Action -eq 'Observe'){
 # One database snapshot: the outer statement embeds the cumulative contract.
 $observation=(Get-Content (Join-Path $repo 'supabase/tests/storage_authentic_predecessor.sql') -Raw).Trim().TrimEnd(';')
 $contract=(Get-Content (Join-Path $repo 'supabase/tests/storage_successor_hosted_release_contract.sql') -Raw).Trim().TrimEnd(';')
 $rows=Query ("with o as (`n"+$observation+"`n), c as (`n"+$contract+"`n) select (o.observation::jsonb || jsonb_build_object('storageStage',c.storage_stage,'storageContractOk',c.storage_contract_ok))::text as observation from o cross join c;") @('observation')
 if($rows.Count -ne 1){throw 'One observation required.'}
 $rows[0].observation
}elseif($Action -eq 'Catalog'){
 $sql=Get-Content (Join-Path $repo 'supabase/tests/catalog/canonical_baseline_v1_contract_rows.sql') -Raw
 $rows=Query $sql @('category','identity','canonical')
 ConvertTo-Json -InputObject @($rows) -Depth 4 -Compress
}else{
 # A coordinator-created durable attempt is mandatory. The adapter cannot
 # create it, rerun a consumed stage, or accept an arbitrary SQL file.
 $number=if($Action -eq 'Apply445'){445}else{446}
 $attemptPath=Join-Path $Workdir "attempt-$number.json"
 $attempt=Get-Content -LiteralPath $attemptPath -Raw | ConvertFrom-Json
 if($attempt.approvalSha256 -cne $ApprovalSha256 -or $attempt.targetProject -cne $TargetProject -or $attempt.stage -ne $number){throw 'Attempt identity mismatch.'}
 $consumed=[IO.File]::Open((Join-Path $Workdir "consumed-$number"),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
 try{$consumed.Flush($true)}finally{$consumed.Dispose()}
 $files=@(Get-ChildItem (Join-Path $Workdir 'supabase/migrations') -Filter '*.sql' | Sort-Object Name)
 if($files.Count -ne $number){throw 'Wrong exact migration stage.'}
 $dry=Invoke-ForgeSupabaseCli -Arguments @('db','push','--linked','--dry-run','--agent=no','--workdir',$Workdir)
 Assert-ForgeSupabaseDryRunPlan -Result $dry -ExpectedMigrationFiles @($files[-1].Name) | Out-Null
 Invoke-ForgeSupabaseCli -Arguments @('db','push','--linked','--agent=no','--workdir',$Workdir) | Out-Null
 '{"applied":true}'
}
