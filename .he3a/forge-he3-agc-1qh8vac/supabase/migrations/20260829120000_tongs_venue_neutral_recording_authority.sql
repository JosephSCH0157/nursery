-- Venue-neutral recording authority and explicit recording-origin workpiece creation.
-- Workpiece creation and Record-time authority establishment are deliberately separate.

begin;

alter table tongs.episodes
  add column if not exists created_by uuid null references auth.users(id) on delete set null,
  add column if not exists creation_origin text null;

create or replace function tongs.create_episode_identity_internal(
  p_workspace_id uuid,
  p_title text,
  p_created_by uuid,
  p_creation_origin text
) returns uuid
language plpgsql
security definer
set search_path=pg_catalog,tongs
as $function$
declare
  v_title text := btrim(coalesce(p_title,''));
  v_workpiece_id uuid;
begin
  if p_created_by is null then raise exception 'episode creator is required' using errcode='22023'; end if;
  if length(v_title) not between 1 and 200 then raise exception 'episode title must be between 1 and 200 characters' using errcode='22023'; end if;
  if not exists(select 1 from tongs.workspaces where id=p_workspace_id) then raise exception 'workspace not found' using errcode='23503'; end if;
  insert into tongs.episodes(workspace_id,label,lifecycle_state,created_by,creation_origin)
  values(p_workspace_id,v_title,'active',p_created_by,nullif(btrim(coalesce(p_creation_origin,'')),''))
  returning id into v_workpiece_id;
  return v_workpiece_id;
end;
$function$;

revoke all on function tongs.create_episode_identity_internal(uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function tongs.create_episode_identity_internal(uuid,text,uuid,text) to service_role;
alter function tongs.create_episode_identity_internal(uuid,text,uuid,text) owner to postgres;

create table tongs.recording_workpiece_creation_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  workpiece_id uuid not null,
  operation_key text not null check(length(btrim(operation_key)) between 16 and 200),
  request_fingerprint text not null check(request_fingerprint ~ '^[0-9a-f]{32}$'),
  title text not null check(length(btrim(title)) between 1 and 200),
  origin_venue text not null check(origin_venue in ('anvil','bellows')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(workspace_id,operation_key),
  unique(id,workspace_id,workpiece_id),
  foreign key(workpiece_id,workspace_id) references tongs.episodes(id,workspace_id) on delete cascade
);

create function tongs.reject_recording_workpiece_creation_mutation()
returns trigger language plpgsql set search_path=pg_catalog,tongs as $$
begin raise exception using errcode='55000',message='recording workpiece creation receipts are immutable'; end $$;
create trigger trg_recording_workpiece_creation_immutable
before update or delete on tongs.recording_workpiece_creation_requests
for each row execute function tongs.reject_recording_workpiece_creation_mutation();

alter table tongs.recording_workpiece_creation_requests enable row level security;
create policy recording_workpiece_creation_select_if_workspace_viewer
on tongs.recording_workpiece_creation_requests for select to authenticated
using(tongs.has_workspace_role(workspace_id,'viewer'));
revoke insert,update,delete on tongs.recording_workpiece_creation_requests from authenticated;
grant select on tongs.recording_workpiece_creation_requests to authenticated;
grant all on tongs.recording_workpiece_creation_requests to service_role;

create or replace function tongs.create_recording_workpiece(
  p_workspace_id uuid,p_title text,p_origin_venue text,p_operation_key text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $function$
declare
  v_user uuid:=auth.uid(); v_title text:=btrim(coalesce(p_title,'')); v_venue text:=lower(btrim(coalesce(p_origin_venue,'')));
  v_key text:=btrim(coalesce(p_operation_key,'')); v_fingerprint text; v_existing tongs.recording_workpiece_creation_requests%rowtype;
  v_workpiece uuid; v_receipt tongs.recording_workpiece_creation_requests%rowtype;
begin
  if v_user is null or not tongs.has_workspace_role(p_workspace_id,'editor') then return jsonb_build_object('outcome','denied','reason','editor_required'); end if;
  if length(v_title) not between 1 and 200 then return jsonb_build_object('outcome','conflict','reason','invalid_title'); end if;
  if v_venue not in ('anvil','bellows') then return jsonb_build_object('outcome','conflict','reason','invalid_origin_venue'); end if;
  if length(v_key) not between 16 and 200 then return jsonb_build_object('outcome','conflict','reason','invalid_operation_key'); end if;
  v_fingerprint:=md5(concat_ws('|',p_workspace_id,v_title,v_venue));
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||v_key,0));
  select * into v_existing from tongs.recording_workpiece_creation_requests where workspace_id=p_workspace_id and operation_key=v_key;
  if found then
    if v_existing.request_fingerprint=v_fingerprint then
      return jsonb_build_object('outcome','existing','workpiece_id',v_existing.workpiece_id,'receipt',to_jsonb(v_existing));
    end if;
    return jsonb_build_object('outcome','conflict','reason','operation_key_reused');
  end if;
  v_workpiece:=tongs.create_episode_identity_internal(p_workspace_id,v_title,v_user,'recording_venue');
  insert into tongs.recording_workpiece_creation_requests(workspace_id,workpiece_id,operation_key,request_fingerprint,title,origin_venue,created_by)
  values(p_workspace_id,v_workpiece,v_key,v_fingerprint,v_title,v_venue,v_user) returning * into v_receipt;
  return jsonb_build_object('outcome','created','workpiece_id',v_workpiece,'receipt',to_jsonb(v_receipt));
end;
$function$;
revoke all on function tongs.create_recording_workpiece(uuid,text,text,text) from public,anon;
grant execute on function tongs.create_recording_workpiece(uuid,text,text,text) to authenticated,service_role;
alter function tongs.create_recording_workpiece(uuid,text,text,text) owner to postgres;

-- Keep Hearth's origin-specific workflow while sharing the canonical Episode insert.
create or replace function tongs.create_hearth_project_episode(
  p_workspace_id uuid,p_project_id uuid,p_title text,p_operation_key text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare v_user uuid:=auth.uid();v_key text:=btrim(coalesce(p_operation_key,''));v_workpiece uuid;v_link uuid;v_title text:=coalesce(nullif(btrim(p_title),''),'Untitled Episode');
begin
  if v_user is null or not tongs.has_workspace_role(p_workspace_id,'editor') then return jsonb_build_object('outcome','denied');end if;
  if length(v_key) not between 16 and 200 then return jsonb_build_object('outcome','conflict','reason','invalid_operation_key');end if;
  if not exists(select 1 from tongs.barstock_assignments where id=p_project_id and workspace_id=p_workspace_id) then return jsonb_build_object('outcome','not_found','reason','project_not_found');end if;
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||p_project_id::text||':'||v_key,0));
  select id,workpiece_id into v_link,v_workpiece from tongs.barstock_project_episode_links where workspace_id=p_workspace_id and project_id=p_project_id and creation_operation_key=v_key;
  if v_workpiece is not null then return jsonb_build_object('outcome','existing','created',false,'link_id',v_link,'workpiece_id',v_workpiece,'operation_key',v_key);end if;
  v_workpiece:=tongs.create_episode_identity_internal(p_workspace_id,v_title,v_user,'hearth_project');
  insert into tongs.barstock_project_episode_links(workspace_id,project_id,workpiece_id,creation_operation_key,created_by)
  values(p_workspace_id,p_project_id,v_workpiece,v_key,v_user) returning id into v_link;
  return jsonb_build_object('outcome','created','created',true,'link_id',v_link,'workpiece_id',v_workpiece,'operation_key',v_key);
end$$;

-- Rename the existing authority in place so all referenced IDs and FKs survive.
alter table tongs.anvil_capture_authorities rename to recording_capture_authorities;
alter table tongs.recording_capture_authorities
  add column venue text,
  add column script_binding_kind text,
  add column request_fingerprint text;
-- Relax the legacy approved-script-only shape before converting historical
-- completion-backfill authorities to the authoritative `none` binding.
alter table tongs.recording_capture_authorities
  alter column script_path drop not null,
  alter column script_revision drop not null,
  alter column script_hash drop not null,
  drop constraint if exists anvil_capture_authority_live_ready_required;
alter table tongs.recording_capture_authorities disable trigger trg_anvil_capture_authority_immutable;
update tongs.recording_capture_authorities set venue='anvil',
  script_binding_kind=case when script_approval_id is null then 'none' else 'approved_canonical_script' end,
  ready_transition_id=case when script_approval_id is null then null else ready_transition_id end,
  script_path=case when script_approval_id is null then null else script_path end,
  script_revision=case when script_approval_id is null then null else script_revision end,
  script_hash=case when script_approval_id is null then null else script_hash end,
  script_approval_revision=case when script_approval_id is null then null else script_approval_revision end,
  script_approval_hash=case when script_approval_id is null then null else script_approval_hash end,
  request_fingerprint=md5(concat_ws('|',workspace_id,workpiece_id,operation_key));
alter table tongs.recording_capture_authorities enable trigger trg_anvil_capture_authority_immutable;
alter table tongs.recording_capture_authorities
  alter column venue set not null,
  alter column script_binding_kind set not null,
  alter column request_fingerprint set not null,
  add constraint recording_capture_venue_check check(venue in ('anvil','bellows')),
  add constraint recording_capture_script_binding_check check(
    (script_binding_kind='none' and ready_transition_id is null and script_path is null and script_revision is null and script_hash is null and script_approval_id is null and script_approval_revision is null and script_approval_hash is null)
    or
    (script_binding_kind='approved_canonical_script' and ready_transition_id is not null and script_path='script/script.md' and script_revision>0 and script_hash ~ '^[0-9a-f]{64}$' and script_approval_id is not null and script_approval_revision>0 and script_approval_hash=script_hash)
  );

-- Replace the old Anvil-only insert guard. A live recording may be explicitly
-- unscripted, while an approved-script binding must still prove the complete
-- workspace/workpiece/Ready/approval relationship.
drop trigger trg_anvil_capture_authority_relationships on tongs.recording_capture_authorities;
drop function tongs.guard_anvil_capture_authority_relationships();
create function tongs.guard_recording_capture_authority_relationships()
returns trigger language plpgsql set search_path=pg_catalog,tongs as $$
declare v_ready tongs.workpiece_ready_transition_requests%rowtype;
begin
  if not exists(select 1 from tongs.episodes e where e.id=new.workpiece_id and e.workspace_id=new.workspace_id) then
    raise exception using errcode='23514',message='recording capture authority episode membership mismatch';
  end if;
  if new.recording_session_id is not null and not exists(
    select 1 from tongs.recording_sessions s where s.id=new.recording_session_id and s.workspace_id=new.workspace_id
  ) then raise exception using errcode='23514',message='recording capture authority planner session mismatch'; end if;
  if new.script_binding_kind='approved_canonical_script' then
    select * into v_ready from tongs.workpiece_ready_transition_requests where id=new.ready_transition_id;
    if not found or v_ready.workspace_id<>new.workspace_id or v_ready.workpiece_id<>new.workpiece_id
      or v_ready.script_path<>new.script_path or v_ready.script_revision<>new.script_revision
      or lower(v_ready.script_hash)<>new.script_hash or v_ready.script_approval_id<>new.script_approval_id
      or v_ready.script_approval_revision<>new.script_approval_revision
      or lower(v_ready.script_approval_hash)<>new.script_approval_hash then
      raise exception using errcode='23514',message='recording capture authority approved Ready transition mismatch';
    end if;
  end if;
  return new;
end $$;
create trigger trg_recording_capture_authority_relationships
before insert on tongs.recording_capture_authorities
for each row execute function tongs.guard_recording_capture_authority_relationships();

create table tongs.anvil_capture_executions (
  execution_id uuid primary key,
  recording_capture_authority_id uuid not null unique references tongs.recording_capture_authorities(id) on delete restrict,
  operation_key text not null check(length(btrim(operation_key)) between 8 and 200),
  anvil_version text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
insert into tongs.anvil_capture_executions(execution_id,recording_capture_authority_id,operation_key,created_by,created_at)
select capture_session_id,id,operation_key,established_by,established_at from tongs.recording_capture_authorities;

create function tongs.reject_recording_authority_mutation()
returns trigger language plpgsql set search_path=pg_catalog,tongs as $$ begin raise exception using errcode='55000',message='recording authority provenance is immutable'; end $$;
create trigger trg_anvil_capture_execution_immutable before update or delete on tongs.anvil_capture_executions for each row execute function tongs.reject_recording_authority_mutation();
alter table tongs.anvil_capture_executions enable row level security;
create policy anvil_capture_execution_select_if_workspace_viewer on tongs.anvil_capture_executions for select to authenticated
using(exists(select 1 from tongs.recording_capture_authorities a where a.id=recording_capture_authority_id and tongs.has_workspace_role(a.workspace_id,'viewer')));
revoke insert,update,delete on tongs.anvil_capture_executions from authenticated;
grant select on tongs.anvil_capture_executions to authenticated;
grant all on tongs.anvil_capture_executions to service_role;

alter table tongs.recording_capture_authorities drop column capture_session_id;

alter table tongs.bellows_sessions
  add column if not exists workpiece_id uuid null references tongs.episodes(id) on delete restrict,
  add column if not exists recording_capture_authority_id uuid null references tongs.recording_capture_authorities(id) on delete restrict;

create function tongs.validate_bellows_recording_authority_binding()
returns trigger language plpgsql set search_path=pg_catalog,tongs as $$
declare v_authority tongs.recording_capture_authorities%rowtype;
begin
  if tg_op='UPDATE' and old.recording_capture_authority_id is not null
     and new.recording_capture_authority_id is distinct from old.recording_capture_authority_id then
    raise exception using errcode='55000',message='Bellows recording capture authority is immutable once established';
  end if;
  if new.recording_capture_authority_id is null then return new; end if;
  select * into v_authority from tongs.recording_capture_authorities where id=new.recording_capture_authority_id;
  if not found or v_authority.venue<>'bellows' or v_authority.workspace_id<>new.workspace_id
     or v_authority.workpiece_id is distinct from new.workpiece_id then
    raise exception using errcode='23514',message='Bellows authority must identify the same workspace and workpiece with Bellows as capture venue';
  end if;
  return new;
end $$;
create trigger trg_bellows_recording_authority_binding
before insert or update of workspace_id,workpiece_id,recording_capture_authority_id on tongs.bellows_sessions
for each row execute function tongs.validate_bellows_recording_authority_binding();

create or replace function tongs.establish_recording_capture_authority(
  p_workspace_id uuid,p_workpiece_id uuid,p_venue text,p_execution_id uuid,p_operation_key text,
  p_recording_session_id uuid default null,p_venue_version text default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $function$
declare v_user uuid:=auth.uid();v_key text:=btrim(coalesce(p_operation_key,''));v_venue text:=lower(btrim(coalesce(p_venue,'')));v_fingerprint text;
  v_ready record;v_existing tongs.recording_capture_authorities%rowtype;v_saved tongs.recording_capture_authorities%rowtype;v_execution tongs.anvil_capture_executions%rowtype;
begin
  if v_user is null or not tongs.has_workspace_role(p_workspace_id,'editor') then return jsonb_build_object('outcome','denied','reason','editor_required');end if;
  if v_venue not in ('anvil','bellows') then return jsonb_build_object('outcome','conflict','reason','venue_invalid');end if;
  if length(v_key) not between 8 and 200 then return jsonb_build_object('outcome','conflict','reason','operation_key_invalid');end if;
  if v_venue='anvil' and p_execution_id is null then return jsonb_build_object('outcome','conflict','reason','anvil_execution_id_required');end if;
  if not exists(select 1 from tongs.episodes where id=p_workpiece_id and workspace_id=p_workspace_id and archived_at is null and deleted_at is null) then return jsonb_build_object('outcome','not_found','reason','episode_membership_invalid');end if;
  if p_recording_session_id is not null and not exists(select 1 from tongs.recording_sessions r where r.id=p_recording_session_id and r.workspace_id=p_workspace_id) then return jsonb_build_object('outcome','conflict','reason','recording_session_mismatch');end if;
  v_fingerprint:=md5(concat_ws('|',p_workspace_id,p_workpiece_id,v_venue,p_execution_id,p_recording_session_id));
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||v_key,0));
  select * into v_existing from tongs.recording_capture_authorities where workspace_id=p_workspace_id and operation_key=v_key;
  if found then
    if v_existing.request_fingerprint<>v_fingerprint then return jsonb_build_object('outcome','conflict','reason','operation_key_reused');end if;
    select * into v_execution from tongs.anvil_capture_executions where recording_capture_authority_id=v_existing.id;
    return jsonb_build_object('outcome','duplicate','capture_authority',to_jsonb(v_existing),'venue_execution',case when v_execution.execution_id is null then null else to_jsonb(v_execution) end);
  end if;
  select transition_id,script_path,script_revision,lower(script_hash) script_hash,script_approval_id,script_approval_revision,lower(script_approval_hash) script_approval_hash
  into v_ready from tongs.current_workpiece_ready_scripts where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and script_path='script/script.md';
  insert into tongs.recording_capture_authorities(workspace_id,workpiece_id,recording_session_id,ready_transition_id,script_path,script_revision,script_hash,
    script_approval_id,script_approval_revision,script_approval_hash,operation_key,provenance,established_by,venue,script_binding_kind,request_fingerprint)
  values(p_workspace_id,p_workpiece_id,p_recording_session_id,v_ready.transition_id,v_ready.script_path,v_ready.script_revision,v_ready.script_hash,
    v_ready.script_approval_id,v_ready.script_approval_revision,v_ready.script_approval_hash,v_key,'live_established',v_user,v_venue,
    case when v_ready.script_approval_id is null then 'none' else 'approved_canonical_script' end,v_fingerprint)
  returning * into v_saved;
  if v_venue='anvil' then
    insert into tongs.anvil_capture_executions(execution_id,recording_capture_authority_id,operation_key,anvil_version,created_by)
    values(p_execution_id,v_saved.id,v_key,p_venue_version,v_user) returning * into v_execution;
  end if;
  return jsonb_build_object('outcome','established','capture_authority',to_jsonb(v_saved),'venue_execution',case when v_execution.execution_id is null then null else to_jsonb(v_execution) end);
exception when unique_violation then
  select * into v_execution from tongs.anvil_capture_executions where execution_id=p_execution_id;
  if found then select * into v_existing from tongs.recording_capture_authorities where id=v_execution.recording_capture_authority_id;
    if v_existing.request_fingerprint=v_fingerprint then return jsonb_build_object('outcome','duplicate','capture_authority',to_jsonb(v_existing),'venue_execution',to_jsonb(v_execution));end if;
  end if;
  return jsonb_build_object('outcome','conflict','reason','execution_identity_reused');
end;
$function$;
revoke all on function tongs.establish_recording_capture_authority(uuid,uuid,text,uuid,text,uuid,text) from public,anon;
grant execute on function tongs.establish_recording_capture_authority(uuid,uuid,text,uuid,text,uuid,text) to authenticated,service_role;
alter function tongs.establish_recording_capture_authority(uuid,uuid,text,uuid,text,uuid,text) owner to postgres;

-- Transitional Anvil wrapper. It preserves the old wire contract only.
create or replace function tongs.establish_anvil_capture_authority(
  p_workspace_id uuid,p_workpiece_id uuid,p_capture_session_id uuid,p_operation_key text,p_recording_session_id uuid default null
) returns jsonb language sql security definer set search_path=pg_catalog,tongs as $$
  select tongs.establish_recording_capture_authority(p_workspace_id,p_workpiece_id,'anvil',p_capture_session_id,p_operation_key,p_recording_session_id,null);
$$;

-- Completion's existing capture_authority_id FK follows the in-place table rename and now points at
-- the shared authority. Keeping the column name preserves downstream IDs and compiled consumers.
alter table tongs.anvil_recording_completion_requests
  alter column capture_session_id drop not null,
  alter column ready_transition_id drop not null,
  alter column script_path drop not null,
  alter column script_revision drop not null,
  alter column script_hash drop not null;

alter table tongs.anvil_recording_keep_requests
  alter column capture_session_id drop not null,
  add column recording_capture_authority_id uuid null references tongs.recording_capture_authorities(id) on delete restrict;
alter table tongs.anvil_recording_discard_requests
  alter column capture_session_id drop not null,
  add column recording_capture_authority_id uuid null references tongs.recording_capture_authorities(id) on delete restrict;
update tongs.anvil_recording_keep_requests k set recording_capture_authority_id=c.capture_authority_id
from tongs.anvil_recording_completion_requests c where c.id=k.completion_id;
update tongs.anvil_recording_discard_requests d set recording_capture_authority_id=c.capture_authority_id
from tongs.anvil_recording_completion_requests c where c.id=d.completion_id;
alter table tongs.anvil_recording_keep_requests alter column recording_capture_authority_id set not null;
alter table tongs.anvil_recording_discard_requests alter column recording_capture_authority_id set not null;

create function tongs.reject_recording_receipt_mutation()
returns trigger language plpgsql set search_path=pg_catalog,tongs as $$
begin raise exception using errcode='55000',message='recording transition receipts are immutable'; end $$;
create trigger trg_recording_completion_immutable before update or delete on tongs.anvil_recording_completion_requests
for each row execute function tongs.reject_recording_receipt_mutation();
create trigger trg_recording_keep_immutable before update or delete on tongs.anvil_recording_keep_requests
for each row execute function tongs.reject_recording_receipt_mutation();
create trigger trg_recording_discard_immutable before update or delete on tongs.anvil_recording_discard_requests
for each row execute function tongs.reject_recording_receipt_mutation();

create or replace function tongs.recording_transition_take_completed(
  p_recording_capture_authority_id uuid,p_media_path text,p_expected_media_revision bigint,p_expected_media_hash text,
  p_expected_media_bytes bigint,p_expected_media_content_type text,p_storage_bucket text,p_storage_key text,
  p_idempotency_key text,p_completion_evidence jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $function$
declare a tongs.recording_capture_authorities%rowtype;v_user uuid:=auth.uid();v_media record;
  v_key text:=btrim(coalesce(p_idempotency_key,''));v_hash text:=lower(btrim(coalesce(p_expected_media_hash,'')));
  v_type text:=lower(btrim(coalesce(p_expected_media_content_type,'')));v_existing tongs.anvil_recording_completion_requests%rowtype;
  v_saved tongs.anvil_recording_completion_requests%rowtype;v_fingerprint text;
begin
  select * into a from tongs.recording_capture_authorities where id=p_recording_capture_authority_id;
  if not found then return jsonb_build_object('outcome','not_found','reason','capture_authority_not_found','completion',null);end if;
  if v_user is null or not tongs.has_workspace_role(a.workspace_id,'editor') then return jsonb_build_object('outcome','denied','reason','editor_required','completion',null);end if;
  if length(v_key) not between 8 and 200 or v_hash !~ '^[0-9a-f]{64}$' or p_expected_media_bytes<=0
    or p_completion_evidence is null or jsonb_typeof(p_completion_evidence)<>'object'
    or p_completion_evidence->>'recording_capture_authority_id' is distinct from a.id::text
    or coalesce((p_completion_evidence#>>'{artifact_validation,ok}')::boolean,false) is not true
    or lower(coalesce(p_completion_evidence#>>'{artifact_validation,sha256}',''))<>v_hash then
    return jsonb_build_object('outcome','conflict','reason','invalid_completion_evidence','completion',null);
  end if;
  select revision,lower(hash_value) hash_value,bytes,lower(content_type) content_type,storage_bucket,storage_key into v_media
    from tongs.workpiece_files where workpiece_id=a.workpiece_id and path=p_media_path;
  if not found then return jsonb_build_object('outcome','not_found','reason','media_not_found','completion',null);end if;
  if v_media.revision<>p_expected_media_revision or v_media.hash_value<>v_hash or v_media.bytes<>p_expected_media_bytes
    or v_media.content_type<>v_type or v_media.storage_bucket<>p_storage_bucket or v_media.storage_key<>p_storage_key then
    return jsonb_build_object('outcome','stale','reason','media_contract_mismatch','completion',null);end if;
  v_fingerprint:=md5(concat_ws('|',a.id,p_media_path,p_expected_media_revision,v_hash,p_expected_media_bytes,v_type,p_completion_evidence::text));
  select * into v_existing from tongs.anvil_recording_completion_requests where workspace_id=a.workspace_id and idempotency_key=v_key;
  if found then
    if v_existing.capture_authority_id=a.id and v_existing.request_fingerprint=v_fingerprint then return jsonb_build_object('outcome','duplicate','completion',to_jsonb(v_existing));end if;
    return jsonb_build_object('outcome','conflict','reason','idempotency_key_reused','completion',null);
  end if;
  insert into tongs.anvil_recording_completion_requests(workspace_id,workpiece_id,capture_authority_id,
    media_path,media_revision,media_hash,media_bytes,media_content_type,storage_bucket,storage_key,recording_session_id,
    idempotency_key,request_fingerprint,completion_evidence,completed_by)
  values(a.workspace_id,a.workpiece_id,a.id,p_media_path,p_expected_media_revision,v_hash,p_expected_media_bytes,v_type,
    p_storage_bucket,p_storage_key,a.recording_session_id,v_key,v_fingerprint,p_completion_evidence,v_user) returning * into v_saved;
  perform set_config('tongs.recording_authority_rpc','on',true);
  insert into tongs.workpiece_events(workpiece_id,event_name,payload,correlation_id,written_by_tool,written_by_tool_version,written_by_lane)
  values(a.workpiece_id,'take_completed',jsonb_build_object('authority_schema','forge.recording-completion.v1','completion_id',v_saved.id,
    'recording_capture_authority_id',a.id,'workspace_id',a.workspace_id,'file_path',p_media_path,'media_revision',p_expected_media_revision,'media_hash',v_hash),
    v_key,'recording',coalesce(p_completion_evidence->>'venue_version','unknown'),'forge-managed');
  return jsonb_build_object('outcome','saved','completion',to_jsonb(v_saved));
end;
$function$;
revoke all on function tongs.recording_transition_take_completed(uuid,text,bigint,text,bigint,text,text,text,text,jsonb) from public,anon;
grant execute on function tongs.recording_transition_take_completed(uuid,text,bigint,text,bigint,text,text,text,text,jsonb) to authenticated,service_role;

create or replace function tongs.anvil_transition_take_completed_v3(
  p_capture_authority_id uuid,p_media_path text,p_expected_media_revision bigint,p_expected_media_hash text,
  p_expected_media_bytes bigint,p_expected_media_content_type text,p_storage_bucket text,p_storage_key text,
  p_idempotency_key text,p_completion_evidence jsonb
) returns jsonb language sql security definer set search_path=pg_catalog,tongs as $$
  select tongs.recording_transition_take_completed(p_capture_authority_id,p_media_path,p_expected_media_revision,p_expected_media_hash,
    p_expected_media_bytes,p_expected_media_content_type,p_storage_bucket,p_storage_key,p_idempotency_key,
    p_completion_evidence - 'capture_authority_id' - 'capture_session_id' || jsonb_build_object('recording_capture_authority_id',p_capture_authority_id));
$$;

create or replace function tongs.recording_transition_take_decision(
  p_recording_capture_authority_id uuid,p_completion_id uuid,p_decision text,p_idempotency_key text,p_decision_evidence jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $function$
declare a tongs.recording_capture_authorities%rowtype;c tongs.anvil_recording_completion_requests%rowtype;e tongs.anvil_capture_executions%rowtype;
  v_user uuid:=auth.uid();v_key text:=btrim(coalesce(p_idempotency_key,''));v_fingerprint text;
  v_keep tongs.anvil_recording_keep_requests%rowtype;v_discard tongs.anvil_recording_discard_requests%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_completion_id::text,0));
  select * into a from tongs.recording_capture_authorities where id=p_recording_capture_authority_id;
  select * into c from tongs.anvil_recording_completion_requests where id=p_completion_id and capture_authority_id=a.id;
  if a.id is null or c.id is null then return jsonb_build_object('outcome','not_found','reason','capture_completion_mismatch');end if;
  if v_user is null or not tongs.has_workspace_role(a.workspace_id,'editor') then return jsonb_build_object('outcome','denied','reason','editor_required');end if;
  if length(v_key) not between 8 and 200 or p_decision not in ('keep','discard')
    or p_decision_evidence is null or jsonb_typeof(p_decision_evidence)<>'object'
    or p_decision_evidence->>'decision' is distinct from p_decision
    or p_decision_evidence->>'completion_id' is distinct from c.id::text
    or p_decision_evidence->>'recording_capture_authority_id' is distinct from a.id::text then
    return jsonb_build_object('outcome','conflict','reason','invalid_decision_evidence');
  end if;
  select * into e from tongs.anvil_capture_executions where recording_capture_authority_id=a.id;
  if a.venue='anvil' and e.execution_id is null then return jsonb_build_object('outcome','conflict','reason','venue_execution_missing');end if;
  v_fingerprint:=md5(concat_ws('|',a.id,c.id,p_decision,p_decision_evidence::text));
  if p_decision='keep' then
    if exists(select 1 from tongs.anvil_recording_discard_requests where completion_id=c.id) then
      return jsonb_build_object('outcome','conflict','reason','take_already_discarded','keep',null);
    end if;
    select * into v_keep from tongs.anvil_recording_keep_requests where workspace_id=a.workspace_id and idempotency_key=v_key;
    if found then
      if v_keep.recording_capture_authority_id=a.id and v_keep.completion_id=c.id and v_keep.request_fingerprint=v_fingerprint then
        return jsonb_build_object('outcome','duplicate','keep',to_jsonb(v_keep));
      end if;
      return jsonb_build_object('outcome','conflict','reason','idempotency_key_reused','keep',null);
    end if;
    select * into v_keep from tongs.anvil_recording_keep_requests where completion_id=c.id;
    if found then return jsonb_build_object('outcome','duplicate','keep',to_jsonb(v_keep));end if;
    insert into tongs.anvil_recording_keep_requests(workspace_id,workpiece_id,capture_session_id,recording_capture_authority_id,
      completion_id,idempotency_key,request_fingerprint,decision_evidence,kept_by)
    values(a.workspace_id,a.workpiece_id,e.execution_id,a.id,c.id,v_key,v_fingerprint,p_decision_evidence,v_user) returning * into v_keep;
    perform set_config('tongs.recording_authority_rpc','on',true);
    insert into tongs.workpiece_events(workpiece_id,event_name,payload,correlation_id,written_by_tool,written_by_tool_version,written_by_lane)
    values(a.workpiece_id,'take_kept',jsonb_build_object('authority_schema','forge.recording-decision.v1','keep_id',v_keep.id,
      'completion_id',c.id,'recording_capture_authority_id',a.id,'workspace_id',a.workspace_id,'file_path',c.media_path),
      v_key,'recording',coalesce(p_decision_evidence->>'venue_version','unknown'),'forge-managed');
    return jsonb_build_object('outcome','saved','keep',to_jsonb(v_keep));
  end if;
  if exists(select 1 from tongs.anvil_recording_keep_requests where completion_id=c.id) then
    return jsonb_build_object('outcome','conflict','reason','take_already_kept','discard',null);
  end if;
  select * into v_discard from tongs.anvil_recording_discard_requests where workspace_id=a.workspace_id and idempotency_key=v_key;
  if found then
    if v_discard.recording_capture_authority_id=a.id and v_discard.completion_id=c.id and v_discard.request_fingerprint=v_fingerprint then
      return jsonb_build_object('outcome','duplicate','discard',to_jsonb(v_discard));
    end if;
    return jsonb_build_object('outcome','conflict','reason','idempotency_key_reused','discard',null);
  end if;
  select * into v_discard from tongs.anvil_recording_discard_requests where completion_id=c.id;
  if found then return jsonb_build_object('outcome','duplicate','discard',to_jsonb(v_discard));end if;
  insert into tongs.anvil_recording_discard_requests(workspace_id,workpiece_id,capture_session_id,recording_capture_authority_id,
    completion_id,idempotency_key,request_fingerprint,decision_evidence,discarded_by)
  values(a.workspace_id,a.workpiece_id,e.execution_id,a.id,c.id,v_key,v_fingerprint,p_decision_evidence,v_user) returning * into v_discard;
  perform set_config('tongs.recording_authority_rpc','on',true);
  insert into tongs.workpiece_events(workpiece_id,event_name,payload,correlation_id,written_by_tool,written_by_tool_version,written_by_lane)
  values(a.workpiece_id,'take_discarded',jsonb_build_object('authority_schema','forge.recording-decision.v1','discard_id',v_discard.id,
    'completion_id',c.id,'recording_capture_authority_id',a.id,'workspace_id',a.workspace_id,'file_path',c.media_path),
    v_key,'recording',coalesce(p_decision_evidence->>'venue_version','unknown'),'forge-managed');
  return jsonb_build_object('outcome','saved','discard',to_jsonb(v_discard));
end;
$function$;
revoke all on function tongs.recording_transition_take_decision(uuid,uuid,text,text,jsonb) from public,anon;
grant execute on function tongs.recording_transition_take_decision(uuid,uuid,text,text,jsonb) to authenticated,service_role;

create or replace function tongs.anvil_transition_take_decision_v2(
  p_capture_authority_id uuid,p_completion_id uuid,p_decision text,p_idempotency_key text,p_decision_evidence jsonb
) returns jsonb language sql security definer set search_path=pg_catalog,tongs as $$
  select tongs.recording_transition_take_decision(p_capture_authority_id,p_completion_id,p_decision,p_idempotency_key,
    p_decision_evidence - 'capture_authority_id' - 'capture_session_id' || jsonb_build_object('recording_capture_authority_id',p_capture_authority_id));
$$;

create or replace view tongs.anvil_capture_authorities with (security_invoker=true) as
select a.*,e.execution_id as capture_session_id
from tongs.recording_capture_authorities a
join tongs.anvil_capture_executions e on e.recording_capture_authority_id=a.id
where a.venue='anvil';
grant select on tongs.anvil_capture_authorities to authenticated,service_role;

-- Preserve the existing Hammer-facing projection while deriving all capture/script facts from
-- the shared immutable authority instead of copying them onto completion.
create or replace view tongs.current_workpiece_recorded_takes with (security_invoker=true) as
select c.workspace_id,c.workpiece_id,e.execution_id capture_session_id,c.id completion_id,k.id keep_id,
  a.ready_transition_id,a.script_revision,a.script_hash,c.media_path,c.media_revision,c.media_hash,
  c.completion_evidence,k.decision_evidence,c.created_at completed_at,k.created_at kept_at,
  c.completed_by,k.kept_by,'anvil_capture'::text source_kind,c.id source_authority_id,
  c.media_content_type,c.media_bytes,a.recording_session_id
from tongs.anvil_recording_completion_requests c
join tongs.recording_capture_authorities a on a.id=c.capture_authority_id
left join tongs.anvil_capture_executions e on e.recording_capture_authority_id=a.id
left join tongs.anvil_recording_keep_requests k on k.completion_id=c.id
union all
select h.workspace_id,h.workpiece_id,null::uuid,null::uuid,null::uuid,null::uuid,null::bigint,null::text,h.media_path,
  h.media_revision,h.verified_media_hash,h.provenance || jsonb_build_object('artifact_validation',jsonb_build_object(
    'content_type',h.verified_media_content_type,'bytes',h.verified_media_bytes,'sha256',h.verified_media_hash,
    'path',h.media_path,'ok',true)),null::jsonb,h.committed_at,null::timestamptz,h.imported_by,null::uuid,
  'hammer_import'::text,h.id,h.verified_media_content_type,h.verified_media_bytes,null::uuid
from tongs.hammer_recording_import_requests h where h.state='committed';
grant select on tongs.current_workpiece_recorded_takes to authenticated,service_role;

commit;
