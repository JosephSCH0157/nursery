\set ON_ERROR_STOP on
begin;

do $contract$
declare
  v_definition text;
  v_occurrences integer;
begin
  if to_regprocedure('tongs.begin_paid_operation_aggregate_attempt(uuid,text,smallint,text)') is null then
    raise exception 'aggregate-attempt smallint helper is missing';
  end if;
  select pg_get_functiondef(
    'tongs.authorize_hammer_first_transcription_attempt(uuid,uuid,text,text,jsonb)'::regprocedure
  ) into v_definition;
  if position(
    'tongs.begin_paid_operation_aggregate_attempt(operation.reservation_id,p_attempt_key||'':aggregate'',1::smallint,''interactive'')'
    in v_definition
  )=0 then
    raise exception 'Hammer attempt call does not resolve to the smallint helper';
  end if;
  if position(
    'tongs.begin_paid_operation_aggregate_attempt(operation.reservation_id,p_attempt_key||'':aggregate'',1,''interactive'')'
    in v_definition
  )>0 then
    raise exception 'Hammer attempt authority retains the ambiguous integer call';
  end if;
  v_occurrences:=(
    length(v_definition)-length(replace(v_definition,'begin_paid_operation_aggregate_attempt(',''))
  )/length('begin_paid_operation_aggregate_attempt(');
  if v_occurrences<>1 then
    raise exception 'Hammer attempt authority must invoke aggregate admission exactly once';
  end if;
  if position('insert into tongs.hammer_transcription_provider_attempts' in lower(v_definition))=0
     or position('values(p_attempt_id,operation.id,1,''authorized''' in lower(v_definition))=0 then
    raise exception 'Hammer one-attempt persistence boundary changed';
  end if;

  select pg_get_functiondef(
    'tongs.authorize_owner_hearth_research_openai_attempt(uuid,text,smallint,text,bigint,integer,jsonb)'::regprocedure
  ) into v_definition;
  if position(
    'tongs.begin_paid_operation_aggregate_attempt(p_reservation_id,p_attempt_key||'':aggregate'',1::smallint,p_caller_class)'
    in v_definition
  )=0 then
    raise exception 'owner Hearth Research attempt call does not resolve to the smallint helper';
  end if;
  if position(
    'tongs.begin_paid_operation_aggregate_attempt(p_reservation_id,p_attempt_key||'':aggregate'',1,p_caller_class)'
    in v_definition
  )>0 then
    raise exception 'owner Hearth Research retains the ambiguous integer call';
  end if;
  v_occurrences:=(
    length(v_definition)-length(replace(v_definition,'begin_paid_operation_aggregate_attempt(',''))
  )/length('begin_paid_operation_aggregate_attempt(');
  if v_occurrences<>1 then
    raise exception 'owner Hearth Research must invoke aggregate admission exactly once';
  end if;
  if position('p_attempt_number<>1' in regexp_replace(v_definition,'\s','','g'))=0
     or position('duplicate_attempt_blocked' in v_definition)=0 then
    raise exception 'owner Hearth Research one-attempt and duplicate containment changed';
  end if;
end
$contract$;

rollback;
