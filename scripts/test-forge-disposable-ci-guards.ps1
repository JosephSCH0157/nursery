[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$Container,
  [Parameter(Mandatory)][string]$Workdir,
  [Parameter(Mandatory)][ValidateSet('fixture','alignment','successor')][string]$Stage,
  [string]$RepositoryRoot = (Split-Path -Parent $PSScriptRoot)
)
$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath($RepositoryRoot)
$selected = [IO.Path]::GetFullPath($Workdir).TrimEnd([IO.Path]::DirectorySeparatorChar)
$browserId = "forge-he3-browser-$($env:GITHUB_RUN_ID)-$($env:GITHUB_RUN_ATTEMPT)"
if ($env:GITHUB_ACTIONS -cne 'true' -or $env:GITHUB_REPOSITORY -cne 'JosephSCH0157/nursery' -or
    [string]::IsNullOrWhiteSpace($env:RUNNER_TEMP) -or
    (Split-Path -Parent $selected) -cne [IO.Path]::GetFullPath($env:RUNNER_TEMP).TrimEnd([IO.Path]::DirectorySeparatorChar)) {
  throw 'Guard tests require the exact disposable CI workdir.'
}
$leaf = Split-Path -Leaf $selected
$expectedContainer = if ($leaf -ceq 'forge-barstock-baseline') { 'supabase_db_nursery' } elseif ($leaf -ceq $browserId) { "supabase_db_$browserId" } else { '' }
if (-not $expectedContainer -or $Container -cne $expectedContainer) { throw 'Guard tests reject an unrelated database container.' }

$fixture = Get-Content -LiteralPath (Join-Path $repo 'supabase/tests/fixtures/canonical_luna_provider_alignment_authority.sql') -Raw
$fixtureMatch = [regex]::Match($fixture,'(?s)do \$guard\$.*?end \$guard\$;')
$migration = Get-Content -LiteralPath (Join-Path $repo 'supabase/migrations/20261104143249_align_provider_requests_and_luna_financial_authority.sql') -Raw
$migrationMatch = [regex]::Match($migration,'(?s)do \$\$.*?end \$\$;')
if (-not $fixtureMatch.Success -or -not $migrationMatch.Success) { throw 'Unable to extract the unchanged reviewed guard blocks.' }
$fixtureGuard = $fixtureMatch.Value
$migrationGuard = $migrationMatch.Value
# Only read references are redirected to transaction-local snapshots. Original
# policy rows, lineage markers, and migration history are NEVER modified.
$shadowFixture = $fixtureGuard.Replace('forge_meta.','pg_temp.').Replace('supabase_migrations.','pg_temp.').Replace('auth.','pg_temp.').Replace('tongs.','pg_temp.')
$shadowMigration = $migrationGuard.Replace('tongs.','pg_temp.')
$tests = [System.Collections.Generic.List[string]]::new()
$setup = [System.Collections.Generic.List[string]]::new()
$setup.Add('begin;')
$setup.Add("select set_config('forge.provider_alignment_fixture','disposable-baseline-v1',true);")

function Add-Rejection([string]$Name,[string]$Guard,[string]$Mutation,[string]$State,[string]$MessagePrefix) {
  # The exception subtransaction rolls back each negative-test mutation.
  $tests.Add(@'
do $case$
begin
  begin
    __MUTATION__
    execute $source$__GUARD__$source$;
    raise exception 'Guard incorrectly accepted __NAME__' using errcode='XX000';
  exception when sqlstate '__STATE__' then
    if left(sqlerrm,length('__MESSAGE__')) <> '__MESSAGE__' then raise; end if;
  end;
end $case$;
'@.Replace('__MUTATION__',$Mutation).Replace('__GUARD__',$Guard).Replace('__NAME__',$Name).Replace('__STATE__',$State).Replace('__MESSAGE__',$MessagePrefix))
}
if ($Stage -eq 'fixture') {
  # The real guard must reject absent opt-in without any snapshot substitution.
  Add-Rejection 'missing opt-in' $fixtureGuard "perform set_config('forge.provider_alignment_fixture','',true);" '42501' 'Luna provider-alignment fixture requires guarded disposable baseline'
  foreach ($relation in @('forge_meta.database_lineage','supabase_migrations.schema_migrations','auth.users','tongs.platform_operators','tongs.openai_text_provider_rate_revisions','tongs.openai_text_cost_policy_revisions','tongs.private_pricing_revisions','tongs.openai_text_rollout_revisions')) {
    $name = ($relation -split '\.')[1]
    $setup.Add("create temp table $name on commit drop as select * from $relation;")
  }
  # Also proves the empty predecessor snapshots are an accepted fixture input.
  $setup.Add($shadowFixture)
  Add-Rejection 'wrong lineage' $shadowFixture "update pg_temp.database_lineage set lineage='historical-v1';" '42501' 'Luna provider-alignment fixture requires guarded disposable baseline'
  Add-Rejection 'missing lineage marker' $shadowFixture 'delete from pg_temp.database_lineage;' '42501' 'Luna provider-alignment fixture requires guarded disposable baseline'
  Add-Rejection 'wrong exact head' $shadowFixture "delete from pg_temp.schema_migrations where version='20261104071802';" 'P0001' 'Luna provider-alignment fixture requires migration head 20261104071802'
  Add-Rejection 'existing synthetic user' $shadowFixture "insert into pg_temp.users(id) values('fe000000-0000-4000-8000-000000000001');" 'P0001' 'Luna provider-alignment fixture requires its synthetic operator identity to be absent'
  Add-Rejection 'existing synthetic operator' $shadowFixture "insert into pg_temp.platform_operators(user_id) values('fe000000-0000-4000-8000-000000000001');" 'P0001' 'Luna provider-alignment fixture requires its synthetic operator identity to be absent'
  Add-Rejection 'existing predecessor' $shadowFixture "insert into pg_temp.openai_text_cost_policy_revisions(id) values('10000000-0000-4000-8000-000000000010');" '23505' 'Luna provider-alignment predecessor authority already exists'
} elseif ($Stage -eq 'alignment') {
  foreach ($relation in @('openai_text_cost_policy_revisions','openai_text_rate_condition_revisions','private_pricing_revisions','openai_text_rollout_revisions')) {
    $setup.Add("create temp table $relation on commit drop as select * from tongs.$relation;")
  }
  # Positive case runs the exact original block against the actual fixtures.
  $setup.Add($migrationGuard)
  $setup.Add($shadowMigration)
  Add-Rejection 'missing cost predecessor' $shadowMigration "delete from pg_temp.openai_text_cost_policy_revisions where id='10000000-0000-4000-8000-000000000010';" 'P0001' 'reviewed Luna predecessor policy changed'
  Add-Rejection 'changed cost ceiling' $shadowMigration "update pg_temp.openai_text_cost_policy_revisions set direct_provider_ceiling_micros=1016 where id='10000000-0000-4000-8000-000000000010';" 'P0001' 'reviewed Luna predecessor policy changed'
  Add-Rejection 'changed rate condition' $shadowMigration "update pg_temp.openai_text_rate_condition_revisions set cache_write_micros_per_million_tokens=250001 where id='51100000-0000-4000-8000-000000000004';" 'P0001' 'reviewed Luna cache-write rate condition changed'
  Add-Rejection 'changed customer price' $shadowMigration "update pg_temp.private_pricing_revisions set customer_credit_units=4 where id='b4c4472f-0325-4c2e-b2ef-9aef5e59e64a';" 'P0001' 'reviewed Luna customer price changed'
  Add-Rejection 'changed rollout' $shadowMigration "update pg_temp.openai_text_rollout_revisions set mode='halt_new' where route_code='hearth.chat_completion' and revision=12;" 'P0001' 'reviewed Luna rollout predecessor changed'
  # Identity rejection uses the actual unchanged fixture guard after installation.
  Add-Rejection 'fixture at populated predecessor' $fixtureGuard '' 'P0001' 'Luna provider-alignment fixture requires its synthetic operator identity to be absent'
} else {
  Add-Rejection 'fixture after tail resumed' $fixtureGuard '' 'P0001' 'Luna provider-alignment fixture requires migration head 20261104071802'
}
$sql = ($setup -join [Environment]::NewLine) + [Environment]::NewLine + ($tests -join [Environment]::NewLine) + [Environment]::NewLine + 'rollback;'
$file = Join-Path $selected "ci-negative-guards-$Stage.sql"
[IO.File]::WriteAllText($file,$sql,[Text.UTF8Encoding]::new($false))
$remote = "/tmp/forge-ci-negative-guards-$Stage.sql"
try {
  & docker cp $file "$($Container):$remote"
  if ($LASTEXITCODE -ne 0) { throw 'Unable to copy disposable guard tests.' }
  & docker exec $Container psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -f $remote
  if ($LASTEXITCODE -ne 0) { throw "Disposable negative guard tests failed at $Stage." }
  [pscustomobject]@{ok=$true;stage=$Stage;negativeCases=$tests.Count;mutations='transaction-local snapshots only'} | ConvertTo-Json -Compress
} finally {
  Remove-Item -LiteralPath $file
}
