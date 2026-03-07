begin;

-- Live project drift left an old owner_id-based workspace model in place.
-- Canonical repo schema uses created_by + org_id and provisions workspace access
-- through tongs.workspace_members.

update tongs.workspaces
set created_by = coalesce(created_by, owner_id)
where created_by is null;

update tongs.workspace_members wm
set created_by = coalesce(wm.created_by, wm.user_id, w.created_by)
from tongs.workspaces w
where w.id = wm.workspace_id
  and wm.created_by is null;

create or replace function tongs.create_workspace_admin(p_name text, p_owner_id uuid)
returns uuid
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  wid uuid;
  v_owner uuid;
  v_name text;
  v_org_id uuid;
begin
  v_owner := p_owner_id;
  if v_owner is null then
    raise exception 'owner_id is required'
      using errcode = '22023';
  end if;

  v_name := nullif(trim(coalesce(p_name, '')), '');
  if v_name is null then
    v_name := 'Workspace';
  end if;

  v_org_id := tongs.ensure_personal_org(v_owner);

  insert into tongs.workspaces (name, created_by, org_id)
  values (v_name, v_owner, v_org_id)
  returning id into wid;

  insert into tongs.workspace_members (
    workspace_id,
    user_id,
    role,
    created_at,
    created_by
  )
  values (
    wid,
    v_owner,
    'owner',
    now(),
    v_owner
  )
  on conflict (workspace_id, user_id) do update
    set role = excluded.role,
        created_by = coalesce(tongs.workspace_members.created_by, excluded.created_by);

  return wid;
end;
$$;

create or replace function tongs.create_workspace(p_name text)
returns uuid
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_user uuid;
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'not_authenticated'
      using errcode = '42501';
  end if;

  return tongs.create_workspace_admin(p_name, v_user);
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, tongs
as $$
begin
  insert into public.profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  if exists (
    select 1
    from tongs.workspace_members
    where user_id = new.id
  ) then
    return new;
  end if;

  perform tongs.create_workspace_admin('My Workspace', new.id);

  return new;
end;
$$;

drop trigger if exists trg_set_workspace_owner on tongs.workspaces;
drop trigger if exists trg_workspace_add_creator_as_owner on tongs.workspaces;

drop function if exists tongs.set_workspace_owner();
drop function if exists tongs.workspace_add_creator_as_owner();

alter table tongs.workspaces
  drop constraint if exists workspaces_owner_id_fkey;

alter table tongs.workspaces
  drop column if exists owner_id;

commit;
