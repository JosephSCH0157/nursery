-- Service-only append-only correction for the Hammer AssemblyAI capability's
-- aggregate envelope binding. Applying this migration creates no authority rows.
begin;

create or replace function tongs.align_hammer_first_transcription_aggregate_envelope(
  p_previous_policy_id uuid,p_policy_id uuid,p_capability_id uuid,p_actor_id uuid,p_reason text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  previous_policy tongs.restricted_beta_policy_revisions%rowtype;
  previous_capability tongs.restricted_beta_policy_capabilities%rowtype;
  evidence tongs.restricted_beta_cost_evidence_revisions%rowtype;
  next_policy_revision integer;
begin
  perform tongs._require_pricing_service_role();
  if p_previous_policy_id is null or p_policy_id is null or p_capability_id is null
     or p_actor_id is null or not tongs.is_platform_operator(p_actor_id)
     or length(btrim(coalesce(p_reason,''))) not between 8 and 500
  then raise exception 'exact AssemblyAI aggregate-envelope alignment authority is required' using errcode='22023'; end if;

  perform pg_advisory_xact_lock(hashtextextended('hammer-assemblyai-aggregate-envelope-alignment',0));
  select * into previous_policy from tongs.restricted_beta_policy_revisions
    where id=p_previous_policy_id for update;
  select * into previous_capability from tongs.restricted_beta_policy_capabilities
    where policy_revision_id=p_previous_policy_id and capability_code='assemblyai.transcription.hammer';
  select * into evidence from tongs.restricted_beta_cost_evidence_revisions
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
     or evidence.id is null or evidence.evidence_state<>'verified_rate' or evidence.coverage_state<>'complete'
     or evidence.valid_until<=clock_timestamp()
     or evidence.observed_at<clock_timestamp()-make_interval(secs=>previous_policy.evidence_max_age_seconds)
     or (evidence.included_capacity_json->>'supplier_rate_micros_per_hour')::bigint<>230000
     or (evidence.included_capacity_json->>'maximum_attempts')::integer<>1
     or (evidence.included_capacity_json->>'automatic_retries')::integer<>0
  then raise exception 'reviewed Hammer AssemblyAI aggregate authority changed upstream' using errcode='42501'; end if;
  if exists(select 1 from tongs.restricted_beta_policy_revisions where id=p_policy_id)
     or exists(select 1 from tongs.restricted_beta_policy_capabilities where id=p_capability_id)
  then raise exception 'aggregate-envelope alignment identities already exist' using errcode='23505'; end if;

  select coalesce(max(revision),0)+1 into next_policy_revision
    from tongs.restricted_beta_policy_revisions where environment='production';
  insert into tongs.restricted_beta_policy_revisions(
    id,environment,revision,lifecycle_state,aggregate_forge_exposure_limit_micros,reserved_headroom_micros,
    maximum_concurrency,rolling_window_seconds,evidence_max_age_seconds,allocation_policy_revision_id,
    tail_policy_revision_id,reason
  ) values(p_policy_id,'production',next_policy_revision,'active',10840000,0,1,86400,86400,
    previous_policy.allocation_policy_revision_id,previous_policy.tail_policy_revision_id,btrim(p_reason));
  insert into tongs.restricted_beta_policy_capabilities(
    id,policy_revision_id,capability_code,admission_mode,cost_evidence_revision_id,maximum_attempts,
    maximum_concurrency,per_operation_supplier_ceiling_micros,per_operation_supporting_ceiling_micros,
    per_operation_tail_ceiling_micros,permitted_callers_json,exact_model_or_sku,notes
  ) values(p_capability_id,p_policy_id,previous_capability.capability_code,previous_capability.admission_mode,
    previous_capability.cost_evidence_revision_id,previous_capability.maximum_attempts,
    previous_capability.maximum_concurrency,previous_capability.per_operation_supplier_ceiling_micros,
    previous_capability.per_operation_supporting_ceiling_micros,
    previous_capability.per_operation_tail_ceiling_micros,previous_capability.permitted_callers_json,
    previous_capability.exact_model_or_sku,
    'Exact Brad first-transcription capability aligned to the existing Forge production aggregate envelope.');
  return jsonb_build_object('aggregate_policy_revision_id',p_policy_id,'capability_id',p_capability_id,
    'policy_revision',next_policy_revision,'aggregate_forge_exposure_limit_micros',10840000,
    'per_operation_wholesale_ceiling_micros',44589,'customer_payment_micros',0,
    'customer_credit_units',0,'execution_authorized',false,'provider_submitted',false);
end $$;

create or replace function tongs._current_hammer_first_transcription_aggregate_policy()
returns uuid language plpgsql stable security definer set search_path=pg_catalog as $$
declare selected uuid;
begin
  select p.id into selected from tongs.restricted_beta_policy_revisions p
  join tongs.restricted_beta_policy_capabilities c on c.policy_revision_id=p.id
  join tongs.restricted_beta_cost_evidence_revisions e on e.id=c.cost_evidence_revision_id
  where p.environment='production' and p.lifecycle_state='active'
    and p.aggregate_forge_exposure_limit_micros=10840000 and p.reserved_headroom_micros=0
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

revoke all on function tongs.align_hammer_first_transcription_aggregate_envelope(uuid,uuid,uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function tongs.align_hammer_first_transcription_aggregate_envelope(uuid,uuid,uuid,uuid,text)
  to service_role;
revoke all on function tongs._current_hammer_first_transcription_aggregate_policy() from public,anon,authenticated;
grant execute on function tongs._current_hammer_first_transcription_aggregate_policy() to service_role;
comment on function tongs.align_hammer_first_transcription_aggregate_envelope(uuid,uuid,uuid,uuid,text)
  is 'Service-only append-only alignment of the exact AssemblyAI capability to the existing Forge production aggregate envelope; creates no execution or customer funding.';
comment on function tongs._current_hammer_first_transcription_aggregate_policy()
  is 'Resolves the fresh exact one-attempt Hammer AssemblyAI capability under the existing Forge production aggregate envelope.';
notify pgrst,'reload schema';
commit;
