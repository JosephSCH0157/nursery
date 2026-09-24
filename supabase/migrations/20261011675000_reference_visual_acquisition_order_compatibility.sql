begin;

-- 20260924174757 is intentionally immutable and creates the Source-set-aware
-- acquisition signature before this repository's future-dated chain reaches
-- 20261011680000. On a clean replay only, remove that exact signature so the
-- later immutable migration can create it. When 11680000 is already recorded
-- (the linked deployment case), this migration is a strict runtime no-op.
do $$
begin
  if not exists(
    select 1
    from supabase_migrations.schema_migrations
    where version='20261011680000'
  ) then
    drop function if exists tongs.begin_reference_visual_acquisition(
      uuid,uuid,uuid,uuid,uuid,text,text,text,uuid
    );
  end if;
end$$;

commit;
