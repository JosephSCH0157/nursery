begin;

create or replace function tongs.assert_unified_visual_plan_coverage_exclusive(
  p_workspace_id uuid,
  p_workpiece_id uuid,
  p_plan jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, tongs
as $$
declare
  duplicate_focus text;
begin
  if not tongs.has_workspace_role(p_workspace_id, 'editor') then
    raise exception 'workspace editor role required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from tongs.episodes
    where id = p_workpiece_id and workspace_id = p_workspace_id
  ) then
    raise exception 'workpiece not found in workspace' using errcode = 'P0002';
  end if;

  with coverage as (
    select family, nullif(btrim(item->>'context_focus'), '') as focus
    from (values
      ('image', coalesce(p_plan->'images', '[]'::jsonb)),
      ('broll', coalesce(p_plan->'broll', '[]'::jsonb)),
      ('reference_clip', coalesce(p_plan->'reference_clips', '[]'::jsonb)),
      ('reference_visual', coalesce(p_plan->'reference_visuals', '[]'::jsonb))
    ) as families(family, items)
    cross join lateral jsonb_array_elements(families.items) as item
  )
  select focus into duplicate_focus
  from coverage
  where focus is not null
  group by focus
  having count(*) > 1
  limit 1;

  if duplicate_focus is not null then
    raise exception 'visual coverage overlap remains for script focus: %', duplicate_focus
      using errcode = '23514';
  end if;

  return jsonb_build_object('disposition', 'verified', 'exclusive', true);
end;
$$;

revoke all on function tongs.assert_unified_visual_plan_coverage_exclusive(uuid, uuid, jsonb) from public, anon;
grant execute on function tongs.assert_unified_visual_plan_coverage_exclusive(uuid, uuid, jsonb) to authenticated, service_role;

commit;
