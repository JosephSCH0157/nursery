-- PROPOSAL ONLY. Generated with pinned CLI 2.84.2; not in the shared tail.
-- This must NOT be applied out of order. As a successor to 446 it cannot fence
-- the first H444 -> H446 upgrade. That bootstrap requires a separately approved
-- provider/operational fence or a reviewed ordering decision, never renumbering.
-- Database commit fence only: provider byte uploads and external jobs require
-- independent admission shutdown, drain and object/event reconciliation.
begin;
create table forge_meta.storage_release_fence (
 singleton boolean primary key default true check(singleton),
 generation bigint not null default 0 check(generation>=0),
 paused boolean not null default true,
 compatible_contract text,
 approval_sha256 text,
 changed_at timestamptz not null default clock_timestamp(),
 check(approval_sha256 is null or approval_sha256 ~ '^[0-9a-f]{64}$'),
 check(paused or compatible_contract='forge.storage-manifest.v2')
);
alter table forge_meta.storage_release_fence owner to postgres;
alter table forge_meta.storage_release_fence enable row level security;
revoke all on forge_meta.storage_release_fence from public,anon,authenticated,service_role;
insert into forge_meta.storage_release_fence(singleton) values(true);

create table forge_meta.storage_release_fence_events (
 generation bigint primary key,
 paused boolean not null,
 compatible_contract text,
 approval_sha256 text not null check(approval_sha256 ~ '^[0-9a-f]{64}$'),
 actor name not null,
 recorded_at timestamptz not null default clock_timestamp()
);
alter table forge_meta.storage_release_fence_events owner to postgres;
alter table forge_meta.storage_release_fence_events enable row level security;
revoke all on forge_meta.storage_release_fence_events from public,anon,authenticated,service_role;

create function forge_meta.guard_storage_release_write() returns trigger
language plpgsql security definer set search_path=pg_catalog,forge_meta as $$
declare state forge_meta.storage_release_fence%rowtype;
begin
 -- SHARE conflicts with the operator's UPDATE and lasts until transaction end.
 -- Pausing therefore waits for admitted DB transactions, including service-role
 -- and SECURITY DEFINER writes. It does not claim to drain external uploads.
 select * into strict state from forge_meta.storage_release_fence where singleton for share;
 if state.paused then
  raise exception 'Storage release is paused; retain operation identity and retry after explicit resume'
   using errcode='PF004';
 end if;
 return null;
end $$;
alter function forge_meta.guard_storage_release_write() owner to postgres;
revoke all on function forge_meta.guard_storage_release_write() from public,anon,authenticated,service_role;

create function forge_meta.storage_release_fence_inventory_ok() returns boolean
language sql stable security definer set search_path=pg_catalog,forge_meta as $$
 select not exists (
  select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('tongs','public','storage') and c.relkind in ('r','p','f')
   and (c.relkind='f' or not exists (
    select 1 from pg_trigger t where t.tgrelid=c.oid
     and t.tgname='forge_storage_release_write_fence' and t.tgenabled='A'
     and t.tgfoid='forge_meta.guard_storage_release_write()'::regprocedure
     and t.tgtype=62 -- BEFORE STATEMENT INSERT/DELETE/UPDATE/TRUNCATE
   ))
 )
$$;
alter function forge_meta.storage_release_fence_inventory_ok() owner to postgres;
revoke all on function forge_meta.storage_release_fence_inventory_ok() from public,anon,authenticated,service_role;

create function forge_meta.set_storage_release_fence(
 expected_generation bigint, pause_writes boolean, contract text, approval text
) returns bigint language plpgsql security definer set search_path=pg_catalog,forge_meta as $$
declare current_state forge_meta.storage_release_fence%rowtype; next_generation bigint;
begin
 if approval is null or approval !~ '^[0-9a-f]{64}$' then raise exception 'Approval commitment required'; end if;
 if pause_writes is null then raise exception 'Explicit fence state required'; end if;
 select * into strict current_state from forge_meta.storage_release_fence where singleton for update;
 if current_state.generation is distinct from expected_generation then raise exception 'Fence generation conflict'; end if;
 if not pause_writes then
  if contract is distinct from 'forge.storage-manifest.v2'
   or to_regprocedure('tongs.read_workpiece_manifest_version(uuid)') is null
   or not forge_meta.storage_release_fence_inventory_ok() then
   raise exception 'Compatible manifest contract and complete fence inventory required';
  end if;
 end if;
 next_generation=current_state.generation+1;
 update forge_meta.storage_release_fence set generation=next_generation,paused=pause_writes,
  compatible_contract=case when pause_writes then null else contract end,
  approval_sha256=approval,changed_at=clock_timestamp() where singleton;
 insert into forge_meta.storage_release_fence_events(generation,paused,compatible_contract,approval_sha256,actor)
 values(next_generation,pause_writes,case when pause_writes then null else contract end,approval,session_user);
 return next_generation;
end $$;
alter function forge_meta.set_storage_release_fence(bigint,boolean,text,text) owner to postgres;
revoke all on function forge_meta.set_storage_release_fence(bigint,boolean,text,text) from public,anon,authenticated,service_role;

create function forge_meta.immutable_storage_release_event() returns trigger
language plpgsql set search_path=pg_catalog as $$
begin raise exception 'Release fence events are append only'; end $$;
alter function forge_meta.immutable_storage_release_event() owner to postgres;
revoke all on function forge_meta.immutable_storage_release_event() from public,anon,authenticated,service_role;
create trigger immutable_storage_release_event before update or delete or truncate
 on forge_meta.storage_release_fence_events for each statement execute function forge_meta.immutable_storage_release_event();

do $$
declare relation record;
begin
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('tongs','public','storage') and c.relkind='f') then
  raise exception 'Foreign-table external writers require reviewed isolation before fence installation';
 end if;
 for relation in select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('tongs','public','storage') and c.relkind in ('r','p')
  order by n.nspname,c.relname
 loop
  execute format('create trigger forge_storage_release_write_fence before insert or update or delete or truncate on %I.%I for each statement execute function forge_meta.guard_storage_release_write()',relation.nspname,relation.relname);
  execute format('alter table %I.%I enable always trigger forge_storage_release_write_fence',relation.nspname,relation.relname);
 end loop;
 if not forge_meta.storage_release_fence_inventory_ok() then raise exception 'Incomplete release fence'; end if;
end $$;
commit;
