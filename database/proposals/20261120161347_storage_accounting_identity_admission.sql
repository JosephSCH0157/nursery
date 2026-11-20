-- PROPOSAL ONLY: successor to 446, not part of the approved shared tail.
-- No hosted execution. Promote only through the reviewed lineage/catalog and
-- coordinated release procedure; migrations 441-446 remain byte-identical.
begin;
do $$begin
 if to_regprocedure('tongs._storage_historical_identity(storage.objects)') is null
  or to_regclass('tongs.workpiece_manifest_publications') is null then
  raise exception 'Storage accounting and manifest predecessor 446 required';
 end if;
end$$;

create or replace function tongs._enforce_storage_capacity()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare v_workspace uuid; v_owner uuid; v_used jsonb; v_entitlement jsonb;
 v_size bigint; v_limit bigint; v_excluded_predecessor boolean:=false;
begin
 select * into new from storage.objects where id=new.id;
 if not found then return null; end if;
 if new.bucket_id not in ('forge-workpieces','bellows-capture')
  or tongs._storage_capacity_temporary(new.bucket_id,new.name) then return new; end if;
 if tg_op='UPDATE' then
  if tongs._storage_historical_identity(new)=tongs._storage_historical_identity(old) then return new; end if;
  -- The provider's canUpload upsert assigns version/owner but not metadata.
  -- Only the identity trigger may defer this intermediate shape. Any SQL
  -- statement assigning metadata also fires the publication guard, even when
  -- the assigned metadata equals the old value. Durable version-only writes
  -- still pass the unchanged deferred constraint guard before commit.
  if tg_name='forge_storage_capacity_identity_guard'
   and new.version is distinct from old.version
   and (tongs._storage_historical_identity(new)-array['version','owner','owner_id'])
     =(tongs._storage_historical_identity(old)-array['version','owner','owner_id']) then return new; end if;
  select exists(select 1 from tongs.storage_historical_objects h
   where h.object_id=old.id and h.identity=tongs._storage_historical_identity(old)
    and not exists(select 1 from tongs.storage_historical_revocations v where v.observation_id=h.observation_id)
    and not exists(select 1 from tongs.storage_historical_retirements r
     where r.object_id=h.object_id and r.transaction_id<>pg_current_xact_id()::text))
   into v_excluded_predecessor;
  -- Ordinary descriptive metadata has no accounting exposure. An approved
  -- original is different: changing its pinned metadata retires its exclusion
  -- and therefore requires admission for its entire newly billable size.
  if not v_excluded_predecessor and new.bucket_id=old.bucket_id and new.name=old.name
   and new.version is not distinct from old.version and new.metadata is not distinct from old.metadata
   and new.owner is not distinct from old.owner and new.owner_id is not distinct from old.owner_id
   and new.created_at is not distinct from old.created_at then return new; end if;
 end if;
 v_workspace:=tongs._storage_capacity_workspace(new.bucket_id,new.name);
 select created_by into v_owner from tongs.workspaces where id=v_workspace;
 if v_owner is null then raise exception 'storage_billing_owner_unresolved' using errcode='PF002'; end if;
 if current_setting('transaction_isolation')<>'read committed' then
  raise exception 'storage_capacity_requires_read_committed' using errcode='25000'; end if;
 perform pg_advisory_xact_lock(hashtextextended('forge-storage-capacity:'||v_owner::text,0));
 if new.metadata->>'size' is null or new.metadata->>'size' !~ '^[0-9]{1,18}$' then
  raise exception 'storage_usage_size_unverified' using errcode='PF002'; end if;
 v_size:=(new.metadata->>'size')::bigint;
 v_entitlement:=tongs._storage_capacity_entitlement(v_owner);
 v_limit:=(v_entitlement->>'total_bytes')::bigint;
 v_used:=tongs._storage_capacity_usage(v_owner,new.id);
 if (v_used->>'unknown_size_objects')::bigint>0 or (v_used->>'unattributed_objects')::bigint>0 then
  raise exception 'storage_usage_reconciliation_required' using errcode='PF002'; end if;
 if tg_op='UPDATE' and old.metadata->>'size' ~ '^[0-9]{1,18}$' and not v_excluded_predecessor
  and (v_used->>'used_bytes')::numeric+(old.metadata->>'size')::bigint>v_limit then
  raise exception 'storage_capacity_exceeded_delete_only' using errcode='PF001'; end if;
 if v_limit=0 or (v_used->>'used_bytes')::numeric+v_size>v_limit then
  raise exception 'storage_capacity_exceeded_delete_only' using errcode='PF001'; end if;
 return new;
end$$;
alter function tongs._enforce_storage_capacity() owner to postgres;
revoke all on function tongs._enforce_storage_capacity() from public,anon,authenticated,service_role;

drop trigger forge_storage_capacity_statement_guard on storage.objects;
create trigger forge_storage_capacity_statement_guard
 after insert or update of metadata on storage.objects
 for each row when (new.metadata->>'size' is not null)
 execute function tongs._enforce_storage_capacity();
create trigger forge_storage_capacity_identity_guard
 after update of id,bucket_id,name,version,owner,owner_id,user_metadata,created_at on storage.objects
 for each row when (new.metadata->>'size' is not null)
 execute function tongs._enforce_storage_capacity();
-- Existing deferred capacity, retirement, quarantine and manifest triggers,
-- RLS policies, grants, ownership and financial authority are unchanged.
commit;
