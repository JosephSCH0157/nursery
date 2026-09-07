begin;

create table if not exists tongs.hearth_conversation_threads (
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  workpiece_id uuid primary key references tongs.episodes(id) on delete cascade,
  generation bigint not null default 1 check (generation > 0),
  next_sequence bigint not null default 1 check (next_sequence > 0),
  completeness text not null default 'complete'
    check (completeness in ('complete', 'legacy_completeness_unknown', 'known_truncated')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tongs.hearth_conversation_messages (
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  workpiece_id uuid not null references tongs.hearth_conversation_threads(workpiece_id) on delete cascade,
  generation bigint not null check (generation > 0),
  sequence bigint not null check (sequence > 0),
  client_message_key text not null check (length(client_message_key) between 1 and 200),
  role text not null check (role in ('user', 'assistant')),
  content text not null check (length(content) > 0),
  created_at timestamptz not null default now(),
  primary key (workpiece_id, generation, sequence),
  unique (workpiece_id, generation, client_message_key)
);

create index if not exists hearth_conversation_messages_page_idx
  on tongs.hearth_conversation_messages(workpiece_id, generation, sequence);

alter table tongs.hearth_conversation_threads enable row level security;
alter table tongs.hearth_conversation_messages enable row level security;

create policy hearth_conversation_threads_select_member on tongs.hearth_conversation_threads
  for select to authenticated using (tongs.has_workspace_role(workspace_id, 'viewer'));
create policy hearth_conversation_messages_select_member on tongs.hearth_conversation_messages
  for select to authenticated using (tongs.has_workspace_role(workspace_id, 'viewer'));

create or replace function tongs.read_my_hearth_conversation(
  p_workspace_id uuid,
  p_workpiece_id uuid,
  p_after_sequence bigint default 0,
  p_limit integer default 500
) returns table (
  generation bigint,
  completeness text,
  sequence bigint,
  client_message_key text,
  role text,
  content text,
  created_at timestamptz
) language plpgsql security definer set search_path=tongs,public as $$
declare v_thread tongs.hearth_conversation_threads%rowtype;
begin
  perform tongs.assert_workspace_role(p_workspace_id, 'viewer');
  if not exists(select 1 from tongs.episodes e where e.id=p_workpiece_id and e.workspace_id=p_workspace_id) then
    raise exception 'workpiece does not belong to workspace' using errcode='22023';
  end if;
  select * into v_thread from tongs.hearth_conversation_threads t
    where t.workspace_id=p_workspace_id and t.workpiece_id=p_workpiece_id;
  if not found then return; end if;
  if not exists(
    select 1 from tongs.hearth_conversation_messages m
    where m.workspace_id=p_workspace_id and m.workpiece_id=p_workpiece_id
      and m.generation=v_thread.generation and m.sequence>greatest(0,coalesce(p_after_sequence,0))
  ) then
    return query select v_thread.generation,v_thread.completeness,null::bigint,null::text,null::text,null::text,null::timestamptz;
    return;
  end if;
  return query select v_thread.generation,v_thread.completeness,m.sequence,m.client_message_key,m.role,m.content,m.created_at
    from tongs.hearth_conversation_messages m
    where m.workspace_id=p_workspace_id and m.workpiece_id=p_workpiece_id
      and m.generation=v_thread.generation and m.sequence>greatest(0,coalesce(p_after_sequence,0))
    order by m.sequence asc limit greatest(1,least(coalesce(p_limit,500),1000));
end $$;

create or replace function tongs.append_my_hearth_conversation_messages(
  p_workspace_id uuid,
  p_workpiece_id uuid,
  p_generation bigint,
  p_messages jsonb,
  p_import_completeness text default null
) returns jsonb language plpgsql security definer set search_path=tongs,public as $$
declare
  v_thread tongs.hearth_conversation_threads%rowtype;
  v_item jsonb;
  v_key text;
  v_role text;
  v_content text;
  v_inserted integer := 0;
begin
  perform tongs.assert_workspace_role(p_workspace_id, 'editor');
  if not exists(select 1 from tongs.episodes e where e.id=p_workpiece_id and e.workspace_id=p_workspace_id) then
    raise exception 'workpiece does not belong to workspace' using errcode='22023';
  end if;
  if jsonb_typeof(coalesce(p_messages,'[]'::jsonb)) <> 'array' then
    raise exception 'messages must be an array' using errcode='22023';
  end if;
  if p_import_completeness is not null and p_import_completeness not in ('legacy_completeness_unknown','known_truncated') then
    raise exception 'invalid import completeness' using errcode='22023';
  end if;

  insert into tongs.hearth_conversation_threads(workspace_id,workpiece_id,generation,completeness)
    values(p_workspace_id,p_workpiece_id,1,coalesce(p_import_completeness,'complete'))
    on conflict(workpiece_id) do nothing;
  select * into v_thread from tongs.hearth_conversation_threads t
    where t.workspace_id=p_workspace_id and t.workpiece_id=p_workpiece_id for update;
  if not found then raise exception 'conversation thread workspace mismatch' using errcode='42501'; end if;
  if v_thread.generation<>p_generation then
    return jsonb_build_object('status','generation_conflict','generation',v_thread.generation,'inserted',0);
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_messages,'[]'::jsonb)) loop
    v_key:=nullif(btrim(v_item->>'client_message_key'),'');
    v_role:=v_item->>'role';
    v_content:=v_item->>'content';
    if v_key is null or length(v_key)>200 or v_role not in ('user','assistant') or nullif(v_content,'') is null then
      raise exception 'invalid conversation message' using errcode='22023';
    end if;
    if not exists(select 1 from tongs.hearth_conversation_messages m where m.workpiece_id=p_workpiece_id and m.generation=v_thread.generation and m.client_message_key=v_key) then
      insert into tongs.hearth_conversation_messages(workspace_id,workpiece_id,generation,sequence,client_message_key,role,content)
        values(p_workspace_id,p_workpiece_id,v_thread.generation,v_thread.next_sequence,v_key,v_role,v_content);
      v_thread.next_sequence:=v_thread.next_sequence+1;
      v_inserted:=v_inserted+1;
    end if;
  end loop;
  update tongs.hearth_conversation_threads set next_sequence=v_thread.next_sequence,updated_at=now() where workpiece_id=p_workpiece_id;
  return jsonb_build_object('status','committed','generation',v_thread.generation,'inserted',v_inserted);
end $$;

create or replace function tongs.clear_my_hearth_conversation(p_workspace_id uuid,p_workpiece_id uuid,p_expected_generation bigint)
returns jsonb language plpgsql security definer set search_path=tongs,public as $$
declare v_thread tongs.hearth_conversation_threads%rowtype;
begin
  perform tongs.assert_workspace_role(p_workspace_id,'editor');
  select * into v_thread from tongs.hearth_conversation_threads t
    where t.workspace_id=p_workspace_id and t.workpiece_id=p_workpiece_id for update;
  if not found then return jsonb_build_object('status','empty','generation',1); end if;
  if v_thread.generation<>p_expected_generation then
    return jsonb_build_object('status','generation_conflict','generation',v_thread.generation);
  end if;
  delete from tongs.hearth_conversation_messages where workpiece_id=p_workpiece_id and generation=v_thread.generation;
  update tongs.hearth_conversation_threads set generation=generation+1,next_sequence=1,completeness='complete',updated_at=now()
    where workpiece_id=p_workpiece_id returning generation into v_thread.generation;
  return jsonb_build_object('status','cleared','generation',v_thread.generation);
end $$;

revoke all on tongs.hearth_conversation_threads,tongs.hearth_conversation_messages from public;
grant select on tongs.hearth_conversation_threads,tongs.hearth_conversation_messages to authenticated;
grant all on tongs.hearth_conversation_threads,tongs.hearth_conversation_messages to service_role;
revoke all on function tongs.read_my_hearth_conversation(uuid,uuid,bigint,integer) from public;
revoke all on function tongs.append_my_hearth_conversation_messages(uuid,uuid,bigint,jsonb,text) from public;
revoke all on function tongs.clear_my_hearth_conversation(uuid,uuid,bigint) from public;
grant execute on function tongs.read_my_hearth_conversation(uuid,uuid,bigint,integer) to authenticated,service_role;
grant execute on function tongs.append_my_hearth_conversation_messages(uuid,uuid,bigint,jsonb,text) to authenticated,service_role;
grant execute on function tongs.clear_my_hearth_conversation(uuid,uuid,bigint) to authenticated,service_role;

commit;
