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

const lunaAuthorityFixture = String.raw`
insert into tongs.openai_text_provider_rate_revisions(
 id,provider,runtime_model_alias,provider_model_id,revision,input_micros_per_million_tokens,
 cached_input_micros_per_million_tokens,output_micros_per_million_tokens,
 maximum_context_tokens,maximum_output_tokens,source_url,source_checked_at,content_hash
) values(
 '56560000-0000-4000-8000-000000000001','openai','gpt-5.6-luna','gpt-5.6-luna',1,
 200000,20000,1200000,1050000,128000,'https://developers.openai.com/api/docs/models/gpt-5.6-luna',
 '2026-09-08T13:48:17.221114Z',repeat('5',64)
) on conflict(id) do nothing;

insert into tongs.openai_text_route_policies(
 route_code,product_area,provider_operation,maximum_input_units,maximum_output_units,
 maximum_attempts,requires_result_validation,requires_canonical_persistence,byo_supported,rollout_mode,notes
) values
 ('hearth.chat_completion','hearth','chat_completions',2000,512,1,true,true,false,'inactive','Isolated retained authority fixture.'),
 ('hearth.research_synthesis','hearth','chat_completions',128000,16384,1,true,true,false,'inactive','Isolated retained authority fixture.'),
 ('hearth.script_generation','hearth','chat_completions',32000,8000,1,true,true,false,'inactive','Isolated retained authority fixture.'),
 ('hearth.title_generation','hearth','chat_completions',12000,512,1,true,true,false,'inactive','Isolated retained authority fixture.'),
 ('hearth.tag_generation','hearth','chat_completions',12000,256,1,true,true,false,'inactive','Isolated retained authority fixture.'),
 ('hearth.framing_pack_generation','hearth','chat_completions',12000,2048,1,true,true,false,'inactive','Isolated retained authority fixture.'),
 ('hearth.thumbnail_direction_generation','hearth','chat_completions',16000,2048,1,true,true,false,'inactive','Isolated retained authority fixture.')
on conflict(route_code) do nothing;

insert into tongs.openai_text_cost_policy_revisions(
 id,route_code,revision,policy_code,attempt_plan,maximum_input_units,maximum_output_units,
 maximum_attempts,direct_provider_ceiling_micros,supporting_cost_ceiling_micros,
 full_cost_ceiling_micros,cost_coverage,lifecycle_state,notes
) select value.id,value.route_code,99,value.policy_code,
 jsonb_build_array(jsonb_build_object('attempt',1,'rate_revision_id','56560000-0000-4000-8000-000000000001','runtime_model','gpt-5.6-luna','provider_model_id','gpt-5.6-luna','input_max',value.input_max,'output_max',value.output_max)),
 value.input_max,value.output_max,1,value.direct_ceiling,value.supporting_ceiling,value.full_ceiling,
 'complete',value.lifecycle,'Isolated retained Luna authority fixture.'
from (values
 ('10000000-0000-4000-8000-000000000010'::uuid,'hearth.chat_completion','openai-text:hearth-chat:luna-bounded-pilot-v1',2000,512,1015,10000,11015,'pilot_candidate'),
 ('12000000-0000-4000-8000-000000000001'::uuid,'hearth.research_synthesis','openai-text:hearth-research:standard-customer-luna-v1',128000,16384,45261,31456,76717,'active'),
 ('13000000-0000-4000-8000-000000000001'::uuid,'hearth.script_generation','openai-text:hearth-script-generation:test-canary-luna-v1',32000,8000,16000,0,16000,'active'),
 ('14000000-0000-4000-8000-000000000001'::uuid,'hearth.title_generation','openai-text:hearth-title-generation:test-luna-v1',12000,512,3015,0,3015,'active'),
 ('15000000-0000-4000-8000-000000000001'::uuid,'hearth.tag_generation','openai-text:hearth-tag-generation:test-luna-v1',12000,256,2708,0,2708,'active'),
 ('16000000-0000-4000-8000-000000000001'::uuid,'hearth.framing_pack_generation','openai-text:hearth-framing-pack-generation:test-luna-v1',12000,2048,4858,0,4858,'active'),
 ('18000000-0000-4000-8000-000000000001'::uuid,'hearth.thumbnail_direction_generation','openai-text:hearth-thumbnail-direction-generation:test-luna-v1',16000,2048,5658,0,5658,'active')
) value(id,route_code,policy_code,input_max,output_max,direct_ceiling,supporting_ceiling,full_ceiling,lifecycle)
on conflict do nothing;

do $$
declare authority record; v_policy_id uuid; v_pricing_id uuid; v_sku text;
begin
 for authority in select * from (values
  ('40081000-0000-4000-8000-000000000101'::uuid,'40081000-0000-4000-8000-000000000201'::uuid,'40081000-0000-4000-8000-000000000301'::uuid,'10000000-0000-4000-8000-000000000010'::uuid,'hearth.chat_completion',11015,15000,3,14650),
  ('40081000-0000-4000-8000-000000000102'::uuid,'40081000-0000-4000-8000-000000000202'::uuid,'40081000-0000-4000-8000-000000000302'::uuid,'12000000-0000-4000-8000-000000000001'::uuid,'hearth.research_synthesis',76717,105000,21,102034),
  ('40081000-0000-4000-8000-000000000103'::uuid,'40081000-0000-4000-8000-000000000203'::uuid,'40081000-0000-4000-8000-000000000303'::uuid,'13000000-0000-4000-8000-000000000001'::uuid,'hearth.script_generation',16000,25000,5,21280),
  ('40081000-0000-4000-8000-000000000104'::uuid,'40081000-0000-4000-8000-000000000204'::uuid,'40081000-0000-4000-8000-000000000304'::uuid,'14000000-0000-4000-8000-000000000001'::uuid,'hearth.title_generation',3015,5000,1,4010),
  ('40081000-0000-4000-8000-000000000105'::uuid,'40081000-0000-4000-8000-000000000205'::uuid,'40081000-0000-4000-8000-000000000305'::uuid,'15000000-0000-4000-8000-000000000001'::uuid,'hearth.tag_generation',2708,5000,1,3602),
  ('40081000-0000-4000-8000-000000000106'::uuid,'40081000-0000-4000-8000-000000000206'::uuid,'40081000-0000-4000-8000-000000000306'::uuid,'16000000-0000-4000-8000-000000000001'::uuid,'hearth.framing_pack_generation',4858,10000,2,6462),
  ('40081000-0000-4000-8000-000000000107'::uuid,'40081000-0000-4000-8000-000000000207'::uuid,'40081000-0000-4000-8000-000000000307'::uuid,'18000000-0000-4000-8000-000000000001'::uuid,'hearth.thumbnail_direction_generation',5658,10000,2,7526)
 ) value(policy_id,pricing_id,publication_id,cost_id,route_code,full_ceiling,customer_price,credits,unrounded)
 loop
  v_sku:=lower('openai-text:'||authority.route_code||':gpt-5.6-luna:'||authority.cost_id::text);
  select id into v_policy_id from tongs.private_pricing_policies where provider='openai' and private_pricing_policies.sku=v_sku;
  if v_policy_id is null then
   v_policy_id:=authority.policy_id;
   insert into tongs.private_pricing_policies(id,policy_code,scope_kind,provider,sku,created_by)
   values(v_policy_id,'isolated-'||replace(authority.route_code,'.','-')||'-luna','sku','openai',v_sku,'40000000-0000-4000-8000-000000000099');
  end if;
  select revision.id into v_pricing_id from tongs.private_pricing_revisions revision
  where revision.policy_id=v_policy_id order by revision.revision desc limit 1;
  if v_pricing_id is null then
   v_pricing_id:=authority.pricing_id;
   insert into tongs.private_pricing_revisions(
    id,policy_id,revision,previous_revision_id,lifecycle_state,currency,markup_basis_points,
    full_cost_ceiling_micros,failure_cost_ceiling_micros,customer_price_ceiling_micros,
    billable_failure_ceiling_micros,customer_credit_units,billable_failure_classes,free_failure_classes,
    included_quantity,retention_policy,change_reason,content_hash,actor_id,
    unrounded_customer_price_micros,rounding_adjustment_micros,settled_customer_price_micros
   ) values(
    v_pricing_id,v_policy_id,1,null,'review_ready','USD',3300,authority.full_ceiling,0,
    authority.customer_price,0,authority.credits,'[]','["provider_failure","forge_failure"]','{}','{}',
    'Isolated retained Luna price fixture.',encode(extensions.digest(convert_to('isolated-luna-price:'||authority.route_code,'utf8'),'sha256'),'hex'),'40000000-0000-4000-8000-000000000099',
    authority.unrounded,authority.customer_price-authority.unrounded,authority.customer_price
   );
  end if;
  if not exists(select 1 from tongs.private_pricing_publications publication where publication.policy_id=v_policy_id and publication.pricing_revision_id=v_pricing_id and action='published') then
   insert into tongs.private_pricing_publications(id,policy_id,pricing_revision_id,publication_revision,action,reason,actor_id)
   values(authority.publication_id,v_policy_id,v_pricing_id,1,'published','Isolated retained Luna publication fixture.','40000000-0000-4000-8000-000000000099');
  end if;
 end loop;
end $$;

insert into tongs.openai_text_model_catalog_entries(
 id,catalog_revision_id,runtime_model_id,provider_model_id,display_name,tradeoff_summary,
 quality_rank,quality_basis,supported_apis,availability_status,availability_evidence,
 lifecycle_state,rate_revision_id,customer_selection_key,customer_selection_state
) values(
 'bc743a0f-58d7-51c5-8de1-075ed253ac9d','40010000-0000-4000-8000-000000000500',
 'gpt-5.6-luna','gpt-5.6-luna','GPT-5.6 Luna','Fastest and lowest-cost candidate.',60,
 'Retained certified Hearth authority.','["responses","chat_completions","structured_outputs"]',
 'generation_compatible','{"retained_authority":true}','active','56560000-0000-4000-8000-000000000001','40081000-0000-4000-9000-000000000001','selectable'
);

insert into tongs.openai_text_model_route_compatibility(
 id,catalog_entry_id,route_code,compatibility_status,maximum_input_tokens,maximum_output_tokens,
 maximum_attempts,supporting_cost_coverage,cost_policy_revision_id,evidence_json
) select extensions.uuid_generate_v5('bc743a0f-58d7-51c5-8de1-075ed253ac9d',value.route_code),
 'bc743a0f-58d7-51c5-8de1-075ed253ac9d',value.route_code,'generation_verified',
 value.input_max,value.output_max,1,'complete',value.cost_id,'{"retained_certification":true}'
from (values
 ('hearth.chat_completion',2000,512,'10000000-0000-4000-8000-000000000010'::uuid),
 ('hearth.framing_pack_generation',12000,2048,'16000000-0000-4000-8000-000000000001'::uuid),
 ('hearth.research_synthesis',128000,16384,'12000000-0000-4000-8000-000000000001'::uuid),
 ('hearth.script_generation',32000,8000,'13000000-0000-4000-8000-000000000001'::uuid),
 ('hearth.tag_generation',12000,256,'15000000-0000-4000-8000-000000000001'::uuid),
 ('hearth.thumbnail_direction_generation',16000,2048,'18000000-0000-4000-8000-000000000001'::uuid),
 ('hearth.title_generation',12000,512,'14000000-0000-4000-8000-000000000001'::uuid)
) value(route_code,input_max,output_max,cost_id);
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
  psql(lunaAuthorityFixture, "retained Luna authority fixture");
  psql(readFileSync("supabase/migrations/20261012080000_hearth_luna_operation_only_model_authority.sql", "utf8"), "Luna operation-only authority migration");
  psql(readFileSync("supabase/tests/hearth_luna_operation_only_model_authority.sql", "utf8"), "Luna operation-only SQL/RLS proof");
  const summary = psql(String.raw`
    select jsonb_build_object(
      'global_models',(select count(*) from tongs.ai_model_identities),
      'globally_selectable_models',(select count(*) from tongs.ai_global_model_choice_revisions where authority_state='selectable'),
      'luna_operation_only',(select count(*) from tongs.ai_global_model_choice_revisions where model_identity_id='40010000-0000-4000-8000-000000000004' and authority_state='operation_only'),
      'luna_hearth_operations',(select count(*) from tongs.openai_text_model_route_compatibility compatibility join tongs.openai_text_catalog_ai_model_bindings binding on binding.catalog_entry_id=compatibility.catalog_entry_id where binding.model_identity_id='40010000-0000-4000-8000-000000000004' and compatibility.route_code like 'hearth.%'),
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
