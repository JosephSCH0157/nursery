import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const container = process.env.SUPABASE_DB_CONTAINER || "supabase_db_nursery";
const database = `forge_slice6b1_${randomUUID().replaceAll("-", "").slice(0, 10)}`;
const schemaPath = resolve(root, ".git/forge-private-evidence/slice6a-connected-schema-after.sql");
const migrationPath = resolve(root, "supabase/migrations/20261012040000_hammer_test_canary_prerequisites.sql");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 96 * 1024 * 1024,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${options.label || command} failed:\n${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function docker(args, options = {}) {
  return run("docker", args, options);
}

function psql(sql, label) {
  return docker([
    "exec", "-i", container, "psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1",
    "-U", "postgres", "-d", database,
  ], { input: sql, label });
}

function psqlFile(hostPath, containerPath, label) {
  docker(["cp", hostPath, `${container}:${containerPath}`], { label: `${label} copy` });
  return docker([
    "exec", container, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1",
    "-U", "postgres", "-d", database, "-f", containerPath,
  ], { label });
}

const fixture = String.raw`
set session_replication_role = replica;
insert into auth.users(id,email) values
 ('6b100000-0000-4000-8000-000000000001','owner@example.test');
insert into tongs.platform_operators(user_id,reason,granted_by)
values('6b100000-0000-4000-8000-000000000001','Slice 6B.1 isolated owner/operator','6b100000-0000-4000-8000-000000000001');
insert into tongs.owner_testing_principals(user_id,status,revision,reason,configured_by)
values('6b100000-0000-4000-8000-000000000001','enabled',1,'Slice 6B.1 isolated owner','6b100000-0000-4000-8000-000000000001');
insert into tongs.account_authority_classifications(user_id,account_class,revision,reason,configured_by)
values('6b100000-0000-4000-8000-000000000001','owner',1,'Slice 6B.1 isolated owner','6b100000-0000-4000-8000-000000000001');
insert into tongs.financial_runtime_environment_revisions(revision,financial_environment,reason,actor_id)
values(1,'test','Slice 6B.1 isolated Test runtime','6b100000-0000-4000-8000-000000000001');

insert into tongs.openai_text_route_policies(
 route_code,product_area,provider_operation,maximum_input_units,maximum_output_units,maximum_attempts,notes
) values('hammer.transcript_cleanup','hammer','chat_completions',128000,16384,1,'Slice 6B.1 isolated Hammer route');
insert into tongs.openai_text_rollout_revisions(
 route_code,revision,mode,cost_policy_revision_id,reason,actor_id,funding_scope
) values('hammer.transcript_cleanup',3,'halt_new',null,'Slice 6B.1 isolated halt','6b100000-0000-4000-8000-000000000001','forge');
insert into tongs.openai_text_failure_loss_policy_revisions(
 id,route_code,environment,revision,per_operation_limit_micros,aggregate_limit_micros,
 rolling_window_seconds,maximum_concurrency,lifecycle_state,reason,actor_id
) values('6b100000-0000-4000-8000-000000000010','hammer.transcript_cleanup','test',1,
 967680,967680,86400,1,'active','Slice 6B.1 isolated Hammer Test loss authority','6b100000-0000-4000-8000-000000000001');

insert into tongs.private_markup_rule_revisions(
 id,revision,previous_revision_id,default_markup_basis_points,overrides_json,change_reason,content_hash,actor_id
) values('6b100000-0000-4000-8000-000000000011',1,null,3300,'[]','Slice 6B.1 common markup',repeat('1',64),'6b100000-0000-4000-8000-000000000001');
insert into tongs.private_pricing_policies(id,policy_code,scope_kind,provider,sku,created_by) values
 ('40010000-0000-4000-8000-000000000401','slice6b1-mini','sku','openai','slice6b1-mini','6b100000-0000-4000-8000-000000000001'),
 ('40010000-0000-4000-8000-000000000411','slice6b1-61','sku','openai','slice6b1-61','6b100000-0000-4000-8000-000000000001'),
 ('40010000-0000-4000-8000-000000000421','slice6b1-56','sku','openai','slice6b1-56','6b100000-0000-4000-8000-000000000001');
insert into tongs.private_pricing_revisions(
 id,policy_id,revision,lifecycle_state,currency,markup_basis_points,full_cost_ceiling_micros,
 failure_cost_ceiling_micros,customer_price_ceiling_micros,billable_failure_ceiling_micros,
 customer_credit_units,billable_failure_classes,free_failure_classes,included_quantity,
 retention_policy,change_reason,content_hash,actor_id,unrounded_customer_price_micros,
 rounding_adjustment_micros,settled_customer_price_micros
) values
 ('40010000-0000-4000-8000-000000000402','40010000-0000-4000-8000-000000000401',1,'review_ready','USD',3300,169728,0,230000,0,46,'[]','[]','{}','{}','Mini',repeat('2',64),'6b100000-0000-4000-8000-000000000001',225739,4261,230000),
 ('40010000-0000-4000-8000-000000000412','40010000-0000-4000-8000-000000000411',1,'review_ready','USD',3300,483840,0,645000,0,129,'[]','[]','{}','{}','6.1 Sol',repeat('3',64),'6b100000-0000-4000-8000-000000000001',643508,1492,645000),
 ('40010000-0000-4000-8000-000000000422','40010000-0000-4000-8000-000000000421',1,'review_ready','USD',3300,967680,0,1290000,0,258,'[]','[]','{}','{}','5.6 Sol',repeat('4',64),'6b100000-0000-4000-8000-000000000001',1287015,2985,1290000);

insert into tongs.ai_model_identities(id,model_code,provider_code,provider_model_id,customer_selection_key) values
 ('40010000-0000-4000-8000-000000000001','openai:gpt-5.4-mini','openai','gpt-5.4-mini-2026-03-17','40010000-0000-4000-9000-000000000001'),
 ('40010000-0000-4000-8000-000000000002','openai:gpt-6.1-sol','openai','gpt-6.1-sol','40010000-0000-4000-9000-000000000002'),
 ('40010000-0000-4000-8000-000000000003','openai:gpt-5.6-sol','openai','gpt-5.6-sol','40010000-0000-4000-9000-000000000003');
insert into tongs.ai_model_identity_revisions(id,model_identity_id,revision,display_name,relative_cost_class,lifecycle_state,evidence_json) values
 ('6b100000-0000-4000-8000-000000000021','40010000-0000-4000-8000-000000000001',1,'GPT-5.4 Mini','lower_cost','active','{}'),
 ('6b100000-0000-4000-8000-000000000022','40010000-0000-4000-8000-000000000002',1,'GPT-6.1 Sol','mid_range_cost','active','{}'),
 ('6b100000-0000-4000-8000-000000000023','40010000-0000-4000-8000-000000000003',1,'GPT-5.6 Sol','higher_cost','active','{}');

insert into tongs.restricted_beta_policy_revisions(id,environment,revision,lifecycle_state,reason)
values('6b100000-0000-4000-8000-000000000031','test',1,'draft','Slice 6B.1 isolated historical draft');
insert into tongs.restricted_beta_policy_revisions(
 id,environment,revision,lifecycle_state,aggregate_forge_exposure_limit_micros,reserved_headroom_micros,
 maximum_concurrency,rolling_window_seconds,evidence_max_age_seconds,reason
) values('6b100000-0000-4000-8000-000000000032','test',2,'active',600000,0,1,86400,2592000,'Slice 6B.1 isolated prior Test policy');
set session_replication_role = origin;

create or replace function tongs._eligible_ai_models_for_operation(p_operation_code text)
returns table(model_identity_id uuid,customer_selection_key uuid,display_name text,relative_cost_class text,catalog_revision_id uuid,catalog_revision integer,model_catalog_entry_id uuid,runtime_model_id text,provider_model_id text,cost_policy_revision_id uuid,customer_credit_units bigint)
language sql stable security definer set search_path=pg_catalog as $$
 select * from (values
  ('40010000-0000-4000-8000-000000000001'::uuid,'40010000-0000-4000-9000-000000000001'::uuid,'GPT-5.4 Mini','lower_cost','6b100000-0000-4000-8000-000000000040'::uuid,17,'6b100000-0000-4000-8000-000000000041'::uuid,'gpt-5.4-mini','gpt-5.4-mini-2026-03-17','40010000-0000-4000-8000-000000000301'::uuid,46::bigint),
  ('40010000-0000-4000-8000-000000000002'::uuid,'40010000-0000-4000-9000-000000000002'::uuid,'GPT-6.1 Sol','mid_range_cost','6b100000-0000-4000-8000-000000000040'::uuid,17,'6b100000-0000-4000-8000-000000000042'::uuid,'gpt-6.1-sol','gpt-6.1-sol','40010000-0000-4000-8000-000000000302'::uuid,129::bigint),
  ('40010000-0000-4000-8000-000000000003'::uuid,'40010000-0000-4000-9000-000000000003'::uuid,'GPT-5.6 Sol','higher_cost','6b100000-0000-4000-8000-000000000040'::uuid,17,'6b100000-0000-4000-8000-000000000043'::uuid,'gpt-5.6-sol','gpt-5.6-sol','40010000-0000-4000-8000-000000000303'::uuid,258::bigint)
 ) eligible(model_identity_id,customer_selection_key,display_name,relative_cost_class,catalog_revision_id,catalog_revision,model_catalog_entry_id,runtime_model_id,provider_model_id,cost_policy_revision_id,customer_credit_units)
 where p_operation_code='hammer.transcript_cleanup'
$$;
`;

try {
  docker(["exec", container, "createdb", "-U", "postgres", database], { label: "create isolated database" });
  psql(String.raw`
    create schema if not exists auth;
    create table auth.users(id uuid primary key,email text);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $$;
    create function auth.role() returns text language sql stable as $$
      select coalesce(current_setting('request.jwt.claim.role',true),'')
    $$;
    create schema if not exists extensions;
    create extension if not exists "uuid-ossp" with schema extensions;
    create extension if not exists pgcrypto with schema extensions;
  `, "isolated bootstrap");
  psqlFile(schemaPath, "/tmp/forge-slice6b1-schema.sql", "connected-shape schema restore");
  psql(fixture, "Slice 6B.1 fixture");
  psqlFile(migrationPath, "/tmp/forge-slice6b1-migration.sql", "Slice 6B.1 migration");

  const summary = psql(String.raw`
    set request.jwt.claim.role = 'service_role';
    select jsonb_build_object(
      'global_preferences',(select count(*) from tongs.ai_model_preference_revisions),
      'hammer_overrides',(select count(*) from tongs.ai_operation_model_override_revisions where operation_code='hammer.transcript_cleanup' and override_state='specific'),
      'resolved_model',(tongs.resolve_openai_text_model_for_quote('6b100000-0000-4000-8000-000000000001','hammer.transcript_cleanup','forge')->>'runtime_model_id'),
      'preference_source',(tongs.resolve_openai_text_model_for_quote('6b100000-0000-4000-8000-000000000001','hammer.transcript_cleanup','forge')->>'preference_source'),
      'test_policy',(select jsonb_build_object('revision',revision,'state',lifecycle_state,'aggregate',aggregate_forge_exposure_limit_micros,'window',rolling_window_seconds,'concurrency',maximum_concurrency) from tongs.restricted_beta_policy_revisions where id='40010000-0000-4000-8000-000000000701'),
      'hammer_term',(select jsonb_build_object('mode',admission_mode,'per_operation',per_operation_supplier_ceiling_micros,'model',exact_model_or_sku,'attempts',maximum_attempts) from tongs.restricted_beta_policy_capabilities where id='40010000-0000-4000-8000-000000000703'),
      'rollout',(select mode from tongs.openai_text_rollout_revisions where route_code='hammer.transcript_cleanup' order by revision desc limit 1),
      'execution_scopes',(select count(*) from tongs.customer_paid_execution_scope_authorizations where route_code='hammer.transcript_cleanup'),
      'assignments',(select count(*) from tongs.paid_execution_aggregate_assignments where policy_revision_id='40010000-0000-4000-8000-000000000701'),
      'quotes',(select count(*) from tongs.openai_text_customer_quote_bindings where route_code='hammer.transcript_cleanup'),
      'reservations',(select count(*) from tongs.openai_text_funding_bindings where route_code='hammer.transcript_cleanup'),
      'holds',(select count(*) from tongs.restricted_beta_exposure_holds h join tongs.restricted_beta_policy_capabilities c on c.id=h.capability_term_id where c.capability_code='openai.text.hammer_cleanup'),
      'private_policy_rls',(select relrowsecurity and relforcerowsecurity from pg_class where oid='tongs.restricted_beta_policy_revisions'::regclass),
      'customer_cannot_read_policy',not has_table_privilege('authenticated','tongs.restricted_beta_policy_revisions','SELECT')
    );
  `, "Slice 6B.1 isolated summary");
  const result = JSON.parse(summary);
  if (result.global_preferences !== 0 || result.hammer_overrides !== 1) throw new Error("override isolation failed");
  if (result.resolved_model !== "gpt-5.4-mini" || result.preference_source !== "operation_override") throw new Error("authoritative model resolution failed");
  if (result.test_policy.revision !== 3 || result.test_policy.state !== "active" || result.test_policy.aggregate !== 967680 || result.test_policy.window !== 86400 || result.test_policy.concurrency !== 1) throw new Error("aggregate policy bounds failed");
  if (result.hammer_term.mode !== "covered" || result.hammer_term.per_operation !== 967680 || result.hammer_term.model !== "gpt-5.4-mini" || result.hammer_term.attempts !== 1) throw new Error("aggregate term bounds failed");
  if (result.rollout !== "halt_new" || result.execution_scopes !== 0 || result.assignments !== 0 || result.quotes !== 0 || result.reservations !== 0 || result.holds !== 0) throw new Error("halted authority became operational");
  if (!result.private_policy_rls || !result.customer_cannot_read_policy) throw new Error("private aggregate policy security regressed");
  console.log(JSON.stringify(result));
} finally {
  docker(["exec", container, "dropdb", "-U", "postgres", "--if-exists", "--force", database], { label: "drop isolated database" });
}
