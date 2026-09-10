begin;

do $$
declare
  route_count integer;
  active_count integer;
  complete_cost_count integer;
  reconciliation_count integer;
  reconciliation_amount bigint;
  customer_table_grant_count integer;
  rate_count integer;
  reconciliation_definition text;
begin
  select count(*) into route_count
  from tongs.openai_text_route_policies
  where route_code in (
    'hearth.speech_transcription',
    'anvil.realtime_transcription',
    'hammer.transcript_prep',
    'hammer.transcript_regeneration'
  ) and provider_operation = 'audio_transcriptions'
    and maximum_attempts = 1;
  if route_count <> 4 then
    raise exception 'expected four bounded audio-transcription route policies, found %', route_count;
  end if;

  select count(*) into active_count
  from tongs.openai_text_rollout_revisions
  where route_code in (
    'hearth.speech_transcription',
    'anvil.realtime_transcription',
    'hammer.transcript_prep',
    'hammer.transcript_regeneration'
  ) and mode <> 'inactive';
  if active_count <> 0 then
    raise exception 'transcription rollout was unexpectedly activated';
  end if;

  select count(*) into complete_cost_count
  from tongs.openai_text_cost_policy_revisions
  where route_code in (
    'hearth.speech_transcription',
    'anvil.realtime_transcription',
    'hammer.transcript_prep',
    'hammer.transcript_regeneration'
  ) and (lifecycle_state <> 'draft' or cost_coverage = 'complete');
  if complete_cost_count <> 0 then
    raise exception 'unapproved supporting costs became executable';
  end if;

  select count(*) into rate_count
  from tongs.openai_text_provider_rate_revisions
  where provider_model_id in (
    'gpt-4o-mini-transcribe',
    'gpt-4o-transcribe',
    'gpt-4o-transcribe-diarize'
  ) and billing_basis = 'audio_and_text_tokens'
    and audio_input_micros_per_million_tokens is not null
    and text_input_micros_per_million_tokens is not null;
  if rate_count <> 3 then
    raise exception 'expected three evidence-backed token rate revisions, found %', rate_count;
  end if;

  select count(*),coalesce(sum(amount_micros),0)
  into reconciliation_count,reconciliation_amount
  from tongs.openai_transcription_reconciliation_notes
  where source_key = 'openai:transcription:2026-09-01:2026-09-10:authoritative-unallocated';
  if reconciliation_count <> 1 or reconciliation_amount <> 39058 then
    raise exception 'historical authoritative transcription total was duplicated or changed';
  end if;
  if exists (
    select 1 from tongs.openai_transcription_reconciliation_notes
    where source_key = 'openai:transcription:2026-09-01:2026-09-10:authoritative-unallocated'
      and (allocation_status <> 'unmatched' or request_level_certainty)
  ) then
    raise exception 'aggregate transcription total was given false operation-level certainty';
  end if;

  select count(*) into customer_table_grant_count
  from information_schema.role_table_grants
  where table_schema = 'tongs'
    and table_name in (
      'openai_transcription_duration_rate_revisions',
      'openai_transcription_supporting_cost_inventory',
      'openai_transcription_source_bindings',
      'openai_transcription_canonical_results',
      'openai_transcription_reconciliation_notes'
    )
    and grantee in ('anon','authenticated');
  if customer_table_grant_count <> 0 then
    raise exception 'customer role can read private transcription pricing/accounting tables';
  end if;

  select pg_get_functiondef('tongs._process_openai_organization_reconciliation(uuid)'::regprocedure)
    into reconciliation_definition;
  if position('candidate_duration' in reconciliation_definition) = 0
     or position('audio_transcriptions' in reconciliation_definition) = 0 then
    raise exception 'audio usage evidence is not connected to conservative cost allocation';
  end if;

  if to_regprocedure('tongs.settle_openai_customer_failure_without_duplicate_expense(uuid,uuid,text,text,jsonb)') is null then
    raise exception 'OpenAI zero-charge settlement without duplicate supplier expense is missing';
  end if;
end $$;

rollback;
