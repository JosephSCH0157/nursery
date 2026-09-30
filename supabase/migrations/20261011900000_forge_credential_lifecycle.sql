-- Private, value-free lifecycle authority for infrastructure/provider credentials.
-- Raw credentials remain exclusively in the provider and canonical secret manager.
begin;

create or replace function tongs._credential_lifecycle_metadata_safe(p_value jsonb)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_key text;
  v_child jsonb;
  v_text text;
begin
  if p_value is null then return true; end if;
  case jsonb_typeof(p_value)
    when 'object' then
      for v_key, v_child in select key, value from jsonb_each(p_value) loop
        if lower(v_key) ~ '(secret|password|private[_-]?key|api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|credential[_-]?value)' then
          return false;
        end if;
        if not tongs._credential_lifecycle_metadata_safe(v_child) then return false; end if;
      end loop;
    when 'array' then
      for v_child in select value from jsonb_array_elements(p_value) loop
        if not tongs._credential_lifecycle_metadata_safe(v_child) then return false; end if;
      end loop;
    when 'string' then
      v_text := p_value #>> '{}';
      if v_text ~* '^(bearer\s+|sk[-_]|rk[-_]|eyJ[a-zA-Z0-9_-]{12,}\.)'
         or v_text ~ '^[A-Za-z0-9_+/=-]{80,}$' then
        return false;
      end if;
    else null;
  end case;
  return true;
end;
$$;

create table tongs.credential_lifecycle_records (
  credential_id uuid primary key,
  provider text not null check (length(btrim(provider)) between 2 and 80),
  credential_purpose text not null check (length(btrim(credential_purpose)) between 3 and 200),
  configuration_variable_name text not null check (configuration_variable_name ~ '^[A-Z][A-Z0-9_]{2,127}$'),
  affected_capability text not null check (length(btrim(affected_capability)) between 3 and 200),
  financial_environment text not null check (financial_environment in ('live','test')),
  runtime_environment text not null check (runtime_environment in ('production','preview','development')),
  credential_identity_hash text check (credential_identity_hash is null or credential_identity_hash ~ '^[0-9a-f]{64}$'),
  provider_created_at timestamptz,
  activated_at timestamptz,
  expires_at timestamptz,
  rotation_lead interval not null default interval '7 days' check (rotation_lead > interval '0 seconds'),
  rotation_due_at timestamptz,
  lifecycle_status text not null check (lifecycle_status in (
    'planned','active','rotation_due','replacement_ready','replacement_active',
    'revocation_pending','revoked','expired','disabled'
  )),
  replacement_credential_id uuid references tongs.credential_lifecycle_records(credential_id) on delete restrict,
  activation_deployment_id text,
  activation_deployment_sha text check (activation_deployment_sha is null or activation_deployment_sha ~ '^[0-9a-f]{7,64}$'),
  last_verification_at timestamptz,
  config_presence_verified_at timestamptz,
  route_configuration_verified_at timestamptz,
  non_paid_readiness_verified_at timestamptz,
  bounded_smoke_performed_at timestamptz,
  smoke_operation_id text,
  revocation_required boolean not null default false,
  revocation_confirmed_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata_json) = 'object' and tongs._credential_lifecycle_metadata_safe(metadata_json)),
  created_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (financial_environment, runtime_environment, configuration_variable_name, credential_identity_hash),
  check (replacement_credential_id is null or replacement_credential_id <> credential_id),
  check (expires_at is null or provider_created_at is null or expires_at > provider_created_at),
  check ((expires_at is null and rotation_due_at is null) or
         (expires_at is not null and rotation_due_at = expires_at - rotation_lead)),
  check (revocation_confirmed_at is null or revocation_required),
  check (lifecycle_status <> 'revoked' or revocation_confirmed_at is not null)
);

create index credential_lifecycle_deadline_idx
  on tongs.credential_lifecycle_records(runtime_environment, financial_environment, rotation_due_at)
  where lifecycle_status not in ('revoked','disabled');
create index credential_lifecycle_status_idx
  on tongs.credential_lifecycle_records(lifecycle_status, expires_at);
create index credential_lifecycle_replacement_idx
  on tongs.credential_lifecycle_records(replacement_credential_id)
  where replacement_credential_id is not null;
create index credential_lifecycle_created_by_idx
  on tongs.credential_lifecycle_records(created_by)
  where created_by is not null;

create table tongs.credential_lifecycle_events (
  event_id uuid primary key,
  credential_id uuid not null references tongs.credential_lifecycle_records(credential_id) on delete restrict,
  event_sequence integer not null check (event_sequence > 0),
  event_key text not null unique check (length(btrim(event_key)) between 8 and 300),
  from_status text,
  to_status text not null check (to_status in (
    'planned','active','rotation_due','replacement_ready','replacement_active',
    'revocation_pending','revoked','expired','disabled'
  )),
  event_type text not null check (event_type in (
    'registered','status_transition','verification_recorded','deadline_recorded','deadline_reached',
    'replacement_linked','revocation_confirmed'
  )),
  actor_id uuid references auth.users(id) on delete restrict,
  evidence_json jsonb not null default '{}'::jsonb
    check (jsonb_typeof(evidence_json) = 'object' and tongs._credential_lifecycle_metadata_safe(evidence_json)),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (credential_id, event_sequence)
);
create index credential_lifecycle_events_credential_idx
  on tongs.credential_lifecycle_events(credential_id, event_sequence desc);

create table tongs.credential_lifecycle_alerts (
  alert_id uuid primary key,
  credential_id uuid not null references tongs.credential_lifecycle_records(credential_id) on delete restrict,
  alert_key text not null unique,
  urgency text not null check (urgency in ('warning','urgent','critical','expired')),
  provider text not null,
  credential_purpose text not null,
  configuration_variable_name text not null,
  affected_capability text not null,
  deadline_at timestamptz not null,
  recommended_action text not null,
  created_at timestamptz not null default now(),
  unique (credential_id, urgency, deadline_at)
);
create index credential_lifecycle_alerts_deadline_idx
  on tongs.credential_lifecycle_alerts(urgency, deadline_at, created_at desc);

create trigger credential_lifecycle_events_immutable
before update or delete on tongs.credential_lifecycle_events
for each row execute function tongs._reject_accounting_mutation();
create trigger credential_lifecycle_alerts_immutable
before update or delete on tongs.credential_lifecycle_alerts
for each row execute function tongs._reject_accounting_mutation();

alter table tongs.credential_lifecycle_records enable row level security;
alter table tongs.credential_lifecycle_records force row level security;
alter table tongs.credential_lifecycle_events enable row level security;
alter table tongs.credential_lifecycle_events force row level security;
alter table tongs.credential_lifecycle_alerts enable row level security;
alter table tongs.credential_lifecycle_alerts force row level security;

revoke all on tongs.credential_lifecycle_records,
  tongs.credential_lifecycle_events,
  tongs.credential_lifecycle_alerts
from public, anon, authenticated, service_role;
grant select on tongs.credential_lifecycle_records,
  tongs.credential_lifecycle_events,
  tongs.credential_lifecycle_alerts
to service_role;

create or replace function tongs._require_credential_lifecycle_reader()
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare v_actor uuid := auth.uid();
begin
  if coalesce(current_setting('request.jwt.claim.role', true),'') <> 'service_role'
     and (v_actor is null or not tongs.is_platform_operator(v_actor)) then
    raise exception 'platform operator required' using errcode = '42501';
  end if;
end;
$$;

create or replace function tongs.set_credential_lifecycle_deadline(
  p_credential_id uuid,
  p_expires_at timestamptz,
  p_rotation_lead interval,
  p_evidence_json jsonb,
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
  v_sequence integer;
  v_lead interval := coalesce(p_rotation_lead, interval '7 days');
  v_evidence jsonb := coalesce(p_evidence_json,'{}'::jsonb);
  v_now timestamptz := coalesce(p_occurred_at,transaction_timestamp());
begin
  perform tongs._require_credential_lifecycle_writer();
  if p_expires_at is null or p_expires_at<=v_now or v_lead<=interval '0 seconds'
     or p_event_key is null or p_actor_id is null or not tongs.is_platform_operator(p_actor_id)
     or not tongs._credential_lifecycle_metadata_safe(v_evidence) then
    raise exception 'invalid credential lifecycle deadline' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('credential-lifecycle:'||p_credential_id::text,0));
  select * into v_row from tongs.credential_lifecycle_records where credential_id=p_credential_id for update;
  if not found then raise exception 'credential lifecycle record not found' using errcode='P0002'; end if;
  if v_row.lifecycle_status in ('revoked','disabled') then
    raise exception 'terminal credential deadline cannot change' using errcode='22023';
  end if;
  select coalesce(max(event_sequence),0)+1 into v_sequence
    from tongs.credential_lifecycle_events where credential_id=p_credential_id;
  update tongs.credential_lifecycle_records set
    expires_at=p_expires_at,rotation_lead=v_lead,rotation_due_at=p_expires_at-v_lead,
    updated_at=v_now
  where credential_id=p_credential_id returning * into v_row;
  insert into tongs.credential_lifecycle_events(
    event_id,credential_id,event_sequence,event_key,from_status,to_status,event_type,actor_id,evidence_json,occurred_at
  ) values (
    gen_random_uuid(),p_credential_id,v_sequence,btrim(p_event_key),v_row.lifecycle_status,
    v_row.lifecycle_status,'deadline_recorded',p_actor_id,
    v_evidence||jsonb_build_object('expires_at',p_expires_at,'rotation_lead_seconds',extract(epoch from v_lead)),v_now
  );
  return to_jsonb(v_row)-'credential_identity_hash';
end;
$$;

create or replace function tongs.record_credential_lifecycle_verification(
  p_credential_id uuid,
  p_verification_json jsonb,
  p_activation_deployment_id text,
  p_activation_deployment_sha text,
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
  v_sequence integer;
  v_evidence jsonb:=coalesce(p_verification_json,'{}'::jsonb);
  v_now timestamptz:=coalesce(p_occurred_at,transaction_timestamp());
begin
  perform tongs._require_credential_lifecycle_writer();
  if p_actor_id is null or not tongs.is_platform_operator(p_actor_id) or p_event_key is null
     or not tongs._credential_lifecycle_metadata_safe(v_evidence) then
    raise exception 'invalid credential lifecycle verification' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('credential-lifecycle:'||p_credential_id::text,0));
  select * into v_row from tongs.credential_lifecycle_records where credential_id=p_credential_id for update;
  if not found then raise exception 'credential lifecycle record not found' using errcode='P0002'; end if;
  select coalesce(max(event_sequence),0)+1 into v_sequence
    from tongs.credential_lifecycle_events where credential_id=p_credential_id;
  update tongs.credential_lifecycle_records set
    activation_deployment_id=coalesce(nullif(btrim(coalesce(p_activation_deployment_id,'')),''),activation_deployment_id),
    activation_deployment_sha=coalesce(lower(nullif(btrim(coalesce(p_activation_deployment_sha,'')),'')),activation_deployment_sha),
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
    gen_random_uuid(),p_credential_id,v_sequence,btrim(p_event_key),v_row.lifecycle_status,
    v_row.lifecycle_status,'verification_recorded',p_actor_id,v_evidence,v_now
  );
  return to_jsonb(v_row)-'credential_identity_hash';
end;
$$;

create or replace function tongs._require_credential_lifecycle_writer()
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
begin
  if coalesce(current_setting('request.jwt.claim.role', true),'') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
end;
$$;

create or replace function tongs.register_credential_lifecycle(
  p_credential_id uuid,
  p_provider text,
  p_credential_purpose text,
  p_configuration_variable_name text,
  p_affected_capability text,
  p_financial_environment text,
  p_runtime_environment text,
  p_credential_identity_hash text,
  p_provider_created_at timestamptz,
  p_activated_at timestamptz,
  p_expires_at timestamptz,
  p_rotation_lead interval,
  p_lifecycle_status text,
  p_activation_deployment_id text,
  p_activation_deployment_sha text,
  p_verification_json jsonb,
  p_metadata_json jsonb,
  p_actor_id uuid,
  p_event_key text,
  p_occurred_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_existing tongs.credential_lifecycle_records%rowtype;
  v_lead interval := coalesce(p_rotation_lead, interval '7 days');
  v_metadata jsonb := coalesce(p_metadata_json, '{}'::jsonb);
  v_verification jsonb := coalesce(p_verification_json, '{}'::jsonb);
  v_rotation_due timestamptz := case when p_expires_at is null then null else p_expires_at - v_lead end;
  v_now timestamptz := coalesce(p_occurred_at, transaction_timestamp());
begin
  perform tongs._require_credential_lifecycle_writer();
  if p_credential_id is null or p_provider is null or p_credential_purpose is null
     or p_configuration_variable_name is null or p_affected_capability is null
     or p_actor_id is null or not tongs.is_platform_operator(p_actor_id)
     or p_event_key is null or not tongs._credential_lifecycle_metadata_safe(v_metadata)
     or not tongs._credential_lifecycle_metadata_safe(v_verification) then
    raise exception 'invalid credential lifecycle registration' using errcode = '22023';
  end if;
  if p_lifecycle_status not in ('planned','active') then
    raise exception 'credential registration status must be planned or active' using errcode = '22023';
  end if;
  if p_expires_at is not null and p_expires_at <= v_now then
    raise exception 'new credential expiration must be in the future' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('credential-lifecycle:'||p_credential_id::text, 0));
  select * into v_existing from tongs.credential_lifecycle_records where credential_id = p_credential_id;
  if found then
    if v_existing.provider <> btrim(p_provider)
       or v_existing.credential_purpose <> btrim(p_credential_purpose)
       or v_existing.configuration_variable_name <> btrim(p_configuration_variable_name)
       or v_existing.credential_identity_hash is distinct from lower(p_credential_identity_hash)
       or v_existing.expires_at is distinct from p_expires_at then
      raise exception 'credential lifecycle registration conflict' using errcode = '23505';
    end if;
    return to_jsonb(v_existing) - 'credential_identity_hash' || jsonb_build_object('replay', true);
  end if;

  insert into tongs.credential_lifecycle_records(
    credential_id,provider,credential_purpose,configuration_variable_name,affected_capability,
    financial_environment,runtime_environment,credential_identity_hash,provider_created_at,
    activated_at,expires_at,rotation_lead,rotation_due_at,lifecycle_status,
    activation_deployment_id,activation_deployment_sha,last_verification_at,
    config_presence_verified_at,route_configuration_verified_at,
    non_paid_readiness_verified_at,bounded_smoke_performed_at,smoke_operation_id,
    metadata_json,created_by,created_at,updated_at
  ) values (
    p_credential_id,btrim(p_provider),btrim(p_credential_purpose),btrim(p_configuration_variable_name),
    btrim(p_affected_capability),p_financial_environment,p_runtime_environment,
    lower(p_credential_identity_hash),p_provider_created_at,p_activated_at,p_expires_at,v_lead,
    v_rotation_due,p_lifecycle_status,nullif(btrim(coalesce(p_activation_deployment_id,'')),''),
    lower(nullif(btrim(coalesce(p_activation_deployment_sha,'')),'')),v_now,
    case when coalesce((v_verification->>'config_presence_verified')::boolean,false) then v_now end,
    case when coalesce((v_verification->>'route_configuration_verified')::boolean,false) then v_now end,
    case when coalesce((v_verification->>'non_paid_readiness_verified')::boolean,false) then v_now end,
    case when coalesce((v_verification->>'bounded_smoke_performed')::boolean,false) then v_now end,
    nullif(v_verification->>'smoke_operation_id',''),v_metadata,p_actor_id,v_now,v_now
  ) returning * into v_existing;
  insert into tongs.credential_lifecycle_events(
    event_id,credential_id,event_sequence,event_key,from_status,to_status,event_type,actor_id,evidence_json,occurred_at
  ) values (
    gen_random_uuid(),p_credential_id,1,btrim(p_event_key),null,p_lifecycle_status,
    'registered',p_actor_id,v_verification,v_now
  );
  return to_jsonb(v_existing) - 'credential_identity_hash' || jsonb_build_object('replay', false);
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

create or replace function tongs.refresh_credential_lifecycle_alerts(
  p_as_of timestamptz,
  p_actor_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_row tongs.credential_lifecycle_records%rowtype;
  v_target text;
  v_urgency text;
  v_sequence integer;
  v_created integer := 0;
  v_transitioned integer := 0;
  v_now timestamptz := coalesce(p_as_of, transaction_timestamp());
begin
  perform tongs._require_credential_lifecycle_writer();
  if p_actor_id is null or not tongs.is_platform_operator(p_actor_id) then
    raise exception 'platform operator required' using errcode='42501';
  end if;
  for v_row in
    select * from tongs.credential_lifecycle_records
    where expires_at is not null and lifecycle_status not in ('revoked','disabled')
    order by credential_id for update
  loop
    v_target := case
      when v_now >= v_row.expires_at then 'expired'
      when v_now >= v_row.rotation_due_at and v_row.lifecycle_status='active' then 'rotation_due'
      else v_row.lifecycle_status end;
    if v_target <> v_row.lifecycle_status then
      select coalesce(max(event_sequence),0)+1 into v_sequence
        from tongs.credential_lifecycle_events where credential_id=v_row.credential_id;
      update tongs.credential_lifecycle_records set lifecycle_status=v_target,updated_at=v_now
        where credential_id=v_row.credential_id;
      insert into tongs.credential_lifecycle_events(
        event_id,credential_id,event_sequence,event_key,from_status,to_status,event_type,actor_id,evidence_json,occurred_at
      ) values (
        gen_random_uuid(),v_row.credential_id,v_sequence,
        'deadline:'||v_row.credential_id::text||':'||v_target||':'||extract(epoch from v_row.expires_at)::bigint,
        v_row.lifecycle_status,v_target,'deadline_reached',p_actor_id,
        jsonb_build_object('deadline_at',v_row.expires_at,'evaluated_at',v_now),v_now
      );
      v_transitioned := v_transitioned + 1;
    end if;
    v_urgency := case
      when v_now >= v_row.expires_at then 'expired'
      when v_row.expires_at-v_now <= interval '1 day' then 'critical'
      when v_row.expires_at-v_now <= interval '3 days' then 'urgent'
      when v_now >= v_row.rotation_due_at then 'warning'
      else null end;
    if v_urgency is not null then
      insert into tongs.credential_lifecycle_alerts(
        alert_id,credential_id,alert_key,urgency,provider,credential_purpose,
        configuration_variable_name,affected_capability,deadline_at,recommended_action,created_at
      ) values (
        gen_random_uuid(),v_row.credential_id,
        'credential-alert:'||v_row.credential_id::text||':'||v_urgency||':'||extract(epoch from v_row.expires_at)::bigint,
        v_urgency,v_row.provider,v_row.credential_purpose,v_row.configuration_variable_name,
        v_row.affected_capability,v_row.expires_at,
        case when v_urgency='expired'
          then 'Credential expired. Keep the capability fail-closed; provision and verify a replacement before use.'
          else 'Create a replacement at the provider, update the canonical production variable, verify isolation and readiness, then revoke the old credential.' end,
        v_now
      ) on conflict (credential_id,urgency,deadline_at) do nothing;
      if found then v_created := v_created + 1; end if;
    end if;
  end loop;
  return jsonb_build_object('evaluated_at',v_now,'records_transitioned',v_transitioned,'alerts_created',v_created);
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
declare v_row tongs.credential_lifecycle_records%rowtype;
begin
  perform tongs._require_credential_lifecycle_writer();
  select * into v_row from tongs.credential_lifecycle_records
  where configuration_variable_name=btrim(p_configuration_variable_name)
    and financial_environment=p_financial_environment
    and runtime_environment=p_runtime_environment
  order by activated_at desc nulls last, created_at desc limit 1;
  if not found then
    return jsonb_build_object('tracked',false,'allowed',true,'status','untracked');
  end if;
  return jsonb_build_object(
    'tracked',true,
    'allowed',v_row.lifecycle_status in ('active','rotation_due'),
    'status',v_row.lifecycle_status,
    'credential_id',v_row.credential_id,
    'expires_at',v_row.expires_at,
    'rotation_due_at',v_row.rotation_due_at
  );
end;
$$;

create or replace function tongs.read_credential_lifecycle_report(
  p_as_of timestamptz default now(),
  p_only_actionable boolean default false
) returns setof jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
begin
  perform tongs._require_credential_lifecycle_reader();
  return query
  select jsonb_build_object(
    'credential_id',record.credential_id,
    'provider',record.provider,
    'purpose',record.credential_purpose,
    'configuration_variable_name',record.configuration_variable_name,
    'affected_capability',record.affected_capability,
    'financial_environment',record.financial_environment,
    'runtime_environment',record.runtime_environment,
    'status',record.lifecycle_status,
    'activated_at',record.activated_at,
    'expires_at',record.expires_at,
    'rotation_due_at',record.rotation_due_at,
    'days_remaining',case when record.expires_at is null then null else ceil(extract(epoch from (record.expires_at-coalesce(p_as_of,now())))/86400.0)::integer end,
    'urgency',case when record.expires_at is null then null
      when coalesce(p_as_of,now())>=record.expires_at then 'expired'
      when record.expires_at-coalesce(p_as_of,now())<=interval '1 day' then 'critical'
      when record.expires_at-coalesce(p_as_of,now())<=interval '3 days' then 'urgent'
      when coalesce(p_as_of,now())>=record.rotation_due_at then 'warning' else null end,
    'replacement_credential_id',record.replacement_credential_id,
    'revocation_required',record.revocation_required,
    'revocation_confirmed_at',record.revocation_confirmed_at,
    'activation_deployment_id',record.activation_deployment_id,
    'activation_deployment_sha',record.activation_deployment_sha,
    'last_verification_at',record.last_verification_at,
    'verification',jsonb_build_object(
      'config_presence_verified_at',record.config_presence_verified_at,
      'route_configuration_verified_at',record.route_configuration_verified_at,
      'non_paid_readiness_verified_at',record.non_paid_readiness_verified_at,
      'bounded_smoke_performed_at',record.bounded_smoke_performed_at,
      'smoke_operation_id',record.smoke_operation_id
    ),
    'recommended_action',case
      when record.lifecycle_status in ('expired','revoked','disabled') then 'Keep the affected capability fail-closed until an active replacement is verified.'
      when record.expires_at is not null and coalesce(p_as_of,now())>=record.rotation_due_at then 'Create a replacement externally; update canonical production config; verify presence, isolation, and non-paid readiness; run a bounded smoke only with approval; revoke the old key; record the new expiration.'
      else null end,
    'codex_handoff',jsonb_build_object(
      'steps',jsonb_build_array(
        'create replacement key at provider','update canonical production variable',
        'verify production presence','verify dependent route isolation',
        'verify old and new credential identities','run non-paid readiness verification',
        'perform bounded smoke only if explicitly approved','revoke old provider key',
        'confirm replacement expiration','update lifecycle record'
      )
    )
  )
  from tongs.credential_lifecycle_records record
  where not coalesce(p_only_actionable,false)
     or record.lifecycle_status in ('rotation_due','replacement_ready','replacement_active','revocation_pending','expired')
     or (record.expires_at is not null and coalesce(p_as_of,now())>=record.rotation_due_at)
  order by record.expires_at asc nulls last, record.provider, record.credential_purpose;
end;
$$;

revoke all on function tongs._credential_lifecycle_metadata_safe(jsonb) from public,anon,authenticated,service_role;
revoke all on function tongs._require_credential_lifecycle_reader() from public,anon,authenticated,service_role;
revoke all on function tongs._require_credential_lifecycle_writer() from public,anon,authenticated,service_role;
revoke all on function tongs.register_credential_lifecycle(uuid,text,text,text,text,text,text,text,timestamptz,timestamptz,timestamptz,interval,text,text,text,jsonb,jsonb,uuid,text,timestamptz) from public,anon,authenticated;
revoke all on function tongs.set_credential_lifecycle_deadline(uuid,timestamptz,interval,jsonb,uuid,text,timestamptz) from public,anon,authenticated;
revoke all on function tongs.record_credential_lifecycle_verification(uuid,jsonb,text,text,uuid,text,timestamptz) from public,anon,authenticated;
revoke all on function tongs.transition_credential_lifecycle(uuid,text,text,uuid,timestamptz,jsonb,uuid,text,timestamptz) from public,anon,authenticated;
revoke all on function tongs.refresh_credential_lifecycle_alerts(timestamptz,uuid) from public,anon,authenticated;
revoke all on function tongs.read_credential_lifecycle_execution_gate(text,text,text) from public,anon,authenticated;
revoke all on function tongs.read_credential_lifecycle_report(timestamptz,boolean) from public,anon;

grant execute on function tongs.register_credential_lifecycle(uuid,text,text,text,text,text,text,text,timestamptz,timestamptz,timestamptz,interval,text,text,text,jsonb,jsonb,uuid,text,timestamptz) to service_role;
grant execute on function tongs.set_credential_lifecycle_deadline(uuid,timestamptz,interval,jsonb,uuid,text,timestamptz) to service_role;
grant execute on function tongs.record_credential_lifecycle_verification(uuid,jsonb,text,text,uuid,text,timestamptz) to service_role;
grant execute on function tongs.transition_credential_lifecycle(uuid,text,text,uuid,timestamptz,jsonb,uuid,text,timestamptz) to service_role;
grant execute on function tongs.refresh_credential_lifecycle_alerts(timestamptz,uuid) to service_role;
grant execute on function tongs.read_credential_lifecycle_execution_gate(text,text,text) to service_role;
grant execute on function tongs.read_credential_lifecycle_report(timestamptz,boolean) to authenticated,service_role;

comment on table tongs.credential_lifecycle_records is
  'Private value-free lifecycle state for provider and infrastructure credentials. Raw credentials are prohibited.';
comment on function tongs.read_credential_lifecycle_execution_gate(text,text,text) is
  'Service-only fail-closed status for tracked credentials. It never resolves, returns, or falls back to another credential.';

commit;
