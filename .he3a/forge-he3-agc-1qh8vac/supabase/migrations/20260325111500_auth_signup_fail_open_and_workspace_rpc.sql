begin;

create or replace function tongs.list_my_workspaces()
returns table (
  workspace_id uuid,
  workspace_name text,
  role text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_user uuid;
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  return query
  select
    w.id as workspace_id,
    w.name as workspace_name,
    wm.role,
    w.created_at
  from tongs.workspace_members wm
  join tongs.workspaces w
    on w.id = wm.workspace_id
  where wm.user_id = v_user
  order by
    tongs.workspace_role_rank(wm.role) desc,
    w.created_at asc,
    lower(w.name) asc;
end;
$$;

revoke all on function tongs.list_my_workspaces() from public;
grant execute on function tongs.list_my_workspaces() to authenticated;
grant execute on function tongs.list_my_workspaces() to service_role;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, tongs
as $$
begin
  begin
    if pg_catalog.to_regclass('public.profiles') is not null then
      insert into public.profiles (user_id)
      values (new.id)
      on conflict (user_id) do nothing;
    end if;
  exception when others then
    raise warning '[handle_new_user] profile bootstrap failed for user %: % (%)', new.id, SQLERRM, SQLSTATE;
  end;

  begin
    if not exists (
      select 1
      from tongs.workspace_members
      where user_id = new.id
    ) then
      perform tongs.create_workspace_admin('My Workspace', new.id);
    end if;
  exception when others then
    raise warning '[handle_new_user] workspace bootstrap failed for user %: % (%)', new.id, SQLERRM, SQLSTATE;
  end;

  return new;
end;
$$;

commit;
