-- Run after the migration chain in an isolated database. This proof deliberately
-- stays read-only so it can also certify the linked schema without manufacturing
-- customer finance state.
begin;

do $$
declare
  quote_definition text;
  paid_result_definition text;
  thumbnail_direction_persist_definition text;
  thumbnail_direction_read_definition text;
  thumbnail_direction_finalize_definition text;
  tag_evidence_definition text;
  generic_evidence_definition text;
begin
  if not exists (
    select 1 from tongs.openai_text_route_policies
    where route_code='hearth.thumbnail_direction_generation'
      and maximum_input_units=16000 and maximum_output_units=2048
      and maximum_attempts=1 and requires_result_validation
      and requires_canonical_persistence and not byo_supported
  ) then raise exception 'Thumbnail Directions route contract mismatch'; end if;

  if not exists (
    select 1 from tongs.openai_text_cost_policy_revisions
    where id='18000000-0000-4000-8000-000000000001'
      and route_code='hearth.thumbnail_direction_generation'
      and maximum_input_units=16000 and maximum_output_units=2048
      and maximum_attempts=1 and direct_provider_ceiling_micros=5658
      and supporting_cost_ceiling_micros=0 and full_cost_ceiling_micros=5658
      and cost_coverage='complete' and lifecycle_state='active'
  ) then raise exception 'Thumbnail Directions cost policy proof failed'; end if;

  if not exists (
    select 1 from tongs.private_pricing_revisions
    where id='18000000-0000-4000-8000-000000000003'
      and customer_credit_units=2 and settled_customer_price_micros=10000
      and full_cost_ceiling_micros=5658
      and unrounded_customer_price_micros=7526
      and rounding_adjustment_micros=2474
  ) then raise exception 'Thumbnail Directions pricing proof failed'; end if;

  if not exists (
    select 1 from tongs.private_pricing_cost_components
    where pricing_revision_id='18000000-0000-4000-8000-000000000003'
      and component_code='verified_variable_supporting_cost'
      and success_ceiling_micros=0 and failure_ceiling_micros=0
  ) then raise exception 'Thumbnail Directions zero supporting-cost proof failed'; end if;

  if not exists (
    select 1
    from tongs.openai_text_model_route_compatibility compatibility
    join tongs.openai_text_model_catalog_entries entry
      on entry.id=compatibility.catalog_entry_id
    join tongs.openai_text_model_catalog_revisions catalog
      on catalog.id=entry.catalog_revision_id
    where catalog.id='18000000-0000-4000-8000-000000000005'
      and catalog.revision=12 and catalog.lifecycle_state='active'
      and entry.provider_model_id='gpt-5.6-luna'
      and compatibility.route_code='hearth.thumbnail_direction_generation'
      and compatibility.compatibility_status='generation_verified'
      and compatibility.maximum_input_tokens=16000
      and compatibility.maximum_output_tokens=2048
      and compatibility.maximum_attempts=1
      and compatibility.cost_policy_revision_id='18000000-0000-4000-8000-000000000001'
  ) then raise exception 'Thumbnail Directions Luna catalog compatibility proof failed'; end if;

  if not exists (
    select 1 from tongs.openai_text_failure_loss_policy_revisions
    where route_code='hearth.thumbnail_direction_generation' and environment='test'
      and per_operation_limit_micros=5658 and aggregate_limit_micros=5658
      and maximum_concurrency=1 and rolling_window_seconds=86400
  ) then raise exception 'Thumbnail Directions exposure proof failed'; end if;

  if (select count(*) from tongs.customer_paid_execution_scope_authorizations
      where route_code='hearth.thumbnail_direction_generation' and financial_environment='test'
        and authorization_kind='normal_customer' and status='active')<>1
  then raise exception 'Thumbnail Directions must have exactly one Test scope'; end if;
  if exists(select 1 from tongs.customer_paid_execution_scope_authorizations
      where route_code='hearth.thumbnail_direction_generation' and financial_environment='live'
        and status='active')
  then raise exception 'Thumbnail Directions must have no Live scope'; end if;

  if not (select relrowsecurity and relforcerowsecurity from pg_class
      where oid='tongs.hearth_thumbnail_direction_generation_results'::regclass)
    or not (select relrowsecurity and relforcerowsecurity from pg_class
      where oid='tongs.hearth_thumbnail_direction_canonical_receipts'::regclass)
    or not (select relrowsecurity and relforcerowsecurity from pg_class
      where oid='tongs.openai_text_validation_failure_evidence'::regclass)
  then raise exception 'Thumbnail Directions result/evidence RLS is not forced'; end if;

  if has_table_privilege('anon','tongs.hearth_thumbnail_direction_generation_results','select')
    or has_table_privilege('authenticated','tongs.hearth_thumbnail_direction_generation_results','select')
    or has_table_privilege('anon','tongs.hearth_thumbnail_direction_canonical_receipts','select')
    or has_table_privilege('authenticated','tongs.hearth_thumbnail_direction_canonical_receipts','select')
    or has_table_privilege('anon','tongs.openai_text_validation_failure_evidence','select')
    or has_table_privilege('authenticated','tongs.openai_text_validation_failure_evidence','select')
  then raise exception 'customer roles can read private Thumbnail Directions evidence'; end if;
  if not has_table_privilege('service_role','tongs.hearth_thumbnail_direction_generation_results','select')
    or not has_table_privilege('service_role','tongs.hearth_thumbnail_direction_canonical_receipts','select')
    or not has_table_privilege('service_role','tongs.openai_text_validation_failure_evidence','select')
  then raise exception 'service role cannot read private Thumbnail Directions evidence'; end if;

  if not exists(select 1 from pg_trigger where tgrelid='tongs.hearth_thumbnail_direction_generation_results'::regclass
      and tgname='hearth_thumbnail_direction_generation_results_immutable' and not tgisinternal)
    or not exists(select 1 from pg_trigger where tgrelid='tongs.hearth_thumbnail_direction_canonical_receipts'::regclass
      and tgname='hearth_thumbnail_direction_canonical_receipts_immutable' and not tgisinternal)
    or not exists(select 1 from pg_trigger where tgrelid='tongs.openai_text_validation_failure_evidence'::regclass
      and tgname='openai_text_validation_failure_evidence_immutable' and not tgisinternal)
  then raise exception 'Thumbnail Directions result/evidence immutability trigger missing'; end if;

  if has_function_privilege('anon',
      'tongs.persist_hearth_thumbnail_direction_generation_result(text,uuid,uuid,uuid,uuid,text,uuid,integer,text,text,bigint,bigint,jsonb)',
      'execute')
    or has_function_privilege('authenticated',
      'tongs.persist_hearth_thumbnail_direction_generation_result(text,uuid,uuid,uuid,uuid,text,uuid,integer,text,text,bigint,bigint,jsonb)',
      'execute')
    or has_function_privilege('anon',
      'tongs.read_hearth_thumbnail_direction_generation_result(text,uuid)','execute')
    or has_function_privilege('authenticated',
      'tongs.read_hearth_thumbnail_direction_generation_result(text,uuid)','execute')
    or has_function_privilege('anon',
      'tongs.read_staged_hearth_thumbnail_direction_generation_result(text,uuid)','execute')
    or has_function_privilege('authenticated',
      'tongs.read_staged_hearth_thumbnail_direction_generation_result(text,uuid)','execute')
    or has_function_privilege('anon',
      'tongs.finalize_hearth_thumbnail_direction_generation_result(text,uuid,uuid,uuid,text)','execute')
    or has_function_privilege('authenticated',
      'tongs.finalize_hearth_thumbnail_direction_generation_result(text,uuid,uuid,uuid,text)','execute')
  then raise exception 'customer roles can execute Thumbnail Directions persistence authority'; end if;
  if not has_function_privilege('service_role',
      'tongs.persist_hearth_thumbnail_direction_generation_result(text,uuid,uuid,uuid,uuid,text,uuid,integer,text,text,bigint,bigint,jsonb)',
      'execute')
    or not has_function_privilege('service_role',
      'tongs.read_hearth_thumbnail_direction_generation_result(text,uuid)','execute')
    or not has_function_privilege('service_role',
      'tongs.read_staged_hearth_thumbnail_direction_generation_result(text,uuid)','execute')
    or not has_function_privilege('service_role',
      'tongs.finalize_hearth_thumbnail_direction_generation_result(text,uuid,uuid,uuid,text)','execute')
  then raise exception 'service role cannot execute Thumbnail Directions persistence authority'; end if;

  select pg_get_functiondef(
    'tongs.persist_hearth_thumbnail_direction_generation_result(text,uuid,uuid,uuid,uuid,text,uuid,integer,text,text,bigint,bigint,jsonb)'::regprocedure
  ) into thumbnail_direction_persist_definition;
  select pg_get_functiondef(
    'tongs.read_hearth_thumbnail_direction_generation_result(text,uuid)'::regprocedure
  ) into thumbnail_direction_read_definition;
  select pg_get_functiondef(
    'tongs.finalize_hearth_thumbnail_direction_generation_result(text,uuid,uuid,uuid,text)'::regprocedure
  ) into thumbnail_direction_finalize_definition;
  if position('perform tongs._require_pricing_service_role()' in lower(thumbnail_direction_persist_definition))=0
    or position('sequence_row.current_approval_id is distinct from p_approval_id' in lower(thumbnail_direction_persist_definition))=0
    or position('sequence_row.current_revision is distinct from p_approval_revision' in lower(thumbnail_direction_persist_definition))=0
    or position('digest(convert_to(approval.script_text' in lower(thumbnail_direction_persist_definition))=0
    or position('result replay conflict' in lower(thumbnail_direction_persist_definition))=0
    or position('''replay'',true' in replace(lower(thumbnail_direction_persist_definition),' ',''))=0
    or position('thumbnail_directions_three.v1' in thumbnail_direction_persist_definition)=0
    or position('jsonb_array_length(p_result_json->''directions'')<>3' in replace(thumbnail_direction_persist_definition,' ',''))=0
    or position('perform tongs._require_pricing_service_role()' in lower(thumbnail_direction_read_definition))=0
    or position('hearth_thumbnail_direction_canonical_receipts' in lower(thumbnail_direction_read_definition))=0
    or position('''replay'',true' in replace(lower(thumbnail_direction_read_definition),' ',''))=0
    or position('perform tongs._require_pricing_service_role()' in lower(thumbnail_direction_finalize_definition))=0
    or position('canonical thumbnail directions receipt replay conflict' in lower(thumbnail_direction_finalize_definition))=0
  then raise exception 'Thumbnail Directions approval-currentness or replay authority changed'; end if;

  select pg_get_functiondef(
    'tongs.create_customer_openai_text_quote(uuid,uuid,text,text,uuid,text,text,text,text,timestamptz)'::regprocedure
  ) into quote_definition;
  select pg_get_functiondef(
    'tongs.persist_openai_text_paid_result(uuid,text,text,uuid,uuid,uuid,text,text,text,text,bigint,bigint,text,jsonb)'::regprocedure
  ) into paid_result_definition;
  if position('hearth.thumbnail_direction_generation' in quote_definition)=0
    or position('hearth.thumbnail_direction_generation' in paid_result_definition)=0
  then raise exception 'generic paid route allow-list not extended'; end if;

  select pg_get_functiondef(
    'tongs.record_hearth_tag_validation_failure_evidence(text,uuid,text,text,bigint,bigint,text,text,text)'::regprocedure
  ) into tag_evidence_definition;
  if position('hearth.tag_generation' in tag_evidence_definition)=0
    or position('tags_top10_comma_block.v2' in tag_evidence_definition)=0
  then raise exception 'existing Tag evidence semantics changed'; end if;

  select pg_get_functiondef(
    'tongs.record_openai_text_validation_failure_evidence(text,text,uuid,text,text,bigint,bigint,text,text,text)'::regprocedure
  ) into generic_evidence_definition;
  if position('hearth.framing_pack_generation' in generic_evidence_definition)=0
    or position('visual.unified_plan' in generic_evidence_definition)=0
    or position('hearth.thumbnail_direction_generation' in generic_evidence_definition)=0
    or position('thumbnail_directions_three.v1' in generic_evidence_definition)=0
  then raise exception 'generic validation evidence compatibility changed'; end if;
end $$;

rollback;

