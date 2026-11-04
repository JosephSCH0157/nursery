-- Resolve both confirmed aggregate-attempt callers against the authoritative
-- helper's smallint attempt-count signature. This changes only the call-site
-- type; all one-attempt, funding, exposure, sponsorship, and settlement
-- authority stays in the existing functions and tables.
begin;

do $repair$
declare
  v_signature regprocedure :=
    to_regprocedure('tongs.authorize_hammer_first_transcription_attempt(uuid,uuid,text,text,jsonb)');
  v_definition text;
  v_changed text;
  v_old text :=
    'tongs.begin_paid_operation_aggregate_attempt(operation.reservation_id,p_attempt_key||'':aggregate'',1,''interactive'')';
  v_new text :=
    'tongs.begin_paid_operation_aggregate_attempt(operation.reservation_id,p_attempt_key||'':aggregate'',1::smallint,''interactive'')';
begin
  if v_signature is null then
    raise exception 'Hammer attempt authority is missing';
  end if;
  if to_regprocedure('tongs.begin_paid_operation_aggregate_attempt(uuid,text,smallint,text)') is null then
    raise exception 'authoritative aggregate-attempt helper signature is missing';
  end if;

  select pg_get_functiondef(v_signature) into v_definition;
  if position(v_new in v_definition)>0 or position(v_old in v_definition)=0 then
    raise exception 'Hammer attempt authority changed upstream; explicit review required';
  end if;
  v_changed:=replace(v_definition,v_old,v_new);
  if v_changed=v_definition
     or position(v_old in v_changed)>0
     or position(v_new in v_changed)=0 then
    raise exception 'Hammer aggregate-attempt signature replacement was not exact';
  end if;
  execute v_changed;
end
$repair$;

do $repair_owner_hearth_research$
declare
  v_signature regprocedure :=
    to_regprocedure('tongs.authorize_owner_hearth_research_openai_attempt(uuid,text,smallint,text,bigint,integer,jsonb)');
  v_definition text;
  v_changed text;
  v_old text :=
    'tongs.begin_paid_operation_aggregate_attempt(p_reservation_id,p_attempt_key||'':aggregate'',1,p_caller_class)';
  v_new text :=
    'tongs.begin_paid_operation_aggregate_attempt(p_reservation_id,p_attempt_key||'':aggregate'',1::smallint,p_caller_class)';
begin
  if v_signature is null then
    raise exception 'owner Hearth Research attempt authority is missing';
  end if;

  select pg_get_functiondef(v_signature) into v_definition;
  if position(v_new in v_definition) > 0 or position(v_old in v_definition) = 0 then
    raise exception 'owner Hearth Research attempt authority changed upstream; explicit review required';
  end if;
  v_changed := replace(v_definition, v_old, v_new);
  if v_changed = v_definition
     or position(v_old in v_changed) > 0
     or position(v_new in v_changed) = 0 then
    raise exception 'owner Hearth Research aggregate-attempt signature replacement was not exact';
  end if;
  execute v_changed;
end
$repair_owner_hearth_research$;

do $verify$
declare
  v_definition text;
begin
  select pg_get_functiondef(
    'tongs.authorize_hammer_first_transcription_attempt(uuid,uuid,text,text,jsonb)'::regprocedure
  ) into v_definition;
  if position(
    'tongs.begin_paid_operation_aggregate_attempt(operation.reservation_id,p_attempt_key||'':aggregate'',1::smallint,''interactive'')'
    in v_definition
  )=0 then
    raise exception 'Hammer aggregate-attempt smallint call was not installed';
  end if;
  if has_function_privilege('public',
       'tongs.authorize_hammer_first_transcription_attempt(uuid,uuid,text,text,jsonb)','execute')
     or has_function_privilege('anon',
       'tongs.authorize_hammer_first_transcription_attempt(uuid,uuid,text,text,jsonb)','execute')
     or has_function_privilege('authenticated',
       'tongs.authorize_hammer_first_transcription_attempt(uuid,uuid,text,text,jsonb)','execute')
     or not has_function_privilege('service_role',
       'tongs.authorize_hammer_first_transcription_attempt(uuid,uuid,text,text,jsonb)','execute') then
    raise exception 'Hammer attempt authority ACL changed';
  end if;

  select pg_get_functiondef(
    'tongs.authorize_owner_hearth_research_openai_attempt(uuid,text,smallint,text,bigint,integer,jsonb)'::regprocedure
  ) into v_definition;
  if position(
    'tongs.begin_paid_operation_aggregate_attempt(p_reservation_id,p_attempt_key||'':aggregate'',1::smallint,p_caller_class)'
    in v_definition
  ) = 0 then
    raise exception 'owner Hearth Research aggregate-attempt smallint call was not installed';
  end if;
  if has_function_privilege('public',
       'tongs.authorize_owner_hearth_research_openai_attempt(uuid,text,smallint,text,bigint,integer,jsonb)','execute')
     or has_function_privilege('anon',
       'tongs.authorize_owner_hearth_research_openai_attempt(uuid,text,smallint,text,bigint,integer,jsonb)','execute')
     or has_function_privilege('authenticated',
       'tongs.authorize_owner_hearth_research_openai_attempt(uuid,text,smallint,text,bigint,integer,jsonb)','execute')
     or not has_function_privilege('service_role',
       'tongs.authorize_owner_hearth_research_openai_attempt(uuid,text,smallint,text,bigint,integer,jsonb)','execute') then
    raise exception 'owner Hearth Research attempt authority ACL changed';
  end if;
end
$verify$;

notify pgrst,'reload schema';
commit;
