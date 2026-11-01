-- Disposable baseline-v1 fixture for the current-authority reservation race.
-- Provider, pricing, catalog, compatibility, rollout, and paid-scope values are
-- copied from the reviewed Visual Plan/Luna authority listed in the harness.
-- This file is test-only data and must never be installed as a migration.

begin;

do $guard$
declare
  v_lineage text;
  v_lineage_count bigint;
  v_migration_count bigint;
  v_migration_head text;
begin
  select count(*), min(lineage) into v_lineage_count, v_lineage
  from forge_meta.database_lineage;
  select count(*), max(version) into v_migration_count, v_migration_head
  from supabase_migrations.schema_migrations;
  if v_lineage_count is distinct from 1 or v_lineage is distinct from 'baseline-v1'
     or v_migration_count is distinct from 17
     or v_migration_head is distinct from '20261101201817' then
    raise exception 'current-authority race fixture requires certified baseline-v1 head 20261101201817';
  end if;

  if exists(select 1 from tongs.openai_text_provider_rate_revisions)
     or exists(select 1 from tongs.openai_text_cost_policy_revisions)
     or exists(select 1 from tongs.private_pricing_policies)
     or exists(select 1 from tongs.openai_text_model_catalog_revisions)
     or exists(select 1 from tongs.openai_text_rollout_revisions)
     or exists(select 1 from tongs.customer_paid_execution_scope_authorizations)
     or exists(select 1 from tongs.paid_execution_control_revisions)
     or exists(select 1 from tongs.financial_runtime_environment_revisions)
     or exists(select 1 from tongs.customer_deposits)
     or exists(select 1 from tongs.funding_reservations)
     or exists(select 1 from tongs.openai_text_provider_captures)
     or exists(select 1 from tongs.hammer_transcription_provider_attempts)
     or exists(select 1 from tongs.paid_media_provider_attempts)
     or exists(select 1 from tongs.owner_cost_provider_attempts) then
    raise exception 'current-authority race fixture requires an inactive empty B1 financial state';
  end if;
end
$guard$;

insert into auth.users(
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at
) values
  ('ca100000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','current-authority-customer@example.test','',now(),now(),now()),
  ('ca100000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','current-authority-operator@example.test','',now(),now(),now());

insert into tongs.platform_operators(user_id,reason,granted_by)
values(
  'ca100000-0000-4000-8000-000000000002',
  'Disposable current-authority reservation-concurrency certification.',
  'ca100000-0000-4000-8000-000000000002'
);

insert into tongs.workspaces(id,name,created_by,org_id)
select
  'ca100000-0000-4000-8000-000000000003',
  'Current authority concurrency proof',
  'ca100000-0000-4000-8000-000000000001',
  id
from tongs.orgs
where personal_owner_user_id='ca100000-0000-4000-8000-000000000001';

insert into tongs.workspace_members(workspace_id,user_id,role)
values(
  'ca100000-0000-4000-8000-000000000003',
  'ca100000-0000-4000-8000-000000000001',
  'owner'
) on conflict(workspace_id,user_id) do nothing;

-- Reviewed Forge Credit denomination. The customer balance below is fixture
-- data, not a pack term, offer, publication, or commercial activation.
insert into tongs.forge_credit_contract_revisions(
  contract_code,revision,lifecycle_state,credit_value_micros,currency,
  markup_basis_points,tax_treatment,reason
) values(
  'forge.credit-economy.v1',1,'active',5000,'USD',3300,
  'pre_tax_customer_value',
  'One Forge Credit is exactly $0.005 of pre-tax customer value; supplier cost is private.'
);

insert into tongs.financial_runtime_environment_revisions(
  revision,financial_environment,reason,actor_id
) values(
  1,'test','Development and beta use Stripe Test through the canonical financial path.',null
);

-- Exact original shadow control. Provider execution and settlement stay off.
insert into tongs.paid_execution_control_revisions(
  revision,pricing_activation_enabled,reservation_shadow_enabled,
  customer_settlement_enabled,owner_budget_spending_enabled,
  provider_execution_enabled,reason
) values(
  1,false,true,false,false,false,
  'Private pricing and reservations installed in shadow mode; activation requires a later approved migration.'
);

insert into tongs.openai_text_provider_rate_revisions(
  id,provider,runtime_model_alias,provider_model_id,revision,
  input_micros_per_million_tokens,cached_input_micros_per_million_tokens,
  output_micros_per_million_tokens,maximum_context_tokens,maximum_output_tokens,
  source_url,source_checked_at,content_hash
) values(
  '56560000-0000-4000-8000-000000000001','openai','gpt-5.6-luna','gpt-5.6-luna',1,
  200000,20000,1200000,1050000,128000,
  'https://developers.openai.com/api/docs/models/gpt-5.6-luna',
  '2026-09-08T13:48:17.2211144Z',
  encode(extensions.digest(convert_to(
    'openai:gpt-5.6-luna:1:200000:20000:1200000:1050000:128000','utf8'
  ),'sha256'),'hex')
);

insert into tongs.openai_text_route_policies(
  route_code,product_area,provider_operation,maximum_input_units,maximum_output_units,
  maximum_attempts,requires_result_validation,requires_canonical_persistence,
  byo_supported,rollout_mode,notes
) values(
  'visual.unified_plan','visual_motion','responses',64000,16000,1,true,true,true,
  'inactive','Unified visual-plan schema validation and canonical plan persistence required.'
);

insert into tongs.openai_text_cost_policy_revisions(
  id,route_code,revision,policy_code,attempt_plan,maximum_input_units,
  maximum_output_units,maximum_attempts,direct_provider_ceiling_micros,
  supporting_cost_ceiling_micros,full_cost_ceiling_micros,cost_coverage,
  lifecycle_state,notes
) values(
  '17000000-0000-4000-8000-000000000001','visual.unified_plan',3,
  'openai-text:visual-unified-plan:test-luna-v3',
  '[{"attempt":1,"rate_revision_id":"56560000-0000-4000-8000-000000000001","runtime_model":"gpt-5.6-luna","provider_model_id":"gpt-5.6-luna","input_max":32000,"output_max":6144}]',
  32000,6144,1,13773,0,13773,'complete','active',
  'Ceil(32000*0.20 + 6144*1.20)=13773 micros direct maximum. Existing validation, four-child persistence, readback, Supabase, and Netlify are platform overhead with no verified attributable variable allocation.'
);

insert into tongs.private_pricing_policies(
  id,policy_code,scope_kind,provider,sku,created_by
) values(
  '17000000-0000-4000-8000-000000000002',
  'forge-visual-unified-plan-test-luna-v1','sku','openai',
  'openai-text:visual.unified_plan:gpt-5.6-luna:17000000-0000-4000-8000-000000000001',
  'ca100000-0000-4000-8000-000000000002'
);

insert into tongs.private_pricing_revisions(
  id,policy_id,revision,previous_revision_id,lifecycle_state,currency,
  markup_basis_points,full_cost_ceiling_micros,failure_cost_ceiling_micros,
  customer_price_ceiling_micros,billable_failure_ceiling_micros,
  customer_credit_units,billable_failure_classes,free_failure_classes,
  included_quantity,retention_policy,change_reason,content_hash,actor_id,
  unrounded_customer_price_micros,rounding_adjustment_micros,
  settled_customer_price_micros
) values(
  '17000000-0000-4000-8000-000000000003',
  '17000000-0000-4000-8000-000000000002',1,null,'review_ready','USD',3300,
  13773,0,20000,0,4,'[]',
  '["provider_failure","forge_failure","validation_failure","persistence_failure"]',
  '{"input_tokens":32000,"output_tokens":6144,"provider_attempts":1,"browsing_requests":0,"retrieval_requests":0,"tools":0,"attachments":0}',
  '{"unified_visual_plan_operation":"platform_overhead","four_child_canonical_commit":"platform_overhead","validation_evidence":"platform_overhead"}',
  'Approved four-credit Test unified Visual Plan product, direct supplier cost only.',
  encode(extensions.digest(convert_to(
    'forge-visual-unified-plan-test-luna-v1:13773:18319:1681:20000:4','utf8'
  ),'sha256'),'hex'),
  'ca100000-0000-4000-8000-000000000002',18319,1681,20000
);

insert into tongs.private_pricing_cost_components(
  pricing_revision_id,ordinal,component_code,component_kind,credential_funding,
  provider_label,success_ceiling_micros,failure_ceiling_micros,
  cost_policy_revision,tail_policy,tail_policy_details
) values
  ('17000000-0000-4000-8000-000000000003',1,'openai_unified_visual_plan',
   'direct_provider','forge','OpenAI',13773,0,
   'Luna rate 2026-09-20','none','{"input_ceiling_micros":6400,"output_ceiling_micros":7373}'),
  ('17000000-0000-4000-8000-000000000003',2,'verified_variable_supporting_cost',
   'compute','forge','Forge',0,0,'Direct-only approved basis 2026-09-23','none',
   '{"verified_attributable_variable_micros":0}'),
  ('17000000-0000-4000-8000-000000000003',3,'fixed_platform_and_evidence_retention',
   'retention_tail','forge','Forge platform',0,0,'Supporting-cost policy 2026-09-23',
   'plan_funded','{"classification":"platform_overhead","operation_allocation_micros":0}');

insert into tongs.private_pricing_publications(
  id,policy_id,pricing_revision_id,publication_revision,action,reason,actor_id
) values(
  '17000000-0000-4000-8000-000000000004',
  '17000000-0000-4000-8000-000000000002',
  '17000000-0000-4000-8000-000000000003',1,'published',
  'Publish only for the bounded Test customer scope; no Live customer authority.',
  'ca100000-0000-4000-8000-000000000002'
);

insert into tongs.openai_text_model_catalog_revisions(
  id,revision,lifecycle_state,quality_method,source_checked_at,content_hash,actor_id
) values(
  '40010000-0000-4000-8000-000000000500',17,'active',
  'Revision 16 retained. Hammer choices are customer-selected and explicitly not quality-ranked.',
  '2026-10-03T20:00:00Z',
  encode(extensions.digest(convert_to(
    'openai-model-catalog:17:hammer-global-preference','utf8'
  ),'sha256'),'hex'),
  'ca100000-0000-4000-8000-000000000002'
);

insert into tongs.openai_text_model_catalog_entries(
  id,catalog_revision_id,runtime_model_id,provider_model_id,display_name,
  tradeoff_summary,quality_rank,quality_basis,supported_apis,
  availability_status,availability_evidence,lifecycle_state,rate_revision_id,
  customer_selection_state
) values(
  'bc743a0f-58d7-51c5-8de1-075ed253ac9d',
  '40010000-0000-4000-8000-000000000500','gpt-5.6-luna','gpt-5.6-luna',
  'GPT-5.6 Luna','Fastest and lowest-cost candidate.',60,
  'Official OpenAI positioning: fast, cost-sensitive model for high-volume work.',
  '["responses","chat_completions","structured_outputs"]','generation_compatible',
  '{"model_visibility_checked_at":"2026-09-09","generation_compatibility":"bounded_hearth_pilot","authoritative_cost_reconciliation":"pending","visual_unified_plan_test_cost_policy_revision_id":"17000000-0000-4000-8000-000000000001","visual_unified_plan_test_pricing_revision_id":"17000000-0000-4000-8000-000000000003"}',
  'active','56560000-0000-4000-8000-000000000001','selectable'
);

insert into tongs.openai_text_model_route_compatibility(
  id,catalog_entry_id,route_code,compatibility_status,maximum_input_tokens,
  maximum_output_tokens,maximum_attempts,supporting_cost_coverage,
  cost_policy_revision_id,evidence_json
) values(
  extensions.uuid_generate_v5('bc743a0f-58d7-51c5-8de1-075ed253ac9d','visual.unified_plan'),
  'bc743a0f-58d7-51c5-8de1-075ed253ac9d','visual.unified_plan',
  'generation_verified',32000,6144,1,'complete',
  '17000000-0000-4000-8000-000000000001',
  '{"test_only":true,"responses_json_schema":true,"browsing_requests":0,"retrieval_requests":0,"tools":0,"attachments":0,"provider_contract_version":"forge.unified-visual-plan-provider.v5","canonical_four_child_commit_required":true,"pricing_revision_id":"17000000-0000-4000-8000-000000000003"}'
);

insert into tongs.ai_model_identities(
  id,model_code,provider_code,provider_model_id,customer_selection_key
) values(
  '40010000-0000-4000-8000-000000000004','openai:gpt-5.6-luna',
  'openai','gpt-5.6-luna','40010000-0000-4000-9000-000000000004'
);

insert into tongs.ai_model_identity_revisions(
  id,model_identity_id,revision,display_name,relative_cost_class,lifecycle_state,evidence_json
) values(
  '40010000-0000-4000-8000-000000000104',
  '40010000-0000-4000-8000-000000000004',1,'GPT-5.6 Luna','lower_cost','active',
  '{"authority":"operation_only","classification_basis":"retained provider rates are lower component-by-component than all globally selectable models","customer_ranking":false}'
);

insert into tongs.ai_global_model_choice_revisions(
  id,model_identity_id,revision,authority_state,reason,evidence_json
) values(
  '40010000-0000-4000-8000-000000000704',
  '40010000-0000-4000-8000-000000000004',1,'operation_only',
  'Expose Luna only through exact operation eligibility and explicit operation overrides.',
  '{"source":"approved_hearth_luna_reconciliation","global_preference":false}'
);

insert into tongs.openai_text_catalog_ai_model_bindings(catalog_entry_id,model_identity_id)
values(
  'bc743a0f-58d7-51c5-8de1-075ed253ac9d',
  '40010000-0000-4000-8000-000000000004'
);

insert into tongs.openai_text_rollout_revisions(
  route_code,revision,mode,cost_policy_revision_id,reason,actor_id,funding_scope
) values(
  'visual.unified_plan',3,'enforce','17000000-0000-4000-8000-000000000001',
  'Supersede the historical inactive/halt authority only for authorized Forge-funded Test customers; Live remains inactive.',
  'ca100000-0000-4000-8000-000000000002','forge'
);

insert into tongs.customer_paid_execution_scope_authorizations(
  id,user_id,workspace_id,financial_environment,route_code,provider,model_or_sku,
  pricing_revision_id,cost_policy_revision_id,maximum_operation_count,
  maximum_customer_charge_micros,maximum_wholesale_exposure_micros,
  maximum_concurrency,rolling_window_seconds,valid_from,valid_until,status,
  reason,created_by,authorization_kind
) values(
  'ca100000-0000-4000-8000-000000000010',
  'ca100000-0000-4000-8000-000000000001',
  'ca100000-0000-4000-8000-000000000003','test','visual.unified_plan','openai',
  'gpt-5.6-luna','17000000-0000-4000-8000-000000000003',
  '17000000-0000-4000-8000-000000000001',null,20000,13773,1,null,
  now()-interval '1 hour',null,'active',
  'Approved four-credit bounded Test unified Visual Plan canary.',
  'ca100000-0000-4000-8000-000000000002','normal_customer'
);

-- A disposable 20,000-micro/4-credit customer balance: exact value of one
-- reviewed Visual Plan quote. No pack, offer, or external payment is created.
select tongs._create_accounting_event(
  'ca100000-0000-4000-8000-000000000020',
  'current-authority-race-deposit','customer_deposit_received','test',
  'test_fixture','current-authority-race','USD',
  'ca100000-0000-4000-8000-000000000001',null,null,
  '{"fixture":"current-authority-reservation-concurrency"}',now()
);

set local session_replication_role=replica;
insert into tongs.customer_deposits(
  id,user_id,stripe_mode,stripe_event_id,stripe_session_id,stripe_payment_intent_id,
  pack_id,currency,gross_amount_micros,credit_units,journal_event_id,metadata_json,received_at
) values(
  'ca100000-0000-4000-8000-000000000020',
  'ca100000-0000-4000-8000-000000000001','test',
  'evt_current_authority_race','cs_current_authority_race','pi_current_authority_race',
  'test_fixture_exact_quote','USD',20000,4,
  'ca100000-0000-4000-8000-000000000020',
  '{"fixture":"current-authority-reservation-concurrency","external_payment":false}',now()
);
set local session_replication_role=origin;

insert into tongs.accounting_journal_entries(
  event_id,line_number,account_code,user_id,deposit_id,currency,amount_micros
) values
  ('ca100000-0000-4000-8000-000000000020',1,'test_cash_clearing',
   'ca100000-0000-4000-8000-000000000001','ca100000-0000-4000-8000-000000000020','USD',20000),
  ('ca100000-0000-4000-8000-000000000020',2,'test_customer_deposit_balance',
   'ca100000-0000-4000-8000-000000000001','ca100000-0000-4000-8000-000000000020','USD',-20000);
insert into tongs.accounting_journal_entries(
  event_id,line_number,account_code,user_id,deposit_id,unit_kind,quantity_delta
) values(
  'ca100000-0000-4000-8000-000000000020',3,'test_customer_credits',
  'ca100000-0000-4000-8000-000000000001','ca100000-0000-4000-8000-000000000020',
  'forge_credit',4
);
select tongs._assert_accounting_event_balanced('ca100000-0000-4000-8000-000000000020');

select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub','',true);
set local role service_role;
select tongs.record_customer_deposit_processor_fee(
  'ca100000-0000-4000-8000-000000000021',
  'ca100000-0000-4000-8000-000000000020',
  'txn_current_authority_race',0,now(),
  '{"fixture":"current-authority-reservation-concurrency","external_payment":false}'
);

select tongs.create_customer_openai_text_quote(
  'ca100000-0000-4000-8000-000000000030',
  'ca100000-0000-4000-8000-000000000001',
  'current-authority-race-operation-a','visual.unified_plan',
  'ca100000-0000-4000-8000-000000000003','visual-plan-a',repeat('a',64),
  'gpt-5.6-luna','forge',now()+interval '1 hour'
);
select tongs.create_customer_openai_text_quote(
  'ca100000-0000-4000-8000-000000000031',
  'ca100000-0000-4000-8000-000000000001',
  'current-authority-race-operation-b','visual.unified_plan',
  'ca100000-0000-4000-8000-000000000003','visual-plan-b',repeat('b',64),
  'gpt-5.6-luna','forge',now()+interval '1 hour'
);

reset role;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ca100000-0000-4000-8000-000000000001',true);
set local role authenticated;
select tongs.accept_quote(
  'ca100000-0000-4000-8000-000000000030',
  'ca100000-0000-4000-8000-000000000032','current-authority-accept-a',
  tongs.read_my_spending_quote('ca100000-0000-4000-8000-000000000030')->>'quote_hash'
);
select tongs.accept_quote(
  'ca100000-0000-4000-8000-000000000031',
  'ca100000-0000-4000-8000-000000000033','current-authority-accept-b',
  tongs.read_my_spending_quote('ca100000-0000-4000-8000-000000000031')->>'quote_hash'
);
reset role;

do $proof$
begin
  if (select count(*) from tongs._eligible_ai_models_for_operation('visual.unified_plan')
      where model_identity_id='40010000-0000-4000-8000-000000000004'
        and runtime_model_id='gpt-5.6-luna'
        and catalog_revision=17
        and model_catalog_entry_id='bc743a0f-58d7-51c5-8de1-075ed253ac9d'
        and cost_policy_revision_id='17000000-0000-4000-8000-000000000001'
        and customer_credit_units=4) is distinct from 1 then
    raise exception 'exact reviewed operation/model/pricing authority is not eligible';
  end if;
  if (select count(*) from tongs.openai_text_customer_quote_bindings
      where quote_id in(
        'ca100000-0000-4000-8000-000000000030',
        'ca100000-0000-4000-8000-000000000031'
      ) and model_catalog_revision_id='40010000-0000-4000-8000-000000000500'
        and model_catalog_entry_id='bc743a0f-58d7-51c5-8de1-075ed253ac9d'
        and pricing_revision_id='17000000-0000-4000-8000-000000000003'
        and cost_policy_revision_id='17000000-0000-4000-8000-000000000001'
        and runtime_model='gpt-5.6-luna'
        and credential_funding='forge') is distinct from 2 then
    raise exception 'immutable quote bindings do not pin the reviewed authority';
  end if;
  if (select count(*) from tongs.customer_spending_quotes
      where id in(
        'ca100000-0000-4000-8000-000000000030',
        'ca100000-0000-4000-8000-000000000031'
      ) and financial_environment='test'
        and normal_maximum_charge_micros=20000
        and customer_credit_units=4
        and full_cost_ceiling_micros=13773) is distinct from 2 then
    raise exception 'reviewed quote economics changed';
  end if;
  if exists(select 1 from tongs.forge_credit_pack_terms)
     or exists(select 1 from tongs.customer_subscription_allowance_terms)
     or exists(select 1 from tongs.credential_lifecycle_records)
     or exists(select 1 from tongs.openai_text_provider_captures)
     or exists(select 1 from tongs.hammer_transcription_provider_attempts)
     or exists(select 1 from tongs.paid_media_provider_attempts)
     or exists(select 1 from tongs.owner_cost_provider_attempts) then
    raise exception 'fixture introduced an offer, credential, or provider operation';
  end if;
  if (select provider_execution_enabled from tongs._current_paid_execution_control()) is not false then
    raise exception 'provider execution must remain disabled';
  end if;
end
$proof$;

commit;

select 'FORGE_CURRENT_AUTHORITY_RESERVATION_FIXTURE_READY';
