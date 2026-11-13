[CmdletBinding()]
param([Parameter(Mandatory)][ValidateSet('baseline','historical')][string]$Lineage,
 [string]$RepositoryRoot=(Split-Path -Parent $PSScriptRoot),
 [Parameter(Mandatory)][string]$EvidenceDirectory)
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath($RepositoryRoot);$evidence=[IO.Path]::GetFullPath($EvidenceDirectory)
if(-not $evidence.StartsWith((Join-Path $repo '.git')+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) -or -not(Test-Path -LiteralPath $evidence -PathType Container)){throw 'Existing restricted repository-private evidence directory required'}
$env:GIT_OPTIONAL_LOCKS='0'
& docker info *> $null;if($LASTEXITCODE -ne 0){throw 'Docker Desktop must be started manually'}
$helper=Join-Path $repo 'scripts/lib/forge-storage-full-tail.mjs'
$verified=& node $helper --action verify --root $repo|ConvertFrom-Json
if($LASTEXITCODE -ne 0 -or -not $verified.ok){throw 'Pinned full-tail verification failed'}
$contract=Get-Content (Join-Path $repo 'docs/database/certification/storage-full-tail-446.json') -Raw|ConvertFrom-Json
function Replace-One([string]$Text,[string]$Old,[string]$New){if(([regex]::Matches($Text,[regex]::Escape($Old))).Count -ne 1){throw 'Pinned runner structure changed'};$Text.Replace($Old,$New)}
function Literal([string]$Text){"'"+$Text.Replace("'","''")+"'"}
$template=if($Lineage -eq 'baseline'){'scripts/certify-canonical-baseline-v1.ps1'}else{'scripts/certify-hammer-owner-funded-first-transcription-historical-successor.ps1'}
$generated=Join-Path ([IO.Path]::GetTempPath()) ('forge-storage-full-tail-'+[guid]::NewGuid().ToString('N')+'.ps1')
try{
 & node $helper --action template --root $repo --path $template --output $generated
 if($LASTEXITCODE -ne 0){throw 'Pinned runner extraction failed'}
 $source=[IO.File]::ReadAllText($generated).Replace("`r`n","`n")
 if($Lineage -eq 'baseline'){
  $needle='  [pscustomobject]@{' + "`n" + '    ok = $true' + "`n" + '    schema = "forge.$CatalogStage-baseline-successor-certification.v1"'
  $addition='  & '+(Literal (Join-Path $repo 'scripts/certify-storage-full-tail-baseline-stage.ps1'))+' -RepositoryRoot $repo -Workdir $workdir -Container $container -Lane $DefaultPrivilegeMode -EvidenceDirectory '+(Literal $evidence)+"`n"
  $source=Replace-One $source $needle ($addition+$needle)
 }else{
  # This separate governed probe changes no original runner or exact-prefix guard.
  # It proves the synthetic H chain through the real operational-data boundary.
  $source=Replace-One $source "`$predecessorHistoryRows=424" "`$predecessorHistoryRows=437"
  $start=$source.IndexOf("    Copy-Item -Path (Join-Path `$repo 'supabase/migrations/*.sql')")
  $end=$source.IndexOf("    `$lineage=Get-Content",$start)
  if($start -lt 0 -or $end -lt $start){throw 'Historical staging block changed'}
  $stage='    & node '+(Literal $helper)+' --action stage --root $repo --workdir $workdir --lineage historical --through 20261104071802'+"`n"+'    if($LASTEXITCODE -ne 0){throw "Pinned historical prefix staging failed"}'+"`n"
  $source=$source.Substring(0,$start)+$stage+$source.Substring($end)
  $old=@'
$expected=@('20261020171517','20261020171519','20261020171522','20261022000000','20261024164519','20261025070300','20261025080943','20261027030139','20261028092438','20261029004958','20261029033827','20261029110858','20261029154824')
'@
  $pending=@($contract.migrations|Where-Object{$_.version -gt $contract.historicalAnchor -and $_.version -le '20261104071802'}|ForEach-Object {Literal $_.version})
  # The authentic/synthetic Gate5D contract supplies the exact 411-row anchor.
  $source=Replace-One $source $old.Trim() ('$expected=@('+($pending -join ',')+')')
  $point='    $receiptHashesBefore=Get-RecordingReceiptHashes $container'
  $hold=@'
    & node FULL_HELPER --action stage --root $repo --workdir $workdir --lineage historical --through 20261113214832
    if($LASTEXITCODE -ne 0){throw 'Full H suffix staging failed'}
    $discovery=(& supabase db push --local --dry-run --workdir $workdir --agent=no 2>&1|Out-String)
    if($LASTEXITCODE -ne 0){throw 'Full H pending discovery failed'}
    $remaining=@([regex]::Matches($discovery,'(?m)2026\d{10}')|ForEach-Object Value|Select-Object -Unique)
    $expectedRemaining=@(REMAINING_LIST)
    if(($remaining -join ',') -cne ($expectedRemaining -join ',')){throw 'Full H remaining tail differs'}
    $financial=Invoke-Psql $container "select jsonb_build_object('policy',(select count(*) from tongs.openai_text_cost_policy_revisions where id='10000000-0000-4000-8000-000000000010'),'rate_condition',(select count(*) from tongs.openai_text_rate_condition_revisions where id='51100000-0000-4000-8000-000000000004'),'price',(select count(*) from tongs.private_pricing_revisions where id='b4c4472f-0325-4c2e-b2ef-9aef5e59e64a'),'rollout',(select count(*) from tongs.openai_text_rollout_revisions where route_code='hearth.chat_completion' and revision=12));" -Redact|ConvertFrom-Json
    if(@($financial.psobject.Properties|Where-Object{$_.Value -ne 0}).Count){throw 'Unexpected operational authority in synthetic H fixture'}
    $result=[pscustomobject]@{status='BLOCKED';lane=$Lane;lineage='historical-v1';syntheticOnly=$true;authenticFinancialState=$false;appliedHistoryCount=437;target='20261113214832';pending=$remaining;missingPredecessor=$financial;original411HistoryUnchanged=$true;negativeRestoreChecks=$negative;reason='Authentic operational financial predecessor unavailable. No synthetic financial rows were invented or inserted.'}
    return $result
'@
  $remaining=@($contract.migrations|Where-Object{$_.version -gt '20261104071802'}|ForEach-Object{Literal $_.version})
  $hold=$hold.Replace('FULL_HELPER',(Literal $helper)).Replace('REMAINING_LIST',($remaining -join ','))
  $source=Replace-One $source $point ($hold+"`n"+$point)
  $begin=$source.LastIndexOf('  [pscustomobject]@{');$end=$source.IndexOf("`n}", $begin)
  if($begin -lt 0 -or $end -lt $begin){throw 'Historical result block changed'}
  $replacement=@'
  $summary=[ordered]@{schema='forge.storage-full-tail-historical.v1';status='BLOCKED';gitHead=$head;target='20261113214832';syntheticOnly=$true;authenticHistoricalFinancialState=$false;failureCleanupVerified=$failureCleanup;nurseryResourcesUnchanged=$nurseryUnchanged;lanes=$lanes}
  $summary|ConvertTo-Json -Depth 12|Set-Content EVIDENCE_RESULT
  $summary|ConvertTo-Json -Depth 12 -Compress
'@
  $replacement=$replacement.Replace('EVIDENCE_RESULT',(Literal (Join-Path $evidence 'historical-result.json')))
  $source=$source.Substring(0,$begin)+$replacement+$source.Substring($end)
 }
 $source=$source.Replace('$PSScriptRoot',(Literal (Join-Path $repo 'scripts')))
 [IO.File]::WriteAllText($generated,$source,[Text.UTF8Encoding]::new($false))
 if($Lineage -eq 'baseline'){
  foreach($lane in @('permissive','restrictive')){
   & pwsh -NoProfile -File $generated -RepositoryRoot $repo -CatalogStage provider-alignment -DefaultPrivilegeMode $lane
   if($LASTEXITCODE -ne 0){throw "Full-tail baseline $lane lane failed"}
  }
  $p=Get-Content (Join-Path $evidence 'permissive-full-catalog.json') -Raw|ConvertFrom-Json
  $r=Get-Content (Join-Path $evidence 'restrictive-full-catalog.json') -Raw|ConvertFrom-Json
  if($p.contractSha256 -cne $r.contractSha256 -or $p.objectCount -ne $r.objectCount){throw 'Full-tail catalog/ACL differs between privilege lanes'}
  [ordered]@{schema='forge.storage-full-tail-baseline-comparison.v1';status='PASS';gitHead=$verified.head;target=$contract.target;historyCount=33;catalogObjectCount=$p.objectCount;catalogSha256=$p.contractSha256;syntheticOperationalPrerequisite=$true;authenticHistoricalFinancialState=$false}|ConvertTo-Json|Set-Content (Join-Path $evidence 'baseline-result.json')
 }else{
  & pwsh -NoProfile -File $generated -RepositoryRoot $repo -HistoryMode CertifiedChain
  if($LASTEXITCODE -ne 0){throw 'Governed historical boundary probe failed'}
 }
}finally{if(Test-Path -LiteralPath $generated){Remove-Item -LiteralPath $generated}}
