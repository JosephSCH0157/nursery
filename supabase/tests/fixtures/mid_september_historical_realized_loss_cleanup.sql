-- LOCAL CERTIFICATION FIXTURE ONLY. Removes the temporary event identities used
-- to execute 20260917012316 without reproducing customer financial history.

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
  ) then
    raise exception 'realized-loss cleanup requires the preceding historical slice'
      using errcode='P0001';
  end if;

  if to_regclass('tongs.openai_text_failure_realized_loss_corrections') is not null then
    alter table tongs.openai_text_failure_realized_loss_corrections
      disable trigger openai_text_failure_realized_loss_corrections_immutable;
    delete from tongs.openai_text_failure_realized_loss_corrections
    where id in (
      'f1000000-0000-4000-8000-000000000001',
      'f1000000-0000-4000-8000-000000000002'
    );
    alter table tongs.openai_text_failure_realized_loss_corrections
      enable trigger openai_text_failure_realized_loss_corrections_immutable;
  end if;
  alter table tongs.openai_text_failure_exposure_events
    disable trigger openai_text_failure_exposure_events_immutable;
  delete from tongs.openai_text_failure_exposure_events
  where id in (
    'bafff750-6322-413c-bd6f-c5870e34190f',
    'a0098b15-f9c1-4fef-b55f-a7341cd8ba6e'
  );
  alter table tongs.openai_text_failure_exposure_events
    enable trigger openai_text_failure_exposure_events_immutable;
  if not exists (
    select 1 from pg_constraint
    where conrelid='tongs.openai_text_failure_exposure_events'::regclass
      and conname='openai_text_failure_exposure_events_hold_id_fkey'
  ) then
    alter table tongs.openai_text_failure_exposure_events
      add constraint openai_text_failure_exposure_events_hold_id_fkey
      foreign key(hold_id) references tongs.openai_text_failure_exposure_holds(id)
      on delete restrict;
  end if;

  if exists (
    select 1 from tongs.openai_text_failure_exposure_events
    where id in (
      'bafff750-6322-413c-bd6f-c5870e34190f',
      'a0098b15-f9c1-4fef-b55f-a7341cd8ba6e'
    )
  ) then
    raise exception 'realized-loss bridge cleanup failed';
  end if;
end $$;

commit;
