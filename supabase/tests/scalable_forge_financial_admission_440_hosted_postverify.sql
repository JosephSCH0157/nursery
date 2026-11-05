with latest_rollouts as (
  select distinct on (route_code) route_code, revision, mode
  from tongs.openai_text_rollout_revisions
  where route_code in ('hammer.transcript_cleanup','hearth.chat_completion')
  order by route_code, revision desc
), latest_hammer_policy as (
  select p.aggregate_forge_exposure_limit_micros, c.per_operation_supplier_ceiling_micros,
         c.per_operation_supporting_ceiling_micros, c.maximum_attempts,
         (e.included_capacity_json->>'automatic_retries')::integer as automatic_retries
  from tongs.restricted_beta_policy_revisions p
  join tongs.restricted_beta_policy_capabilities c on c.policy_revision_id=p.id
  join tongs.restricted_beta_cost_evidence_revisions e on e.id=c.cost_evidence_revision_id
  where p.environment='production' and p.lifecycle_state='active'
    and c.capability_code='assemblyai.transcription.hammer'
  order by p.revision desc limit 1
), admission as (
  select
    count(*) filter (where coalesce(to_jsonb(p)->>'exposure_accounting_mode','legacy_gross')='funded_net_v2')::bigint as funded_net_policy_count,
    count(*) filter (where coalesce(to_jsonb(p)->>'exposure_accounting_mode','legacy_gross')<>'legacy_gross')::bigint as non_legacy_policy_count,
    bool_and(coalesce(to_jsonb(p)->>'exposure_accounting_mode','legacy_gross')='legacy_gross') as all_policies_legacy_gross
  from tongs.restricted_beta_policy_revisions p
), assignments as (
  select count(*)::bigint as funded_net_assignment_count
  from tongs.paid_execution_aggregate_assignments a
  join tongs.restricted_beta_policy_revisions p on p.id=a.policy_revision_id
  where coalesce(to_jsonb(p)->>'exposure_accounting_mode','legacy_gross')='funded_net_v2'
), function_oids as (
  select to_regprocedure('tongs.read_forge_cost_observability()') as observability_oid,
         to_regprocedure('tongs.reserve_restricted_beta_exposure(uuid,uuid,text,text,uuid,uuid,text,text,text,text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,integer,text)') as reserve_oid
), helpers as (
  select unnest(array[
    to_regprocedure('tongs._restricted_beta_hold_remaining_gross(uuid)'),
    to_regprocedure('tongs._restricted_beta_hold_is_open(uuid)'),
    to_regprocedure('tongs._scalable_funding_offset(uuid,bigint,text)'),
    to_regprocedure('tongs._scalable_hold_effective_offset(uuid)'),
    to_regprocedure('tongs._scalable_policy_exposure(uuid)'),
    to_regprocedure('tongs._authorize_scalable_hold_attempt(uuid)')
  ]) as helper_oid
), contracts as (
  select
    exists(select 1 from information_schema.columns where table_schema='tongs' and table_name='restricted_beta_policy_revisions' and column_name='exposure_accounting_mode')
      and exists(select 1 from pg_constraint where conname='restricted_beta_funded_net_limits_complete')
      and exists(select 1 from pg_constraint where conname='restricted_beta_funded_net_hold_complete')
      and reserve_oid is not null
      and coalesce(pg_get_functiondef(reserve_oid) like '%funded_net_v2%',false)
      and (select count(*)=6 and bool_and(helper_oid is not null) from helpers) as scalable_contract_ok,
    observability_oid is not null
      and coalesce((select prosecdef and provolatile='s' and proconfig @> array['search_path=pg_catalog']::text[] from pg_proc where oid=observability_oid),false)
      and coalesce(pg_get_functiondef(observability_oid) like '%forge.cost-observability.v1%',false) as observability_contract_ok,
    (select count(*)=6 and bool_and(
       helper_oid is not null
       and coalesce((select prosecdef and proconfig @> array['search_path=pg_catalog']::text[] from pg_proc where oid=helper_oid),false)
       and has_function_privilege('service_role',helper_oid,'EXECUTE')
       and not has_function_privilege('public',helper_oid,'EXECUTE')
       and not has_function_privilege('anon',helper_oid,'EXECUTE')
       and not has_function_privilege('authenticated',helper_oid,'EXECUTE')) from helpers) as scalable_acl_ok,
    observability_oid is not null
      and has_function_privilege('service_role',observability_oid,'EXECUTE')
      and not has_function_privilege('public',observability_oid,'EXECUTE')
      and not has_function_privilege('anon',observability_oid,'EXECUTE')
      and not has_function_privilege('authenticated',observability_oid,'EXECUTE') as observability_acl_ok
  from function_oids
)
select
  (select lineage from forge_meta.database_lineage where singleton=true) as lineage,
  (select revision from latest_rollouts where route_code='hammer.transcript_cleanup') as hammer_rollout_revision,
  (select mode from latest_rollouts where route_code='hammer.transcript_cleanup') as hammer_rollout_mode,
  (select revision from latest_rollouts where route_code='hearth.chat_completion') as luna_rollout_revision,
  (select mode from latest_rollouts where route_code='hearth.chat_completion') as luna_rollout_mode,
  (select aggregate_forge_exposure_limit_micros from latest_hammer_policy) as aggregate_exposure_limit_micros,
  (select per_operation_supplier_ceiling_micros from latest_hammer_policy) as supplier_ceiling_micros,
  (select per_operation_supporting_ceiling_micros from latest_hammer_policy) as supporting_ceiling_micros,
  (select maximum_attempts from latest_hammer_policy) as maximum_attempts,
  (select automatic_retries from latest_hammer_policy) as automatic_retries,
  (select count(*) from tongs.hammer_first_transcription_activation_authorities a where clock_timestamp()>=a.valid_from and clock_timestamp()<a.valid_until) as effective_activations,
  (select count(*) from tongs.hammer_first_transcription_capacity_authorities c where clock_timestamp()<c.expires_at) as effective_capacity_authorities,
  (select count(*) from tongs.customer_paid_execution_scope_authorizations s where s.route_code='hammer.transcript_cleanup' and tongs._hammer_scope_is_effective(s.id,clock_timestamp())) as effective_scopes,
  (select count(*) from tongs.customer_paid_execution_scope_authorizations s where s.route_code='hammer.transcript_cleanup' and s.financial_environment='test' and tongs._hammer_scope_is_effective(s.id,clock_timestamp())) as effective_test_scopes,
  (select count(*) from tongs.customer_paid_execution_scope_authorizations s where s.route_code='hammer.transcript_cleanup' and s.financial_environment='live' and tongs._hammer_scope_is_effective(s.id,clock_timestamp())) as effective_live_scopes,
  (select count(*) from tongs.hammer_transcription_operations) as operations,
  (select count(*) from tongs.hammer_transcription_provider_attempts) as provider_attempts,
  (select count(*) from tongs.hammer_transcription_operations where state in ('queued','processing','submission_unknown')) as unresolved_operations,
  (select count(*) from tongs.hammer_transcription_provider_attempts where state in ('authorized','queued','processing','submission_unknown')) as unresolved_attempts,
  admission.funded_net_policy_count, assignments.funded_net_assignment_count,
  admission.non_legacy_policy_count, coalesce(admission.all_policies_legacy_gross,true) as all_policies_legacy_gross,
  contracts.scalable_contract_ok, contracts.observability_contract_ok,
  contracts.scalable_acl_ok, contracts.observability_acl_ok
from admission cross join assignments cross join contracts;
