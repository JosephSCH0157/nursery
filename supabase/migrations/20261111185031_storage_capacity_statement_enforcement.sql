-- Storage API must observe capacity rejection before its transaction callback
-- returns success. Keep the deferred guard for final/incomplete metadata state.
-- The rollback-only, metadata-less canUpload probe remains compatible.
begin;
-- Stable codes survive Storage API error-message sanitization. No admission
-- rule changes; the original migration remains byte-identical.
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
create trigger forge_storage_capacity_statement_guard
  after insert or update on storage.objects
  for each row when (new.metadata->>'size' is not null)
  execute function tongs._enforce_storage_capacity();
commit;
