-- Read-only authority and economics proof for the Test unified Visual Plan product.
begin;

do $$
declare
  evidence_definition text;
begin
  if not exists (
    select 1 from tongs.openai_text_route_policies
    where route_code='visual.unified_plan' and maximum_input_units=64000
      and maximum_output_units=16000 and maximum_attempts=1
      and requires_result_validation and requires_canonical_persistence
  ) then raise exception 'historical Visual Plan route contract changed'; end if;

  if not exists (
    select 1 from tongs.openai_text_cost_policy_revisions
    where id='17000000-0000-4000-8000-000000000001'
      and route_code='visual.unified_plan' and revision=3
      and maximum_input_units=32000 and maximum_output_units=6144
      and maximum_attempts=1 and direct_provider_ceiling_micros=13773
      and supporting_cost_ceiling_micros=0 and full_cost_ceiling_micros=13773
      and cost_coverage='complete' and lifecycle_state='active'
  ) then raise exception 'Visual Plan cost policy proof failed'; end if;

  if not exists (
    select 1 from tongs.private_pricing_revisions
    where id='17000000-0000-4000-8000-000000000003'
      and customer_credit_units=4 and settled_customer_price_micros=20000
      and full_cost_ceiling_micros=13773
      and unrounded_customer_price_micros=18319
      and rounding_adjustment_micros=1681
  ) then raise exception 'Visual Plan pricing proof failed'; end if;

  if not exists (
    select 1 from tongs.private_pricing_cost_components
    where pricing_revision_id='17000000-0000-4000-8000-000000000003'
      and component_code='verified_variable_supporting_cost'
      and success_ceiling_micros=0 and failure_ceiling_micros=0
  ) then raise exception 'Visual Plan zero supporting-cost proof failed'; end if;

  if not exists (
    select 1
    from tongs.openai_text_model_route_compatibility compatibility
    join tongs.openai_text_model_catalog_entries entry
      on entry.id=compatibility.catalog_entry_id
    join tongs.openai_text_model_catalog_revisions catalog
      on catalog.id=entry.catalog_revision_id
    where catalog.id='17000000-0000-4000-8000-000000000005'
      and catalog.revision=10 and catalog.lifecycle_state='active'
      and entry.provider_model_id='gpt-5.6-luna'
      and compatibility.route_code='visual.unified_plan'
      and compatibility.compatibility_status='generation_verified'
      and compatibility.maximum_input_tokens=32000
      and compatibility.maximum_output_tokens=6144
      and compatibility.maximum_attempts=1
      and compatibility.cost_policy_revision_id='17000000-0000-4000-8000-000000000001'
  ) then raise exception 'Visual Plan Luna compatibility proof failed'; end if;

  if not exists (
    select 1 from tongs.openai_text_failure_loss_policy_revisions
    where route_code='visual.unified_plan' and environment='test'
      and per_operation_limit_micros=13773 and aggregate_limit_micros=13773
      and maximum_concurrency=1 and rolling_window_seconds=86400
  ) then raise exception 'Visual Plan Test exposure proof failed'; end if;

  if (select count(*) from tongs.customer_paid_execution_scope_authorizations
      where route_code='visual.unified_plan' and financial_environment='test'
        and authorization_kind='normal_customer' and status='active'
        and model_or_sku='gpt-5.6-luna'
        and maximum_customer_charge_micros=20000
        and maximum_wholesale_exposure_micros=13773
        and maximum_concurrency=1)<>1
  then raise exception 'Visual Plan must have exactly one bounded normal Test scope'; end if;
  if exists(select 1 from tongs.customer_paid_execution_scope_authorizations
      where route_code='visual.unified_plan' and financial_environment='live'
        and status='active')
  then raise exception 'Visual Plan must have no Live scope'; end if;

  if not exists (
    select 1 from tongs.openai_text_rollout_revisions rollout
    where route_code='visual.unified_plan' and mode='enforce'
      and cost_policy_revision_id='17000000-0000-4000-8000-000000000001'
      and revision=(select max(current.revision) from tongs.openai_text_rollout_revisions current
        where current.route_code='visual.unified_plan')
  ) then raise exception 'Visual Plan modern rollout proof failed'; end if;
  if not exists (
    select 1 from tongs.openai_text_rollout_revisions
    where route_code='visual.unified_plan' and revision=1 and mode='inactive'
  ) then raise exception 'Visual Plan historical inactive evidence changed'; end if;
  if not exists (
    select 1 from tongs.openai_text_cost_policy_revisions
    where route_code='visual.unified_plan' and revision=2
      and maximum_input_units=64000 and maximum_output_units=16384
      and lifecycle_state='draft'
  ) then raise exception 'Visual Plan historical 64k/16k policy changed'; end if;

  if not (select relrowsecurity and relforcerowsecurity from pg_class
      where oid='tongs.openai_text_validation_failure_evidence'::regclass)
  then raise exception 'generic validation evidence RLS is not forced'; end if;
  if has_table_privilege('anon','tongs.openai_text_validation_failure_evidence','select')
    or has_table_privilege('authenticated','tongs.openai_text_validation_failure_evidence','select')
    or not has_table_privilege('service_role','tongs.openai_text_validation_failure_evidence','select')
  then raise exception 'generic validation evidence permissions mismatch'; end if;

  select pg_get_functiondef(
    'tongs.record_openai_text_validation_failure_evidence(text,text,uuid,text,text,bigint,bigint,text,text,text)'::regprocedure
  ) into evidence_definition;
  if position('visual.unified_plan' in evidence_definition)=0
    or position('forge.unified-visual-plan-provider.v4' in evidence_definition)=0
    or position('forge.unified-visual-plan-provider.v5' in evidence_definition)=0
    or position('hearth.framing_pack_generation' in evidence_definition)=0
    or position('framing_pack_seven_sections.v1' in evidence_definition)=0
  then raise exception 'generic validation evidence route authority mismatch'; end if;

  if not (select relrowsecurity and relforcerowsecurity from pg_class
      where oid='tongs.unified_visual_plan_reconciliation_events'::regclass)
    or has_table_privilege('anon','tongs.unified_visual_plan_reconciliation_events','select')
    or has_table_privilege('authenticated','tongs.unified_visual_plan_reconciliation_events','select')
    or not has_table_privilege('service_role','tongs.unified_visual_plan_reconciliation_events','select')
  then raise exception 'unified Visual Plan reconciliation evidence permissions mismatch'; end if;
  if has_function_privilege('anon',
      'tongs.reconcile_unified_visual_plan_validation_failure(text,text,uuid,text,text,text,bigint)','execute')
    or has_function_privilege('authenticated',
      'tongs.reconcile_unified_visual_plan_validation_failure(text,text,uuid,text,text,text,bigint)','execute')
    or not has_function_privilege('service_role',
      'tongs.reconcile_unified_visual_plan_validation_failure(text,text,uuid,text,text,text,bigint)','execute')
  then raise exception 'unified Visual Plan reconciliation RPC permissions mismatch'; end if;
  if position('state=''failed''' in pg_get_functiondef(
      'tongs.fail_unified_visual_plan(text,text,text,text,text)'::regprocedure))=0
  then raise exception 'unified Visual Plan failure is not terminal'; end if;
end $$;

rollback;
