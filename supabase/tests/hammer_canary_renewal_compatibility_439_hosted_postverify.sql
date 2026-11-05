with latest_rollouts as (
  select distinct on (route_code) route_code, revision, mode
  from tongs.openai_text_rollout_revisions
  where route_code in ('hammer.transcript_cleanup','hearth.chat_completion')
  order by route_code, revision desc
), latest_hammer_policy as (
  select p.aggregate_forge_exposure_limit_micros,
         c.per_operation_supplier_ceiling_micros,
         c.per_operation_supporting_ceiling_micros,
         c.maximum_attempts,
         (e.included_capacity_json->>'automatic_retries')::integer as automatic_retries
  from tongs.restricted_beta_policy_revisions p
  join tongs.restricted_beta_policy_capabilities c on c.policy_revision_id=p.id
  join tongs.restricted_beta_cost_evidence_revisions e on e.id=c.cost_evidence_revision_id
  where p.environment='production' and p.lifecycle_state='active'
    and c.capability_code='assemblyai.transcription.hammer'
  order by p.revision desc limit 1
), functions as (
  select
    'tongs.renew_hammer_first_transcription_aggregate_cost_authority(uuid,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,text,text)'::regprocedure as renewal_oid,
    'tongs._current_hammer_first_transcription_aggregate_policy()'::regprocedure as resolver_oid
), definitions as (
  select pg_get_functiondef(renewal_oid) as renewal_definition,
         pg_get_functiondef(resolver_oid) as resolver_definition,
         renewal_oid, resolver_oid
  from functions
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
  (select prosecdef and proconfig @> array['search_path=pg_catalog']::text[]
     and renewal_definition ~ 'aggregate_forge_exposure_limit_micros\s*<>\s*10840000'
     and renewal_definition ~ 'per_operation_supplier_ceiling_micros\s*<>\s*38589'
     and renewal_definition ~ 'per_operation_supporting_ceiling_micros\s*<>\s*6000'
     and renewal_definition ~ 'maximum_attempts\s*<>\s*1'
     and renewal_definition like '%automatic_retries%' from definitions join pg_proc on oid=renewal_oid) as renewal_rpc_contract_ok,
  (select prosecdef and provolatile='s' and proconfig @> array['search_path=pg_catalog']::text[]
     and resolver_definition ~ 'aggregate_forge_exposure_limit_micros\s*=\s*10840000'
     and resolver_definition ~ 'per_operation_supplier_ceiling_micros\s*=\s*38589'
     and resolver_definition ~ 'per_operation_supporting_ceiling_micros\s*=\s*6000'
     and resolver_definition ~ 'maximum_attempts\s*=\s*1'
     and resolver_definition like '%automatic_retries%' from definitions join pg_proc on oid=resolver_oid) as resolver_contract_ok,
  (select has_function_privilege('service_role',renewal_oid,'EXECUTE')
     and not has_function_privilege('public',renewal_oid,'EXECUTE')
     and not has_function_privilege('anon',renewal_oid,'EXECUTE')
     and not has_function_privilege('authenticated',renewal_oid,'EXECUTE') from definitions) as renewal_acl_ok,
  (select has_function_privilege('service_role',resolver_oid,'EXECUTE')
     and not has_function_privilege('public',resolver_oid,'EXECUTE')
     and not has_function_privilege('anon',resolver_oid,'EXECUTE')
     and not has_function_privilege('authenticated',resolver_oid,'EXECUTE') from definitions) as resolver_acl_ok;
