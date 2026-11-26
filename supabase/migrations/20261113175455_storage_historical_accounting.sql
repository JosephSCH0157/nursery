-- Accounting only. No inventory, ownership, entitlement or access is seeded.
-- An operator must separately observe, review raw-byte evidence and approve.
begin;

create table tongs.storage_historical_observations (
 id uuid primary key default gen_random_uuid(),
 operator_id uuid not null references auth.users(id), observed_at timestamptz not null,
 manifest jsonb not null, manifest_sha256 text not null unique
);
create table tongs.storage_historical_approvals (
 observation_id uuid primary key references tongs.storage_historical_observations(id),
 operator_id uuid not null references auth.users(id), approved_at timestamptz not null default clock_timestamp(),
 manifest_sha256 text not null, evidence_sha256 text not null check(evidence_sha256 ~ '^[a-f0-9]{64}$'),
 reason text not null check(length(btrim(reason)) between 8 and 1000)
);
create table tongs.storage_historical_objects (
 object_id uuid primary key,
 observation_id uuid not null references tongs.storage_historical_approvals(observation_id),
 identity jsonb not null
);
create table tongs.storage_historical_retirements (
 object_id uuid primary key references tongs.storage_historical_objects(object_id),
 retired_at timestamptz not null default clock_timestamp(),
 transaction_id text not null default pg_current_xact_id()::text,
 operation text not null check(operation in ('UPDATE','DELETE')),
 successor_identity jsonb, actor_id uuid, actor_role text
);
create table tongs.storage_historical_revocations (
 observation_id uuid primary key references tongs.storage_historical_approvals(observation_id),
 operator_id uuid not null references auth.users(id), revoked_at timestamptz not null default clock_timestamp(),
 reason text not null check(length(btrim(reason)) between 8 and 1000)
);

-- Provider version + binding + all content metadata are pinned. Only access
-- bookkeeping (last_accessed_at, updated_at) is deliberately omitted. Client
-- user_metadata cannot supply the version, size or trusted digest evidence.
create function tongs._storage_historical_identity(o storage.objects) returns jsonb
language sql immutable set search_path=pg_catalog as $$
 select tongs._storage_quarantine_identity(o) - 'updated_at'
$$;
create function tongs._require_storage_historical_operator() returns uuid
language plpgsql security definer set search_path=pg_catalog as $$
declare actor uuid:=auth.uid();
begin
 if current_setting('transaction_isolation')<>'read committed' then
  raise exception 'historical accounting requires read committed' using errcode='25000'; end if;
 if auth.role() is distinct from 'authenticated' or actor is null or not tongs.is_platform_operator(actor) then
  raise exception 'authenticated platform operator required' using errcode='42501'; end if;
 perform 1 from tongs.platform_operators where user_id=actor for share;
 if not found then raise exception 'operator authority revoked' using errcode='42501'; end if;
 return actor;
end$$;
create function tongs.observe_storage_historical_accounting(p_object_ids uuid[]) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare actor uuid; observed timestamptz:=clock_timestamp(); item storage.objects;
 items jsonb:='[]'; manifest jsonb; observation tongs.storage_historical_observations;
begin
 actor:=tongs._require_storage_historical_operator();
 if cardinality(p_object_ids) is null or cardinality(p_object_ids) not between 1 and 475
 or (select count(distinct x) from unnest(p_object_ids) x)<>cardinality(p_object_ids) then
  raise exception 'explicit unique bounded historical inventory required' using errcode='22023'; end if;
 for item in select * from storage.objects where id=any(p_object_ids) order by id for share loop
  if item.created_at is null or item.updated_at is null
  or item.created_at>='2026-11-11T00:00:00Z'::timestamptz or item.updated_at>='2026-11-11T00:00:00Z'::timestamptz
  or item.bucket_id not in ('forge-workpieces','bellows-capture')
  or nullif(item.version,'') is null or nullif(item.metadata->>'eTag','') is null
  or item.metadata->>'size' is null or item.metadata->>'size' !~ '^[0-9]{1,18}$'
  or tongs._storage_capacity_temporary(item.bucket_id,item.name)
  or exists(select 1 from tongs.workspaces w where w.id=tongs._storage_capacity_workspace(item.bucket_id,item.name) and w.created_by is not null)
  or exists(select 1 from tongs.storage_quarantine_objects q where q.object_id=item.id)
  or exists(select 1 from tongs.storage_historical_objects h where h.object_id=item.id) then
   raise exception 'object is not eligible unresolved historical evidence' using errcode='23514'; end if;
  items:=items||jsonb_build_array(tongs._storage_historical_identity(item));
 end loop;
 if jsonb_array_length(items)<>cardinality(p_object_ids) then raise exception 'missing object' using errcode='23514'; end if;
 manifest:=jsonb_build_object('policy','forge.storage-historical-accounting.v1',
  'observed_at',observed,'historical_before','2026-11-11T00:00:00Z','objects',items);
 insert into tongs.storage_historical_observations(operator_id,observed_at,manifest,manifest_sha256)
 values(actor,observed,manifest,encode(extensions.digest(convert_to(manifest::text,'UTF8'),'sha256'),'hex')) returning * into observation;
 return to_jsonb(observation)||jsonb_build_object('manifest_canonical_utf8',manifest::text);
end$$;
create function tongs.approve_storage_historical_accounting(
 p_observation_id uuid,p_manifest_sha256 text,p_evidence_sha256 text,p_reason text) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare actor uuid; observation tongs.storage_historical_observations;
 receipt tongs.storage_historical_approvals; item storage.objects; entry jsonb;
begin
 actor:=tongs._require_storage_historical_operator();
 perform pg_advisory_xact_lock(hashtextextended('forge-storage-historical-accounting',0));
 select * into observation from tongs.storage_historical_observations where id=p_observation_id;
 if not found or observation.manifest_sha256 is distinct from p_manifest_sha256
 or observation.manifest_sha256<>encode(extensions.digest(convert_to(observation.manifest::text,'UTF8'),'sha256'),'hex') then
  raise exception 'historical manifest mismatch' using errcode='23514'; end if;
 select * into receipt from tongs.storage_historical_approvals where observation_id=p_observation_id;
 if found then
  if receipt.operator_id<>actor or receipt.reason is distinct from p_reason
   or receipt.evidence_sha256 is distinct from p_evidence_sha256 then
   raise exception 'authorization replay conflict' using errcode='23505'; end if;
  if exists(select 1 from tongs.storage_historical_revocations where observation_id=p_observation_id) then
   raise exception 'historical approval revoked' using errcode='23514'; end if;
  return to_jsonb(receipt);
 end if;
 if observation.observed_at<clock_timestamp()-interval '10 minutes' then
  raise exception 'historical observation expired' using errcode='23514'; end if;
 if (select count(*) from tongs.storage_historical_objects)+jsonb_array_length(observation.manifest->'objects')>475 then
  raise exception 'historical inventory ceiling exceeded' using errcode='23514'; end if;
 for entry in select value from jsonb_array_elements(observation.manifest->'objects') order by value->>'object_id' loop
  select * into item from storage.objects where id=(entry->>'object_id')::uuid for update;
  if not found or tongs._storage_historical_identity(item) is distinct from entry
   or exists(select 1 from tongs.workspaces w where w.id=tongs._storage_capacity_workspace(item.bucket_id,item.name) and w.created_by is not null)
   or exists(select 1 from tongs.storage_quarantine_objects q where q.object_id=item.id) then
   raise exception 'historical object changed or attributed' using errcode='23514'; end if;
 end loop;
 insert into tongs.storage_historical_approvals(observation_id,operator_id,manifest_sha256,evidence_sha256,reason)
 values(p_observation_id,actor,p_manifest_sha256,p_evidence_sha256,p_reason) returning * into receipt;
 insert into tongs.storage_historical_objects(object_id,observation_id,identity)
 select (value->>'object_id')::uuid,p_observation_id,value from jsonb_array_elements(observation.manifest->'objects');
 return to_jsonb(receipt);
end$$;
create function tongs.revoke_storage_historical_accounting(p_observation_id uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare actor uuid; receipt tongs.storage_historical_revocations;
begin
 actor:=tongs._require_storage_historical_operator();
 perform pg_advisory_xact_lock(hashtextextended('forge-storage-historical-accounting',0));
 -- Serialize against mutations of affected rows; revocation cannot remove bytes.
 perform 1 from storage.objects o join tongs.storage_historical_objects h on h.object_id=o.id
  where h.observation_id=p_observation_id order by o.id for update of o;
 select * into receipt from tongs.storage_historical_revocations where observation_id=p_observation_id;
 if found then
  if receipt.operator_id<>actor or receipt.reason is distinct from p_reason then
   raise exception 'revocation replay conflict' using errcode='23505'; end if;
  return to_jsonb(receipt);
 end if;
 insert into tongs.storage_historical_revocations(observation_id,operator_id,reason)
 values(p_observation_id,actor,p_reason) returning * into receipt;
 return to_jsonb(receipt);
end$$;
create function tongs._storage_historical_matches(o storage.objects) returns boolean
language sql stable security definer set search_path=pg_catalog as $$
 select exists(select 1 from tongs.storage_historical_objects h where h.object_id=o.id
 and h.identity=tongs._storage_historical_identity(o)
 and not exists(select 1 from tongs.storage_historical_retirements r where r.object_id=h.object_id)
 and not exists(select 1 from tongs.storage_historical_revocations r where r.observation_id=h.observation_id))
$$;
create function tongs._retire_storage_historical_generation() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if tg_op='DELETE' or tongs._storage_historical_identity(new) is distinct from tongs._storage_historical_identity(old) then
  insert into tongs.storage_historical_retirements(object_id,operation,successor_identity,actor_id,actor_role)
  select object_id,tg_op,case when tg_op='UPDATE' then tongs._storage_historical_identity(new) end,auth.uid(),auth.role()
  from tongs.storage_historical_objects where object_id=old.id
  on conflict(object_id) do nothing;
 end if;
 return null;
end$$;
-- Audit only. No mutation denial; failure of ordinary capacity rolls this back.
create trigger forge_storage_00_historical_retirement after update or delete on storage.objects
 for each row execute function tongs._retire_storage_historical_generation();

create function tongs.read_storage_historical_accounting() returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
begin
 perform tongs._require_storage_historical_operator();
 return (select jsonb_build_object('approved_objects',count(*),
 'approved_bytes',coalesce(sum((h.identity->>'byte_size')::bigint),0),
 'excluded_objects',count(*) filter(where tongs._storage_historical_matches(o)),
 'unassigned_retained_bytes',coalesce(sum((h.identity->>'byte_size')::bigint) filter(where tongs._storage_historical_matches(o)),0),
 'retired_objects',(select count(*) from tongs.storage_historical_retirements),
 'revoked_approvals',(select count(*) from tongs.storage_historical_revocations),
 'customer_charge',0,'capacity_credit',0,'billing_amount_status','not_provider_billed_cost')
 from tongs.storage_historical_objects h left join storage.objects o on o.id=h.object_id);
end$$;

do $$declare n text;begin
 foreach n in array array['storage_historical_observations','storage_historical_approvals',
 'storage_historical_objects','storage_historical_retirements','storage_historical_revocations'] loop
  execute format('alter table tongs.%I owner to postgres',n);
  execute format('alter table tongs.%I enable row level security',n);
  execute format('revoke all on tongs.%I from public,anon,authenticated,service_role',n);
  execute format('create trigger immutable_evidence before update or delete on tongs.%I for each row execute function tongs._immutable_subscription_evidence()',n);
 end loop;
end$$;

create or replace function tongs._storage_capacity_usage(p_owner uuid,p_exclude uuid default null)
returns jsonb language sql volatile security definer set search_path=pg_catalog as $$
 with owned as (
  select o.metadata from storage.objects o
  join tongs.workspaces w on w.id=tongs._storage_capacity_workspace(o.bucket_id,o.name)
  where w.created_by=p_owner and (p_exclude is null or o.id<>p_exclude)
   and not tongs._storage_quarantine_matches(o) and not tongs._storage_historical_matches(o)
   and not tongs._storage_capacity_temporary(o.bucket_id,o.name)
 ) select jsonb_build_object(
  'used_bytes',coalesce(sum(case when metadata->>'size' ~ '^[0-9]{1,18}$' then (metadata->>'size')::bigint else 0 end),0),
  'unknown_size_objects',count(*) filter(where metadata->>'size' is null or metadata->>'size' !~ '^[0-9]{1,18}$'),
  'retained_objects',count(*),
  'unattributed_objects',(select count(*) from storage.objects o where o.bucket_id in ('forge-workpieces','bellows-capture')
   and not tongs._storage_quarantine_matches(o) and not tongs._storage_historical_matches(o)
   and not tongs._storage_capacity_temporary(o.bucket_id,o.name)
   and not exists(select 1 from tongs.workspaces w
    where w.id=tongs._storage_capacity_workspace(o.bucket_id,o.name) and w.created_by is not null))) from owned
$$;

create or replace function tongs._enforce_storage_capacity()
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
  if v_owner is null then raise exception 'storage_billing_owner_unresolved' using errcode='PF002'; end if;
  if current_setting('transaction_isolation')<>'read committed' then
    raise exception 'storage_capacity_requires_read_committed' using errcode='25000';
  end if;
  -- Serialize final metadata publication for every writer, including service_role.
  -- Deletion never enters this trigger. Do not introduce a privileged bypass.
  perform pg_advisory_xact_lock(hashtextextended('forge-storage-capacity:'||v_owner::text,0));
  if new.metadata->>'size' is null or new.metadata->>'size' !~ '^[0-9]{1,18}$' then
    raise exception 'storage_usage_size_unverified' using errcode='PF002';
  end if;
  v_size:=(new.metadata->>'size')::bigint;
  v_entitlement:=tongs._storage_capacity_entitlement(v_owner);
  v_limit:=(v_entitlement->>'total_bytes')::bigint;
  v_used:=tongs._storage_capacity_usage(v_owner,new.id);
  if (v_used->>'unknown_size_objects')::bigint>0 or (v_used->>'unattributed_objects')::bigint>0 then
    raise exception 'storage_usage_reconciliation_required' using errcode='PF002';
  end if;
  if tg_op='UPDATE' and old.metadata->>'size' ~ '^[0-9]{1,18}$'
    -- An excluded predecessor is not billable debt. Only this transaction's
    -- retired original generation qualifies; the successor is counted in full.
    and not exists(select 1 from tongs.storage_historical_objects h
      join tongs.storage_historical_retirements r on r.object_id=h.object_id
      where h.object_id=old.id and h.identity=tongs._storage_historical_identity(old)
      and r.transaction_id=pg_current_xact_id()::text
      and not exists(select 1 from tongs.storage_historical_revocations v where v.observation_id=h.observation_id))
    and (v_used->>'used_bytes')::numeric+(old.metadata->>'size')::bigint>v_limit then
    raise exception 'storage_capacity_exceeded_delete_only' using errcode='PF001';
  end if;
  if v_limit=0 or (v_used->>'used_bytes')::numeric+v_size>v_limit then
    raise exception 'storage_capacity_exceeded_delete_only' using errcode='PF001';
  end if;
  return new;
end $$;

alter function tongs._enforce_storage_capacity() owner to postgres;
revoke all on function tongs._enforce_storage_capacity() from public,anon,authenticated,service_role;

do $$declare signature text;begin
 foreach signature in array array['_storage_historical_identity(storage.objects)','_require_storage_historical_operator()',
 'observe_storage_historical_accounting(uuid[])','approve_storage_historical_accounting(uuid,text,text,text)',
 'revoke_storage_historical_accounting(uuid,text)','_storage_historical_matches(storage.objects)',
 '_retire_storage_historical_generation()','read_storage_historical_accounting()'] loop
  execute 'alter function tongs.'||signature||' owner to postgres';
  execute 'revoke all on function tongs.'||signature||' from public,anon,authenticated,service_role';
 end loop;
end$$;
grant execute on function tongs.observe_storage_historical_accounting(uuid[]),
 tongs.approve_storage_historical_accounting(uuid,text,text,text),
 tongs.revoke_storage_historical_accounting(uuid,text),tongs.read_storage_historical_accounting() to authenticated;
commit;
