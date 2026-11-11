-- No hosted inventory or approvals are seeded. Observe and approve are separate,
-- authenticated platform-operator actions. No ownership or entitlement changes.
begin;
create table tongs.storage_quarantine_observations (
 id uuid primary key default gen_random_uuid(), operator_id uuid not null references auth.users(id),
 observed_at timestamptz not null, manifest jsonb not null, manifest_sha256 text not null unique
);
create table tongs.storage_quarantine_authorizations (
 observation_id uuid primary key references tongs.storage_quarantine_observations(id),
 operator_id uuid not null references auth.users(id), approved_at timestamptz not null default clock_timestamp(),
 manifest_sha256 text not null, reason text not null check(length(btrim(reason)) between 8 and 1000)
);
create table tongs.storage_quarantine_objects (
 object_id uuid primary key, observation_id uuid not null references tongs.storage_quarantine_authorizations(observation_id),
 bucket text not null, path_sha256 text not null, identity jsonb not null,
 unique(bucket,path_sha256)
);
create table tongs.storage_quarantine_deletions (
 object_id uuid primary key references tongs.storage_quarantine_objects(object_id),
 deleted_at timestamptz not null default clock_timestamp(), actor_id uuid, actor_role text
);

create function tongs._storage_quarantine_identity(o storage.objects) returns jsonb
language sql immutable set search_path=pg_catalog as $$
 select jsonb_build_object('object_id',o.id,'bucket',o.bucket_id,
 'path_sha256',encode(extensions.digest(convert_to(o.name,'UTF8'),'sha256'),'hex'),
 'version',o.version,'byte_size',o.metadata->>'size',
 'metadata_sha256',encode(extensions.digest(convert_to(coalesce(o.metadata,'null'::jsonb)::text,'UTF8'),'sha256'),'hex'),
 'created_at',extract(epoch from o.created_at),'updated_at',extract(epoch from o.updated_at),
 'owner',o.owner,'owner_id',o.owner_id,'user_metadata',to_jsonb(o)->'user_metadata')
$$;
create function tongs._require_storage_quarantine_operator() returns uuid
language plpgsql security definer set search_path=pg_catalog as $$
declare actor uuid:=auth.uid();
begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'quarantine requires read committed' using errcode='25000'; end if;
 if auth.role() is distinct from 'authenticated' or actor is null or not tongs.is_platform_operator(actor)
 then raise exception 'authenticated platform operator required' using errcode='42501'; end if;
 perform 1 from tongs.platform_operators where user_id=actor for share;
 if not found then raise exception 'operator authority revoked' using errcode='42501'; end if;
 return actor;
end$$;
create function tongs.observe_storage_quarantine(p_object_ids uuid[]) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare actor uuid; observed timestamptz:=clock_timestamp(); item storage.objects; items jsonb:='[]'; manifest jsonb;
 observation tongs.storage_quarantine_observations;
begin
 actor:=tongs._require_storage_quarantine_operator();
 if cardinality(p_object_ids) is null or cardinality(p_object_ids) not between 1 and 475
 or (select count(distinct x) from unnest(p_object_ids) x)<>cardinality(p_object_ids)
 then raise exception 'explicit unique bounded object inventory required' using errcode='22023'; end if;
 for item in select * from storage.objects where id=any(p_object_ids) order by id for share loop
   -- Fixed historical boundary from the reviewed November 11 inventory, not a
   -- caller-selected cutoff. Age is eligibility only, never ownership proof.
   if item.created_at is null or item.updated_at is null
   or item.created_at>='2026-11-11T00:00:00Z'::timestamptz or item.updated_at>='2026-11-11T00:00:00Z'::timestamptz
   or item.bucket_id not in ('forge-workpieces','bellows-capture')
   or item.metadata->>'size' is null or item.metadata->>'size' !~ '^[0-9]{1,18}$'
   or tongs._storage_capacity_temporary(item.bucket_id,item.name)
   or exists(select 1 from tongs.workspaces w where w.id=tongs._storage_capacity_workspace(item.bucket_id,item.name) and w.created_by is not null)
   then raise exception 'object is not eligible unresolved historical evidence' using errcode='23514'; end if;
   items:=items||jsonb_build_array(tongs._storage_quarantine_identity(item));
 end loop;
 if jsonb_array_length(items)<>cardinality(p_object_ids) then raise exception 'missing object' using errcode='23514'; end if;
 manifest:=jsonb_build_object('policy','forge.storage-historical-quarantine.v1','historical_before','2026-11-11T00:00:00Z',
 'observed_at',observed,'objects',items);
 insert into tongs.storage_quarantine_observations(operator_id,observed_at,manifest,manifest_sha256)
 values(actor,observed,manifest,encode(extensions.digest(convert_to(manifest::text,'UTF8'),'sha256'),'hex')) returning * into observation;
 return to_jsonb(observation)||jsonb_build_object('manifest_canonical_utf8',manifest::text);
end$$;
create function tongs.approve_storage_quarantine(p_observation_id uuid,p_manifest_sha256 text,p_reason text) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare actor uuid; observation tongs.storage_quarantine_observations; receipt tongs.storage_quarantine_authorizations;
 item storage.objects; entry jsonb;
begin
 actor:=tongs._require_storage_quarantine_operator();
 perform pg_advisory_xact_lock(hashtextextended('forge-storage-historical-quarantine',0));
 select * into observation from tongs.storage_quarantine_observations where id=p_observation_id;
 if not found or observation.manifest_sha256 is distinct from p_manifest_sha256
 or observation.manifest_sha256<>encode(extensions.digest(convert_to(observation.manifest::text,'UTF8'),'sha256'),'hex')
 then raise exception 'quarantine manifest mismatch' using errcode='23514'; end if;
 select * into receipt from tongs.storage_quarantine_authorizations where observation_id=p_observation_id;
 if found then
   if receipt.operator_id<>actor or receipt.reason is distinct from p_reason then raise exception 'authorization replay conflict' using errcode='23505'; end if;
   return to_jsonb(receipt);
 end if;
 if (select count(*) from tongs.storage_quarantine_objects)+jsonb_array_length(observation.manifest->'objects')>475
 then raise exception 'reviewed historical inventory ceiling exceeded' using errcode='23514'; end if;
 for entry in select value from jsonb_array_elements(observation.manifest->'objects') order by value->>'object_id' loop
   select * into item from storage.objects where id=(entry->>'object_id')::uuid for update;
   if not found or tongs._storage_quarantine_identity(item) is distinct from entry
   or exists(select 1 from tongs.workspaces w where w.id=tongs._storage_capacity_workspace(item.bucket_id,item.name) and w.created_by is not null)
   then raise exception 'quarantine object changed or attributed' using errcode='23514'; end if;
 end loop;
 insert into tongs.storage_quarantine_authorizations(observation_id,operator_id,manifest_sha256,reason)
 values(p_observation_id,actor,p_manifest_sha256,p_reason) returning * into receipt;
 insert into tongs.storage_quarantine_objects(object_id,observation_id,bucket,path_sha256,identity)
 select (value->>'object_id')::uuid,p_observation_id,value->>'bucket',value->>'path_sha256',value
 from jsonb_array_elements(observation.manifest->'objects');
 return to_jsonb(receipt);
end$$;
create function tongs._storage_quarantine_matches(o storage.objects) returns boolean
language sql stable security definer set search_path=pg_catalog as $$
 select exists(select 1 from tongs.storage_quarantine_objects q where q.object_id=o.id
 and q.identity=tongs._storage_quarantine_identity(o)
 and not exists(select 1 from tongs.storage_quarantine_deletions d where d.object_id=q.object_id))
$$;
create function tongs._guard_storage_quarantine() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare q tongs.storage_quarantine_objects;
begin
 if tg_op='DELETE' then
   insert into tongs.storage_quarantine_deletions(object_id,actor_id,actor_role)
   select object_id,auth.uid(),auth.role() from tongs.storage_quarantine_objects where object_id=old.id;
   return old; -- Preserve Storage's independent delete authorization and guard.
 end if;
 select * into q from tongs.storage_quarantine_objects where object_id=new.id
 or (bucket=new.bucket_id and path_sha256=encode(extensions.digest(convert_to(new.name,'UTF8'),'sha256'),'hex'))
 or (tg_op='UPDATE' and object_id=old.id) limit 1;
 if found and (tg_op='INSERT' or q.identity is distinct from tongs._storage_quarantine_identity(new)
 or exists(select 1 from tongs.storage_quarantine_deletions where object_id=q.object_id))
 then raise exception 'historical quarantine forbids mutation or reappearance' using errcode='PF002'; end if;
 return new;
end$$;
create trigger forge_storage_quarantine_guard before insert or update or delete on storage.objects
 for each row execute function tongs._guard_storage_quarantine();
-- Recheck the final tuple after provider BEFORE triggers (including updated_at).
create trigger forge_storage_00_quarantine_final_guard after insert or update on storage.objects
 for each row execute function tongs._guard_storage_quarantine();

-- Operator-only byte accounting, not a customer debit/credit or a fabricated
-- provider bill. Approval evidence survives deletion; current unassigned usage
-- counts only exact objects that remain present.
create function tongs.read_storage_quarantine_accounting() returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
begin
 perform tongs._require_storage_quarantine_operator();
 return (select jsonb_build_object('approved_objects',count(*),'approved_bytes',coalesce(sum((q.identity->>'byte_size')::bigint),0),
 'present_objects',count(*) filter(where tongs._storage_quarantine_matches(o)),
 'unassigned_retained_bytes',coalesce(sum((q.identity->>'byte_size')::bigint) filter(where tongs._storage_quarantine_matches(o)),0),
 'deleted_objects',(select count(*) from tongs.storage_quarantine_deletions),
 'customer_charge',0,'capacity_credit',0,'billing_amount_status','not_provider_billed_cost')
 from tongs.storage_quarantine_objects q left join storage.objects o on o.id=q.object_id);
end$$;

-- Immutable receipts and snapshots, RLS with no direct application grants.
do $$declare n text;begin
 foreach n in array array['storage_quarantine_observations','storage_quarantine_authorizations','storage_quarantine_objects','storage_quarantine_deletions'] loop
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
      and not tongs._storage_quarantine_matches(o)
      and not tongs._storage_capacity_temporary(o.bucket_id,o.name)
  ) select jsonb_build_object(
    'used_bytes',coalesce(sum(case when metadata->>'size' ~ '^[0-9]{1,18}$' then (metadata->>'size')::bigint else 0 end),0),
    'unknown_size_objects',count(*) filter(where metadata->>'size' is null or metadata->>'size' !~ '^[0-9]{1,18}$'),
    'retained_objects',count(*),
    'unattributed_objects',(select count(*) from storage.objects o where o.bucket_id in ('forge-workpieces','bellows-capture')
      and not tongs._storage_quarantine_matches(o)
      and not tongs._storage_capacity_temporary(o.bucket_id,o.name)
      and not exists(select 1 from tongs.workspaces w
        where w.id=tongs._storage_capacity_workspace(o.bucket_id,o.name) and w.created_by is not null))) from owned
$$;

do $$declare signature text;begin
 foreach signature in array array['_storage_quarantine_identity(storage.objects)','_require_storage_quarantine_operator()',
 'observe_storage_quarantine(uuid[])','approve_storage_quarantine(uuid,text,text)','_storage_quarantine_matches(storage.objects)',
 '_guard_storage_quarantine()','read_storage_quarantine_accounting()'] loop
 execute 'alter function tongs.'||signature||' owner to postgres';
 execute 'revoke all on function tongs.'||signature||' from public,anon,authenticated,service_role';
 end loop;
end$$;
grant execute on function tongs.observe_storage_quarantine(uuid[]),tongs.approve_storage_quarantine(uuid,text,text),tongs.read_storage_quarantine_accounting() to authenticated;
-- No attribution/release RPC: workspace repair alone cannot assign these bytes.
-- Later attribution requires independently reviewed authoritative ownership proof
-- and a separately approved forward procedure; operator status is not that proof.
commit;
