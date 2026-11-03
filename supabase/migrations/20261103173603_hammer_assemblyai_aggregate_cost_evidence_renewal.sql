-- Service-only append-only renewal for Brad's exact AssemblyAI aggregate cost
-- evidence. Applying this migration creates no financial or execution rows.
begin;

create or replace function tongs.renew_hammer_first_transcription_aggregate_cost_authority(
  p_previous_policy_id uuid,p_cost_evidence_id uuid,p_policy_id uuid,p_capability_id uuid,
  p_actor_id uuid,p_evidence_sha256 text,p_observed_at timestamptz,p_valid_until timestamptz,
  p_source_reference text,p_reason text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  previous_policy tongs.restricted_beta_policy_revisions%rowtype;
  previous_capability tongs.restricted_beta_policy_capabilities%rowtype;
  previous_evidence tongs.restricted_beta_cost_evidence_revisions%rowtype;
  next_policy_revision integer; next_evidence_revision integer;
begin
  perform tongs._require_pricing_service_role();
  if p_previous_policy_id is null or p_cost_evidence_id is null or p_policy_id is null
     or p_capability_id is null or p_actor_id is null or not tongs.is_platform_operator(p_actor_id)
     or p_evidence_sha256 !~ '^[0-9a-f]{64}$'
     or p_observed_at>clock_timestamp()+interval '5 minutes'
     or p_observed_at<clock_timestamp()-interval '1 hour'
     or p_valid_until<=clock_timestamp() or p_valid_until-p_observed_at>interval '24 hours'
     or btrim(coalesce(p_source_reference,''))<>'https://www.assemblyai.com/pricing/'
     or length(btrim(coalesce(p_reason,''))) not between 8 and 500
  then raise exception 'current exact AssemblyAI aggregate renewal evidence is required' using errcode='22023'; end if;

  perform pg_advisory_xact_lock(hashtextextended('hammer-assemblyai-aggregate-cost-renewal',0));
  select * into previous_policy from tongs.restricted_beta_policy_revisions
    where id=p_previous_policy_id for update;
  select * into previous_capability from tongs.restricted_beta_policy_capabilities
    where policy_revision_id=p_previous_policy_id and capability_code='assemblyai.transcription.hammer';
  select * into previous_evidence from tongs.restricted_beta_cost_evidence_revisions
    where id=previous_capability.cost_evidence_revision_id;
  if previous_policy.id is null or previous_policy.environment<>'production'
     or previous_policy.lifecycle_state<>'active'
     or previous_policy.aggregate_forge_exposure_limit_micros<>44589
     or previous_policy.reserved_headroom_micros<>0 or previous_policy.maximum_concurrency<>1
     or previous_policy.rolling_window_seconds<>86400 or previous_policy.evidence_max_age_seconds<>86400
     or previous_capability.id is null or previous_capability.admission_mode<>'covered'
     or previous_capability.maximum_attempts<>1 or previous_capability.maximum_concurrency<>1
     or previous_capability.per_operation_supplier_ceiling_micros<>38589
     or previous_capability.per_operation_supporting_ceiling_micros<>6000
     or previous_capability.per_operation_tail_ceiling_micros<>0
     or previous_capability.permitted_callers_json<>'["interactive"]'::jsonb
     or previous_capability.exact_model_or_sku<>'universal-3-5-pro:diarization'
     or previous_evidence.id is null or previous_evidence.evidence_state<>'verified_rate'
     or previous_evidence.coverage_state<>'complete'
     or (previous_evidence.included_capacity_json->>'supplier_rate_micros_per_hour')::bigint<>230000
     or (previous_evidence.included_capacity_json->>'maximum_attempts')::integer<>1
     or (previous_evidence.included_capacity_json->>'automatic_retries')::integer<>0
  then raise exception 'reviewed Hammer AssemblyAI aggregate authority changed upstream' using errcode='42501'; end if;

  select coalesce(max(revision),0)+1 into next_policy_revision
    from tongs.restricted_beta_policy_revisions where environment='production';
  select coalesce(max(revision),0)+1 into next_evidence_revision
    from tongs.restricted_beta_cost_evidence_revisions where capability_code='assemblyai.transcription.hammer';
  insert into tongs.restricted_beta_cost_evidence_revisions(
    id,capability_code,revision,evidence_state,coverage_state,source_reference,observed_at,valid_until,
    included_capacity_json,reserved_headroom_json,latency_json,hard_cap_scope,notes
  ) values(p_cost_evidence_id,'assemblyai.transcription.hammer',next_evidence_revision,'verified_rate','complete',
    btrim(p_source_reference),p_observed_at,p_valid_until,
    jsonb_build_object('provider','assemblyai','model','universal-3-5-pro','speaker_labels',true,
      'base_rate_micros_per_hour',210000,'speaker_diarization_rate_micros_per_hour',20000,
      'supplier_rate_micros_per_hour',230000,'billing_increment_ms',1000,'minimum_billable_ms',1000,
      'recording_duration_ms',603848,'supplier_ceiling_micros',38589,'maximum_attempts',1,
      'automatic_retries',0,'evidence_sha256',lower(p_evidence_sha256)),
    jsonb_build_object('supporting_cost_ceiling_micros',6000,'complete_wholesale_ceiling_micros',44589),
    jsonb_build_object('maximum_reconciliation_window_ms',1800000,'maximum_provider_polls',12),
    previous_evidence.hard_cap_scope,
    'Official rate re-observation only; pricing, ceilings, attempts, retries, and customer funding are unchanged.');
  insert into tongs.restricted_beta_policy_revisions(
    id,environment,revision,lifecycle_state,aggregate_forge_exposure_limit_micros,reserved_headroom_micros,
    maximum_concurrency,rolling_window_seconds,evidence_max_age_seconds,allocation_policy_revision_id,
    tail_policy_revision_id,reason
  ) values(p_policy_id,'production',next_policy_revision,'active',
    previous_policy.aggregate_forge_exposure_limit_micros,previous_policy.reserved_headroom_micros,
    previous_policy.maximum_concurrency,previous_policy.rolling_window_seconds,
    previous_policy.evidence_max_age_seconds,previous_policy.allocation_policy_revision_id,
    previous_policy.tail_policy_revision_id,btrim(p_reason));
  insert into tongs.restricted_beta_policy_capabilities(
    id,policy_revision_id,capability_code,admission_mode,cost_evidence_revision_id,maximum_attempts,
    maximum_concurrency,per_operation_supplier_ceiling_micros,per_operation_supporting_ceiling_micros,
    per_operation_tail_ceiling_micros,permitted_callers_json,exact_model_or_sku,notes
  ) values(p_capability_id,p_policy_id,previous_capability.capability_code,previous_capability.admission_mode,
    p_cost_evidence_id,previous_capability.maximum_attempts,previous_capability.maximum_concurrency,
    previous_capability.per_operation_supplier_ceiling_micros,
    previous_capability.per_operation_supporting_ceiling_micros,
    previous_capability.per_operation_tail_ceiling_micros,previous_capability.permitted_callers_json,
    previous_capability.exact_model_or_sku,
    'Unchanged exact Brad first-transcription capability bound to refreshed official rate evidence.');
  return jsonb_build_object('cost_evidence_revision_id',p_cost_evidence_id,
    'aggregate_policy_revision_id',p_policy_id,'capability_id',p_capability_id,
    'policy_revision',next_policy_revision,'evidence_revision',next_evidence_revision,
    'aggregate_forge_exposure_limit_micros',44589,'supplier_rate_micros_per_hour',230000,
    'customer_payment_micros',0,'customer_credit_units',0,'execution_authorized',false,'provider_submitted',false);
end $$;

create or replace function tongs._current_hammer_first_transcription_aggregate_policy()
returns uuid language plpgsql stable security definer set search_path=pg_catalog as $$
declare selected uuid;
begin
  select p.id into selected from tongs.restricted_beta_policy_revisions p
  join tongs.restricted_beta_policy_capabilities c on c.policy_revision_id=p.id
  join tongs.restricted_beta_cost_evidence_revisions e on e.id=c.cost_evidence_revision_id
  where p.environment='production' and p.lifecycle_state='active'
    and p.aggregate_forge_exposure_limit_micros=44589 and p.reserved_headroom_micros=0
    and p.maximum_concurrency=1 and p.rolling_window_seconds=86400 and p.evidence_max_age_seconds=86400
    and c.capability_code='assemblyai.transcription.hammer' and c.admission_mode='covered'
    and c.maximum_attempts=1 and c.maximum_concurrency=1
    and c.per_operation_supplier_ceiling_micros=38589
    and c.per_operation_supporting_ceiling_micros=6000 and c.per_operation_tail_ceiling_micros=0
    and c.permitted_callers_json='["interactive"]'::jsonb
    and c.exact_model_or_sku='universal-3-5-pro:diarization'
    and e.evidence_state='verified_rate' and e.coverage_state='complete'
    and e.valid_until>clock_timestamp()
    and e.observed_at>=clock_timestamp()-make_interval(secs=>p.evidence_max_age_seconds)
    and (e.included_capacity_json->>'supplier_rate_micros_per_hour')::bigint=230000
  order by p.revision desc limit 1;
  if selected is null then raise exception 'current exact Hammer AssemblyAI aggregate cost authority required' using errcode='42501'; end if;
  return selected;
end $$;

revoke all on function tongs.renew_hammer_first_transcription_aggregate_cost_authority(
  uuid,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,text,text) from public,anon,authenticated;
grant execute on function tongs.renew_hammer_first_transcription_aggregate_cost_authority(
  uuid,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,text,text) to service_role;
revoke all on function tongs._current_hammer_first_transcription_aggregate_policy() from public,anon,authenticated;
grant execute on function tongs._current_hammer_first_transcription_aggregate_policy() to service_role;

do $patch_renewal$ declare definition text; changed text; begin
  select pg_get_functiondef('tongs.renew_hammer_owner_funded_first_transcription_authority(uuid,uuid,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,bigint,bigint,bigint,boolean,timestamptz,timestamptz,text)'::regprocedure) into definition;
  changed:=replace(definition,'previous.pricing_revision_id,previous.aggregate_policy_revision_id,',
    'previous.pricing_revision_id,tongs._current_hammer_first_transcription_aggregate_policy(),');
  if changed=definition then raise exception 'Hammer authority renewal aggregate-policy binding changed upstream'; end if;
  execute changed;
end $patch_renewal$;

comment on function tongs.renew_hammer_first_transcription_aggregate_cost_authority(
  uuid,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,text,text)
  is 'Service-only append-only renewal of exact Brad AssemblyAI aggregate rate evidence; creates no quote, funding, activation, or execution.';
comment on function tongs._current_hammer_first_transcription_aggregate_policy()
  is 'Resolves only the latest fresh, exact, unchanged-cost aggregate policy for Brad first transcription.';
notify pgrst,'reload schema';
commit;
