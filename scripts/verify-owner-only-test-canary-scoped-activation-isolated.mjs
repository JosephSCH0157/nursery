import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const container = process.env.SUPABASE_DB_CONTAINER || "supabase_db_nursery";
const database = `forge_slice6c1_${randomUUID().replaceAll("-", "").slice(0, 10)}`;
const schemaPath = resolve(root, ".git/forge-private-evidence/slice6a-connected-schema-after.sql");
const priorVerifier = readFileSync(resolve(root, "scripts/verify-hammer-test-canary-prerequisites-isolated.mjs"), "utf8");
const fixtureMatch = priorVerifier.match(/const fixture = String\.raw`([\s\S]*?)`;\n\ntry \{/);
if (!fixtureMatch) throw new Error("Slice 6B.1 isolated fixture could not be located");
const fixture = fixtureMatch[1].replace(
  "'slice6b1-mini','sku','openai','slice6b1-mini'",
  "'slice6b1-mini','sku','openai','openai-text:hammer.transcript_cleanup:gpt-5.4-mini:40010000-0000-4000-8000-000000000301'",
);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", maxBuffer: 96 * 1024 * 1024, ...options });
  if (result.status !== 0) throw new Error(`${options.label || command} failed:\n${result.stderr || result.stdout}`);
  return result.stdout.trim();
}
function docker(args, options = {}) { return run("docker", args, options); }
function psql(sql, label) {
  return docker(["exec", "-i", container, "psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], { input: sql, label });
}
function psqlFile(hostPath, containerPath, label) {
  docker(["cp", hostPath, `${container}:${containerPath}`], { label: `${label} copy` });
  return docker(["exec", container, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database, "-f", containerPath], { label });
}

const setup = String.raw`
insert into tongs.openai_text_cost_policy_revisions(
 id,route_code,revision,policy_code,attempt_plan,maximum_input_units,maximum_output_units,maximum_attempts,
 direct_provider_ceiling_micros,supporting_cost_ceiling_micros,full_cost_ceiling_micros,cost_coverage,lifecycle_state,notes
) values('40010000-0000-4000-8000-000000000301','hammer.transcript_cleanup',1,'slice6c1-mini',
 '[{"attempt":1,"rate_revision_id":"6b100000-0000-4000-8000-000000000080","runtime_model":"gpt-5.4-mini","provider_model_id":"gpt-5.4-mini-2026-03-17","input_max":128000,"output_max":16384}]',
 128000,16384,1,169728,0,169728,'complete','active','Slice 6C.1 exact Mini policy');
insert into tongs.openai_text_provider_rate_revisions(
 id,provider,runtime_model_alias,provider_model_id,revision,input_micros_per_million_tokens,
 cached_input_micros_per_million_tokens,output_micros_per_million_tokens,maximum_context_tokens,
 maximum_output_tokens,source_url,source_checked_at,content_hash
) values('6b100000-0000-4000-8000-000000000080','openai','gpt-5.4-mini','gpt-5.4-mini-2026-03-17',1,
 250000,25000,2000000,128000,16384,'https://developers.openai.com/api/docs/pricing',now(),repeat('8',64));
insert into tongs.openai_text_model_catalog_revisions(
 id,revision,lifecycle_state,quality_method,source_checked_at,content_hash,actor_id
) values('6b100000-0000-4000-8000-000000000040',17,'active','Slice 6C.1 frozen evidence',now(),repeat('4',64),'6b100000-0000-4000-8000-000000000001');
insert into tongs.openai_text_model_catalog_entries(
 id,catalog_revision_id,runtime_model_id,provider_model_id,display_name,tradeoff_summary,quality_rank,
 quality_basis,supported_apis,availability_status,availability_evidence,lifecycle_state,rate_revision_id,
 customer_selection_key,customer_selection_state
) values('6b100000-0000-4000-8000-000000000041','6b100000-0000-4000-8000-000000000040',
 'gpt-5.4-mini','gpt-5.4-mini-2026-03-17','GPT-5.4 Mini','Lower cost',1,'Retained bake-off evidence',
 '["chat_completions"]','generation_compatible','{}','active','6b100000-0000-4000-8000-000000000080',
 '40010000-0000-4000-9000-000000000001','selectable');
insert into tongs.openai_text_model_route_compatibility(
 id,catalog_entry_id,route_code,compatibility_status,maximum_input_tokens,maximum_output_tokens,
 maximum_attempts,supporting_cost_coverage,cost_policy_revision_id,evidence_json
) values('6b100000-0000-4000-8000-000000000081','6b100000-0000-4000-8000-000000000041',
 'hammer.transcript_cleanup','generation_verified',128000,16384,1,'complete',
 '40010000-0000-4000-8000-000000000301','{}');
insert into tongs.openai_text_failure_loss_rollout_revisions(
 route_code,financial_environment,revision,mode,loss_policy_revision_id,reason,actor_id
) values('hammer.transcript_cleanup','test',1,'halt_new','6b100000-0000-4000-8000-000000000010','Slice 6C.1 isolated halt','6b100000-0000-4000-8000-000000000001');
insert into tongs.paid_execution_control_revisions(
 revision,pricing_activation_enabled,reservation_shadow_enabled,customer_settlement_enabled,
 owner_budget_spending_enabled,provider_execution_enabled,reason,actor_id
) values(1,true,true,false,true,true,'Slice 6C.1 isolated owner execution control','6b100000-0000-4000-8000-000000000001');
insert into tongs.private_pricing_publications(
 id,policy_id,pricing_revision_id,publication_revision,action,reason,actor_id
) values('6b100000-0000-4000-8000-000000000090','40010000-0000-4000-8000-000000000401',
 '40010000-0000-4000-8000-000000000402',1,'published','Slice 6C.1 isolated exact price','6b100000-0000-4000-8000-000000000001');
insert into tongs.orgs(id,name,created_by,personal_owner_user_id)
values('6b100000-0000-4000-8000-000000000100','Slice 6C.1 Owner','6b100000-0000-4000-8000-000000000001','6b100000-0000-4000-8000-000000000001');
insert into tongs.workspaces(id,name,created_by,org_id)
values('6b100000-0000-4000-8000-000000000101','Slice 6C.1 Workspace','6b100000-0000-4000-8000-000000000001','6b100000-0000-4000-8000-000000000100');
insert into tongs.ai_funding_preference_revisions(id,user_id,workspace_id,revision,payer_kind,org_id,actor_id)
values('6b100000-0000-4000-8000-000000000102','6b100000-0000-4000-8000-000000000001',
 '6b100000-0000-4000-8000-000000000101',1,'owner_testing',null,'6b100000-0000-4000-8000-000000000001');
set request.jwt.claim.role='service_role';
select tongs.create_owner_only_openai_text_execution_scope_authorization(
 '6b100000-0000-4000-8000-000000000110','6b100000-0000-4000-8000-000000000001',
 '6b100000-0000-4000-8000-000000000001','6b100000-0000-4000-8000-000000000101','test',
 'hammer.transcript_cleanup','gpt-5.4-mini',now()-interval '1 minute',now()+interval '1 day','Slice 6C.1 isolated exact owner scope');
insert into tongs.paid_execution_aggregate_assignments(
 id,policy_revision_id,user_id,workspace_id,state,valid_from,valid_until,reason
) values('6b100000-0000-4000-8000-000000000120','40010000-0000-4000-8000-000000000701',
 '6b100000-0000-4000-8000-000000000001','6b100000-0000-4000-8000-000000000101','active',
 now()-interval '1 minute',now()+interval '1 day','Slice 6C.1 isolated exact aggregate assignment');
`;

try {
  docker(["exec", container, "createdb", "-U", "postgres", database], { label: "create isolated database" });
  psql(String.raw`
    create schema if not exists auth;
    create table auth.users(id uuid primary key,email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select coalesce(current_setting('request.jwt.claim.role',true),'') $$;
    create schema if not exists extensions;
    create extension if not exists "uuid-ossp" with schema extensions;
    create extension if not exists pgcrypto with schema extensions;
  `, "isolated bootstrap");
  psqlFile(schemaPath, "/tmp/forge-slice6c1-schema.sql", "connected-shape schema restore");
  psql(fixture, "Slice 6B.1 fixture");
  psqlFile(resolve(root, "supabase/migrations/20261012040000_hammer_test_canary_prerequisites.sql"), "/tmp/forge-slice6c1-prerequisite.sql", "Slice 6B.1 migration");
  psql(setup, "Slice 6C.1 staged authority");
  psqlFile(resolve(root, "supabase/migrations/20261012050000_owner_only_test_canary_scoped_activation.sql"), "/tmp/forge-slice6c1-migration.sql", "Slice 6C.1 migration");
  psqlFile(resolve(root, "supabase/migrations/20261012060000_scoped_owner_canary_execution_context_activation.sql"), "/tmp/forge-slice6c4-execution-context.sql", "Slice 6C.4 execution-context migration");
  psqlFile(resolve(root, "supabase/migrations/20261012070000_return_paid_funding_environment.sql"), "/tmp/forge-slice6c5-funding-environment.sql", "Slice 6C.5 funding-environment migration");

  const authority = JSON.parse(psql(String.raw`
    select jsonb_build_object(
      'activations',(select count(*) from tongs.owner_paid_execution_canary_activation_revisions where state='active'),
      'budgets',(select count(*) from tongs.owner_operating_budgets where environment='test' and route='hammer.transcript_cleanup'),
      'budget_amount',(select maximum_amount_micros from tongs.owner_operating_budget_revisions where budget_id in(select id from tongs.owner_operating_budgets where environment='test') order by revision desc limit 1),
      'rollout',(select mode from tongs.openai_text_rollout_revisions where route_code='hammer.transcript_cleanup' order by revision desc limit 1),
      'normal_scopes',(select count(*) from tongs.customer_paid_execution_scope_authorizations where route_code='hammer.transcript_cleanup' and authorization_kind='normal_customer'),
      'live_scopes',(select count(*) from tongs.customer_paid_execution_scope_authorizations where route_code='hammer.transcript_cleanup' and financial_environment='live'),
      'rls',(select relrowsecurity and relforcerowsecurity from pg_class where oid='tongs.owner_paid_execution_canary_activation_revisions'::regclass),
      'authenticated_read',has_table_privilege('authenticated','tongs.owner_paid_execution_canary_activation_revisions','select'));
  `, "authority summary"));
  if (authority.activations !== 1 || authority.budgets !== 1 || authority.budget_amount !== 169728) throw new Error("exact owner authority was not created");
  if (authority.rollout !== "halt_new" || authority.normal_scopes !== 0 || authority.live_scopes !== 0) throw new Error("Hammer/Live isolation regressed");
  if (!authority.rls || authority.authenticated_read) throw new Error("private activation security regressed");

  psqlFile(resolve(root, "supabase/tests/owner_only_test_canary_scoped_activation.sql"), "/tmp/forge-slice6c1-test.sql", "rollback-only provider-boundary proof");
  const durable = JSON.parse(psql(String.raw`
    select jsonb_build_object(
      'quotes',(select count(*) from tongs.openai_text_customer_quote_bindings where route_code='hammer.transcript_cleanup'),
      'reservations',(select count(*) from tongs.openai_text_funding_bindings where route_code='hammer.transcript_cleanup'),
      'aggregate_bindings',(select count(*) from tongs.paid_operation_aggregate_bindings where capability_code='openai.text.hammer_cleanup'),
      'holds',(select count(*) from tongs.restricted_beta_exposure_holds hold join tongs.restricted_beta_policy_capabilities capability on capability.id=hold.capability_term_id where capability.capability_code='openai.text.hammer_cleanup'),
      'provider_attempts',(select count(*) from tongs.funding_reservation_events event join tongs.funding_reservations reservation on reservation.id=event.reservation_id join tongs.openai_text_customer_quote_bindings binding on binding.quote_id=reservation.quote_id where binding.route_code='hammer.transcript_cleanup' and event.provider_attempt_key is not null));
  `, "post-rollback durability summary"));
  if (Object.values(durable).some((value) => value !== 0)) throw new Error(`rollback left durable financial activity: ${JSON.stringify(durable)}`);
  console.log(JSON.stringify({ ok: true, authority, durable, provider_network_calls: 0 }));
} finally {
  docker(["exec", container, "dropdb", "-U", "postgres", "--if-exists", "--force", database], { label: "drop isolated database" });
}
