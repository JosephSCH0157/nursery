begin;

do $$
begin
  if not exists (
    select 1
    from supabase_migrations.schema_migrations
    where version = '20260811140000'
  ) then
    drop policy if exists reference_visual_sequence_sequences_viewer
      on tongs.reference_visual_sequence_sequences;
  end if;
end
$$;

commit;
