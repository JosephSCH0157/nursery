-- Preserve definitive customer Runway pre-provider failures on replay and add
-- one explicit, durable replacement generation-attempt identity for the
-- bounded normal-customer Test smoke. No quote, reservation, or provider call
-- is created by this migration.
begin;

do $$
begin
  if not exists(select 1 from supabase_migrations.schema_migrations where version='20261011760000') then
    raise exception '20261011760000 must precede terminal replay and generation-attempt authority';
  end if;
end $$;

create table tongs.broll_generation_replacement_scopes(
  id uuid primary key,
  original_authorization_id uuid not null unique
    references tongs.runway_customer_test_authorizations(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  workspace_id uuid not null references tongs.workspaces(id) on delete restrict,
  workpiece_id uuid not null,
  beat_id uuid not null,
  prompt_revision_id uuid not null,
  prompt_revision bigint not null check(prompt_revision>0),
  prompt_content_hash text not null check(prompt_content_hash~'^[0-9a-f]{64}$'),
  creative_input_hash text not null check(creative_input_hash~'^[0-9a-f]{64}$'),
  original_operation_id text not null unique,
  original_operation_fingerprint text not null unique check(original_operation_fingerprint~'^[0-9a-f]{64}$'),
  original_submission_attempt_id uuid,
  financial_environment text not null check(financial_environment='test'),
  model text not null check(model='gen4.5'),
  generation_mode text not null check(generation_mode='text_to_video'),
  duration_seconds integer not null check(duration_seconds=5),
  ratio text not null check(ratio='1280:720'),
  reference_image_count integer not null check(reference_image_count=0),
  output_count integer not null check(output_count=1),
  maximum_replacement_attempts integer not null check(maximum_replacement_attempts=1),
  maximum_provider_attempts integer not null check(maximum_provider_attempts=1),
  maximum_customer_charge_micros bigint not null check(maximum_customer_charge_micros=800000),
  maximum_wholesale_exposure_micros bigint not null check(maximum_wholesale_exposure_micros=600000),
  maximum_concurrency integer not null check(maximum_concurrency=1),
  customer_failure_charge_micros bigint not null check(customer_failure_charge_micros=0),
  valid_from timestamptz not null,
  valid_until timestamptz not null check(valid_until>valid_from),
  reason text not null check(nullif(btrim(reason),'') is not null),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key(workpiece_id,workspace_id) references tongs.episodes(id,workspace_id) on delete restrict,
  foreign key(prompt_revision_id,workspace_id,workpiece_id,beat_id,prompt_revision)
    references tongs.broll_prompt_revisions(id,workspace_id,workpiece_id,beat_id,revision) on delete restrict
);

create table tongs.broll_generation_attempts(
  generation_request_id uuid primary key,
  replacement_scope_id uuid not null unique
    references tongs.broll_generation_replacement_scopes(id) on delete restrict,
  attempt_ordinal integer not null check(attempt_ordinal=2),
  previous_operation_id text not null,
  workspace_id uuid not null references tongs.workspaces(id) on delete restrict,
  workpiece_id uuid not null,
  beat_id uuid not null,
  prompt_revision_id uuid not null,
  prompt_revision bigint not null check(prompt_revision>0),
  prompt_content_hash text not null check(prompt_content_hash~'^[0-9a-f]{64}$'),
  creative_input_hash text not null check(creative_input_hash~'^[0-9a-f]{64}$'),
  operation_id text not null unique check(operation_id~'^forge:broll:[a-zA-Z0-9._:-]{8,180}$'),
  operation_fingerprint text not null unique check(operation_fingerprint~'^[0-9a-f]{64}$'),
  initiated_by uuid not null references auth.users(id) on delete restrict,
  initiated_at timestamptz not null default now(),
  foreign key(workpiece_id,workspace_id) references tongs.episodes(id,workspace_id) on delete restrict,
  foreign key(prompt_revision_id,workspace_id,workpiece_id,beat_id,prompt_revision)
    references tongs.broll_prompt_revisions(id,workspace_id,workpiece_id,beat_id,revision) on delete restrict
);

do $$ declare n text; begin
  foreach n in array array['broll_generation_replacement_scopes','broll_generation_attempts'] loop
    execute format('alter table tongs.%I enable row level security',n);
    execute format('alter table tongs.%I force row level security',n);
    execute format('revoke all on tongs.%I from public,anon,authenticated,service_role',n);
    execute format('grant select on tongs.%I to service_role',n);
    execute format('create trigger %I_immutable before update or delete on tongs.%I for each row execute function tongs._reject_accounting_mutation()',n,n);
  end loop;
end $$;

create or replace function tongs._is_terminal_customer_runway_preprovider_failure(p_operation_id text)
returns boolean language sql stable security definer set search_path=pg_catalog as $$
  select exists(
    select 1
    from tongs.broll_operation_receipts operation
    where operation.operation_id=p_operation_id
      and operation.operation_type='candidate_acquire'
      and operation.state='failed'
      and operation.failed_stage='runway_financial_preflight'
      and operation.failure_code='runway_funding_required'
      and operation.normalized_inputs_json->>'source_kind'='generated'
      and operation.normalized_inputs_json->>'runway_model'='gen4.5'
      and operation.provider_task_id is null
      and operation.provider_response_json is null
      and operation.provider_submission_json is null
      and operation.verified_asset_id is null
      and operation.verified_poster_asset_id is null
      and operation.result_candidate_revision_id is null
      and exists(
        select 1 from tongs.runway_customer_test_authorizations authz
        where authz.operation_id=operation.operation_id
          and authz.operation_fingerprint=operation.operation_fingerprint
          and authz.user_id=operation.created_by
          and authz.workspace_id=operation.workspace_id
      )
      and exists(
        select 1
        from tongs.runway_funding_bindings binding
        join tongs.funding_reservations reservation on reservation.id=binding.reservation_id
        where binding.operation_id=operation.operation_id
          and binding.operation_fingerprint=operation.operation_fingerprint
          and binding.workspace_id=operation.workspace_id
          and reservation.operation_id=operation.operation_id
          and reservation.user_id=operation.created_by
          and reservation.funding_environment='test'
          and reservation.reserved_customer_charge_micros=800000
          and reservation.reserved_credit_units=160
          and reservation.reserved_wholesale_spend_micros=600000
          and (
            select event.event_type='released'
              and event.evidence_json->>'reason'='aggregate_exposure_exhausted'
              and coalesce((event.evidence_json->>'transmitted')::boolean,true)=false
            from tongs.funding_reservation_events event
            where event.reservation_id=reservation.id
            order by event.sequence desc limit 1
          )
      )
      and not exists(select 1 from tongs.runway_submission_boundary_events event where event.operation_id=operation.operation_id)
      and not exists(select 1 from tongs.runway_execution_reconciliation_receipts receipt where receipt.operation_id=operation.operation_id)
      and not exists(select 1 from tongs.assets asset where asset.operation_id=operation.operation_id)
  )
$$;

create or replace function tongs.begin_broll_operation(
  p_workspace_id uuid,p_workpiece_id uuid,p_beat_id uuid,p_operation_type text,
  p_operation_id text,p_operation_fingerprint text,p_inputs jsonb,p_actor_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare
  v_op tongs.broll_operation_receipts%rowtype;
  v_generation_request_id uuid;
begin
  if not tongs.has_workspace_role(p_workspace_id,'editor') then
    raise exception 'workspace editor authority required' using errcode='42501';
  end if;
  if auth.uid() is distinct from p_actor_id then
    raise exception 'operation actor must match authenticated creator' using errcode='42501';
  end if;
  if p_operation_type='candidate_acquire'
     and p_inputs->>'source_kind'='generated'
     and nullif(p_inputs->>'generation_request_id','') is not null then
    begin
      v_generation_request_id:=(p_inputs->>'generation_request_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'invalid generation request identity' using errcode='22023';
    end;
    if not exists(
      select 1 from tongs.broll_generation_attempts attempt
      where attempt.generation_request_id=v_generation_request_id
        and attempt.workspace_id=p_workspace_id and attempt.workpiece_id=p_workpiece_id
        and attempt.beat_id=p_beat_id and attempt.operation_id=p_operation_id
        and attempt.operation_fingerprint=p_operation_fingerprint
        and attempt.initiated_by=p_actor_id
        and attempt.prompt_revision_id=(p_inputs->>'prompt_revision_id')::uuid
        and attempt.prompt_revision=(p_inputs->>'prompt_revision')::bigint
        and attempt.prompt_content_hash=p_inputs->>'prompt_content_hash'
        and attempt.creative_input_hash=p_inputs->>'creative_input_hash'
    ) then
      raise exception 'generation request does not authorize this operation identity' using errcode='42501';
    end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_operation_id,0));
  select * into v_op from tongs.broll_operation_receipts where operation_id=p_operation_id for update;
  if found then
    if v_op.operation_fingerprint<>p_operation_fingerprint
       or v_op.workspace_id<>p_workspace_id or v_op.workpiece_id<>p_workpiece_id
       or v_op.beat_id is distinct from p_beat_id or v_op.operation_type<>p_operation_type then
      return jsonb_build_object('disposition','operation_identity_conflict');
    end if;
    if v_op.state='failed' then
      if tongs._is_terminal_customer_runway_preprovider_failure(v_op.operation_id) then
        return jsonb_build_object(
          'disposition','terminal_failure_replay','operation',to_jsonb(v_op),
          'replacement_allowed',exists(
            select 1 from tongs.broll_generation_replacement_scopes scope
            where scope.original_operation_id=v_op.operation_id
              and scope.user_id=p_actor_id and scope.valid_until>clock_timestamp()
          ),'transmitted',false,'customer_charge_micros',0
        );
      end if;
      update tongs.broll_operation_receipts set
        state=case
          when verified_poster_asset_id is not null then 'poster_asset_verified'
          when verified_asset_id is not null then 'video_asset_verified'
          when provider_response_json is not null then 'provider_or_upload_completed'
          else 'pending' end,
        failed_stage=null,failure_code=null,failure_message=null,updated_at=now()
      where operation_id=p_operation_id returning * into v_op;
    end if;
    return jsonb_build_object('disposition','replay','operation',to_jsonb(v_op));
  end if;
  insert into tongs.broll_operation_receipts(
    operation_id,operation_fingerprint,operation_type,state,workspace_id,
    workpiece_id,beat_id,normalized_inputs_json,created_by
  ) values(
    p_operation_id,p_operation_fingerprint,p_operation_type,'pending',p_workspace_id,
    p_workpiece_id,p_beat_id,p_inputs,p_actor_id
  ) returning * into v_op;
  return jsonb_build_object('disposition','reserved','operation',to_jsonb(v_op));
end $$;

create or replace function tongs.start_customer_runway_generation_attempt(
  p_workspace_id uuid,p_workpiece_id uuid,p_beat_id uuid,
  p_prompt_revision_id uuid,p_prompt_revision bigint,p_prompt_content_hash text,
  p_creative_input_hash text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_actor uuid:=auth.uid();
  v_scope tongs.broll_generation_replacement_scopes%rowtype;
  v_attempt tongs.broll_generation_attempts%rowtype;
  v_original_authorization tongs.runway_customer_test_authorizations%rowtype;
  v_generation_request_id uuid;
  v_authorization_id uuid;
  v_operation_fingerprint text;
  v_operation_id text;
  v_valid_from timestamptz:=clock_timestamp();
  v_valid_until timestamptz;
begin
  if v_actor is null or not tongs.has_workspace_role(p_workspace_id,'editor') then
    raise exception 'workspace editor authority required' using errcode='42501';
  end if;
  if p_prompt_revision_id is null or p_prompt_revision is null or p_prompt_revision<=0
     or p_prompt_content_hash!~'^[0-9a-f]{64}$' or p_creative_input_hash!~'^[0-9a-f]{64}$' then
    raise exception 'invalid generation attempt context' using errcode='22023';
  end if;
  select * into v_scope from tongs.broll_generation_replacement_scopes
  where user_id=v_actor and workspace_id=p_workspace_id and workpiece_id=p_workpiece_id
    and beat_id=p_beat_id and prompt_revision_id=p_prompt_revision_id
    and prompt_revision=p_prompt_revision and prompt_content_hash=lower(p_prompt_content_hash)
    and creative_input_hash=lower(p_creative_input_hash)
  for update;
  if not found then
    raise exception 'no bounded replacement generation authority exists for this exact request' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('broll-generation-replacement:'||v_scope.id::text,0));
  select * into v_attempt from tongs.broll_generation_attempts
  where replacement_scope_id=v_scope.id;
  if found then
    return jsonb_build_object(
      'disposition','generation_attempt_replay','generation_request_id',v_attempt.generation_request_id,
      'attempt_ordinal',v_attempt.attempt_ordinal,'previous_operation_id',v_attempt.previous_operation_id,
      'operation_id',v_attempt.operation_id,'operation_fingerprint',v_attempt.operation_fingerprint,
      'creative_input_hash',v_attempt.creative_input_hash,'prompt_revision_id',v_attempt.prompt_revision_id,
      'prompt_revision',v_attempt.prompt_revision,'prompt_content_hash',v_attempt.prompt_content_hash,
      'replay',true
    );
  end if;
  if v_scope.valid_from>v_valid_from or v_scope.valid_until<=v_valid_from then
    raise exception 'bounded replacement generation authority is not current' using errcode='42501';
  end if;
  if not tongs._is_terminal_customer_runway_preprovider_failure(v_scope.original_operation_id) then
    raise exception 'original generation is not a definitive untransmitted terminal failure' using errcode='42501';
  end if;
  if not exists(
    select 1 from tongs.broll_prompt_sequences sequence
    where sequence.workspace_id=p_workspace_id and sequence.workpiece_id=p_workpiece_id
      and sequence.beat_id=p_beat_id and sequence.current_prompt_revision_id=p_prompt_revision_id
      and sequence.current_prompt_revision=p_prompt_revision
  ) or not exists(
    select 1 from tongs.broll_prompt_revisions prompt
    where prompt.id=p_prompt_revision_id and prompt.workspace_id=p_workspace_id
      and prompt.workpiece_id=p_workpiece_id and prompt.beat_id=p_beat_id
      and prompt.revision=p_prompt_revision and prompt.content_hash=lower(p_prompt_content_hash)
  ) then
    raise exception 'canonical prompt authority changed before replacement attempt' using errcode='55000';
  end if;
  select * into v_original_authorization from tongs.runway_customer_test_authorizations
  where id=v_scope.original_authorization_id;
  if not found or v_original_authorization.user_id<>v_actor
     or v_original_authorization.workspace_id<>p_workspace_id
     or v_original_authorization.operation_id<>v_scope.original_operation_id
     or v_original_authorization.operation_fingerprint<>v_scope.original_operation_fingerprint
     or v_original_authorization.financial_environment<>'test'
     or v_original_authorization.model<>'gen4.5'
     or v_original_authorization.generation_mode<>'text_to_video'
     or v_original_authorization.duration_seconds<>5 or v_original_authorization.ratio<>'1280:720'
     or v_original_authorization.reference_image_count<>0 or v_original_authorization.output_count<>1
     or v_original_authorization.maximum_provider_attempts<>1
     or v_original_authorization.maximum_customer_charge_micros<>800000
     or v_original_authorization.maximum_wholesale_exposure_micros<>600000
     or v_original_authorization.maximum_concurrency<>1 then
    raise exception 'original customer Runway authority does not match replacement scope' using errcode='42501';
  end if;
  v_generation_request_id:=extensions.uuid_generate_v5(v_scope.id,'generation-attempt-2');
  v_operation_fingerprint:=encode(extensions.digest(convert_to(jsonb_build_object(
    'creative_input_hash',v_scope.creative_input_hash,
    'generation_request_id',v_generation_request_id,
    'attempt_ordinal',2,
    'previous_operation_id',v_scope.original_operation_id
  )::text,'utf8'),'sha256'),'hex');
  v_operation_id:='forge:broll:acquire:'||v_operation_fingerprint;
  v_authorization_id:=extensions.uuid_generate_v5(v_generation_request_id,'runway-test-authorization');
  v_valid_until:=least(v_scope.valid_until,v_valid_from+interval '24 hours');
  insert into tongs.broll_generation_attempts(
    generation_request_id,replacement_scope_id,attempt_ordinal,previous_operation_id,
    workspace_id,workpiece_id,beat_id,prompt_revision_id,prompt_revision,
    prompt_content_hash,creative_input_hash,operation_id,operation_fingerprint,initiated_by
  ) values(
    v_generation_request_id,v_scope.id,2,v_scope.original_operation_id,
    p_workspace_id,p_workpiece_id,p_beat_id,p_prompt_revision_id,p_prompt_revision,
    lower(p_prompt_content_hash),lower(p_creative_input_hash),v_operation_id,v_operation_fingerprint,v_actor
  ) returning * into v_attempt;
  insert into tongs.runway_customer_test_authorizations(
    id,user_id,workspace_id,financial_environment,route_code,provider,model,
    generation_mode,duration_seconds,ratio,output_count,reference_image_count,
    maximum_provider_attempts,pricing_revision_id,operation_id,operation_fingerprint,
    maximum_operation_count,maximum_customer_charge_micros,
    maximum_wholesale_exposure_micros,maximum_concurrency,valid_from,valid_until,
    status,reason,created_by,maximum_quote_count
  ) values(
    v_authorization_id,v_actor,p_workspace_id,'test','tongs_broll_v2','runway','gen4.5',
    'text_to_video',5,'1280:720',1,0,1,v_original_authorization.pricing_revision_id,
    v_operation_id,v_operation_fingerprint,1,800000,600000,1,v_valid_from,v_valid_until,
    'active','One explicit replacement for the proven untransmitted terminal customer Test attempt.',
    v_original_authorization.created_by,2
  );
  insert into tongs.paid_execution_aggregate_assignments(
    id,policy_revision_id,user_id,workspace_id,state,valid_from,valid_until,reason
  ) values(
    extensions.uuid_generate_v5(v_authorization_id,'aggregate-assignment'),
    '19730000-0000-4000-8000-000000000005',v_actor,p_workspace_id,'active',
    v_valid_from,v_valid_until,
    'Exact one-operation replacement normal-customer Test Runway Gen-4.5 exposure assignment.'
  );
  return jsonb_build_object(
    'disposition','generation_attempt_started','generation_request_id',v_attempt.generation_request_id,
    'attempt_ordinal',v_attempt.attempt_ordinal,'previous_operation_id',v_attempt.previous_operation_id,
    'operation_id',v_attempt.operation_id,'operation_fingerprint',v_attempt.operation_fingerprint,
    'creative_input_hash',v_attempt.creative_input_hash,'prompt_revision_id',v_attempt.prompt_revision_id,
    'prompt_revision',v_attempt.prompt_revision,'prompt_content_hash',v_attempt.prompt_content_hash,
    'authorization_id',v_authorization_id,'replay',false
  );
end $$;

-- Restore the exact linked canary only when every preserved fact still proves
-- the same untransmitted financial-preflight terminal outcome. The historical
-- submission_attempt_id is intentionally retained as inactive evidence.
do $$
declare
  v_operation constant text:='forge:broll:acquire:9b83645ed2fd1bb4d563f045d57c6a54c485aa300a57071856fdcb39db4bad32';
  v_fingerprint constant text:='9b83645ed2fd1bb4d563f045d57c6a54c485aa300a57071856fdcb39db4bad32';
  v_op tongs.broll_operation_receipts%rowtype;
begin
  select * into v_op from tongs.broll_operation_receipts where operation_id=v_operation for update;
  if not found then return; end if;
  if v_op.operation_fingerprint<>v_fingerprint
     or v_op.workspace_id<>'cc5478ff-37be-403e-824c-467fa7da061e'
     or v_op.workpiece_id<>'21d16d6a-905b-491e-8761-028789612ae5'
     or v_op.beat_id<>'b84e5766-4e73-4b33-b15b-47b3c34b8258'
     or v_op.created_by<>'71daf61b-57b3-4e5f-a8c8-64befecb5950'
     or v_op.submission_attempt_id<>'03c8e49d-4c61-4573-a4ac-24711668e236'
     or v_op.normalized_inputs_json->>'prompt_revision_id'<>'663b328e-b5e9-478e-a530-1bbbb123f3e1'
     or v_op.normalized_inputs_json->>'prompt_content_hash'<>'142910a1e925630cb7458c1b9c3a71eee709c99f337f5f50e03041ad878b1e7a'
     or v_op.provider_task_id is not null or v_op.provider_response_json is not null
     or v_op.provider_submission_json is not null or v_op.verified_asset_id is not null
     or v_op.verified_poster_asset_id is not null or v_op.result_candidate_revision_id is not null
     or exists(select 1 from tongs.runway_submission_boundary_events where operation_id=v_operation)
     or exists(select 1 from tongs.runway_execution_reconciliation_receipts where operation_id=v_operation)
     or exists(select 1 from tongs.assets where operation_id=v_operation) then
    raise exception 'exact Runway canary no longer matches safe re-terminalization evidence';
  end if;
  if not exists(
    select 1 from tongs.runway_funding_bindings binding
    join tongs.funding_reservations reservation on reservation.id=binding.reservation_id
    where binding.operation_id=v_operation and binding.operation_fingerprint=v_fingerprint
      and reservation.id='83ad78a6-9995-44d8-afdf-fd66daa6395b'
      and reservation.reserved_customer_charge_micros=800000
      and reservation.reserved_credit_units=160
      and reservation.reserved_wholesale_spend_micros=600000
      and reservation.funding_environment='test'
      and (select event.event_type='released'
            and event.evidence_json->>'reason'='aggregate_exposure_exhausted'
            and coalesce((event.evidence_json->>'transmitted')::boolean,true)=false
           from tongs.funding_reservation_events event
           where event.reservation_id=reservation.id order by event.sequence desc limit 1)
  ) then raise exception 'exact released Runway reservation evidence is missing'; end if;
  if v_op.state not in('pending','failed') then
    raise exception 'exact Runway canary is not in the expected replay-damaged or terminal state';
  end if;
  if v_op.state='pending' then
    update tongs.broll_operation_receipts set
      state='failed',failed_stage='runway_financial_preflight',
      failure_code='runway_funding_required',
      failure_message='Aggregate Test exposure was unavailable. The reservation was released before Runway was called.',
      updated_at=clock_timestamp()
    where operation_id=v_operation;
  end if;
end $$;

-- The entitlement is linked-data-only. Clean replay creates the authority
-- shape without inventing a customer, operation, or replacement.
insert into tongs.broll_generation_replacement_scopes(
  id,original_authorization_id,user_id,workspace_id,workpiece_id,beat_id,
  prompt_revision_id,prompt_revision,prompt_content_hash,creative_input_hash,
  original_operation_id,original_operation_fingerprint,original_submission_attempt_id,
  financial_environment,model,generation_mode,duration_seconds,ratio,
  reference_image_count,output_count,maximum_replacement_attempts,
  maximum_provider_attempts,maximum_customer_charge_micros,
  maximum_wholesale_exposure_micros,maximum_concurrency,
  customer_failure_charge_micros,valid_from,valid_until,reason,created_by
)
select
  '19770000-0000-4000-8000-000000000001',authz.id,authz.user_id,
  authz.workspace_id,operation.workpiece_id,operation.beat_id,
  '663b328e-b5e9-478e-a530-1bbbb123f3e1',1,
  '142910a1e925630cb7458c1b9c3a71eee709c99f337f5f50e03041ad878b1e7a',
  operation.operation_fingerprint,operation.operation_id,operation.operation_fingerprint,
  operation.submission_attempt_id,'test','gen4.5','text_to_video',5,'1280:720',
  0,1,1,1,800000,600000,1,0,clock_timestamp(),clock_timestamp()+interval '24 hours',
  'One explicit replacement after the exact original customer Test attempt ended before Runway was called.',
  authz.created_by
from tongs.runway_customer_test_authorizations authz
join tongs.broll_operation_receipts operation on operation.operation_id=authz.operation_id
where authz.id='19730000-0000-4000-8000-000000000007'
  and operation.operation_id='forge:broll:acquire:9b83645ed2fd1bb4d563f045d57c6a54c485aa300a57071856fdcb39db4bad32'
  and operation.operation_fingerprint='9b83645ed2fd1bb4d563f045d57c6a54c485aa300a57071856fdcb39db4bad32'
  and operation.state='failed'
  and tongs._is_terminal_customer_runway_preprovider_failure(operation.operation_id);

revoke all on function tongs._is_terminal_customer_runway_preprovider_failure(text) from public,anon,authenticated,service_role;
revoke all on function tongs.begin_broll_operation(uuid,uuid,uuid,text,text,text,jsonb,uuid) from public,anon;
grant execute on function tongs.begin_broll_operation(uuid,uuid,uuid,text,text,text,jsonb,uuid) to authenticated,service_role;
revoke all on function tongs.start_customer_runway_generation_attempt(uuid,uuid,uuid,uuid,bigint,text,text) from public,anon;
grant execute on function tongs.start_customer_runway_generation_attempt(uuid,uuid,uuid,uuid,bigint,text,text) to authenticated;

do $$
declare
  v_operation constant text:='forge:broll:acquire:9b83645ed2fd1bb4d563f045d57c6a54c485aa300a57071856fdcb39db4bad32';
begin
  if exists(select 1 from tongs.broll_operation_receipts where operation_id=v_operation)
     and (not tongs._is_terminal_customer_runway_preprovider_failure(v_operation)
       or not exists(select 1 from tongs.broll_operation_receipts
         where operation_id=v_operation and submission_attempt_id='03c8e49d-4c61-4573-a4ac-24711668e236')) then
    raise exception 'linked Runway canary terminal replay proof failed';
  end if;
  if has_table_privilege('public','tongs.broll_generation_attempts','select')
     or has_table_privilege('anon','tongs.broll_generation_attempts','select')
     or has_table_privilege('authenticated','tongs.broll_generation_attempts','select,insert,update,delete')
     or has_table_privilege('authenticated','tongs.broll_generation_replacement_scopes','select,insert,update,delete')
     or not has_table_privilege('service_role','tongs.broll_generation_attempts','select') then
    raise exception 'generation-attempt table privilege mismatch';
  end if;
  if has_function_privilege('public','tongs.start_customer_runway_generation_attempt(uuid,uuid,uuid,uuid,bigint,text,text)','execute')
     or has_function_privilege('anon','tongs.start_customer_runway_generation_attempt(uuid,uuid,uuid,uuid,bigint,text,text)','execute')
     or not has_function_privilege('authenticated','tongs.start_customer_runway_generation_attempt(uuid,uuid,uuid,uuid,bigint,text,text)','execute') then
    raise exception 'generation-attempt function privilege mismatch';
  end if;
  if not (select relrowsecurity and relforcerowsecurity from pg_class where oid='tongs.broll_generation_attempts'::regclass)
     or not (select relrowsecurity and relforcerowsecurity from pg_class where oid='tongs.broll_generation_replacement_scopes'::regclass) then
    raise exception 'generation-attempt RLS mismatch';
  end if;
  if (select lifecycle_state from tongs.financial_environment_configuration_revisions
      where environment='live' order by revision desc limit 1)<>'inactive_ready' then
    raise exception 'Live changed during terminal replay repair';
  end if;
end $$;

comment on function tongs.start_customer_runway_generation_attempt(uuid,uuid,uuid,uuid,bigint,text,text) is
  'Creator-initiated, idempotent creation of the single exact normal-customer Test Runway replacement identity. Creates no quote, reservation, acceptance, debit, or provider call.';

notify pgrst,'reload schema';
commit;
