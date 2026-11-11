-- Storage capacity v1. No Stripe/customer records or financial activation.
-- Approved term: subscribed 5 GiB; free 0; paid packs additive. Retained bytes
-- belong once to the workspace creator/owner. Temporary capture parts and DB
-- rows are excluded. All Storage data mutation remains owned by Storage API.
begin;

create function tongs._storage_capacity_workspace(p_bucket text,p_name text)
returns uuid language plpgsql stable security definer set search_path=pg_catalog as $$
declare parts text[]:=string_to_array(p_name,'/'); v_workspace uuid;
begin
  if p_bucket='bellows-capture' then
    if parts[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select id into v_workspace from tongs.workspaces where id=parts[1]::uuid;
    end if;
    return v_workspace;
  end if;
  if p_bucket<>'forge-workpieces' then return null; end if;
  if parts[1]='workpieces' and parts[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select workspace_id into v_workspace from tongs.episodes where id=parts[2]::uuid;
  elsif parts[1]='workspaces' and parts[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select id into v_workspace from tongs.workspaces where id=parts[2]::uuid;
  elsif parts[1] ~* '^[0-9a-f-]{36}$' and parts[2] ~* '^[0-9a-f-]{36}$' then
    select id into v_workspace from tongs.workspaces where id=parts[2]::uuid and created_by=parts[1]::uuid;
  end if;
  return v_workspace;
exception when invalid_text_representation then return null;
end $$;

create function tongs._storage_capacity_temporary(p_bucket text,p_name text)
returns boolean language sql immutable set search_path=pg_catalog as $$
  select (p_bucket='bellows-capture' and p_name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/parts/[0-9]+[.]part$') or (p_bucket='forge-workpieces' and
    p_name ~ '^workpieces/[0-9a-f-]{36}/_uploads/[^/]+/(session[.]v1[.]json|chunks/[0-9]+[.]part)$')
$$;

create function tongs._storage_capacity_entitlement(p_owner uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog as $$
  with eligible as (
    select s.*,
      coalesce((select max(tongs.billing_storage_entitled_bytes(r.plan_item_id))
        from tongs.subscription_cycle_receipts r
        where r.user_id=s.user_id and r.stripe_subscription_id=s.stripe_subscription_id
          and r.stripe_mode=tongs._current_financial_environment()
          and r.purchase_type='cloud_storage' and r.period_start<=now() and r.period_end>now()),0) paid_pack_bytes,
      exists(select 1 from tongs.subscription_cycle_receipts r
        where r.user_id=s.user_id and r.stripe_subscription_id=s.stripe_subscription_id
          and r.stripe_mode=tongs._current_financial_environment()
          and r.purchase_type='subscription' and tongs.billing_item_is_plan(r.plan_item_id)
          and r.period_start<=now() and r.period_end>now()) paid_membership
    from tongs.billing_subscriptions s where s.user_id=p_owner
      and s.status in ('active','past_due','unpaid')
      and s.current_period_end>now()
  ), totals as (
    select case when coalesce(bool_or(purchase_type='subscription' and tongs.billing_item_is_plan(item_id) and paid_membership),false)
      then 5368709120::bigint else 0::bigint end base_bytes,
      coalesce(sum(case when purchase_type='cloud_storage'
        then least(tongs.billing_storage_entitled_bytes(item_id),paid_pack_bytes) else 0 end),0)::bigint addon_bytes
    from eligible
  ) select jsonb_build_object('term','forge.storage-capacity.v1','base_bytes',base_bytes,
    'addon_bytes',addon_bytes,'total_bytes',base_bytes+addon_bytes,
    'financial_environment',tongs._current_financial_environment()) from totals
$$;

create function tongs._storage_capacity_usage(p_owner uuid,p_exclude uuid default null)
returns jsonb language sql volatile security definer set search_path=pg_catalog as $$
  with owned as (
    select o.metadata from storage.objects o
    join tongs.workspaces w on w.id=tongs._storage_capacity_workspace(o.bucket_id,o.name)
    where w.created_by=p_owner and (p_exclude is null or o.id<>p_exclude)
      and not tongs._storage_capacity_temporary(o.bucket_id,o.name)
  ) select jsonb_build_object(
    'used_bytes',coalesce(sum(case when metadata->>'size' ~ '^[0-9]{1,18}$' then (metadata->>'size')::bigint else 0 end),0),
    'unknown_size_objects',count(*) filter(where metadata->>'size' is null or metadata->>'size' !~ '^[0-9]{1,18}$'),
    'retained_objects',count(*),
    'unattributed_objects',(select count(*) from storage.objects o where o.bucket_id in ('forge-workpieces','bellows-capture')
      and not tongs._storage_capacity_temporary(o.bucket_id,o.name)
      and tongs._storage_capacity_workspace(o.bucket_id,o.name) is null)) from owned
$$;

create function tongs.read_my_storage_capacity()
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_user uuid:=auth.uid(); v_entitlement jsonb; v_usage jsonb; v_limit bigint; v_used bigint;
begin
  if v_user is null then raise exception 'authentication required' using errcode='42501'; end if;
  v_entitlement:=tongs._storage_capacity_entitlement(v_user);
  v_usage:=tongs._storage_capacity_usage(v_user);
  v_limit:=(v_entitlement->>'total_bytes')::bigint; v_used:=(v_usage->>'used_bytes')::bigint;
  return v_entitlement || v_usage || jsonb_build_object('remaining_bytes',greatest(v_limit-v_used,0),
    'delete_only',v_used>=v_limit or ((v_usage->>'unknown_size_objects')::bigint>0 or (v_usage->>'unattributed_objects')::bigint>0),
    'usage_complete',(v_usage->>'unknown_size_objects')::bigint=0 and (v_usage->>'unattributed_objects')::bigint=0,'observed_at',clock_timestamp());
end $$;

create function tongs._enforce_storage_capacity()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare v_workspace uuid; v_owner uuid; v_used jsonb; v_entitlement jsonb; v_size bigint; v_limit bigint;
begin
  -- Storage's admission probe inserts a metadata-less row and rolls back.
  -- A deferred constraint trigger never runs for that probe. Inspect the final
  -- row at commit, including transactions that updated or deleted it again.
  select * into new from storage.objects where id=new.id;
  if not found then return null; end if;
  if new.bucket_id not in ('forge-workpieces','bellows-capture') or tongs._storage_capacity_temporary(new.bucket_id,new.name) then return new; end if;
  if tg_op='UPDATE' and new.bucket_id=old.bucket_id and new.name=old.name
    and new.metadata is not distinct from old.metadata and new.version is not distinct from old.version then return new; end if;
  v_workspace:=tongs._storage_capacity_workspace(new.bucket_id,new.name);
  select created_by into v_owner from tongs.workspaces where id=v_workspace;
  if v_owner is null then raise exception 'storage_billing_owner_unresolved' using errcode='23514'; end if;
  if current_setting('transaction_isolation')<>'read committed' then
    raise exception 'storage_capacity_requires_read_committed' using errcode='25000';
  end if;
  -- Serialize final metadata publication for every writer, including service_role.
  -- Deletion never enters this trigger. Do not introduce a privileged bypass.
  perform pg_advisory_xact_lock(hashtextextended('forge-storage-capacity:'||v_owner::text,0));
  if new.metadata->>'size' is null or new.metadata->>'size' !~ '^[0-9]{1,18}$' then
    raise exception 'storage_usage_size_unverified' using errcode='23514';
  end if;
  v_size:=(new.metadata->>'size')::bigint;
  v_entitlement:=tongs._storage_capacity_entitlement(v_owner);
  v_limit:=(v_entitlement->>'total_bytes')::bigint;
  v_used:=tongs._storage_capacity_usage(v_owner,new.id);
  if (v_used->>'unknown_size_objects')::bigint>0 or (v_used->>'unattributed_objects')::bigint>0 then
    raise exception 'storage_usage_reconciliation_required' using errcode='23514';
  end if;
  if tg_op='UPDATE' and old.metadata->>'size' ~ '^[0-9]{1,18}$'
    and (v_used->>'used_bytes')::numeric+(old.metadata->>'size')::bigint>v_limit then
    raise exception 'storage_capacity_exceeded_delete_only' using errcode='23514';
  end if;
  if v_limit=0 or (v_used->>'used_bytes')::numeric+v_size>v_limit then
    raise exception 'storage_capacity_exceeded_delete_only' using errcode='23514';
  end if;
  return new;
end $$;

-- Enforcement is on provider-owned metadata publication, not browser counters.
-- No rows in storage.objects are inserted, updated, deleted, or backfilled here.
create constraint trigger forge_storage_capacity_guard after insert or update
  on storage.objects deferrable initially deferred for each row execute function tongs._enforce_storage_capacity();

alter function tongs._storage_capacity_workspace(text,text) owner to postgres;
alter function tongs._storage_capacity_temporary(text,text) owner to postgres;
alter function tongs._storage_capacity_entitlement(uuid) owner to postgres;
alter function tongs._storage_capacity_usage(uuid,uuid) owner to postgres;
alter function tongs.read_my_storage_capacity() owner to postgres;
alter function tongs._enforce_storage_capacity() owner to postgres;
revoke all on function tongs._storage_capacity_workspace(text,text),tongs._storage_capacity_temporary(text,text),
  tongs._storage_capacity_entitlement(uuid),tongs._storage_capacity_usage(uuid,uuid),tongs._enforce_storage_capacity(),
  tongs.read_my_storage_capacity() from public,anon,authenticated,service_role;
grant execute on function tongs.read_my_storage_capacity() to authenticated;
commit;
