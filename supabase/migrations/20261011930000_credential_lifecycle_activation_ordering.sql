-- Make lifecycle activation evidence authoritative for credential selection.
-- replacement_active describes the old record's replacement state; only a
-- planned -> active transition activates the credential represented by a row.
begin;

do $$
declare
  v_missing text;
begin
  select string_agg(r.credential_id::text, ', ' order by r.credential_id)
    into v_missing
  from tongs.credential_lifecycle_records r
  where r.lifecycle_status in ('active', 'rotation_due')
    and r.activated_at is null
    and not exists (
      select 1
      from tongs.credential_lifecycle_events e
      where e.credential_id = r.credential_id
        and e.from_status = 'planned'
        and e.to_status = 'active'
        and e.event_type = 'status_transition'
    );

  if v_missing is not null then
    raise exception 'active credential lifecycle records lack canonical activation events: %', v_missing
      using errcode = '23514';
  end if;
end;
$$;

with canonical_activation as (
  select e.credential_id, min(e.occurred_at) as activated_at
  from tongs.credential_lifecycle_events e
  join tongs.credential_lifecycle_records r
    on r.credential_id = e.credential_id
  where r.lifecycle_status in ('active', 'rotation_due')
    and r.activated_at is null
    and e.from_status = 'planned'
    and e.to_status = 'active'
    and e.event_type = 'status_transition'
  group by e.credential_id
)
update tongs.credential_lifecycle_records r
set activated_at = a.activated_at
from canonical_activation a
where r.credential_id = a.credential_id
  and r.activated_at is null;

do $$
begin
  if exists (
    select 1
    from tongs.credential_lifecycle_records
    where lifecycle_status in ('active', 'rotation_due')
      and activated_at is null
  ) then
    raise exception 'credential activation backfill left usable records without activation timestamps'
      using errcode = '23514';
  end if;
end;
$$;

create or replace function tongs.transition_credential_lifecycle(
  p_credential_id uuid,
  p_expected_status text,
  p_new_status text,
  p_replacement_credential_id uuid,
  p_revocation_confirmed_at timestamptz,
  p_verification_json jsonb,
  p_actor_id uuid,
  p_event_key text,
  p_occurred_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_row tongs.credential_lifecycle_records%rowtype;
  v_replacement tongs.credential_lifecycle_records%rowtype;
  v_sequence integer;
  v_event_type text := 'status_transition';
  v_evidence jsonb := coalesce(p_verification_json, '{}'::jsonb);
  v_now timestamptz := coalesce(p_occurred_at, transaction_timestamp());
  v_allowed boolean := false;
begin
  perform tongs._require_credential_lifecycle_writer();
  if p_actor_id is null or not tongs.is_platform_operator(p_actor_id)
     or p_event_key is null or not tongs._credential_lifecycle_metadata_safe(v_evidence) then
    raise exception 'invalid credential lifecycle transition' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('credential-lifecycle:'||p_credential_id::text, 0));
  select * into v_row from tongs.credential_lifecycle_records where credential_id=p_credential_id for update;
  if not found then raise exception 'credential lifecycle record not found' using errcode='P0002'; end if;
  if v_row.lifecycle_status <> p_expected_status then
    raise exception 'credential lifecycle status conflict' using errcode='40001';
  end if;
  v_allowed := case v_row.lifecycle_status
    when 'planned' then p_new_status in ('active','disabled')
    when 'active' then p_new_status in ('rotation_due','replacement_ready','expired','disabled')
    when 'rotation_due' then p_new_status in ('replacement_ready','expired','disabled')
    when 'replacement_ready' then p_new_status in ('replacement_active','expired','disabled')
    when 'replacement_active' then p_new_status in ('revocation_pending','disabled')
    when 'revocation_pending' then p_new_status in ('revoked','disabled')
    when 'expired' then p_new_status in ('replacement_ready','disabled')
    else false end;
  if not v_allowed then raise exception 'invalid credential lifecycle transition' using errcode='22023'; end if;

  if p_new_status in ('replacement_ready','replacement_active','revocation_pending') then
    if p_replacement_credential_id is null then
      raise exception 'replacement credential required' using errcode='22023';
    end if;
    select * into v_replacement from tongs.credential_lifecycle_records
      where credential_id=p_replacement_credential_id;
    if not found or v_replacement.credential_id=v_row.credential_id
       or v_replacement.provider<>v_row.provider
       or v_replacement.configuration_variable_name<>v_row.configuration_variable_name
       or v_replacement.financial_environment<>v_row.financial_environment
       or v_replacement.runtime_environment<>v_row.runtime_environment then
      raise exception 'replacement credential authority mismatch' using errcode='23514';
    end if;
    v_event_type := 'replacement_linked';
  end if;
  if p_new_status='revoked' and p_revocation_confirmed_at is null then
    raise exception 'revocation confirmation required' using errcode='22023';
  end if;
  if p_new_status='revoked' then v_event_type := 'revocation_confirmed'; end if;

  select coalesce(max(event_sequence),0)+1 into v_sequence
    from tongs.credential_lifecycle_events where credential_id=p_credential_id;
  update tongs.credential_lifecycle_records set
    lifecycle_status=p_new_status,
    activated_at=case
      when p_expected_status='planned' and p_new_status='active'
        then coalesce(activated_at,v_now)
      else activated_at
    end,
    replacement_credential_id=coalesce(p_replacement_credential_id,replacement_credential_id),
    revocation_required=case when p_new_status in ('replacement_active','revocation_pending','revoked') then true else revocation_required end,
    revocation_confirmed_at=case when p_new_status='revoked' then p_revocation_confirmed_at else revocation_confirmed_at end,
    last_verification_at=v_now,
    config_presence_verified_at=case when coalesce((v_evidence->>'config_presence_verified')::boolean,false) then v_now else config_presence_verified_at end,
    route_configuration_verified_at=case when coalesce((v_evidence->>'route_configuration_verified')::boolean,false) then v_now else route_configuration_verified_at end,
    non_paid_readiness_verified_at=case when coalesce((v_evidence->>'non_paid_readiness_verified')::boolean,false) then v_now else non_paid_readiness_verified_at end,
    bounded_smoke_performed_at=case when coalesce((v_evidence->>'bounded_smoke_performed')::boolean,false) then v_now else bounded_smoke_performed_at end,
    smoke_operation_id=coalesce(nullif(v_evidence->>'smoke_operation_id',''),smoke_operation_id),
    updated_at=v_now
  where credential_id=p_credential_id returning * into v_row;
  insert into tongs.credential_lifecycle_events(
    event_id,credential_id,event_sequence,event_key,from_status,to_status,event_type,actor_id,evidence_json,occurred_at
  ) values (
    gen_random_uuid(),p_credential_id,v_sequence,btrim(p_event_key),p_expected_status,p_new_status,
    v_event_type,p_actor_id,v_evidence,v_now
  );
  return to_jsonb(v_row) - 'credential_identity_hash';
end;
$$;

create or replace function tongs.read_credential_lifecycle_execution_gate(
  p_configuration_variable_name text,
  p_financial_environment text,
  p_runtime_environment text
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_row tongs.credential_lifecycle_records%rowtype;
  v_allowed boolean;
begin
  perform tongs._require_credential_lifecycle_writer();
  select * into v_row from tongs.credential_lifecycle_records
  where configuration_variable_name=btrim(p_configuration_variable_name)
    and financial_environment=p_financial_environment
    and runtime_environment=p_runtime_environment
  order by
    case
      when lifecycle_status in ('active','rotation_due')
       and activated_at is not null
       and (expires_at is null or expires_at > statement_timestamp()) then 0
      else 1
    end,
    activated_at desc nulls last,
    credential_id desc
  limit 1;
  if not found then
    return jsonb_build_object('tracked',false,'allowed',true,'status','untracked');
  end if;
  v_allowed := v_row.lifecycle_status in ('active','rotation_due')
    and v_row.activated_at is not null
    and (v_row.expires_at is null or v_row.expires_at > statement_timestamp());
  return jsonb_build_object(
    'tracked',true,
    'allowed',v_allowed,
    'status',v_row.lifecycle_status,
    'credential_id',v_row.credential_id,
    'expires_at',v_row.expires_at,
    'rotation_due_at',v_row.rotation_due_at
  );
end;
$$;

revoke all on function tongs.transition_credential_lifecycle(uuid,text,text,uuid,timestamptz,jsonb,uuid,text,timestamptz)
  from public,anon,authenticated;
revoke all on function tongs.read_credential_lifecycle_execution_gate(text,text,text)
  from public,anon,authenticated;
grant execute on function tongs.transition_credential_lifecycle(uuid,text,text,uuid,timestamptz,jsonb,uuid,text,timestamptz)
  to service_role;
grant execute on function tongs.read_credential_lifecycle_execution_gate(text,text,text)
  to service_role;

commit;
