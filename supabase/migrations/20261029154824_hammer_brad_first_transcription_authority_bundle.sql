-- Governed one-operation authority installer for Brad's first real Hammer
-- transcription. Applying this migration creates no pricing, funding,
-- provider, customer, quote, reservation, or execution authority. The sole
-- writer remains a separately authorized service-role call.
begin;

do $$ begin
  if to_regprocedure('tongs.install_hammer_first_transcription_activation(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,uuid,uuid,text,text,timestamptz,timestamptz,text,timestamptz,timestamptz,bigint,bigint,bigint,boolean,timestamptz,timestamptz,text)') is null
     or to_regprocedure('tongs.install_hammer_scoped_live_funding_authority(uuid,uuid,uuid,timestamptz,timestamptz,text)') is null
  then
    raise exception 'Hammer migrations 421 and 422 are required';
  end if;
end $$;

create or replace function tongs.install_brad_hammer_first_transcription_authority_bundle(
  p_actor_id uuid,
  p_account_evidence_sha256 text,
  p_account_source_url text,
  p_account_checked_at timestamptz,
  p_account_expires_at timestamptz,
  p_capacity_evidence_sha256 text,
  p_capacity_checked_at timestamptz,
  p_capacity_expires_at timestamptz,
  p_netlify_remaining_credit_microunits bigint,
  p_supabase_remaining_uncached_egress_bytes bigint,
  p_supabase_remaining_database_bytes bigint,
  p_supabase_spend_cap_enabled boolean,
  p_valid_from timestamptz,
  p_valid_until timestamptz,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog
as $$
declare
  v_user_id constant uuid := '71daf61b-57b3-4e5f-a8c8-64befecb5950';
  v_workspace_id constant uuid := 'cc5478ff-37be-403e-824c-467fa7da061e';
  v_workpiece_id constant uuid := '21d16d6a-905b-491e-8761-028789612ae5';
  v_recording_id constant uuid := '4cc846e3-187c-46d9-8733-e7402488236c';
  v_revision_id constant uuid := '9c991aa7-f551-4f03-a4d6-41eb40ef81ec';
  v_completion_id constant uuid := 'bf67d649-1bc2-44ba-9a33-783b3ab523ea';
  v_policy_id uuid := extensions.uuid_generate_v5(v_recording_id,'assemblyai-pricing-policy-v1');
  v_pricing_id uuid := extensions.uuid_generate_v5(v_recording_id,'assemblyai-pricing-revision-v1');
  v_cost_evidence_id uuid := extensions.uuid_generate_v5(v_recording_id,'assemblyai-cost-evidence-v1');
  v_aggregate_policy_id uuid := extensions.uuid_generate_v5(v_recording_id,'assemblyai-aggregate-policy-v1');
  v_capability_id uuid := extensions.uuid_generate_v5(v_recording_id,'assemblyai-aggregate-capability-v1');
  v_provider_authority_id uuid := extensions.uuid_generate_v5(v_recording_id,'assemblyai-provider-authority-v1');
  v_capacity_authority_id uuid := extensions.uuid_generate_v5(v_recording_id,'assemblyai-capacity-authority-v1');
  v_activation_id uuid := extensions.uuid_generate_v5(v_recording_id,'assemblyai-activation-authority-v1');
  v_funding_authority_id uuid := extensions.uuid_generate_v5(v_recording_id,'assemblyai-live-funding-authority-v1');
  v_components jsonb := jsonb_build_array(
    jsonb_build_object(
      'component_code','assemblyai_universal_3_5_pro_diarization',
      'component_kind','direct_provider','credential_funding','forge',
      'provider_label','AssemblyAI Universal-3.5 Pro with speaker labels',
      'success_ceiling_micros',38589,'failure_ceiling_micros',0,
      'cost_policy_revision','hammer-h2-first-transcription-r2',
      'tail_policy','none','tail_policy_details','{}'::jsonb
    ),
    jsonb_build_object(
      'component_code','forge_plan_funded_support',
      'component_kind','contingency','credential_funding','forge',
      'provider_label','Forge bounded supporting resources',
      'success_ceiling_micros',6000,'failure_ceiling_micros',6000,
      'cost_policy_revision','hammer-h2-first-transcription-r2',
      'tail_policy','plan_funded',
      'tail_policy_details',jsonb_build_object('capacity_evidence_required',true)
    )
  );
  v_billable_failures constant jsonb := '[]'::jsonb;
  v_free_failures constant jsonb := '["provider_failure","provider_billed_failure","unknown_fault","prebilling_rejection","forge_validation_failure","persistence_failure","resource_exhausted"]'::jsonb;
  v_included_quantity jsonb := jsonb_build_object(
    'recording_id',v_recording_id,'recording_revision_id',v_revision_id,
    'duration_ms',603848,'media_bytes',120617428,'maximum_attempts',1,
    'maximum_concurrency',1,'automatic_retries',0,'speaker_labels',true
  );
  v_retention_policy constant jsonb := jsonb_build_object(
    'provider_retention_days',30,'continuing_canonical_storage','plan_funded',
    'provider_model_improvement_participation',true
  );
  v_pricing_hash text;
  v_source jsonb;
  v_activation jsonb;
  v_funding jsonb;
begin
  perform tongs._require_pricing_service_role();
  if p_actor_id <> '42c3de1d-bd24-41fe-abd9-640f17518b2c'::uuid
     or not tongs.is_platform_operator(p_actor_id) then
    raise exception 'exact platform operator required' using errcode='42501';
  end if;
  if p_account_evidence_sha256 !~ '^[0-9a-f]{64}$'
     or p_capacity_evidence_sha256 !~ '^[0-9a-f]{64}$'
     or p_account_source_url not like 'https://%'
     or p_account_checked_at>clock_timestamp()
     or p_capacity_checked_at>clock_timestamp()
     or p_account_expires_at<=clock_timestamp()
     or p_capacity_expires_at<=clock_timestamp()
     or p_account_expires_at-p_account_checked_at>interval '30 days'
     or p_capacity_expires_at-p_capacity_checked_at>interval '24 hours'
     or p_netlify_remaining_credit_microunits<671178
     or p_supabase_remaining_uncached_egress_bytes<243332008
     or p_supabase_remaining_database_bytes<8388608
     or p_supabase_spend_cap_enabled is not true
     or p_valid_from>clock_timestamp()+interval '5 minutes'
     or p_valid_until<=greatest(p_valid_from,clock_timestamp())
     or p_valid_until>least(p_account_expires_at,p_capacity_expires_at)
     or p_valid_until-p_valid_from>interval '24 hours'
     or length(btrim(coalesce(p_reason,''))) not between 8 and 500
     or exists(select 1 from tongs.hammer_transcription_operations
       where state in('queued','processing','submission_unknown'))
  then
    raise exception 'current exact account, capacity, validity, and inactivity evidence required' using errcode='42501';
  end if;

  v_source:=tongs.resolve_hammer_transcription_source_authority(
    v_workspace_id,v_workpiece_id,v_recording_id,v_revision_id
  );
  if v_source->>'completion_id'<>v_completion_id::text
     or v_source->>'media_sha256'<>'595ea9d8abc571a5e92be6eec0c5e5c23e82a6a6956a598dc391c82d80224e24'
     or (v_source->>'media_bytes')::bigint<>120617428
     or (v_source->>'duration_ms')::bigint<>603848
  then raise exception 'canonical Brad recording evidence drifted' using errcode='42501'; end if;

  v_pricing_hash:=encode(extensions.digest(convert_to(jsonb_build_object(
    'policy_id',v_policy_id,'revision',1,'currency','USD','markup_basis_points',3300,
    'customer_credit_units',12,'cost_components',v_components,
    'billable_failure_classes',v_billable_failures,'free_failure_classes',v_free_failures,
    'included_quantity',v_included_quantity,'retention_policy',v_retention_policy,
    'change_reason','Brad first bounded AssemblyAI transcription; 33% cost-plus rounded to 12 whole Forge Credits.'
  )::text,'utf8'),'sha256'),'hex');

  insert into tongs.private_pricing_policies(id,policy_code,scope_kind,provider,sku,created_by)
  values(v_policy_id,'hammer-brad-first-assemblyai-v1','sku','assemblyai',
    'assemblyai:universal-3-5-pro:diarization:brad-first',p_actor_id)
  on conflict(id) do nothing;

  insert into tongs.private_pricing_revisions(
    id,policy_id,revision,previous_revision_id,lifecycle_state,currency,markup_basis_points,
    full_cost_ceiling_micros,failure_cost_ceiling_micros,customer_price_ceiling_micros,
    billable_failure_ceiling_micros,customer_credit_units,billable_failure_classes,
    free_failure_classes,included_quantity,retention_policy,change_reason,content_hash,actor_id,
    unrounded_customer_price_micros,rounding_adjustment_micros,settled_customer_price_micros
  ) values(
    v_pricing_id,v_policy_id,1,null,'review_ready','USD',3300,44589,6000,60000,0,12,
    v_billable_failures,v_free_failures,v_included_quantity,v_retention_policy,
    'Brad first bounded AssemblyAI transcription; 33% cost-plus rounded to 12 whole Forge Credits.',
    v_pricing_hash,p_actor_id,59304,696,60000
  ) on conflict(id) do nothing;

  insert into tongs.private_pricing_cost_components(
    pricing_revision_id,ordinal,component_code,component_kind,credential_funding,
    provider_label,success_ceiling_micros,failure_ceiling_micros,cost_policy_revision,
    tail_policy,tail_policy_details
  ) select v_pricing_id,ordinal::smallint,component->>'component_code',component->>'component_kind',
      component->>'credential_funding',component->>'provider_label',
      (component->>'success_ceiling_micros')::bigint,(component->>'failure_ceiling_micros')::bigint,
      component->>'cost_policy_revision',component->>'tail_policy',component->'tail_policy_details'
    from jsonb_array_elements(v_components) with ordinality as item(component,ordinal)
  on conflict do nothing;

  if not exists(select 1 from tongs.private_pricing_revisions r
      where r.id=v_pricing_id and r.policy_id=v_policy_id and r.lifecycle_state='review_ready'
        and r.currency='USD' and r.markup_basis_points=3300 and r.full_cost_ceiling_micros=44589
        and r.failure_cost_ceiling_micros=6000 and r.customer_price_ceiling_micros=60000
        and r.billable_failure_ceiling_micros=0 and r.customer_credit_units=12
        and r.unrounded_customer_price_micros=59304 and r.rounding_adjustment_micros=696
        and r.settled_customer_price_micros=60000 and r.content_hash=v_pricing_hash)
     or (select count(*) from tongs.private_pricing_cost_components where pricing_revision_id=v_pricing_id)<>2
     or (select sum(success_ceiling_micros) from tongs.private_pricing_cost_components where pricing_revision_id=v_pricing_id)<>44589
     or (select sum(failure_ceiling_micros) from tongs.private_pricing_cost_components where pricing_revision_id=v_pricing_id)<>6000
  then raise exception 'exact immutable 12-Credit pricing revision conflict' using errcode='23505'; end if;

  insert into tongs.restricted_beta_cost_evidence_revisions(
    id,capability_code,revision,evidence_state,coverage_state,source_reference,
    observed_at,valid_until,included_capacity_json,reserved_headroom_json,
    latency_json,hard_cap_scope,notes
  ) values(
    v_cost_evidence_id,'assemblyai.transcription.hammer',1,'verified_rate','complete',
    p_account_source_url,p_account_checked_at,p_account_expires_at,
    jsonb_build_object('provider','assemblyai','model','universal-3-5-pro',
      'speaker_labels',true,'supplier_rate_micros_per_hour',230000,
      'billing_increment_ms',1000,'minimum_billable_ms',1000,
      'recording_duration_ms',603848,'supplier_ceiling_micros',38589,
      'maximum_attempts',1,'automatic_retries',0,
      'account_evidence_sha256',p_account_evidence_sha256),
    jsonb_build_object('supporting_cost_ceiling_micros',6000,
      'complete_wholesale_ceiling_micros',44589,'capacity_evidence_sha256',p_capacity_evidence_sha256),
    jsonb_build_object('maximum_reconciliation_window_ms',1800000,'maximum_provider_polls',12),
    'One exact 603,848-ms Brad recording, one AssemblyAI attempt, Universal-3.5 Pro with speaker labels.',
    'Owner-certified account rate and bounded plan-funded Forge supporting resources.'
  ) on conflict(id) do nothing;

  insert into tongs.restricted_beta_policy_revisions(
    id,environment,revision,lifecycle_state,aggregate_forge_exposure_limit_micros,
    reserved_headroom_micros,maximum_concurrency,rolling_window_seconds,
    evidence_max_age_seconds,reason
  ) values(v_aggregate_policy_id,'production',116,'active',44589,0,1,86400,86400,
    'Dedicated one-operation AssemblyAI aggregate authority for Brad first Hammer transcription.')
  on conflict(id) do nothing;

  insert into tongs.restricted_beta_policy_capabilities(
    id,policy_revision_id,capability_code,admission_mode,cost_evidence_revision_id,
    maximum_attempts,maximum_concurrency,per_operation_supplier_ceiling_micros,
    per_operation_supporting_ceiling_micros,per_operation_tail_ceiling_micros,
    permitted_callers_json,exact_model_or_sku,notes
  ) values(v_capability_id,v_aggregate_policy_id,'assemblyai.transcription.hammer','covered',
    v_cost_evidence_id,1,1,38589,6000,0,'["interactive"]'::jsonb,
    'universal-3-5-pro:diarization','Exact Brad first-transcription capability; no retries.')
  on conflict(id) do nothing;

  if not exists(select 1 from tongs.restricted_beta_policy_revisions p
      join tongs.restricted_beta_policy_capabilities c on c.policy_revision_id=p.id
      join tongs.restricted_beta_cost_evidence_revisions e on e.id=c.cost_evidence_revision_id
      where p.id=v_aggregate_policy_id and p.environment='production' and p.revision=116
        and p.lifecycle_state='active' and p.aggregate_forge_exposure_limit_micros=44589
        and p.maximum_concurrency=1 and c.capability_code='assemblyai.transcription.hammer'
        and c.admission_mode='covered' and c.maximum_attempts=1 and c.maximum_concurrency=1
        and c.per_operation_supplier_ceiling_micros=38589
        and c.per_operation_supporting_ceiling_micros=6000
        and c.per_operation_tail_ceiling_micros=0 and e.coverage_state='complete'
        and e.evidence_state='verified_rate' and e.valid_until>=p_valid_until)
  then raise exception 'exact dedicated AssemblyAI aggregate authority conflict' using errcode='23505'; end if;

  v_activation:=tongs.install_hammer_first_transcription_activation(
    v_activation_id,v_provider_authority_id,v_capacity_authority_id,p_actor_id,v_user_id,
    v_workspace_id,v_workpiece_id,v_recording_id,v_revision_id,v_completion_id,'live',
    v_pricing_id,v_aggregate_policy_id,p_account_evidence_sha256,p_account_source_url,
    p_account_checked_at,p_account_expires_at,p_capacity_evidence_sha256,p_capacity_checked_at,
    p_capacity_expires_at,p_netlify_remaining_credit_microunits,
    p_supabase_remaining_uncached_egress_bytes,p_supabase_remaining_database_bytes,
    p_supabase_spend_cap_enabled,p_valid_from,p_valid_until,btrim(p_reason)
  );
  v_funding:=tongs.install_hammer_scoped_live_funding_authority(
    v_funding_authority_id,v_activation_id,p_actor_id,p_valid_from,p_valid_until,btrim(p_reason)
  );

  return jsonb_build_object(
    'pricing_revision_id',v_pricing_id,'aggregate_policy_revision_id',v_aggregate_policy_id,
    'provider_authority_id',v_provider_authority_id,'capacity_authority_id',v_capacity_authority_id,
    'activation_authority_id',v_activation_id,'funding_authority_id',v_funding_authority_id,
    'customer_credit_units',12,'maximum_customer_charge_micros',60000,
    'maximum_checkout_sessions',1,'maximum_provider_attempts',1,'automatic_retries',0,
    'execution_authorized',false,'funds_granted',false,'provider_submitted',false,
    'activation',v_activation,'funding',v_funding
  );
end $$;

revoke all on function tongs.install_brad_hammer_first_transcription_authority_bundle(
  uuid,text,text,timestamptz,timestamptz,text,timestamptz,timestamptz,
  bigint,bigint,bigint,boolean,timestamptz,timestamptz,text
) from public,anon,authenticated;
grant execute on function tongs.install_brad_hammer_first_transcription_authority_bundle(
  uuid,text,text,timestamptz,timestamptz,text,timestamptz,timestamptz,
  bigint,bigint,bigint,boolean,timestamptz,timestamptz,text
) to service_role;

do $$ begin
  if exists(select 1 from tongs.hammer_first_transcription_activation_authorities)
     or exists(select 1 from tongs.hammer_scoped_live_funding_authorities)
  then raise exception 'authority-bundle migration must remain financially inert'; end if;
  if tongs._current_financial_environment()<>'test' then
    raise exception 'authority-bundle migration must preserve global Test'; end if;
end $$;

comment on function tongs.install_brad_hammer_first_transcription_authority_bundle(
  uuid,text,text,timestamptz,timestamptz,text,timestamptz,timestamptz,
  bigint,bigint,bigint,boolean,timestamptz,timestamptz,text
) is 'Separately owner-authorized, service-only, atomic installation of the exact Brad 12-Credit private price, one-operation AssemblyAI aggregate capability, scoped Live Checkout, and inactive provider authority. It grants no funds and submits no media.';

notify pgrst,'reload schema';
commit;
