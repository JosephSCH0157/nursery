begin;

do $hammer_h2c_contract$
declare
  target regclass;
  target_name text;
  rollout_mode text;
begin
  foreach target_name in array array[
    'hammer_transcription_provider_authorities',
    'hammer_transcription_operations',
    'hammer_transcription_provider_attempts',
    'hammer_transcription_stage_receipts',
    'hammer_canonical_transcripts_v2'
  ] loop
    target := format('tongs.%I', target_name)::regclass;
    if not (select relrowsecurity and relforcerowsecurity from pg_class where oid=target) then
      raise exception 'Hammer H2-C table % must force RLS', target_name;
    end if;
    if has_table_privilege('authenticated',target,'INSERT')
       or has_table_privilege('authenticated',target,'UPDATE')
       or has_table_privilege('authenticated',target,'DELETE') then
      raise exception 'authenticated has Hammer H2-C write privilege on %', target_name;
    end if;
  end loop;

  if has_table_privilege('authenticated','tongs.hammer_transcription_provider_authorities','SELECT') then
    raise exception 'authenticated can read private provider authority';
  end if;

  if (select count(*) from tongs.hammer_transcription_provider_authorities) <> 0
     or (select count(*) from tongs.hammer_transcription_operations) <> 0
     or (select count(*) from tongs.hammer_transcription_provider_attempts) <> 0
     or (select count(*) from tongs.hammer_transcription_stage_receipts) <> 0
     or (select count(*) from tongs.hammer_canonical_transcripts_v2) <> 0 then
    raise exception 'Hammer H2-C migration created authority or operation data';
  end if;

  select mode into rollout_mode
  from tongs.openai_text_rollout_revisions
  where route_code='hammer.transcript_prep'
  order by revision desc limit 1;
  if rollout_mode not in ('inactive','halt_new') then
    raise exception 'Hammer transcript-prep route is not fail closed: %', rollout_mode;
  end if;

  if exists(
    select 1 from pg_constraint
    where conrelid='tongs.hammer_transcription_operations'::regclass
      and contype='c'
      and pg_get_constraintdef(oid) like '%execution_authorized = false%'
  ) is not true then
    raise exception 'execution_authorized=false hard stop is missing';
  end if;

  if exists(
    select 1 from tongs.hammer_transcription_operations
    where execution_authorized or financial_environment='live'
  ) then
    raise exception 'Hammer H2-C contains executable or Live authority';
  end if;
end
$hammer_h2c_contract$;

rollback;
