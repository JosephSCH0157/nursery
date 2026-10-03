import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const container = process.env.SUPABASE_DB_CONTAINER || "supabase_db_nursery";
const database = `forge_slice4_${randomUUID().replaceAll("-", "").slice(0, 10)}`;
const migrations = [
  "20260910120000_tongs_accounting_foundation.sql",
  "20260911120000_tongs_private_pricing_reservations_shadow.sql",
  "20260912120000_tongs_owner_budget_reservations_shadow.sql",
  "20260915120000_tongs_runway_paid_execution_boundary.sql",
  "20260916120000_tongs_runway_owner_pilot_activation.sql",
  "20260917120000_tongs_pricing_customer_interface.sql",
  "20260918120000_tongs_failure_relief_openai_text_shadow.sql",
  "20260919120000_tongs_openai_text_enforcement_foundation.sql",
  "20260920120000_tongs_hearth_chat_paid_execution.sql",
  "20260921120000_tongs_openai_hearth_owner_pilot_control.sql",
  "20260922120000_tongs_openai_hearth_luna_pilot_proposal.sql",
  "20260922130000_tongs_openai_hearth_luna_pilot_control.sql",
  "20260922140000_tongs_openai_hearth_luna_pilot_emergency_halt.sql",
  "20260922150000_tongs_openai_loss_policy_scope_and_preprovider_rearm.sql",
  "20260922160000_tongs_failure_class_corrections_and_luna_retest.sql",
  "20260922170000_tongs_precise_forge_failure_classes.sql",
  "20260923120000_tongs_customer_hearth_luna_canary.sql",
  "20260928120000_tongs_openai_text_ordinary_customer_funding.sql",
  "20260929120000_tongs_openai_text_model_catalog.sql",
  "20260930120000_tongs_openai_evidence_and_support_proposal.sql",
  "20261001120000_tongs_restricted_beta_financial_policy.sql",
  "20261002120000_tongs_aggregate_paid_execution_connection.sql",
  "20261003120000_tongs_openai_cost_reconciliation_connection.sql",
  "20261004120000_tongs_openai_transcription_financial_coordination.sql",
  "20261005120000_tongs_customer_funding_read_model.sql",
  "20261006120000_tongs_owner_org_funding_authority.sql",
  "20261006130000_tongs_openai_model_catalog_revision_2.sql",
  "20261007120000_tongs_non_spending_financial_repairs.sql",
  "20261008120000_tongs_owner_funded_hearth_activation.sql",
  "20261008220000_tongs_owner_hearth_model_choice_view.sql",
  "20261009120000_tongs_openai_coordinated_cutover.sql",
  "20261012010000_tongs_route_scoped_openai_model_preferences.sql",
];

function docker(args, input) {
  return spawnSync("docker", args, { input, encoding: "utf8", maxBuffer: 80 * 1024 * 1024 });
}
function check(result, label) {
  if (result.status !== 0) throw new Error(`${label} failed:\n${result.stderr || result.stdout}`);
}
function psql(sql, label) {
  const result = docker(["exec", "-i", container, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], sql);
  check(result, label);
  return result.stdout.trim();
}

const connectedBaselineFixture = String.raw`
alter table tongs.private_pricing_revisions
  add column if not exists unrounded_customer_price_micros bigint,
  add column if not exists rounding_adjustment_micros bigint,
  add column if not exists settled_customer_price_micros bigint;

alter table tongs.openai_text_supporting_cost_inventory
  drop constraint if exists openai_text_supporting_cost_inventory_disposition_check;
alter table tongs.openai_text_supporting_cost_inventory
  add constraint openai_text_supporting_cost_inventory_disposition_check check(disposition in(
    'included_unmetered','separately_blocked','allocation_required',
    'attributable_metered','platform_overhead','workspace_entitlement'
  ));

alter table tongs.openai_text_failure_loss_policy_revisions
  drop constraint if exists openai_text_failure_loss_policy_revisions_environment_check;
alter table tongs.openai_text_failure_loss_policy_revisions
  add constraint openai_text_failure_loss_policy_revisions_environment_check
  check(environment in('test','live','production'));

create table if not exists tongs.openai_text_failure_loss_rollout_revisions(
  route_code text not null references tongs.openai_text_route_policies(route_code) on delete restrict,
  financial_environment text not null check(financial_environment in('test','live')),
  revision integer not null check(revision>0),
  mode text not null check(mode in('enforce','halt_new')),
  loss_policy_revision_id uuid not null references tongs.openai_text_failure_loss_policy_revisions(id) on delete restrict,
  source_limit_event_id uuid references tongs.openai_text_failure_limit_events(id) on delete restrict,
  reason text not null check(nullif(btrim(reason),'') is not null),
  actor_id uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key(route_code,financial_environment,revision)
);
alter table tongs.openai_text_failure_loss_rollout_revisions enable row level security;
revoke all on tongs.openai_text_failure_loss_rollout_revisions from public,anon,authenticated,service_role;
grant select on tongs.openai_text_failure_loss_rollout_revisions to service_role;

create table if not exists tongs.customer_paid_execution_scope_authorizations(
  id uuid primary key default gen_random_uuid(),
  route_code text not null references tongs.openai_text_route_policies(route_code) on delete restrict
);

insert into auth.users(id,email) values('40000000-0000-4000-8000-000000000099','slice4-operator@example.test') on conflict(id) do nothing;
insert into tongs.platform_operators(user_id,reason,granted_by)
values('40000000-0000-4000-8000-000000000099','Slice 4 isolated authority fixture','40000000-0000-4000-8000-000000000099')
on conflict(user_id) do nothing;

insert into tongs.private_markup_rule_revisions(
 id,revision,previous_revision_id,default_markup_basis_points,overrides_json,change_reason,content_hash,actor_id
) values(
 '648f0593-de89-461a-b208-46900dd23268',1,null,3300,'[]',
 'Canonical common customer markup authority.',repeat('e',64),'40000000-0000-4000-8000-000000000099'
) on conflict(revision) do nothing;

insert into tongs.openai_text_rollout_revisions(route_code,revision,mode,cost_policy_revision_id,reason,actor_id,funding_scope)
values('hammer.transcript_cleanup',2,'halt_new',null,'Connected Slice 3A baseline: Hammer remains halted.','40000000-0000-4000-8000-000000000099','forge')
on conflict(route_code,revision) do nothing;

insert into tongs.openai_text_model_catalog_revisions(id,revision,lifecycle_state,quality_method,source_checked_at,content_hash,actor_id)
values('19720000-0000-4000-8000-000000000008',16,'active','Connected revision 16 shape fixture for isolated Slice 4 verification.','2026-10-03T00:00:00Z',repeat('d',64),'40000000-0000-4000-8000-000000000099');

insert into tongs.openai_text_model_catalog_entries(
 id,catalog_revision_id,runtime_model_id,provider_model_id,display_name,tradeoff_summary,quality_rank,quality_basis,
 supported_apis,availability_status,availability_evidence,lifecycle_state,rate_revision_id,customer_selection_key,customer_selection_state
)
select values_row.id,'19720000-0000-4000-8000-000000000008',values_row.runtime_id,values_row.provider_id,
 values_row.display_name,values_row.tradeoff,values_row.quality_rank,'Retained evaluation and access evidence.',
 '["chat_completions","structured_outputs"]'::jsonb,'generation_compatible',values_row.evidence::jsonb,'active',values_row.rate_id,
 values_row.selection_key,'selectable'
from (values
 ('19720000-0000-4000-8000-000000000101'::uuid,'gpt-5.4-mini','gpt-5.4-mini-2026-03-17','GPT-5.4 Mini','Lower cost',10,'54000000-0000-4000-8000-000000000001'::uuid,'19720000-0000-4000-9000-000000000101'::uuid,'{"generation_calls":20,"provider_failures":0}'),
 ('19720000-0000-4000-8000-000000000102'::uuid,'gpt-5.6-sol','gpt-5.6-sol','GPT-5.6 Sol','Higher cost',10,'56000000-0000-4000-8000-000000000012'::uuid,'19720000-0000-4000-9000-000000000102'::uuid,'{"generation_calls":20,"provider_failures":0,"temperature":"omitted"}')
) values_row(id,runtime_id,provider_id,display_name,tradeoff,quality_rank,rate_id,selection_key,evidence);
`;

try {
  check(docker(["exec", container, "createdb", "-U", "postgres", database]), "create isolated database");
  const baseline = readFileSync("supabase/tests/billing_isolated_baseline.sql", "utf8")
    .replace(/^create role anon nologin;\r?\n/m, "")
    .replace(/^create role authenticated nologin;\r?\n/m, "")
    .replace(/^create role service_role nologin bypassrls;\r?\n/m, "");
  psql(baseline, "billing baseline");
  psql(String.raw`
    create table tongs.orgs(id uuid primary key,name text not null,created_by uuid references auth.users(id),personal_owner_user_id uuid references auth.users(id),created_at timestamptz default now(),updated_at timestamptz default now());
    create table tongs.org_members(org_id uuid references tongs.orgs(id),user_id uuid references auth.users(id),org_role text not null,created_at timestamptz default now(),created_by uuid references auth.users(id),primary key(org_id,user_id));
    alter table tongs.workspaces add column org_id uuid references tongs.orgs(id);
    alter table tongs.workspaces add column created_by uuid references auth.users(id);
    create table tongs.workspace_members(workspace_id uuid references tongs.workspaces(id),user_id uuid references auth.users(id),role text not null default 'member',primary key(workspace_id,user_id));
    create table tongs.workpiece_jobs(id uuid primary key,job_type text not null,status text not null);
    create table tongs.episodes(id uuid primary key,workspace_id uuid not null references tongs.workspaces(id),unique(id,workspace_id));
    create function tongs._transition_owner_authority_agrees(uuid) returns boolean language sql stable security definer set search_path=pg_catalog as 'select false';
    revoke all on function tongs._transition_owner_authority_agrees(uuid) from public,anon,authenticated,service_role;
  `, "compatibility baseline");
  psql('create extension if not exists "uuid-ossp" with schema extensions;', "uuid compatibility");
  for (const migration of migrations) psql(readFileSync(`supabase/migrations/${migration}`, "utf8"), migration);
  psql(connectedBaselineFixture, "connected baseline fixture");
  psql(readFileSync("supabase/migrations/20261012020000_forge_ai_global_model_preference_and_hammer_authority.sql", "utf8"), "Slice 4 migration");
  psql(readFileSync("supabase/tests/forge_ai_global_model_preference_hammer_slice4.sql", "utf8"), "Slice 4 SQL/RLS proof");
  const summary = psql(String.raw`
    select jsonb_build_object(
      'global_models',(select count(*) from tongs.ai_model_identities),
      'hammer_eligible_models',(select count(*) from tongs._eligible_ai_models_for_operation('hammer.transcript_cleanup')),
      'hammer_latest_rollout',(select mode from tongs.openai_text_rollout_revisions where route_code='hammer.transcript_cleanup' order by revision desc limit 1),
      'hammer_execution_scopes',(select count(*) from tongs.customer_paid_execution_scope_authorizations where route_code='hammer.transcript_cleanup'),
      'published_prices',(select jsonb_agg(customer_credit_units order by customer_credit_units) from tongs.private_pricing_revisions where id in('40010000-0000-4000-8000-000000000402','40010000-0000-4000-8000-000000000412','40010000-0000-4000-8000-000000000422'))
    );
  `, "Slice 4 summary");
  console.log(summary);
} finally {
  docker(["exec", container, "dropdb", "-U", "postgres", "--if-exists", "--force", database]);
}
