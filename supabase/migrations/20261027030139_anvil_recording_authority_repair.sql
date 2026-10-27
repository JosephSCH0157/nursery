begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $preflight$
begin
  if to_regclass('tongs.recording_capture_authorities') is null
     or to_regclass('tongs.anvil_capture_executions') is null
     or to_regclass('tongs.anvil_recording_completion_requests') is null
     or to_regclass('tongs.anvil_recording_keep_requests') is null
     or to_regclass('tongs.anvil_recording_discard_requests') is null then
    raise exception using errcode='55000', message='recording authority repair prerequisites are absent';
  end if;
  if not exists (
    select 1 from pg_attribute
    where attrelid='tongs.anvil_recording_completion_requests'::regclass
      and attname='capture_authority_id' and not attisdropped
  ) then
    raise exception using errcode='55000', message='recording completion authority lineage is absent';
  end if;
  if exists (
    select 1
    from tongs.anvil_recording_completion_requests c
    left join tongs.recording_capture_authorities a on a.id=c.capture_authority_id
    where c.capture_authority_id is null or a.id is null
      or a.workspace_id<>c.workspace_id or a.workpiece_id<>c.workpiece_id
  ) then
    raise exception using errcode='23514', message='recording completion authority lineage is incomplete or inconsistent';
  end if;
end
$preflight$;

alter table tongs.anvil_recording_keep_requests
  add column if not exists recording_capture_authority_id uuid null;
alter table tongs.anvil_recording_discard_requests
  add column if not exists recording_capture_authority_id uuid null;

do $constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='tongs.anvil_recording_keep_requests'::regclass
      and contype='f' and conkey=array[
        (select attnum from pg_attribute where attrelid='tongs.anvil_recording_keep_requests'::regclass and attname='recording_capture_authority_id')::smallint
      ]
      and confrelid='tongs.recording_capture_authorities'::regclass
  ) then
    alter table tongs.anvil_recording_keep_requests
      add constraint anvil_recording_keep_recording_capture_authority_fkey
      foreign key(recording_capture_authority_id)
      references tongs.recording_capture_authorities(id) on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid='tongs.anvil_recording_discard_requests'::regclass
      and contype='f' and conkey=array[
        (select attnum from pg_attribute where attrelid='tongs.anvil_recording_discard_requests'::regclass and attname='recording_capture_authority_id')::smallint
      ]
      and confrelid='tongs.recording_capture_authorities'::regclass
  ) then
    alter table tongs.anvil_recording_discard_requests
      add constraint anvil_recording_discard_recording_capture_authority_fkey
      foreign key(recording_capture_authority_id)
      references tongs.recording_capture_authorities(id) on delete restrict;
  end if;
end
$constraints$;

update tongs.anvil_recording_keep_requests k
set recording_capture_authority_id=c.capture_authority_id
from tongs.anvil_recording_completion_requests c
where c.id=k.completion_id
  and k.recording_capture_authority_id is null;

update tongs.anvil_recording_discard_requests d
set recording_capture_authority_id=c.capture_authority_id
from tongs.anvil_recording_completion_requests c
where c.id=d.completion_id
  and d.recording_capture_authority_id is null;

do $lineage$
begin
  if exists (
    select 1
    from tongs.anvil_recording_keep_requests k
    left join tongs.anvil_recording_completion_requests c on c.id=k.completion_id
    left join tongs.recording_capture_authorities a on a.id=k.recording_capture_authority_id
    where c.id is null or a.id is null
      or k.recording_capture_authority_id is distinct from c.capture_authority_id
      or k.workspace_id<>c.workspace_id or k.workpiece_id<>c.workpiece_id
      or a.workspace_id<>k.workspace_id or a.workpiece_id<>k.workpiece_id
      or (k.capture_session_id is not null and not exists (
        select 1 from tongs.anvil_capture_executions e
        where e.recording_capture_authority_id=a.id
          and e.execution_id=k.capture_session_id
      ))
  ) then
    raise exception using errcode='23514', message='recording keep authority lineage is incomplete or ambiguous';
  end if;
  if exists (
    select 1
    from tongs.anvil_recording_discard_requests d
    left join tongs.anvil_recording_completion_requests c on c.id=d.completion_id
    left join tongs.recording_capture_authorities a on a.id=d.recording_capture_authority_id
    where c.id is null or a.id is null
      or d.recording_capture_authority_id is distinct from c.capture_authority_id
      or d.workspace_id<>c.workspace_id or d.workpiece_id<>c.workpiece_id
      or a.workspace_id<>d.workspace_id or a.workpiece_id<>d.workpiece_id
      or (d.capture_session_id is not null and not exists (
        select 1 from tongs.anvil_capture_executions e
        where e.recording_capture_authority_id=a.id
          and e.execution_id=d.capture_session_id
      ))
  ) then
    raise exception using errcode='23514', message='recording discard authority lineage is incomplete or ambiguous';
  end if;
end
$lineage$;

alter table tongs.anvil_recording_keep_requests
  alter column recording_capture_authority_id set not null,
  alter column capture_session_id drop not null;
alter table tongs.anvil_recording_discard_requests
  alter column recording_capture_authority_id set not null,
  alter column capture_session_id drop not null;

create or replace function tongs.reject_recording_receipt_mutation()
returns trigger
language plpgsql
set search_path=pg_catalog,tongs
as $function$
begin
  raise exception using errcode='55000', message='recording transition receipts are immutable';
end
$function$;
alter function tongs.reject_recording_receipt_mutation() owner to postgres;
revoke all on function tongs.reject_recording_receipt_mutation() from public,anon,authenticated;

drop trigger if exists trg_recording_completion_immutable on tongs.anvil_recording_completion_requests;
create trigger trg_recording_completion_immutable
before update or delete on tongs.anvil_recording_completion_requests
for each row execute function tongs.reject_recording_receipt_mutation();
drop trigger if exists trg_recording_keep_immutable on tongs.anvil_recording_keep_requests;
create trigger trg_recording_keep_immutable
before update or delete on tongs.anvil_recording_keep_requests
for each row execute function tongs.reject_recording_receipt_mutation();
drop trigger if exists trg_recording_discard_immutable on tongs.anvil_recording_discard_requests;
create trigger trg_recording_discard_immutable
before update or delete on tongs.anvil_recording_discard_requests
for each row execute function tongs.reject_recording_receipt_mutation();

create or replace function tongs.recording_transition_take_decision(
  p_recording_capture_authority_id uuid,
  p_completion_id uuid,
  p_decision text,
  p_idempotency_key text,
  p_decision_evidence jsonb
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,tongs
as $function$
declare
  a tongs.recording_capture_authorities%rowtype;
  c tongs.anvil_recording_completion_requests%rowtype;
  e tongs.anvil_capture_executions%rowtype;
  v_user uuid:=auth.uid();
  v_key text:=btrim(coalesce(p_idempotency_key,''));
  v_fingerprint text;
  v_keep tongs.anvil_recording_keep_requests%rowtype;
  v_discard tongs.anvil_recording_discard_requests%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_completion_id::text,0));

  select * into a
  from tongs.recording_capture_authorities
  where id=p_recording_capture_authority_id;
  if not found then
    return jsonb_build_object('outcome','not_found','reason','capture_completion_mismatch');
  end if;

  select * into c
  from tongs.anvil_recording_completion_requests
  where id=p_completion_id
    and capture_authority_id=a.id
    and workspace_id=a.workspace_id
    and workpiece_id=a.workpiece_id;
  if not found then
    return jsonb_build_object('outcome','not_found','reason','capture_completion_mismatch');
  end if;

  if v_user is null or not tongs.has_workspace_role(a.workspace_id,'editor') then
    return jsonb_build_object('outcome','denied','reason','editor_required');
  end if;
  if length(v_key) not between 8 and 200 or p_decision not in ('keep','discard')
    or p_decision_evidence is null or jsonb_typeof(p_decision_evidence)<>'object'
    or p_decision_evidence->>'decision' is distinct from p_decision
    or p_decision_evidence->>'completion_id' is distinct from c.id::text
    or p_decision_evidence->>'recording_capture_authority_id' is distinct from a.id::text then
    return jsonb_build_object('outcome','conflict','reason','invalid_decision_evidence');
  end if;

  select * into e
  from tongs.anvil_capture_executions
  where recording_capture_authority_id=a.id;
  if a.venue='anvil' and e.execution_id is null then
    return jsonb_build_object('outcome','conflict','reason','venue_execution_missing');
  end if;

  if p_decision='keep' then
    if exists(select 1 from tongs.anvil_recording_discard_requests where completion_id=c.id) then
      return jsonb_build_object('outcome','conflict','reason','take_already_discarded','keep',null);
    end if;
    select * into v_keep
    from tongs.anvil_recording_keep_requests
    where completion_id=c.id;
    if found then
      if v_keep.recording_capture_authority_id=a.id
         and v_keep.workspace_id=a.workspace_id
         and v_keep.workpiece_id=a.workpiece_id then
        return jsonb_build_object('outcome','duplicate','keep',to_jsonb(v_keep));
      end if;
      return jsonb_build_object('outcome','conflict','reason','existing_decision_lineage_mismatch','keep',null);
    end if;
    select * into v_keep
    from tongs.anvil_recording_keep_requests
    where workspace_id=a.workspace_id and idempotency_key=v_key;
    if found then
      return jsonb_build_object('outcome','conflict','reason','idempotency_key_reused','keep',null);
    end if;

    v_fingerprint:=md5(concat_ws('|',a.id,c.id,p_decision,p_decision_evidence::text));
    insert into tongs.anvil_recording_keep_requests(
      workspace_id,workpiece_id,capture_session_id,recording_capture_authority_id,
      completion_id,idempotency_key,request_fingerprint,decision_evidence,kept_by
    ) values (
      a.workspace_id,a.workpiece_id,e.execution_id,a.id,c.id,v_key,v_fingerprint,p_decision_evidence,v_user
    ) returning * into v_keep;
    perform set_config('tongs.recording_authority_rpc','on',true);
    insert into tongs.workpiece_events(
      workpiece_id,event_name,payload,correlation_id,
      written_by_tool,written_by_tool_version,written_by_lane
    ) values (
      a.workpiece_id,'take_kept',jsonb_build_object(
        'authority_schema','forge.recording-decision.v2','keep_id',v_keep.id,
        'completion_id',c.id,'recording_capture_authority_id',a.id,
        'workspace_id',a.workspace_id,'file_path',c.media_path
      ),v_key,'recording',coalesce(p_decision_evidence->>'venue_version','unknown'),'forge-managed'
    );
    return jsonb_build_object('outcome','saved','keep',to_jsonb(v_keep));
  end if;

  if exists(select 1 from tongs.anvil_recording_keep_requests where completion_id=c.id) then
    return jsonb_build_object('outcome','conflict','reason','take_already_kept','discard',null);
  end if;
  select * into v_discard
  from tongs.anvil_recording_discard_requests
  where completion_id=c.id;
  if found then
    if v_discard.recording_capture_authority_id=a.id
       and v_discard.workspace_id=a.workspace_id
       and v_discard.workpiece_id=a.workpiece_id then
      return jsonb_build_object('outcome','duplicate','discard',to_jsonb(v_discard));
    end if;
    return jsonb_build_object('outcome','conflict','reason','existing_decision_lineage_mismatch','discard',null);
  end if;
  select * into v_discard
  from tongs.anvil_recording_discard_requests
  where workspace_id=a.workspace_id and idempotency_key=v_key;
  if found then
    return jsonb_build_object('outcome','conflict','reason','idempotency_key_reused','discard',null);
  end if;

  v_fingerprint:=md5(concat_ws('|',a.id,c.id,p_decision,p_decision_evidence::text));
  insert into tongs.anvil_recording_discard_requests(
    workspace_id,workpiece_id,capture_session_id,recording_capture_authority_id,
    completion_id,idempotency_key,request_fingerprint,decision_evidence,discarded_by
  ) values (
    a.workspace_id,a.workpiece_id,e.execution_id,a.id,c.id,v_key,v_fingerprint,p_decision_evidence,v_user
  ) returning * into v_discard;
  perform set_config('tongs.recording_authority_rpc','on',true);
  insert into tongs.workpiece_events(
    workpiece_id,event_name,payload,correlation_id,
    written_by_tool,written_by_tool_version,written_by_lane
  ) values (
    a.workpiece_id,'take_discarded',jsonb_build_object(
      'authority_schema','forge.recording-decision.v2','discard_id',v_discard.id,
      'completion_id',c.id,'recording_capture_authority_id',a.id,
      'workspace_id',a.workspace_id,'file_path',c.media_path
    ),v_key,'recording',coalesce(p_decision_evidence->>'venue_version','unknown'),'forge-managed'
  );
  return jsonb_build_object('outcome','saved','discard',to_jsonb(v_discard));
end
$function$;

alter function tongs.recording_transition_take_decision(uuid,uuid,text,text,jsonb) owner to postgres;
revoke all on function tongs.recording_transition_take_decision(uuid,uuid,text,text,jsonb) from public,anon;
grant execute on function tongs.recording_transition_take_decision(uuid,uuid,text,text,jsonb) to authenticated,service_role;

commit;
