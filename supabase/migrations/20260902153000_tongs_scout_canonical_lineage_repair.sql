begin;

do $$
declare
  v_workspace uuid := '494c2ae5-9037-4208-b898-fab4898ab430'::uuid;
  v_legacy uuid := 'b4cc4115-459a-439a-93e8-f33a1239df90'::uuid;
  v_canonical uuid := '140a9410-6170-434f-885f-ac6aaf6a8fcd'::uuid;
  v_actor uuid;
begin
  if not exists(select 1 from tongs.episodes where id=v_legacy and workspace_id=v_workspace)
     or not exists(select 1 from tongs.episodes where id=v_canonical and workspace_id=v_workspace) then
    raise notice 'SCOUT lineage repair skipped because the guarded records are absent';
    return;
  end if;

  select user_id into v_actor
  from tongs.workspace_members
  where workspace_id=v_workspace and role in ('owner','editor')
  order by case role when 'owner' then 0 else 1 end, created_at
  limit 1;
  if v_actor is null then raise exception 'SCOUT lineage repair has no workspace actor'; end if;

  update tongs.barstock_sparks
  set linked_workpiece_id=v_canonical,
      status='forged',
      updated_at=now()
  where workspace_id=v_workspace and linked_workpiece_id=v_legacy;

  update tongs.episodes
  set archived_at=coalesce(archived_at,now()),
      archived_by=coalesce(archived_by,v_actor),
      archive_reason=coalesce(archive_reason,'duplicate lineage consolidated into 140a9410-6170-434f-885f-ac6aaf6a8fcd')
  where id=v_legacy and workspace_id=v_workspace;
end
$$;

commit;
