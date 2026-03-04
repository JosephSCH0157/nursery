-- Workspace-scoped/user-scoped style sample corpus for Accelerate Learning.
-- Stores imported writing samples that can be used as retrieval context.

begin;

create table if not exists tongs.workspace_style_samples (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_kind text not null default 'paste',
  source_label text null,
  source_workpiece_id uuid null references tongs.episodes(id) on delete set null,
  source_path text null,
  content text not null,
  content_chars integer not null default 0
    check (content_chars >= 0),
  content_digest text not null
    check (char_length(content_digest) = 32),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_style_samples_source_kind_check check (
    source_kind in ('upload', 'paste', 'forge_script', 'forge_transcript', 'other')
  ),
  constraint workspace_style_samples_source_path_check check (
    source_path is null
    or (
      length(btrim(source_path)) > 0
      and left(source_path, 1) <> '/'
      and position('..' in source_path) = 0
      and position(chr(92) in source_path) = 0
    )
  )
);

create unique index if not exists workspace_style_samples_workspace_user_digest_uidx
  on tongs.workspace_style_samples (workspace_id, user_id, content_digest);

create index if not exists workspace_style_samples_workspace_user_updated_idx
  on tongs.workspace_style_samples (workspace_id, user_id, updated_at desc);

create index if not exists workspace_style_samples_workspace_source_workpiece_idx
  on tongs.workspace_style_samples (workspace_id, source_workpiece_id)
  where source_workpiece_id is not null;

drop trigger if exists trg_workspace_style_samples_updated_at on tongs.workspace_style_samples;
create trigger trg_workspace_style_samples_updated_at
before update on tongs.workspace_style_samples
for each row execute function tongs.set_updated_at();

alter table tongs.workspace_style_samples enable row level security;

drop policy if exists workspace_style_samples_select_self on tongs.workspace_style_samples;
create policy workspace_style_samples_select_self
on tongs.workspace_style_samples
for select
to authenticated
using (
  user_id = auth.uid()
  and tongs.has_workspace_role(workspace_id, 'viewer')
);

create or replace function tongs.add_my_style_sample(
  p_workspace_id uuid,
  p_source_kind text default 'paste',
  p_source_label text default null,
  p_source_workpiece_id uuid default null,
  p_source_path text default null,
  p_content text default null
)
returns table (
  sample_id uuid,
  workspace_id uuid,
  user_id uuid,
  source_kind text,
  source_label text,
  source_workpiece_id uuid,
  source_path text,
  content text,
  content_chars integer,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_user uuid;
  v_source_kind text := lower(nullif(btrim(coalesce(p_source_kind, '')), ''));
  v_source_label text := nullif(btrim(coalesce(p_source_label, '')), '');
  v_source_path text := nullif(btrim(coalesce(p_source_path, '')), '');
  v_content text := nullif(btrim(coalesce(p_content, '')), '');
  v_content_chars integer;
  v_digest text;
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  if p_workspace_id is null then
    raise exception 'workspace_id is required'
      using errcode = '22023';
  end if;

  perform tongs.assert_workspace_role(p_workspace_id, 'viewer');

  if v_source_kind is null then
    v_source_kind := 'paste';
  end if;
  if v_source_kind not in ('upload', 'paste', 'forge_script', 'forge_transcript', 'other') then
    raise exception 'Unsupported source_kind: %', v_source_kind
      using errcode = '22023';
  end if;

  if v_source_path is not null then
    if left(v_source_path, 1) = '/'
      or position('..' in v_source_path) > 0
      or position(chr(92) in v_source_path) > 0
    then
      raise exception 'source_path must be relative and safe'
        using errcode = '22023';
    end if;
  end if;

  if p_source_workpiece_id is not null then
    perform 1
    from tongs.episodes e
    where e.id = p_source_workpiece_id
      and e.workspace_id = p_workspace_id;
    if not found then
      raise exception 'source_workpiece_id does not belong to workspace'
        using errcode = '22023';
    end if;
  end if;

  if v_content is null then
    raise exception 'content is required'
      using errcode = '22023';
  end if;

  v_content_chars := char_length(v_content);
  if v_content_chars > 150000 then
    raise exception 'style sample content exceeds 150000 characters'
      using errcode = '22023';
  end if;
  v_digest := md5(v_content);

  insert into tongs.workspace_style_samples (
    workspace_id,
    user_id,
    source_kind,
    source_label,
    source_workpiece_id,
    source_path,
    content,
    content_chars,
    content_digest,
    created_at,
    updated_at
  )
  values (
    p_workspace_id,
    v_user,
    v_source_kind,
    v_source_label,
    p_source_workpiece_id,
    v_source_path,
    v_content,
    v_content_chars,
    v_digest,
    now(),
    now()
  )
  on conflict (workspace_id, user_id, content_digest) do update
    set source_kind = excluded.source_kind,
        source_label = coalesce(excluded.source_label, tongs.workspace_style_samples.source_label),
        source_workpiece_id = coalesce(excluded.source_workpiece_id, tongs.workspace_style_samples.source_workpiece_id),
        source_path = coalesce(excluded.source_path, tongs.workspace_style_samples.source_path),
        content = excluded.content,
        content_chars = excluded.content_chars,
        updated_at = now();

  return query
  select
    s.id,
    s.workspace_id,
    s.user_id,
    s.source_kind,
    s.source_label,
    s.source_workpiece_id,
    s.source_path,
    s.content,
    s.content_chars,
    s.created_at,
    s.updated_at
  from tongs.workspace_style_samples s
  where s.workspace_id = p_workspace_id
    and s.user_id = v_user
    and s.content_digest = v_digest
  limit 1;
end;
$$;

create or replace function tongs.list_my_style_samples(
  p_workspace_id uuid,
  p_limit integer default 200
)
returns table (
  sample_id uuid,
  workspace_id uuid,
  user_id uuid,
  source_kind text,
  source_label text,
  source_workpiece_id uuid,
  source_path text,
  content text,
  content_chars integer,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_user uuid;
  v_limit integer := greatest(1, least(coalesce(p_limit, 200), 500));
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  if p_workspace_id is null then
    raise exception 'workspace_id is required'
      using errcode = '22023';
  end if;

  perform tongs.assert_workspace_role(p_workspace_id, 'viewer');

  return query
  select
    s.id,
    s.workspace_id,
    s.user_id,
    s.source_kind,
    s.source_label,
    s.source_workpiece_id,
    s.source_path,
    s.content,
    s.content_chars,
    s.created_at,
    s.updated_at
  from tongs.workspace_style_samples s
  where s.workspace_id = p_workspace_id
    and s.user_id = v_user
  order by s.updated_at desc, s.id desc
  limit v_limit;
end;
$$;

create or replace function tongs.list_my_recent_script_references(
  p_workspace_id uuid,
  p_limit integer default 24
)
returns table (
  workspace_id uuid,
  workpiece_id uuid,
  script_path text,
  title text,
  marked_ready_at timestamptz
)
language plpgsql
security definer
set search_path = tongs, public
as $$
declare
  v_user uuid;
  v_limit integer := greatest(1, least(coalesce(p_limit, 24), 100));
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  if p_workspace_id is null then
    raise exception 'workspace_id is required'
      using errcode = '22023';
  end if;

  perform tongs.assert_workspace_role(p_workspace_id, 'viewer');

  return query
  with ranked as (
    select
      m.workspace_id,
      m.workpiece_id,
      m.script_path,
      m.marked_ready_at,
      e.label,
      row_number() over (
        partition by m.workpiece_id
        order by m.marked_ready_at desc, m.script_path asc
      ) as rn
    from tongs.workpiece_ready_script_meta m
    join tongs.episodes e
      on e.id = m.workpiece_id
    where m.workspace_id = p_workspace_id
  )
  select
    r.workspace_id,
    r.workpiece_id,
    r.script_path,
    coalesce(nullif(btrim(r.label), ''), concat('Episode ', left(r.workpiece_id::text, 8))) as title,
    r.marked_ready_at
  from ranked r
  where r.rn = 1
  order by r.marked_ready_at desc, r.workpiece_id
  limit v_limit;
end;
$$;

revoke all on table tongs.workspace_style_samples from public;
grant select on table tongs.workspace_style_samples to authenticated;
grant all on table tongs.workspace_style_samples to service_role;

revoke all on function tongs.add_my_style_sample(uuid, text, text, uuid, text, text) from public;
revoke all on function tongs.list_my_style_samples(uuid, integer) from public;
revoke all on function tongs.list_my_recent_script_references(uuid, integer) from public;

grant execute on function tongs.add_my_style_sample(uuid, text, text, uuid, text, text) to authenticated;
grant execute on function tongs.list_my_style_samples(uuid, integer) to authenticated;
grant execute on function tongs.list_my_recent_script_references(uuid, integer) to authenticated;

grant execute on function tongs.add_my_style_sample(uuid, text, text, uuid, text, text) to service_role;
grant execute on function tongs.list_my_style_samples(uuid, integer) to service_role;
grant execute on function tongs.list_my_recent_script_references(uuid, integer) to service_role;

commit;
