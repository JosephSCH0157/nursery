-- Optimistic manifest publication; no backfill or historical object rewrite.
begin;
create function tongs.read_workpiece_manifest_version(p_workpiece_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare o storage.objects;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service authority required' using errcode='42501'; end if;
 select * into o from storage.objects where bucket_id='forge-workpieces' and name='workpieces/'||p_workpiece_id::text||'/manifest.json';
 if not found then return jsonb_build_object('exists',false,'version',null); end if;
 if nullif(o.version,'') is null then raise exception 'unversioned manifest requires reconciliation' using errcode='PF003'; end if;
 return jsonb_build_object('exists',true,'version',o.version);
end$$;

create table tongs.workpiece_manifest_publications (
 operation_id uuid primary key, workpiece_id uuid not null,
 object_id uuid not null, provider_version text not null,
 previous_version text, content_sha256 text not null check(content_sha256 ~ '^[0-9a-f]{64}$'),
 bytes bigint not null check(bytes>=0), published_at timestamptz not null default clock_timestamp(),
 unique(object_id,provider_version)
);
alter table tongs.workpiece_manifest_publications owner to postgres;
alter table tongs.workpiece_manifest_publications enable row level security;
revoke all on tongs.workpiece_manifest_publications from public,anon,authenticated,service_role;
create trigger immutable_evidence before update or delete on tongs.workpiece_manifest_publications
 for each row execute function tongs._immutable_subscription_evidence();

create function tongs._publish_workpiece_manifest() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare proof jsonb; wp uuid; expected text; writer jsonb;
begin
 if new.bucket_id<>'forge-workpieces' or new.name !~ '^workpieces/[0-9a-f-]{36}/manifest[.]json$' then
  if tg_op='UPDATE' and old.bucket_id='forge-workpieces' and old.name ~ '^workpieces/[0-9a-f-]{36}/manifest[.]json$' then
   raise exception 'manifest binding cannot be moved' using errcode='PF003'; end if;
  return new;
 end if;
 if tg_op='UPDATE' and new.bucket_id=old.bucket_id and new.name=old.name
  and new.version is not distinct from old.version and new.metadata is not distinct from old.metadata
  and new.user_metadata is not distinct from old.user_metadata then return new; end if;
 -- Existing-object permission probes change only version and always roll back.
 -- Permit the intermediate row, then require a real publication at commit.
 if tg_op='UPDATE' and new.bucket_id=old.bucket_id and new.name=old.name
  and new.metadata is not distinct from old.metadata and new.user_metadata is not distinct from old.user_metadata then return new; end if;
 -- Storage's rollback-only metadata-less permission probe has no durable write.
 -- The existing deferred capacity guard rejects committed missing metadata.
 if new.metadata->>'size' is null then return new; end if;
 if auth.role() is distinct from 'service_role' then raise exception 'manifest service authority required' using errcode='42501'; end if;
 proof:=new.user_metadata->'forge_manifest_publication'; expected:=proof->>'expected_version'; writer:=proof->'written_by';
 if proof is null or proof->>'protocol' is distinct from 'forge.manifest-cas.v1'
  or not (proof ? 'expected_version') or proof->>'sha256' is null or proof->>'sha256' !~ '^[0-9a-f]{64}$'
  or proof->>'operation_id' is null or proof->>'operation_id' !~ '^[0-9a-f-]{36}$'
  or nullif(writer->>'tool','') is null or nullif(writer->>'tool_version','') is null or nullif(writer->>'lane','') is null
  or nullif(new.version,'') is null then
  raise exception 'manifest version precondition required' using errcode='PF003'; end if;
 if (tg_op='INSERT' and expected is not null)
  or (tg_op='UPDATE' and (expected is null or old.version is distinct from expected
   or old.bucket_id<>new.bucket_id or old.name<>new.name)) then
  raise exception 'manifest version conflict' using errcode='PF003'; end if;
 wp:=split_part(new.name,'/',2)::uuid;
 -- Storage row lock + this upsert are one transaction. Failed capacity or
 -- registry publication rolls both back before the HTTP upload returns success.
 insert into tongs.workpiece_files(workpiece_id,path,file_type,content_type,bytes,hash_algo,hash_value,
  storage_bucket,storage_key,written_by_tool,written_by_tool_version,written_by_lane)
 values(wp,'manifest.json','manifest','application/json',(new.metadata->>'size')::bigint,'sha256',proof->>'sha256',
  new.bucket_id,new.name,writer->>'tool',writer->>'tool_version',writer->>'lane')
 on conflict(workpiece_id,path) do update set file_type=excluded.file_type,content_type=excluded.content_type,
  bytes=excluded.bytes,hash_algo=excluded.hash_algo,hash_value=excluded.hash_value,storage_bucket=excluded.storage_bucket,
  storage_key=excluded.storage_key,written_by_tool=excluded.written_by_tool,
  written_by_tool_version=excluded.written_by_tool_version,written_by_lane=excluded.written_by_lane;
 insert into tongs.workpiece_manifest_publications(operation_id,workpiece_id,object_id,provider_version,previous_version,content_sha256,bytes)
 values((proof->>'operation_id')::uuid,wp,new.id,new.version,expected,proof->>'sha256',(new.metadata->>'size')::bigint);
 return new;
end$$;
create trigger forge_storage_10_manifest_publication after insert or update on storage.objects
 for each row execute function tongs._publish_workpiece_manifest();

create function tongs._verify_workpiece_manifest_publication() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare o storage.objects;
begin
 if new.bucket_id<>'forge-workpieces' or new.name !~ '^workpieces/[0-9a-f-]{36}/manifest[.]json$' then return new; end if;
 if tg_op='UPDATE' and new.version is not distinct from old.version
  and new.metadata is not distinct from old.metadata and new.user_metadata is not distinct from old.user_metadata
  and new.name=old.name and new.bucket_id=old.bucket_id then return new; end if;
 select * into o from storage.objects where id=new.id;
 if not found then return new; end if;
 if not exists(select 1 from tongs.workpiece_manifest_publications p where p.object_id=o.id and p.provider_version=o.version
   and p.operation_id::text=o.user_metadata->'forge_manifest_publication'->>'operation_id'
   and p.content_sha256=o.user_metadata->'forge_manifest_publication'->>'sha256'
   and p.bytes=(o.metadata->>'size')::bigint) then
  raise exception 'manifest publication incomplete' using errcode='PF003'; end if;
 return new;
end$$;
create constraint trigger manifest_publication_complete after insert or update on storage.objects
 deferrable initially deferred for each row execute function tongs._verify_workpiece_manifest_publication();

create function tongs._guard_manifest_registry_identity() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare o storage.objects;
begin
 if new.path<>'manifest.json' then return new; end if;
 select * into o from storage.objects where bucket_id='forge-workpieces'
  and name='workpieces/'||new.workpiece_id::text||'/manifest.json' for share;
 if not found or new.storage_bucket<>o.bucket_id or new.storage_key<>o.name
  or new.hash_algo<>'sha256' or new.hash_value is distinct from o.user_metadata->'forge_manifest_publication'->>'sha256'
  or new.bytes is distinct from (o.metadata->>'size')::bigint then
  raise exception 'manifest registry version conflict' using errcode='PF003'; end if;
 return new;
end$$;
create trigger manifest_registry_identity before insert or update on tongs.workpiece_files
 for each row execute function tongs._guard_manifest_registry_identity();

do $$declare sig text;begin
 foreach sig in array array['read_workpiece_manifest_version(uuid)','_publish_workpiece_manifest()','_guard_manifest_registry_identity()','_verify_workpiece_manifest_publication()'] loop
  execute 'alter function tongs.'||sig||' owner to postgres';
  execute 'revoke all on function tongs.'||sig||' from public,anon,authenticated,service_role';
 end loop;
end$$;
grant execute on function tongs.read_workpiece_manifest_version(uuid) to service_role;
commit;
