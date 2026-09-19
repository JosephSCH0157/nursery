-- LOCAL CERTIFICATION FIXTURE ONLY. Never place this file under
-- supabase/migrations and never execute it against a linked database.
--
-- 20260917012316 appends corrections for two real historical customer failure
-- events. Replaying those customer reservations would violate fixture scope, so
-- this guarded bridge creates only the two referenced event identities. The
-- companion cleanup removes them and the appended corrections immediately
-- after the exact migration has installed its schema and functions.

begin;

do $$
begin
  if current_setting('forge.local_historical_replay', true)
       is distinct from 'mid-september-v1' then
    raise exception 'local historical replay guard is missing' using errcode='42501';
  end if;
  if not exists (
    select 1 from supabase_migrations.schema_migrations
    where version='20260916202804'
  ) or exists (
    select 1 from supabase_migrations.schema_migrations
    where version='20260917012316'
  ) then
    raise exception 'realized-loss bridge requires the exact pre-correction boundary'
      using errcode='P0001';
  end if;
  if exists (
    select 1 from tongs.openai_text_failure_exposure_events
    where id in (
      'bafff750-6322-413c-bd6f-c5870e34190f',
      'a0098b15-f9c1-4fef-b55f-a7341cd8ba6e'
    )
  ) then
    raise exception 'realized-loss bridge event identity is already occupied'
      using errcode='23505';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='tongs.openai_text_failure_exposure_events'::regclass
      and conname='openai_text_failure_exposure_events_hold_id_fkey'
  ) then
    raise exception 'realized-loss bridge expected the canonical hold foreign key';
  end if;
  alter table tongs.openai_text_failure_exposure_events
    drop constraint openai_text_failure_exposure_events_hold_id_fkey;
  alter table tongs.openai_text_failure_exposure_events
    disable trigger openai_text_failure_exposure_events_immutable;
  insert into tongs.openai_text_failure_exposure_events(
    id,hold_id,sequence,event_key,event_type,actual_supplier_cost_micros,evidence_json
  ) values
    ('bafff750-6322-413c-bd6f-c5870e34190f','fe000000-0000-4000-8000-000000000101',1,
     'local-replay-only:bafff750-6322-413c-bd6f-c5870e34190f','failure_realized',10631,
     '{"local_historical_bridge":true}'),
    ('a0098b15-f9c1-4fef-b55f-a7341cd8ba6e','fe000000-0000-4000-8000-000000000102',1,
     'local-replay-only:a0098b15-f9c1-4fef-b55f-a7341cd8ba6e','failure_realized',10096,
     '{"local_historical_bridge":true}');
  alter table tongs.openai_text_failure_exposure_events
    enable trigger openai_text_failure_exposure_events_immutable;
end $$;

commit;
