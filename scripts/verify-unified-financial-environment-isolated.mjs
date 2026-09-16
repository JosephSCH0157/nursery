import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const container = process.env.SUPABASE_DB_CONTAINER || "supabase_db_nursery";
const database = `forge_financial_parity_${randomUUID().replaceAll("-", "").slice(0, 10)}`;
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
  "20260923140000_tongs_owner_pricing_rounded_customer_ceiling.sql",
  "20260923150000_tongs_owner_pricing_nullable_markup_fix.sql",
  "20260923160000_tongs_owner_pricing_nullable_markup_short_circuit.sql",
  "20260924120000_tongs_test_customer_paid_execution.sql",
  "20260925120000_tongs_openai_text_route_execution_adapters.sql",
  "20260926120000_tongs_openai_text_test_certification.sql",
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
  "20261008130000_tongs_owner_hearth_runway_commitment_repair.sql",
  "20261008140000_tongs_owner_hearth_attempt_signature_repair.sql",
  "20261008150000_tongs_owner_hearth_definitive_rejection_recovery.sql",
  "20261008160000_tongs_owner_hearth_compatibility_result_corrections.sql",
  "20261008170000_tongs_owner_hearth_compatibility_rpc_alias.sql",
  "20261008180000_tongs_owner_hearth_fresh_compatibility_retry.sql",
  "20261008190000_tongs_owner_hearth_terminal_concurrency_recovery.sql",
  "20261008200000_tongs_owner_hearth_preprovider_recovery_expiry.sql",
  "20261008210000_tongs_owner_hearth_recovery_renewal.sql",
  "20261008220000_tongs_owner_hearth_model_choice_view.sql",
  "20261009120000_tongs_openai_coordinated_cutover.sql",
  "20261010120000_tongs_owner_funded_hearth_research.sql",
  "20261010130000_tongs_owner_hearth_research_permissions.sql",
  "20261011140000_tongs_unified_financial_environment.sql",
  "20261011150000_tongs_historical_backfill_link_repair.sql",
  "20261011160000_tongs_forge_credit_economy.sql",
  "20261011170000_tongs_standard_customer_luna_catalog.sql",
  "20261011180000_tongs_settled_customer_price_quote.sql",
  "20261011190000_tongs_standard_customer_aggregate_admission.sql",
  "20261011200000_tongs_standard_customer_certification_aggregate.sql",
  "20261011210000_tongs_standard_customer_certification_scope_price.sql",
  "20261011220000_tongs_aggregate_financial_environment_selection.sql",
  "20261011230000_tongs_deposit_fee_allocation_catchup.sql",
  "20261011240000_tongs_standard_customer_rollout.sql",
  "20261011250000_tongs_beta_credit_controls.sql",
  "20261011260000_tongs_credit_pack_purchase_availability.sql",
  "20261011270000_tongs_internal_quote_credit_units.sql",
  "20261011280000_tongs_normal_customer_provider_authority.sql",
  "20261011290000_tongs_credit_pack_availability_caller_role.sql",
  "20261011300000_standard_customer_hearth_research.sql",
];

const historicalBackfillFixture = `
  set session_replication_role = replica;
  create temp table link_fixture(
    ordinal integer primary key,
    source_kind text not null,
    source_id uuid not null,
    reservation_id uuid not null,
    operation_record_id uuid,
    term_id uuid,
    operation_id text not null,
    route_code text not null,
    model text,
    units bigint not null,
    revenue bigint not null,
    consumed_at timestamptz not null
  );
  insert into link_fixture values
    (1,'hearth_test_simulator','ab000000-0000-4000-8000-000000000001','ac000000-0000-4000-8000-000000000001',null,null,'fixture:hearth.chat_completion:success','hearth.chat_completion',null,2,20000,'2026-09-08 20:30:47+00'),
    (2,'openai_test_certification','ab000000-0000-4000-8000-000000000002','ac000000-0000-4000-8000-000000000002','ad000000-0000-4000-8000-000000000002','ae000000-0000-4000-8000-000000000002','fixture:hearth.research_synthesis:success','hearth.research_synthesis','gpt-5.3',1,10000,'2026-09-09 00:50:42+00'),
    (3,'openai_test_certification','ab000000-0000-4000-8000-000000000003','ac000000-0000-4000-8000-000000000003','ad000000-0000-4000-8000-000000000003','ae000000-0000-4000-8000-000000000003','fixture:visual.unified_plan:success','visual.unified_plan','gpt-5-mini',1,10000,'2026-09-09 00:50:43+00'),
    (4,'openai_test_certification','ab000000-0000-4000-8000-000000000004','ac000000-0000-4000-8000-000000000004','ad000000-0000-4000-8000-000000000004','ae000000-0000-4000-8000-000000000004','fixture:visual.narrative_interpretation:success','visual.narrative_interpretation','gpt-5-mini',1,10000,'2026-09-09 00:50:45+00'),
    (5,'openai_test_certification','ab000000-0000-4000-8000-000000000005','ac000000-0000-4000-8000-000000000005','ad000000-0000-4000-8000-000000000005','ae000000-0000-4000-8000-000000000005','fixture:motion.broll_interpretation:success','motion.broll_interpretation','gpt-5-mini',1,10000,'2026-09-09 00:50:47+00'),
    (6,'openai_test_certification','ab000000-0000-4000-8000-000000000006','ac000000-0000-4000-8000-000000000006','ad000000-0000-4000-8000-000000000006','ae000000-0000-4000-8000-000000000006','fixture:hammer.transcript_cleanup:success','hammer.transcript_cleanup','gpt-5.3',1,10000,'2026-09-09 00:50:48+00'),
    (7,'openai_test_certification','ab000000-0000-4000-8000-000000000007','ac000000-0000-4000-8000-000000000007','ad000000-0000-4000-8000-000000000007','ae000000-0000-4000-8000-000000000007','fixture:shorts.discovery:success','shorts.discovery','gpt-5.3',1,10000,'2026-09-09 00:50:50+00'),
    (8,'openai_test_certification','ab000000-0000-4000-8000-000000000008','ac000000-0000-4000-8000-000000000008','ad000000-0000-4000-8000-000000000008','ae000000-0000-4000-8000-000000000008','fixture:quench.metadata:success','quench.metadata','gpt-5.3',1,10000,'2026-09-09 00:50:52+00');

  insert into tongs.test_customer_spending_quotes(
    id, authorization_id, user_id, workspace_id, operation_id, request_fingerprint,
    quote_hash, currency, normal_maximum_charge_micros,
    billable_failure_maximum_charge_micros, customer_credit_units, expires_at
  ) select
    'af000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000001',
    'aa000000-0000-4000-8000-000000000001',
    'aa000000-0000-4000-8000-000000000010', operation_id,
    repeat('a',64), repeat('b',64), 'USD', 20000, 0, 2, now()+interval '1 day'
  from link_fixture where ordinal=1;
  insert into tongs.test_funding_reservations(
    id, quote_id, deposit_id, user_id, operation_id,
    reserved_customer_charge_micros, reserved_credit_units, idempotency_key, execution_kind
  ) select reservation_id, 'af000000-0000-4000-8000-000000000001',
    'aa000000-0000-4000-8000-000000000020',
    'aa000000-0000-4000-8000-000000000001', operation_id,
    20000, 2, 'fixture-hearth-reservation', 'simulated_test'
  from link_fixture where ordinal=1;

  insert into tongs.openai_text_test_certification_batches(
    id,user_id,workspace_id,deposit_id,invocation_token_hash,maximum_operation_count,
    maximum_aggregate_charge_micros,maximum_aggregate_failure_exposure_micros,
    expires_at,created_by,reason
  ) values (
    'b0000000-0000-4000-8000-000000000001',
    'aa000000-0000-4000-8000-000000000001',
    'aa000000-0000-4000-8000-000000000010',
    'aa000000-0000-4000-8000-000000000020',repeat('c',64),14,70000,0,
    now()+interval '1 day','aa000000-0000-4000-8000-000000000099',
    'isolated historical provenance fixture'
  );
  insert into tongs.openai_text_test_certification_terms(
    id,batch_id,route_code,revision,model,maximum_input_units,maximum_output_units,
    maximum_attempts,input_micros_per_million_tokens,output_micros_per_million_tokens,
    direct_provider_ceiling_micros,supporting_cost_ceiling_micros,
    failure_exposure_ceiling_micros,markup_basis_points,customer_price_ceiling_micros,
    customer_credit_units,rate_evidence_status,supporting_cost_policy
  ) select term_id,'b0000000-0000-4000-8000-000000000001',route_code,1,model,
    2000,512,1,0,0,0,10000,0,3300,10000,1,'synthetic_test','{}'::jsonb
  from link_fixture where ordinal>1;
  insert into tongs.openai_text_test_certification_operations(
    id,batch_id,term_id,route_code,scenario,operation_id,workpiece_id,
    request_fingerprint,request_json,quote_hash,accepted_by,
    normal_maximum_charge_micros,billable_failure_maximum_charge_micros,
    reserved_credit_units,expires_at
  ) select operation_record_id,'b0000000-0000-4000-8000-000000000001',term_id,
    route_code,'success',operation_id,'fixture-workpiece-'||ordinal,
    repeat('d',64),'{}'::jsonb,repeat('e',64),
    'aa000000-0000-4000-8000-000000000099',10000,0,1,now()+interval '1 day'
  from link_fixture where ordinal>1;
  insert into tongs.openai_text_test_certification_reservations(
    id,operation_record_id,batch_id,deposit_id,user_id,operation_id,
    reserved_customer_charge_micros,reserved_credit_units,idempotency_key,execution_kind
  ) select reservation_id,operation_record_id,
    'b0000000-0000-4000-8000-000000000001',
    'aa000000-0000-4000-8000-000000000020',
    'aa000000-0000-4000-8000-000000000001',operation_id,
    10000,1,'fixture-cert-reservation-'||ordinal,'simulated_test'
  from link_fixture where ordinal>1;

  insert into tongs.accounting_journal_events(
    id,idempotency_key,event_type,environment,source_type,source_id,currency,
    user_id,workspace_id,actor_id,payload_hash,metadata_json,occurred_at,created_at
  ) select source_id,'fixture-journal-'||ordinal,'test_customer_deposit_consumed',
    'test','simulated_forge_operation',operation_id,'USD',
    'aa000000-0000-4000-8000-000000000001',null,null,repeat('f',64),
    case when source_kind='hearth_test_simulator' then jsonb_build_object(
      'credit_units_consumed',units,'operation_id',operation_id,
      'recognized_test_revenue_micros',revenue,'reservation_id',reservation_id,
      'simulated',true
    ) else jsonb_build_object(
      'credit_units_consumed',units,'recognized_test_revenue_micros',revenue,
      'route_code',route_code,'simulated',true
    ) end,
    consumed_at,consumed_at
  from link_fixture;
  insert into tongs.test_customer_deposit_consumptions(
    id,reservation_id,deposit_id,user_id,operation_id,
    recognized_test_revenue_micros,credit_units_consumed,journal_event_id,consumed_at
  ) select source_id,reservation_id,'aa000000-0000-4000-8000-000000000020',
    'aa000000-0000-4000-8000-000000000001',operation_id,revenue,units,source_id,consumed_at
  from link_fixture where ordinal=1;
  insert into tongs.openai_text_test_certification_consumptions(
    id,reservation_id,deposit_id,user_id,operation_id,
    recognized_test_revenue_micros,credit_units_consumed,journal_event_id,consumed_at
  ) select source_id,reservation_id,'aa000000-0000-4000-8000-000000000020',
    'aa000000-0000-4000-8000-000000000001',operation_id,revenue,units,source_id,consumed_at
  from link_fixture where ordinal>1;
  insert into tongs.customer_deposit_consumptions(
    id,deposit_id,user_id,allocation_key,operation_id,recognized_revenue_micros,
    credit_units_consumed,allocated_processor_fee_micros,journal_event_id,
    metadata_json,consumed_at,created_at
  ) select source_id,'aa000000-0000-4000-8000-000000000020',
    'aa000000-0000-4000-8000-000000000001',
    'legacy-simulator:'||source_kind||':'||source_id::text,operation_id,revenue,
    units,0,source_id,jsonb_build_object(
      'legacy_source_kind',source_kind,'legacy_source_id',source_id,'journal_reused',true
    ),consumed_at,consumed_at
  from link_fixture;
  set session_replication_role = origin;
`;

const historicalRepairProofSql = `
  with canonical_snapshot as (
    select coalesce(jsonb_agg(to_jsonb(row) order by id),'[]'::jsonb) value
    from tongs.customer_deposit_consumptions row
  ), simulator_snapshot as (
    select coalesce(jsonb_agg(row_value order by source_kind,source_id),'[]'::jsonb) value
    from (
      select 'hearth_test_simulator' source_kind,id source_id,to_jsonb(row) row_value
      from tongs.test_customer_deposit_consumptions row
      union all
      select 'openai_test_certification',id,to_jsonb(row)
      from tongs.openai_text_test_certification_consumptions row
    ) source
  ), journal_snapshot as (
    select coalesce(jsonb_agg(to_jsonb(row) order by id),'[]'::jsonb) value
    from tongs.accounting_journal_events row
  )
  select jsonb_build_object(
    'canonical_count',(select jsonb_array_length(value) from canonical_snapshot),
    'canonical_units',(select coalesce(sum(credit_units_consumed),0) from tongs.customer_deposit_consumptions),
    'canonical_hash',(select encode(extensions.digest(convert_to(value::text,'utf8'),'sha256'),'hex') from canonical_snapshot),
    'simulator_count',(select jsonb_array_length(value) from simulator_snapshot),
    'simulator_units',(select (select coalesce(sum(credit_units_consumed),0) from tongs.test_customer_deposit_consumptions)+(select coalesce(sum(credit_units_consumed),0) from tongs.openai_text_test_certification_consumptions)),
    'simulator_hash',(select encode(extensions.digest(convert_to(value::text,'utf8'),'sha256'),'hex') from simulator_snapshot),
    'journal_count',(select jsonb_array_length(value) from journal_snapshot),
    'journal_hash',(select encode(extensions.digest(convert_to(value::text,'utf8'),'sha256'),'hex') from journal_snapshot),
    'backfill_count',(select count(*) from tongs.legacy_simulator_consumption_backfills),
    'conversion_count',(select count(*) from tongs.legacy_credit_conversion_mappings where source_kind in ('hearth_test_simulator','openai_test_certification')),
    'distinct_backfill_sources',(select count(distinct (source_kind,source_id)) from tongs.legacy_simulator_consumption_backfills),
    'distinct_backfill_canonical',(select count(distinct canonical_consumption_id) from tongs.legacy_simulator_consumption_backfills),
    'evidence_hash_count',(select count(*) from tongs.legacy_credit_conversion_mappings where source_kind in ('hearth_test_simulator','openai_test_certification') and evidence_json->>'evidence_hash' ~ '^[0-9a-f]{64}$')
  );
`;

function docker(args, input) {
  return spawnSync("docker", args, { input, encoding: "utf8", maxBuffer: 80 * 1024 * 1024 });
}

function check(result, label) {
  if (result.status !== 0) throw new Error(`${label} failed:\n${result.stderr || result.stdout}`);
}

function psql(sql, label) {
  const result = docker([
    "exec", "-i", container, "psql", "-X", "-q", "-A", "-t",
    "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database,
  ], sql);
  check(result, label);
  return result.stdout.trim();
}

try {
  check(docker(["exec", container, "createdb", "-U", "postgres", database]), "create isolated database");
  const baseline = readFileSync("supabase/tests/billing_isolated_baseline.sql", "utf8")
    .replace(/^create role anon nologin;\r?\n/m, "")
    .replace(/^create role authenticated nologin;\r?\n/m, "")
    .replace(/^create role service_role nologin bypassrls;\r?\n/m, "");
  psql(baseline, "billing baseline");
  psql(`
    create table tongs.orgs(
      id uuid primary key,name text not null,created_by uuid references auth.users(id),
      personal_owner_user_id uuid references auth.users(id),created_at timestamptz default now(),updated_at timestamptz default now());
    create table tongs.org_members(
      org_id uuid references tongs.orgs(id),user_id uuid references auth.users(id),
      org_role text not null check(org_role in ('owner','admin','member')),created_at timestamptz default now(),
      created_by uuid references auth.users(id),primary key(org_id,user_id));
    alter table tongs.workspaces add column org_id uuid references tongs.orgs(id);
    alter table tongs.workspaces add column created_by uuid references auth.users(id);
    create table tongs.workspace_members(
      workspace_id uuid references tongs.workspaces(id),user_id uuid references auth.users(id),
      role text not null default 'member',primary key(workspace_id,user_id));
    create table tongs.workpiece_jobs(id uuid primary key,job_type text not null,status text not null);
    create table tongs.episodes(
      id uuid primary key,workspace_id uuid not null references tongs.workspaces(id),unique(id,workspace_id));
    create table tongs.billing_customers(
      user_id uuid primary key references auth.users(id),stripe_customer_id text unique not null,
      email text,customer_name text,metadata_json jsonb not null default '{}',created_at timestamptz default now(),updated_at timestamptz default now());
    create table tongs.billing_events(
      stripe_event_id text primary key,event_type text not null,user_id uuid,stripe_customer_id text,
      stripe_subscription_id text,stripe_session_id text,livemode boolean,payload_json jsonb not null default '{}',processed_at timestamptz default now(),created_at timestamptz default now());
    create table tongs.hearth_research_synthesis_results(
      id uuid primary key default gen_random_uuid(),operation_id text not null unique,reservation_id uuid not null unique,
      user_id uuid not null references auth.users(id),workspace_id uuid not null references tongs.workspaces(id),
      workpiece_id uuid not null references tongs.episodes(id),request_fingerprint text not null,provider_request_id text,
      input_units bigint not null,output_units bigint not null,result_json jsonb not null,created_at timestamptz not null default now());
    create or replace function tongs.read_owner_purchase_activity(p_stripe_mode text default 'test',p_limit integer default 100)
      returns jsonb language sql stable as $$ select jsonb_build_object('contract_version','forge.owner-purchase-activity.v1','stripe_mode',p_stripe_mode,'purchases','[]'::jsonb) $$;
  `, "compatibility baseline");
  psql('create extension if not exists "uuid-ossp" with schema extensions;', "uuid compatibility");
  psql(`
    insert into auth.users(id,role,email,created_at,updated_at)
    values ('aa000000-0000-4000-8000-000000000099','authenticated','operator@isolated.invalid',now(),now());
    insert into tongs.platform_operators(user_id,reason,granted_by)
    values ('aa000000-0000-4000-8000-000000000099','isolated migration verifier',null);
  `, "operator fixture");

  let historicalRepairBefore = null;
  for (const migration of migrations) {
    if (migration === "20261011150000_tongs_historical_backfill_link_repair.sql") {
      psql(historicalBackfillFixture, "historical backfill fixture");
      historicalRepairBefore = JSON.parse(psql(historicalRepairProofSql, "historical backfill pre-proof"));
    }
    if (migration === "20261011160000_tongs_forge_credit_economy.sql") {
      psql(`
        insert into tongs.private_pricing_policies(
          id,policy_code,scope_kind,provider,sku,created_by
        ) values (
          '709b5ec9-c486-4693-a209-9cf29f586f8e',
          'owner-openai-hearth-chat-luna-bounded-pilot','sku','openai','gpt-5.6-luna',
          'aa000000-0000-4000-8000-000000000099'
        );
        insert into tongs.private_pricing_revisions(
          id,policy_id,revision,previous_revision_id,lifecycle_state,currency,
          markup_basis_points,full_cost_ceiling_micros,failure_cost_ceiling_micros,
          customer_price_ceiling_micros,billable_failure_ceiling_micros,
          customer_credit_units,billable_failure_classes,free_failure_classes,
          included_quantity,retention_policy,change_reason,content_hash,actor_id
        ) values (
          '109b5ec9-c486-4693-a209-9cf29f586f8e',
          '709b5ec9-c486-4693-a209-9cf29f586f8e',1,null,'review_ready','USD',3300,
          11015,0,20000,0,2,'[]','["provider_failure","forge_failure","unknown_fault"]',
          '{"input_tokens":2000,"output_tokens":512,"attempts":1,"concurrency":1}',
          '{"kind":"none"}','isolated exact bounded Luna pricing fixture',repeat('1',64),
          'aa000000-0000-4000-8000-000000000099'
        );
        insert into tongs.private_pricing_cost_components(
          pricing_revision_id,ordinal,component_code,component_kind,credential_funding,
          provider_label,success_ceiling_micros,failure_ceiling_micros,
          cost_policy_revision,tail_policy,tail_policy_details
        ) values
          ('109b5ec9-c486-4693-a209-9cf29f586f8e',1,'openai_text','direct_provider','forge',
           'OpenAI',1015,0,'openai-text:hearth-chat:luna-bounded-pilot-v1','none','{}'),
          ('109b5ec9-c486-4693-a209-9cf29f586f8e',2,'bounded_support','compute','forge',
           'Forge validation and persistence',10000,0,
           'openai-text:hearth-chat:luna-bounded-pilot-v1','none','{}');
        insert into tongs.private_markup_rule_revisions(
          id,revision,previous_revision_id,default_markup_basis_points,overrides_json,
          change_reason,content_hash,actor_id
        ) values (
          '719b5ec9-c486-4693-a209-9cf29f586f8e',1,null,3300,'[]',
          'isolated markup fixture',repeat('2',64),
          'aa000000-0000-4000-8000-000000000099'
        );
        insert into tongs.private_pricing_revision_markup_sources(
          pricing_revision_id,markup_rule_revision_id,effective_markup_basis_points
        ) values (
          '109b5ec9-c486-4693-a209-9cf29f586f8e',
          '719b5ec9-c486-4693-a209-9cf29f586f8e',3300
        );
      `, "bounded Luna pricing fixture");
    }
    if (migration === "20261011170000_tongs_standard_customer_luna_catalog.sql") {
      psql(`
        set session_replication_role=replica;
        update tongs.private_pricing_cost_components
          set pricing_revision_id='309b5ec9-c486-4693-a209-9cf29f586f8e'
          where pricing_revision_id=(select id from tongs.private_pricing_revisions
            where policy_id='709b5ec9-c486-4693-a209-9cf29f586f8e' and revision=2);
        update tongs.private_pricing_revision_markup_sources
          set pricing_revision_id='309b5ec9-c486-4693-a209-9cf29f586f8e'
          where pricing_revision_id=(select id from tongs.private_pricing_revisions
            where policy_id='709b5ec9-c486-4693-a209-9cf29f586f8e' and revision=2);
        update tongs.private_pricing_publications
          set pricing_revision_id='309b5ec9-c486-4693-a209-9cf29f586f8e'
          where policy_id='709b5ec9-c486-4693-a209-9cf29f586f8e' and publication_revision=2;
        update tongs.financial_environment_configuration_revisions
          set pricing_revision_id='309b5ec9-c486-4693-a209-9cf29f586f8e'
          where pricing_revision_id=(select id from tongs.private_pricing_revisions
            where policy_id='709b5ec9-c486-4693-a209-9cf29f586f8e' and revision=2);
        update tongs.private_pricing_revisions
          set id='309b5ec9-c486-4693-a209-9cf29f586f8e'
          where policy_id='709b5ec9-c486-4693-a209-9cf29f586f8e' and revision=2;
        set session_replication_role=origin;
        insert into tongs.openai_text_model_catalog_revisions(
          id,revision,lifecycle_state,quality_method,source_checked_at,content_hash,actor_id
        ) values (
          '89000000-0000-4000-8000-000000000003',3,'active',
          'isolated generation-compatible Luna source catalog','2026-09-15T00:00:00Z',
          repeat('3',64),'aa000000-0000-4000-8000-000000000099'
        );
        insert into tongs.openai_text_model_catalog_entries(
          id,catalog_revision_id,runtime_model_id,provider_model_id,display_name,
          tradeoff_summary,quality_rank,quality_basis,supported_apis,
          availability_status,availability_evidence,lifecycle_state,rate_revision_id
        ) values (
          '89000000-0000-4000-8000-000000000103',
          '89000000-0000-4000-8000-000000000003','gpt-5.6-luna','gpt-5.6-luna',
          'GPT-5.6 Luna','Fast, bounded standard-customer model.',60,
          'Isolated migration-chain fixture','["responses"]','generation_compatible',
          '{"generation_verified":true}','active','56560000-0000-4000-8000-000000000001'
        );
        insert into tongs.openai_text_model_route_compatibility(
          id,catalog_entry_id,route_code,compatibility_status,maximum_input_tokens,
          maximum_output_tokens,maximum_attempts,supporting_cost_coverage,
          cost_policy_revision_id,evidence_json
        ) values (
          '89000000-0000-4000-8000-000000000203',
          '89000000-0000-4000-8000-000000000103','hearth.chat_completion',
          'generation_verified',2000,512,1,'complete',
          '10000000-0000-4000-8000-000000000010','{"isolated_fixture":true}'
        );
      `, "connected bounded Luna pricing identity fixture");
    }
    psql(readFileSync(`supabase/migrations/${migration}`, "utf8"), migration);
  }

  const historicalRepairAfter = JSON.parse(psql(historicalRepairProofSql, "historical backfill post-proof"));
  psql(
    readFileSync("supabase/migrations/20261011150000_tongs_historical_backfill_link_repair.sql", "utf8"),
    "historical backfill idempotent replay",
  );
  const historicalRepairReplay = JSON.parse(psql(historicalRepairProofSql, "historical backfill replay proof"));
  for (const field of ["canonical_count","canonical_units","canonical_hash","simulator_count","simulator_units","simulator_hash","journal_count","journal_hash"]) {
    if (historicalRepairBefore[field] !== historicalRepairAfter[field]
      || historicalRepairAfter[field] !== historicalRepairReplay[field]) {
      throw new Error(`Historical economic state changed at ${field}: ${JSON.stringify({ historicalRepairBefore, historicalRepairAfter, historicalRepairReplay })}`);
    }
  }
  if (historicalRepairAfter.backfill_count !== 8
    || historicalRepairAfter.conversion_count !== 8
    || historicalRepairAfter.distinct_backfill_sources !== 8
    || historicalRepairAfter.distinct_backfill_canonical !== 8
    || historicalRepairAfter.evidence_hash_count !== 8
    || JSON.stringify(historicalRepairAfter) !== JSON.stringify(historicalRepairReplay)) {
    throw new Error(`Historical provenance repair proof failed: ${JSON.stringify({ historicalRepairBefore, historicalRepairAfter, historicalRepairReplay })}`);
  }

  psql(`
    insert into tongs.workspaces(id,name,created_by)
    values ('aa000000-0000-4000-8000-000000000010','Isolated rollout workspace',
      'aa000000-0000-4000-8000-000000000099');
    insert into tongs.workspace_members(workspace_id,user_id,role)
    values ('aa000000-0000-4000-8000-000000000010',
      'aa000000-0000-4000-8000-000000000099','owner');
    set request.jwt.claim.role='service_role';
    select tongs.create_normal_customer_paid_execution_authorization(
      'aa000000-0000-4000-8000-000000000030',
      'aa000000-0000-4000-8000-000000000099',
      'aa000000-0000-4000-8000-000000000099',
      'aa000000-0000-4000-8000-000000000010','test',
      'isolated normal customer authorization proof'
    );
    select tongs.provision_beta_test_credits(
      'aa000000-0000-4000-8000-000000000040',
      'aa000000-0000-4000-8000-000000000099',
      'aa000000-0000-4000-8000-000000000099',
      'aa000000-0000-4000-8000-000000000010',9,
      'isolated-beta-credit-grant','isolated beta grant proof','{}'
    );
    select tongs.provision_beta_test_credits(
      'aa000000-0000-4000-8000-000000000040',
      'aa000000-0000-4000-8000-000000000099',
      'aa000000-0000-4000-8000-000000000099',
      'aa000000-0000-4000-8000-000000000010',9,
      'isolated-beta-credit-grant','isolated beta grant proof','{}'
    );
  `, "normal rollout and beta credit fixtures");

  const researchQuote = JSON.parse(psql(`
    set request.jwt.claim.role='service_role';
    select tongs.create_customer_openai_text_quote(
      'aa000000-0000-4000-8000-000000000050',
      'aa000000-0000-4000-8000-000000000099',
      'isolated-standard-customer-hearth-research',
      'hearth.research_synthesis',
      'aa000000-0000-4000-8000-000000000010',
      'aa000000-0000-4000-8000-000000000020',repeat('a',64),
      'gpt-5.6-luna','forge',now()+interval '10 minutes'
    );
  `, "standard customer Hearth research quote"));
  if (researchQuote.customer_credit_units !== 21
    || researchQuote.maximum_customer_charge_micros !== 105000
    || researchQuote.failure_customer_charge_micros !== 0
    || researchQuote.funding_eligible !== false) {
    throw new Error(`Unexpected Hearth research quote: ${JSON.stringify(researchQuote)}`);
  }

  const proof = JSON.parse(psql(`
    set request.jwt.claim.role='service_role';
    select jsonb_build_object(
      'current_environment', tongs._current_financial_environment(),
      'configuration_count', (select count(*) from tongs.financial_environment_configuration_revisions),
      'baseline_count', (select count(*) from tongs.financial_parity_baseline_captures),
      'live_identifier_slots', (select jsonb_array_length(required_stripe_identifier_slots) from tongs.financial_environment_configuration_revisions where environment='live' order by revision desc limit 1),
      'test_configuration', (select lifecycle_state from tongs.financial_environment_configuration_revisions where environment='test' order by revision desc limit 1),
      'live_configuration', (select lifecycle_state from tongs.financial_environment_configuration_revisions where environment='live' order by revision desc limit 1),
      'legacy_case_count', (select count(*) from tongs.legacy_credit_reconciliation_cases),
      'simulator_execute_grants', (select count(*) from information_schema.routine_privileges where specific_schema='tongs' and grantee='service_role' and privilege_type='EXECUTE' and routine_name not like 'read_%' and (routine_name like '%hearth_chat_test%' or routine_name like '%openai_text_test_certification%')),
      'funding_contract', (select prosrc like '%forge.customer-funding.v4%' from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='tongs' and p.proname='read_my_customer_funding'),
      'internal_quote_credit_units', (select prosrc like '%customer_credit_units%v_quote.customer_credit_units%' from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='tongs' and p.proname='create_customer_openai_text_quote'),
      'normal_rollout', (select count(*) from tongs.financial_environment_configuration_revisions where environment='test' and lifecycle_state='customer_rollout_active' and maximum_operation_count is null and rolling_window_seconds is null),
      'normal_authorization', (select count(*) from tongs.customer_paid_execution_scope_authorizations where id='aa000000-0000-4000-8000-000000000030' and authorization_kind='normal_customer' and financial_environment='test' and maximum_operation_count is null and rolling_window_seconds is null and valid_until is null),
      'research_authorization', (select count(*) from tongs.customer_paid_execution_scope_authorizations where user_id='aa000000-0000-4000-8000-000000000099' and workspace_id='aa000000-0000-4000-8000-000000000010' and authorization_kind='normal_customer' and financial_environment='test' and route_code='hearth.research_synthesis' and maximum_customer_charge_micros=105000 and maximum_wholesale_exposure_micros=76717),
      'live_research_authorization', (select count(*) from tongs.customer_paid_execution_scope_authorizations where financial_environment='live' and route_code='hearth.research_synthesis' and status='active'),
      'research_rollout', (select count(*) from tongs.openai_text_rollout_revisions where route_code='hearth.research_synthesis' and revision=3 and mode='enforce' and funding_scope='forge' and cost_policy_revision_id='12000000-0000-4000-8000-000000000001'),
      'research_cost_policy', (select count(*) from tongs.openai_text_cost_policy_revisions where id='12000000-0000-4000-8000-000000000001' and direct_provider_ceiling_micros=45261 and supporting_cost_ceiling_micros=31456 and full_cost_ceiling_micros=76717 and cost_coverage='complete'),
      'overhead_evidence', (select count(*) from tongs.openai_text_supporting_cost_inventory where cost_policy_revision_id='12000000-0000-4000-8000-000000000001' and disposition in ('platform_overhead','workspace_entitlement')),
      'beta_grant_count', (select count(*) from tongs.beta_credit_grants where id='aa000000-0000-4000-8000-000000000040' and credit_units=9 and financial_environment='test'),
      'beta_grant_journal_balanced', (select coalesce(sum(amount_micros),0)=0 from tongs.accounting_journal_entries where event_id='aa000000-0000-4000-8000-000000000040'),
      'beta_purchase_enabled', (select (tongs.read_credit_pack_purchase_availability()->>'purchase_enabled')::boolean)
    );
  `, "parity proof"));
  if (proof.current_environment !== "test"
    || proof.configuration_count !== 7
    || proof.baseline_count !== 1
    || proof.live_identifier_slots !== 3
    || proof.test_configuration !== "customer_rollout_active"
    || proof.live_configuration !== "inactive_ready"
    || proof.simulator_execute_grants !== 0
    || proof.funding_contract !== true
    || proof.internal_quote_credit_units !== true
    || proof.normal_rollout !== 1
    || proof.normal_authorization !== 1
    || proof.research_authorization !== 1
    || proof.live_research_authorization !== 0
    || proof.research_rollout !== 1
    || proof.research_cost_policy !== 1
    || proof.overhead_evidence !== 3
    || proof.beta_grant_count !== 1
    || proof.beta_grant_journal_balanced !== true
    || proof.beta_purchase_enabled !== false) {
    throw new Error(`Unexpected parity proof: ${JSON.stringify(proof)}`);
  }

  console.log(JSON.stringify({
    isolated_database: true,
    shared_financial_path: "passed",
    test_runtime_selected: "passed",
    live_configuration_present_inactive: "passed",
    simulator_authority_revoked: "passed",
    customer_funding_v4: "passed",
    normal_customer_rollout: "credit_bounded_without_certification_quota",
    beta_credit_controls: "passed",
    historical_backfill_links: "8_of_8_exact_and_idempotent",
    historical_economic_state: "unchanged",
    hearth_research_price_publication: "21_credits_variable_cost_only",
  }));
} finally {
  docker(["exec", container, "dropdb", "-U", "postgres", "--if-exists", database]);
}
