[CmdletBinding()]
param([Parameter(Mandatory)][ValidateSet('baseline')][string]$Lineage,
 [ValidateSet('permissive','restrictive')][string]$DefaultPrivilegeMode='permissive',
 [Parameter(Mandatory)][string]$EvidenceDirectory,
 [string]$RepositoryRoot=(Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath($RepositoryRoot)
$evidence=[IO.Path]::GetFullPath($EvidenceDirectory)
if(-not(Test-Path -LiteralPath $evidence -PathType Container)){throw 'Existing evidence directory required'}
if(Test-Path -LiteralPath (Join-Path $evidence "$DefaultPrivilegeMode-review-regression.log")){throw 'Use a new evidence directory; prior results are retained'}
& docker info *> $null
if($LASTEXITCODE -ne 0){throw 'Docker Desktop must be started manually'}
$helper=Join-Path $repo 'scripts/lib/forge-storage-full-tail.mjs'
$generated=Join-Path ([IO.Path]::GetTempPath()) ('forge-storage-review-'+[guid]::NewGuid().ToString('N')+'.ps1')
function Literal([string]$value){"'"+$value.Replace("'","''")+"'"}
try{
 & node $helper --action template --root $repo --path scripts/certify-canonical-baseline-v1.ps1 --output $generated
 if($LASTEXITCODE -ne 0){throw 'Pinned baseline template verification failed'}
 $source=[IO.File]::ReadAllText($generated).Replace("`r`n","`n")
 $needle='  [pscustomobject]@{' + "`n" + '    ok = $true' + "`n" + '    schema = "forge.$CatalogStage-baseline-successor-certification.v1"'
 if(([regex]::Matches($source,[regex]::Escape($needle))).Count -ne 1){throw 'Pinned baseline insertion point changed'}
 $addition='  & '+(Literal (Join-Path $repo 'scripts/certify-storage-full-tail-baseline-stage.ps1'))+' -RepositoryRoot $repo -Workdir $workdir -Container $container -Lane $DefaultPrivilegeMode -EvidenceDirectory '+(Literal $evidence)+' -ReviewRegressionOnly'+"`n"
 $source=$source.Replace($needle,$addition+$needle).Replace('$PSScriptRoot',(Literal (Join-Path $repo 'scripts')))
 [IO.File]::WriteAllText($generated,$source,[Text.UTF8Encoding]::new($false))
 & pwsh -NoProfile -File $generated -RepositoryRoot $repo -CatalogStage provider-alignment -DefaultPrivilegeMode $DefaultPrivilegeMode
 if($LASTEXITCODE -ne 0){throw 'Baseline Storage review regression failed'}
}finally{if(Test-Path -LiteralPath $generated){Remove-Item -LiteralPath $generated}}
