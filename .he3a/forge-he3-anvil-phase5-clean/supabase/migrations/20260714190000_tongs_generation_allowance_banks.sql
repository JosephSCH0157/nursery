-- Durable, leased image and B-roll generation allowances.
-- Raw accounting tables are service-only; authenticated users read sanitized balances via RPC.

begin;

alter table tongs.ai_usage_events
  add column if not exists modality text not null default 'text'
  check (modality in ('text', 'image', 'b_roll'));

create table tongs.generation_balances (
  billing_owner_id uuid not null references auth.users(id) on delete cascade,
  generation_kind text not null check (generation_kind in ('image', 'b_roll')),
  available_quantity bigint not null default 0 check (available_quantity >= 0),
  reserved_quantity bigint not null default 0 check (reserved_quantity >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (billing_owner_id, generation_kind)
);

create table tongs.generation_operations (
  id uuid primary key default gen_random_uuid(),
  billing_owner_id uuid not null references auth.users(id) on delete cascade,
  generation_kind text not null check (generation_kind in ('image', 'b_roll')),
  action_id uuid not null,
  workspace_id uuid,
  workpiece_id uuid,
  requested_maximum integer not null check (requested_maximum > 0),
  reserved_quantity integer not null default 0 check (reserved_quantity >= 0),
  produced_quantity integer not null default 0 check (produced_quantity >= 0),
  released_quantity integer not null default 0 check (released_quantity >= 0),
  compensated_quantity integer not null default 0 check (compensated_quantity >= 0),
  lease_version integer not null default 1 check (lease_version > 0),
  status text not null check (status in (
    'reserved', 'partially_finalized', 'completed', 'expired',
    'persistence_failed', 'persistence_failed_compensated'
  )),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (billing_owner_id, generation_kind, action_id)
);

create index generation_operations_expiry_idx
  on tongs.generation_operations (expires_at)
  where status in ('reserved', 'partially_finalized', 'persistence_failed', 'persistence_failed_compensated');

create table tongs.generation_ledger (
  id bigserial primary key,
  billing_owner_id uuid not null references auth.users(id) on delete cascade,
  generation_kind text not null check (generation_kind in ('image', 'b_roll')),
  operation_id uuid references tongs.generation_operations(id) on delete restrict,
  action_id uuid,
  event_type text not null check (event_type in (
    'starter_grant', 'reservation', 'consumption', 'release',
    'compensating_grant', 'promotional_grant', 'paid_grant', 'admin_adjustment'
  )),
  quantity integer not null check (quantity > 0),
  idempotency_key text not null,
  provider_batch_id text,
  output_ordinal integer,
  provider_request_id text,
  provider text,
  model text,
  workspace_id uuid,
  workpiece_id uuid,
  asset_id uuid,
  version_id uuid,
  estimated_cost_usd numeric(14, 6),
  actual_cost_usd numeric(14, 6),
  status text not null,
  compensates_ledger_id bigint references tongs.generation_ledger(id) on delete restrict,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (billing_owner_id, generation_kind, idempotency_key),
  check ((event_type = 'consumption') = (provider_batch_id is not null and output_ordinal is not null))
);

create unique index generation_ledger_output_identity_idx
  on tongs.generation_ledger (
    billing_owner_id, generation_kind, action_id, provider_batch_id, output_ordinal
  ) where event_type = 'consumption';

create unique index generation_ledger_compensation_identity_idx
  on tongs.generation_ledger (compensates_ledger_id)
  where event_type = 'compensating_grant';

alter table tongs.generation_balances enable row level security;
alter table tongs.generation_operations enable row level security;
alter table tongs.generation_ledger enable row level security;

revoke all on tongs.generation_balances from public, anon, authenticated;
revoke all on tongs.generation_operations from public, anon, authenticated;
revoke all on tongs.generation_ledger from public, anon, authenticated;
grant select on tongs.generation_balances, tongs.generation_operations, tongs.generation_ledger to service_role;

create or replace function tongs._ensure_generation_starter(p_billing_owner_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_kind text;
  v_quantity integer;
  v_inserted bigint;
begin
  if p_billing_owner_id is null then
    raise exception 'billing owner required' using errcode = '22023';
  end if;

  foreach v_kind in array array['image'::text, 'b_roll'::text] loop
    v_quantity := case when v_kind = 'image' then 500 else 25 end;
    insert into tongs.generation_balances (billing_owner_id, generation_kind)
    values (p_billing_owner_id, v_kind)
    on conflict do nothing;

    v_inserted := null;
    insert into tongs.generation_ledger (
      billing_owner_id, generation_kind, event_type, quantity,
      idempotency_key, status, metadata
    ) values (
      p_billing_owner_id, v_kind, 'starter_grant', v_quantity,
      'starter:v1', 'granted', jsonb_build_object('starter_included', v_quantity)
    ) on conflict do nothing
    returning id into v_inserted;

    if v_inserted is not null then
      update tongs.generation_balances
      set available_quantity = available_quantity + v_quantity, updated_at = now()
      where billing_owner_id = p_billing_owner_id and generation_kind = v_kind;
    end if;
  end loop;
end;
$$;

create or replace function tongs._reclaim_expired_generation_reservations(p_billing_owner_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_operation record;
  v_count integer := 0;
begin
  for v_operation in
    select * from tongs.generation_operations
    where status in ('reserved', 'partially_finalized', 'persistence_failed', 'persistence_failed_compensated')
      and reserved_quantity > 0
      and expires_at <= now()
      and (p_billing_owner_id is null or billing_owner_id = p_billing_owner_id)
    order by expires_at
    for update skip locked
  loop
    if v_operation.reserved_quantity > 0 then
      update tongs.generation_balances
      set available_quantity = available_quantity + v_operation.reserved_quantity,
          reserved_quantity = reserved_quantity - v_operation.reserved_quantity,
          updated_at = now()
      where billing_owner_id = v_operation.billing_owner_id
        and generation_kind = v_operation.generation_kind;

      insert into tongs.generation_ledger (
        billing_owner_id, generation_kind, operation_id, action_id, event_type,
        quantity, idempotency_key, workspace_id, workpiece_id, status
      ) values (
        v_operation.billing_owner_id, v_operation.generation_kind, v_operation.id,
        v_operation.action_id, 'release', v_operation.reserved_quantity,
        'expiry:' || v_operation.action_id::text || ':' || v_operation.lease_version::text,
        v_operation.workspace_id, v_operation.workpiece_id,
        case when v_operation.compensated_quantity > 0 then 'persistence_failed_compensated' else 'expired' end
      ) on conflict do nothing;
    end if;

    update tongs.generation_operations
    set released_quantity = released_quantity + reserved_quantity,
        reserved_quantity = 0,
        status = case when compensated_quantity > 0 then 'persistence_failed_compensated' else 'expired' end,
        updated_at = now(), completed_at = now()
    where id = v_operation.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function tongs.get_my_generation_allowances()
returns table (
  generation_kind text,
  starter_included integer,
  available bigint,
  reserved bigint,
  generation_available boolean
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_owner uuid := auth.uid();
begin
  if v_owner is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  perform tongs._ensure_generation_starter(v_owner);
  perform tongs._reclaim_expired_generation_reservations(v_owner);
  return query
    select b.generation_kind,
      case when b.generation_kind = 'image' then 500 else 25 end,
      b.available_quantity, b.reserved_quantity, b.available_quantity > 0
    from tongs.generation_balances b
    where b.billing_owner_id = v_owner
    order by b.generation_kind;
end;
$$;

create or replace function tongs.reserve_generation_allowance(
  p_billing_owner_id uuid,
  p_generation_kind text,
  p_action_id uuid,
  p_requested_maximum integer,
  p_workspace_id uuid default null,
  p_workpiece_id uuid default null
)
returns tongs.generation_operations
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_operation tongs.generation_operations%rowtype;
  v_balance tongs.generation_balances%rowtype;
  v_lease_version integer := 1;
  v_reserve_quantity integer := p_requested_maximum;
begin
  if p_billing_owner_id is null or p_action_id is null or p_requested_maximum <= 0
     or p_generation_kind not in ('image', 'b_roll') then
    raise exception 'invalid generation reservation' using errcode = '22023';
  end if;
  perform tongs._ensure_generation_starter(p_billing_owner_id);
  perform tongs._reclaim_expired_generation_reservations(p_billing_owner_id);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    p_billing_owner_id::text || ':' || p_generation_kind || ':' || p_action_id::text, 0
  ));

  select * into v_operation from tongs.generation_operations
  where billing_owner_id = p_billing_owner_id and generation_kind = p_generation_kind
    and action_id = p_action_id
  for update;

  if found then
    if v_operation.requested_maximum <> p_requested_maximum
       or v_operation.workspace_id is distinct from p_workspace_id
       or v_operation.workpiece_id is distinct from p_workpiece_id then
      raise exception 'action identity conflict' using errcode = '22023';
    end if;
  end if;
  if found and v_operation.status in ('reserved', 'partially_finalized', 'completed', 'persistence_failed', 'persistence_failed_compensated') then
    return v_operation;
  end if;
  if found and v_operation.status = 'expired' then
    v_reserve_quantity := greatest(0, p_requested_maximum - v_operation.produced_quantity);
    if v_reserve_quantity = 0 then
      update tongs.generation_operations set status = 'completed', updated_at = now(), completed_at = now()
      where id = v_operation.id returning * into v_operation;
      return v_operation;
    end if;
  end if;

  select * into v_balance from tongs.generation_balances
  where billing_owner_id = p_billing_owner_id and generation_kind = p_generation_kind
  for update;
  if v_balance.available_quantity < v_reserve_quantity then
    if p_generation_kind = 'image' then
      raise exception 'image_allowance_exhausted' using errcode = 'P0001',
        detail = jsonb_build_object('available', v_balance.available_quantity, 'reserved', v_balance.reserved_quantity, 'requested_maximum', v_reserve_quantity)::text;
    else
      raise exception 'broll_allowance_exhausted' using errcode = 'P0001',
        detail = jsonb_build_object('available', v_balance.available_quantity, 'reserved', v_balance.reserved_quantity, 'requested_maximum', v_reserve_quantity)::text;
    end if;
  end if;

  update tongs.generation_balances set
    available_quantity = available_quantity - v_reserve_quantity,
    reserved_quantity = reserved_quantity + v_reserve_quantity,
    updated_at = now()
  where billing_owner_id = p_billing_owner_id and generation_kind = p_generation_kind;

  if v_operation.id is null then
    insert into tongs.generation_operations (
      billing_owner_id, generation_kind, action_id, workspace_id, workpiece_id,
      requested_maximum, reserved_quantity, status, expires_at
    ) values (
      p_billing_owner_id, p_generation_kind, p_action_id, p_workspace_id, p_workpiece_id,
      p_requested_maximum, v_reserve_quantity, 'reserved', now() + interval '30 minutes'
    ) returning * into v_operation;
  else
    v_lease_version := v_operation.lease_version + 1;
    update tongs.generation_operations set
      reserved_quantity = v_reserve_quantity,
      lease_version = v_lease_version, status = 'reserved',
      expires_at = now() + interval '30 minutes', updated_at = now(), completed_at = null
    where id = v_operation.id returning * into v_operation;
  end if;

  insert into tongs.generation_ledger (
    billing_owner_id, generation_kind, operation_id, action_id, event_type, quantity,
    idempotency_key, workspace_id, workpiece_id, status
  ) values (
    p_billing_owner_id, p_generation_kind, v_operation.id, p_action_id, 'reservation',
    v_reserve_quantity, 'reserve:' || p_action_id::text || ':' || v_operation.lease_version::text,
    p_workspace_id, p_workpiece_id, 'reserved'
  );
  return v_operation;
end;
$$;

create or replace function tongs.record_generation_outputs(
  p_billing_owner_id uuid,
  p_generation_kind text,
  p_action_id uuid,
  p_provider_batch_id text,
  p_provider_request_id text,
  p_provider text,
  p_model text,
  p_outputs jsonb
)
returns tongs.generation_operations
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_operation tongs.generation_operations%rowtype;
  v_output jsonb;
  v_inserted bigint;
  v_new_count integer := 0;
  v_ordinal integer;
begin
  if nullif(trim(p_provider_batch_id), '') is null or jsonb_typeof(p_outputs) <> 'array' then
    raise exception 'invalid provider output batch' using errcode = '22023';
  end if;
  select * into v_operation from tongs.generation_operations
  where billing_owner_id = p_billing_owner_id and generation_kind = p_generation_kind and action_id = p_action_id
  for update;
  if not found or v_operation.status not in ('reserved', 'partially_finalized') or v_operation.expires_at <= now() then
    raise exception 'generation reservation is not active' using errcode = 'P0001';
  end if;

  for v_output in select value from jsonb_array_elements(p_outputs) loop
    v_ordinal := (v_output->>'output_ordinal')::integer;
    if v_ordinal < 0 then raise exception 'invalid output ordinal' using errcode = '22023'; end if;
    v_inserted := null;
    insert into tongs.generation_ledger (
      billing_owner_id, generation_kind, operation_id, action_id, event_type, quantity,
      idempotency_key, provider_batch_id, output_ordinal, provider_request_id,
      provider, model, workspace_id, workpiece_id, asset_id, version_id,
      estimated_cost_usd, actual_cost_usd, status, metadata
    ) values (
      p_billing_owner_id, p_generation_kind, v_operation.id, p_action_id, 'consumption', 1,
      'output:' || p_action_id::text || ':' || p_provider_batch_id || ':' || v_ordinal::text,
      p_provider_batch_id, v_ordinal, p_provider_request_id, p_provider, p_model,
      v_operation.workspace_id, v_operation.workpiece_id,
      nullif(v_output->>'asset_id', '')::uuid, nullif(v_output->>'version_id', '')::uuid,
      nullif(v_output->>'estimated_cost_usd', '')::numeric,
      nullif(v_output->>'actual_cost_usd', '')::numeric,
      'produced', coalesce(v_output->'metadata', '{}'::jsonb)
    ) on conflict do nothing returning id into v_inserted;
    if v_inserted is not null then v_new_count := v_new_count + 1; end if;
  end loop;

  if v_new_count > v_operation.reserved_quantity then
    raise exception 'produced output count exceeds reservation' using errcode = '22023';
  end if;
  if v_new_count > 0 then
    update tongs.generation_balances set
      reserved_quantity = reserved_quantity - v_new_count, updated_at = now()
    where billing_owner_id = p_billing_owner_id and generation_kind = p_generation_kind;
    update tongs.generation_operations set
      reserved_quantity = reserved_quantity - v_new_count,
      produced_quantity = produced_quantity + v_new_count,
      status = 'partially_finalized', updated_at = now()
    where id = v_operation.id returning * into v_operation;
  end if;
  return v_operation;
end;
$$;

create or replace function tongs.complete_generation_operation(
  p_billing_owner_id uuid, p_generation_kind text, p_action_id uuid
)
returns tongs.generation_operations
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare v_operation tongs.generation_operations%rowtype;
begin
  select * into v_operation from tongs.generation_operations
  where billing_owner_id = p_billing_owner_id and generation_kind = p_generation_kind and action_id = p_action_id
  for update;
  if not found then raise exception 'generation operation not found' using errcode = '22023'; end if;
  if v_operation.status = 'completed'
     or (v_operation.status = 'persistence_failed_compensated' and v_operation.reserved_quantity = 0) then
    return v_operation;
  end if;
  if v_operation.reserved_quantity > 0 then
    update tongs.generation_balances set
      available_quantity = available_quantity + v_operation.reserved_quantity,
      reserved_quantity = reserved_quantity - v_operation.reserved_quantity, updated_at = now()
    where billing_owner_id = p_billing_owner_id and generation_kind = p_generation_kind;
    insert into tongs.generation_ledger (
      billing_owner_id, generation_kind, operation_id, action_id, event_type, quantity,
      idempotency_key, workspace_id, workpiece_id, status
    ) values (
      p_billing_owner_id, p_generation_kind, v_operation.id, p_action_id, 'release',
      v_operation.reserved_quantity, 'complete:' || p_action_id::text,
      v_operation.workspace_id, v_operation.workpiece_id, 'released'
    ) on conflict do nothing;
  end if;
  update tongs.generation_operations set
    released_quantity = released_quantity + reserved_quantity, reserved_quantity = 0,
    status = case when compensated_quantity > 0 then 'persistence_failed_compensated' else 'completed' end,
    updated_at = now(), completed_at = now()
  where id = v_operation.id returning * into v_operation;
  return v_operation;
end;
$$;

create or replace function tongs.extend_generation_reservation(
  p_billing_owner_id uuid, p_generation_kind text, p_action_id uuid
)
returns tongs.generation_operations
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare v_operation tongs.generation_operations%rowtype;
begin
  update tongs.generation_operations set expires_at = now() + interval '30 minutes', updated_at = now()
  where billing_owner_id = p_billing_owner_id and generation_kind = p_generation_kind
    and action_id = p_action_id and status in ('reserved', 'partially_finalized') and expires_at > now()
  returning * into v_operation;
  if not found then raise exception 'generation reservation is not active' using errcode = 'P0001'; end if;
  return v_operation;
end;
$$;

create or replace function tongs.compensate_generation_persistence_failures(
  p_billing_owner_id uuid, p_generation_kind text, p_action_id uuid, p_outputs jsonb
)
returns tongs.generation_operations
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_operation tongs.generation_operations%rowtype;
  v_output jsonb;
  v_consumption tongs.generation_ledger%rowtype;
  v_inserted bigint;
  v_count integer := 0;
begin
  if jsonb_typeof(p_outputs) <> 'array' then raise exception 'invalid compensation outputs' using errcode = '22023'; end if;
  select * into v_operation from tongs.generation_operations
  where billing_owner_id = p_billing_owner_id and generation_kind = p_generation_kind and action_id = p_action_id
  for update;
  if not found then raise exception 'generation operation not found' using errcode = '22023'; end if;
  for v_output in select value from jsonb_array_elements(p_outputs) loop
    select * into v_consumption from tongs.generation_ledger
    where billing_owner_id = p_billing_owner_id and generation_kind = p_generation_kind
      and action_id = p_action_id and event_type = 'consumption'
      and provider_batch_id = v_output->>'provider_batch_id'
      and output_ordinal = (v_output->>'output_ordinal')::integer;
    if not found then raise exception 'consumption output not found' using errcode = '22023'; end if;
    v_inserted := null;
    insert into tongs.generation_ledger (
      billing_owner_id, generation_kind, operation_id, action_id, event_type, quantity,
      idempotency_key, workspace_id, workpiece_id, status, compensates_ledger_id, metadata
    ) values (
      p_billing_owner_id, p_generation_kind, v_operation.id, p_action_id,
      'compensating_grant', 1, 'compensate:' || v_consumption.id::text,
      v_operation.workspace_id, v_operation.workpiece_id, 'persistence_failed_compensated',
      v_consumption.id, jsonb_build_object('reason', 'forge_persistence_failure')
    ) on conflict do nothing returning id into v_inserted;
    if v_inserted is not null then v_count := v_count + 1; end if;
  end loop;
  if v_count > 0 then
    update tongs.generation_balances set available_quantity = available_quantity + v_count, updated_at = now()
    where billing_owner_id = p_billing_owner_id and generation_kind = p_generation_kind;
    update tongs.generation_operations set compensated_quantity = compensated_quantity + v_count,
      status = case when reserved_quantity = 0 then 'persistence_failed_compensated' else 'persistence_failed' end,
      updated_at = now()
    where id = v_operation.id returning * into v_operation;
  end if;
  return v_operation;
end;
$$;

create or replace function tongs.reclaim_expired_generation_reservations(p_billing_owner_id uuid default null)
returns integer
language sql
security definer
set search_path = pg_catalog
as $$ select tongs._reclaim_expired_generation_reservations(p_billing_owner_id) $$;

revoke all on function tongs._ensure_generation_starter(uuid) from public, anon, authenticated;
revoke all on function tongs._reclaim_expired_generation_reservations(uuid) from public, anon, authenticated;
revoke all on function tongs.get_my_generation_allowances() from public, anon;
revoke all on function tongs.reserve_generation_allowance(uuid,text,uuid,integer,uuid,uuid) from public, anon, authenticated;
revoke all on function tongs.record_generation_outputs(uuid,text,uuid,text,text,text,text,jsonb) from public, anon, authenticated;
revoke all on function tongs.complete_generation_operation(uuid,text,uuid) from public, anon, authenticated;
revoke all on function tongs.extend_generation_reservation(uuid,text,uuid) from public, anon, authenticated;
revoke all on function tongs.compensate_generation_persistence_failures(uuid,text,uuid,jsonb) from public, anon, authenticated;
revoke all on function tongs.reclaim_expired_generation_reservations(uuid) from public, anon, authenticated;

grant execute on function tongs.get_my_generation_allowances() to authenticated, service_role;
grant execute on function tongs.reserve_generation_allowance(uuid,text,uuid,integer,uuid,uuid) to service_role;
grant execute on function tongs.record_generation_outputs(uuid,text,uuid,text,text,text,text,jsonb) to service_role;
grant execute on function tongs.complete_generation_operation(uuid,text,uuid) to service_role;
grant execute on function tongs.extend_generation_reservation(uuid,text,uuid) to service_role;
grant execute on function tongs.compensate_generation_persistence_failures(uuid,text,uuid,jsonb) to service_role;
grant execute on function tongs.reclaim_expired_generation_reservations(uuid) to service_role;

commit;
