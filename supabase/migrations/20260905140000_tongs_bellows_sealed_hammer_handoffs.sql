-- Bellows may hand media to Hammer only after an immutable capture package exists.
begin;

create table if not exists tongs.bellows_hammer_handoff_receipts (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references tongs.bellows_capture_packages(id) on delete restrict,
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  workpiece_id uuid not null references tongs.episodes(id) on delete restrict,
  operation_id uuid not null,
  state text not null default 'pending' check(state in ('pending','committed','recoverable_failure')),
  hammer_import_id uuid references tongs.hammer_recording_import_requests(id) on delete restrict,
  last_error text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  committed_at timestamptz,
  unique(package_id), unique(workspace_id,operation_id)
);

drop trigger if exists trg_bellows_hammer_handoff_updated_at on tongs.bellows_hammer_handoff_receipts;
create trigger trg_bellows_hammer_handoff_updated_at before update on tongs.bellows_hammer_handoff_receipts
for each row execute function tongs.set_updated_at();

alter table tongs.bellows_hammer_handoff_receipts enable row level security;
drop policy if exists bellows_hammer_handoff_read on tongs.bellows_hammer_handoff_receipts;
create policy bellows_hammer_handoff_read on tongs.bellows_hammer_handoff_receipts for select to authenticated
using(tongs.can_access_workspace(workspace_id));
revoke insert,update,delete on tongs.bellows_hammer_handoff_receipts from authenticated;
grant select on tongs.bellows_hammer_handoff_receipts to authenticated,service_role;

create or replace function tongs.begin_bellows_hammer_handoff(p_package_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare p tongs.bellows_capture_packages; r tongs.bellows_hammer_handoff_receipts;
begin
  select * into p from tongs.bellows_capture_packages where id=p_package_id;
  if not found then return jsonb_build_object('outcome','package_not_found'); end if;
  if not tongs.has_workspace_role(p.workspace_id,'editor') then return jsonb_build_object('outcome','denied'); end if;
  select * into r from tongs.bellows_hammer_handoff_receipts where package_id=p.id for update;
  if found then return jsonb_build_object('outcome',case when r.state='committed' then 'committed' else 'resumable' end,'receipt',to_jsonb(r)); end if;
  insert into tongs.bellows_hammer_handoff_receipts(package_id,workspace_id,workpiece_id,operation_id,created_by)
  values(p.id,p.workspace_id,p.workpiece_id,gen_random_uuid(),auth.uid()) returning * into r;
  return jsonb_build_object('outcome','pending','receipt',to_jsonb(r));
end $$;

create or replace function tongs.complete_bellows_hammer_handoff(p_package_id uuid,p_hammer_import_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare r tongs.bellows_hammer_handoff_receipts; h tongs.hammer_recording_import_requests;
begin
  select * into r from tongs.bellows_hammer_handoff_receipts where package_id=p_package_id for update;
  if not found then return jsonb_build_object('outcome','not_found'); end if;
  if not tongs.has_workspace_role(r.workspace_id,'editor') then return jsonb_build_object('outcome','denied'); end if;
  select * into h from tongs.hammer_recording_import_requests where id=p_hammer_import_id and state='committed';
  if not found or h.workspace_id<>r.workspace_id or h.workpiece_id<>r.workpiece_id then return jsonb_build_object('outcome','import_not_committed'); end if;
  update tongs.bellows_hammer_handoff_receipts set state='committed',hammer_import_id=h.id,last_error=null,committed_at=coalesce(committed_at,now()) where id=r.id returning * into r;
  return jsonb_build_object('outcome','committed','receipt',to_jsonb(r));
end $$;

create or replace function tongs.fail_bellows_hammer_handoff(p_package_id uuid,p_error text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare r tongs.bellows_hammer_handoff_receipts;
begin
  select * into r from tongs.bellows_hammer_handoff_receipts where package_id=p_package_id for update;
  if not found then return jsonb_build_object('outcome','not_found'); end if;
  if not tongs.has_workspace_role(r.workspace_id,'editor') then return jsonb_build_object('outcome','denied'); end if;
  if r.state='committed' then return jsonb_build_object('outcome','committed','receipt',to_jsonb(r)); end if;
  update tongs.bellows_hammer_handoff_receipts set state='recoverable_failure',last_error=left(coalesce(p_error,'unknown'),1000) where id=r.id returning * into r;
  return jsonb_build_object('outcome','recoverable_failure','receipt',to_jsonb(r));
end $$;

revoke all on function tongs.begin_bellows_hammer_handoff(uuid) from public,anon;
revoke all on function tongs.complete_bellows_hammer_handoff(uuid,uuid) from public,anon;
revoke all on function tongs.fail_bellows_hammer_handoff(uuid,text) from public,anon;
grant execute on function tongs.begin_bellows_hammer_handoff(uuid) to authenticated,service_role;
grant execute on function tongs.complete_bellows_hammer_handoff(uuid,uuid) to authenticated,service_role;
grant execute on function tongs.fail_bellows_hammer_handoff(uuid,text) to authenticated,service_role;

commit;
