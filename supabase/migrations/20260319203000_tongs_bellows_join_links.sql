-- Bellows Phase Eight A: canonical join-link access artifacts.
-- Bellows join URLs are access-control truth, not client-owned routing state.

begin;

create table if not exists tongs.bellows_session_join_links (
  id uuid primary key default gen_random_uuid(),
  session_id text not null references tongs.bellows_sessions(id) on delete cascade,
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  token_hash text not null unique,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  role_code text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz null,
  max_uses integer not null default 5,
  use_count integer not null default 0,
  last_used_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bellows_session_join_links_session_id_check check (length(btrim(session_id)) > 0),
  constraint bellows_session_join_links_token_hash_check check (length(btrim(token_hash)) > 0),
  constraint bellows_session_join_links_role_code_check check (role_code in ('S1', 'S2', 'G1', 'G2')),
  constraint bellows_session_join_links_expiry_check check (expires_at > created_at),
  constraint bellows_session_join_links_max_uses_check check (max_uses > 0),
  constraint bellows_session_join_links_use_count_check check (
    use_count >= 0
    and use_count <= max_uses
  ),
  constraint bellows_session_join_links_last_used_at_check check (
    last_used_at is null
    or last_used_at >= created_at
  ),
  constraint bellows_session_join_links_revoked_at_check check (
    revoked_at is null
    or revoked_at >= created_at
  )
);

create index if not exists bellows_session_join_links_session_created_idx
  on tongs.bellows_session_join_links (session_id, created_at desc);

create index if not exists bellows_session_join_links_workspace_created_idx
  on tongs.bellows_session_join_links (workspace_id, created_at desc);

create index if not exists bellows_session_join_links_session_active_idx
  on tongs.bellows_session_join_links (session_id, expires_at asc, last_used_at desc nulls last)
  where revoked_at is null;

drop trigger if exists trg_bellows_session_join_links_updated_at on tongs.bellows_session_join_links;
create trigger trg_bellows_session_join_links_updated_at
before update on tongs.bellows_session_join_links
for each row execute function tongs.set_updated_at();

create or replace function tongs.hash_bellows_join_link_token(p_token text)
returns text
language sql
immutable
strict
set search_path = tongs, public
as $$
  select md5(btrim(p_token));
$$;

create or replace function tongs.validate_bellows_session_join_link()
returns trigger
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_session tongs.bellows_sessions%rowtype;
begin
  select *
  into v_session
  from tongs.bellows_sessions
  where id = new.session_id;

  if not found then
    raise exception 'bellows_session_not_found'
      using errcode = 'P0002';
  end if;

  if v_session.workspace_id <> new.workspace_id then
    raise exception 'bellows_join_link_workspace_mismatch'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_bellows_session_join_links_validate on tongs.bellows_session_join_links;
create trigger trg_bellows_session_join_links_validate
before insert or update on tongs.bellows_session_join_links
for each row execute function tongs.validate_bellows_session_join_link();

create or replace function tongs.create_bellows_join_link(
  p_session_id text,
  p_role_code text default 'G1',
  p_expires_hours integer default 24,
  p_max_uses integer default 5,
  p_created_by_user_id uuid default null
)
returns table (
  join_link_id uuid,
  session_id text,
  workspace_id uuid,
  role_code text,
  token text,
  expires_at timestamptz,
  max_uses integer,
  use_count integer,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_session tongs.bellows_sessions%rowtype;
  v_user uuid;
  v_role text;
  v_hours integer;
  v_max_uses integer;
  v_token text;
  v_join_link tongs.bellows_session_join_links%rowtype;
begin
  if p_session_id is null or btrim(p_session_id) = '' then
    raise exception 'session_id is required'
      using errcode = '22023';
  end if;

  select *
  into v_session
  from tongs.bellows_sessions
  where id = btrim(p_session_id)
  for update;

  if not found then
    raise exception 'bellows_session_not_found'
      using errcode = 'P0002';
  end if;

  if v_session.lifecycle_state in ('sealed', 'incomplete_capture', 'failed_capture', 'archived') then
    raise exception 'bellows_session_not_joinable'
      using errcode = '22023';
  end if;

  if coalesce(auth.role(), '') <> 'service_role' then
    v_user := auth.uid();

    if v_user is null then
      raise exception 'Not authenticated'
        using errcode = '42501';
    end if;

    perform tongs.assert_workspace_role(v_session.workspace_id, 'editor');
  else
    v_user := coalesce(auth.uid(), p_created_by_user_id);

    if v_user is null then
      raise exception 'created_by_user_id is required for service_role'
        using errcode = '22023';
    end if;
  end if;

  v_role := upper(btrim(coalesce(p_role_code, 'G1')));
  if v_role not in ('S1', 'S2', 'G1', 'G2') then
    raise exception 'Unsupported Bellows role code: %', p_role_code
      using errcode = '22023';
  end if;

  v_hours := coalesce(p_expires_hours, 24);
  if v_hours < 1 then v_hours := 1; end if;
  if v_hours > 720 then v_hours := 720; end if;

  v_max_uses := coalesce(p_max_uses, 5);
  if v_max_uses < 1 then v_max_uses := 1; end if;
  if v_max_uses > 1000 then v_max_uses := 1000; end if;

  v_token := replace(gen_random_uuid()::text, '-', '')
    || replace(gen_random_uuid()::text, '-', '');

  insert into tongs.bellows_session_join_links (
    session_id,
    workspace_id,
    token_hash,
    created_by_user_id,
    role_code,
    expires_at,
    max_uses
  )
  values (
    v_session.id,
    v_session.workspace_id,
    tongs.hash_bellows_join_link_token(v_token),
    v_user,
    v_role,
    now() + make_interval(hours => v_hours),
    v_max_uses
  )
  returning *
  into v_join_link;

  return query
  select
    v_join_link.id,
    v_join_link.session_id,
    v_join_link.workspace_id,
    v_join_link.role_code,
    v_token,
    v_join_link.expires_at,
    v_join_link.max_uses,
    v_join_link.use_count,
    v_join_link.revoked_at,
    v_join_link.last_used_at,
    v_join_link.created_at;
end;
$$;

create or replace function tongs.resolve_bellows_join_link(
  p_session_id text,
  p_token text
)
returns table (
  join_link_id uuid,
  session_id text,
  workspace_id uuid,
  role_code text,
  title text,
  host_user_id text,
  lifecycle_state text,
  expires_at timestamptz,
  max_uses integer,
  use_count integer,
  last_used_at timestamptz,
  resolved_at timestamptz
)
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_now timestamptz := now();
  v_join_link tongs.bellows_session_join_links%rowtype;
  v_resolution record;
begin
  if p_session_id is null or btrim(p_session_id) = '' then
    return;
  end if;

  if p_token is null or btrim(p_token) = '' then
    return;
  end if;

  select
    jl.*,
    s.title as session_title,
    s.host_user_id as session_host_user_id,
    s.lifecycle_state as session_lifecycle_state
  into v_resolution
  from tongs.bellows_session_join_links jl
  join tongs.bellows_sessions s
    on s.id = jl.session_id
  where jl.session_id = btrim(p_session_id)
    and jl.token_hash = tongs.hash_bellows_join_link_token(p_token)
  for update of jl;

  if not found then
    return;
  end if;

  if v_resolution.revoked_at is not null then
    return;
  end if;

  if v_resolution.expires_at <= v_now then
    return;
  end if;

  if v_resolution.use_count >= v_resolution.max_uses then
    return;
  end if;

  if v_resolution.session_lifecycle_state in ('sealed', 'incomplete_capture', 'failed_capture', 'archived') then
    return;
  end if;

  update tongs.bellows_session_join_links jl
  set
    use_count = jl.use_count + 1,
    last_used_at = v_now,
    updated_at = v_now
  where jl.id = v_resolution.id
  returning *
  into v_join_link;

  return query
  select
    v_join_link.id,
    v_join_link.session_id,
    v_join_link.workspace_id,
    v_join_link.role_code,
    v_resolution.session_title,
    v_resolution.session_host_user_id,
    v_resolution.session_lifecycle_state,
    v_join_link.expires_at,
    v_join_link.max_uses,
    v_join_link.use_count,
    v_join_link.last_used_at,
    v_now;
end;
$$;

create or replace function tongs.revoke_bellows_join_link(
  p_join_link_id uuid
)
returns table (
  revoked boolean,
  join_link_id uuid
)
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_join_link tongs.bellows_session_join_links%rowtype;
begin
  select *
  into v_join_link
  from tongs.bellows_session_join_links
  where id = p_join_link_id
  for update;

  if not found then
    raise exception 'bellows_join_link_not_found'
      using errcode = 'P0002';
  end if;

  if coalesce(auth.role(), '') <> 'service_role' then
    if auth.uid() is null then
      raise exception 'Not authenticated'
        using errcode = '42501';
    end if;

    perform tongs.assert_workspace_role(v_join_link.workspace_id, 'editor');
  end if;

  if v_join_link.revoked_at is not null then
    return query select false, v_join_link.id;
    return;
  end if;

  update tongs.bellows_session_join_links jl
  set
    revoked_at = now(),
    updated_at = now()
  where jl.id = v_join_link.id;

  return query select true, v_join_link.id;
end;
$$;

alter table tongs.bellows_session_join_links enable row level security;

drop policy if exists bellows_session_join_links_select_if_workspace_editor on tongs.bellows_session_join_links;
create policy bellows_session_join_links_select_if_workspace_editor
on tongs.bellows_session_join_links
for select
to authenticated
using (
  tongs.has_workspace_role(tongs.bellows_session_join_links.workspace_id, 'editor')
);

drop policy if exists bellows_session_join_links_insert_if_workspace_editor on tongs.bellows_session_join_links;
create policy bellows_session_join_links_insert_if_workspace_editor
on tongs.bellows_session_join_links
for insert
to authenticated
with check (
  tongs.has_workspace_role(tongs.bellows_session_join_links.workspace_id, 'editor')
);

drop policy if exists bellows_session_join_links_update_if_workspace_editor on tongs.bellows_session_join_links;
create policy bellows_session_join_links_update_if_workspace_editor
on tongs.bellows_session_join_links
for update
to authenticated
using (
  tongs.has_workspace_role(tongs.bellows_session_join_links.workspace_id, 'editor')
)
with check (
  tongs.has_workspace_role(tongs.bellows_session_join_links.workspace_id, 'editor')
);

revoke all on function tongs.hash_bellows_join_link_token(text) from public;
revoke all on function tongs.validate_bellows_session_join_link() from public;
revoke all on function tongs.create_bellows_join_link(text, text, integer, integer, uuid) from public;
revoke all on function tongs.resolve_bellows_join_link(text, text) from public;
revoke all on function tongs.revoke_bellows_join_link(uuid) from public;

grant execute on function tongs.hash_bellows_join_link_token(text) to authenticated;
grant execute on function tongs.hash_bellows_join_link_token(text) to service_role;
grant execute on function tongs.validate_bellows_session_join_link() to authenticated;
grant execute on function tongs.validate_bellows_session_join_link() to service_role;
grant execute on function tongs.create_bellows_join_link(text, text, integer, integer, uuid) to authenticated;
grant execute on function tongs.create_bellows_join_link(text, text, integer, integer, uuid) to service_role;
grant execute on function tongs.resolve_bellows_join_link(text, text) to anon;
grant execute on function tongs.resolve_bellows_join_link(text, text) to authenticated;
grant execute on function tongs.resolve_bellows_join_link(text, text) to service_role;
grant execute on function tongs.revoke_bellows_join_link(uuid) to authenticated;
grant execute on function tongs.revoke_bellows_join_link(uuid) to service_role;

commit;
