-- Give every Bar-Stock Spark one durable, workspace-scoped Hearth episode identity.

begin;

alter table tongs.barstock_sparks
  add column if not exists linked_workpiece_id uuid null;

alter table tongs.barstock_sparks
  drop constraint if exists barstock_sparks_linked_workpiece_workspace_fkey;

alter table tongs.barstock_sparks
  add constraint barstock_sparks_linked_workpiece_workspace_fkey
  foreign key (linked_workpiece_id, workspace_id)
  references tongs.episodes(id, workspace_id)
  on delete set null (linked_workpiece_id);

create index if not exists barstock_sparks_linked_workpiece_idx
  on tongs.barstock_sparks(workspace_id, linked_workpiece_id)
  where linked_workpiece_id is not null;

create or replace function tongs.get_or_create_hearth_spark_episode(
  p_workspace_id uuid,
  p_spark_id uuid,
  p_title text
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,tongs
as $function$
declare
  v_user uuid := auth.uid();
  v_title text := coalesce(nullif(btrim(p_title), ''), 'Untitled Spark');
  v_spark tongs.barstock_sparks%rowtype;
  v_workpiece_id uuid;
begin
  if v_user is null or not tongs.has_workspace_role(p_workspace_id, 'editor') then
    return jsonb_build_object('outcome', 'denied', 'reason', 'editor_required');
  end if;
  if length(v_title) > 200 then
    return jsonb_build_object('outcome', 'conflict', 'reason', 'invalid_title');
  end if;

  -- Serializes first-open requests across browsers and devices for this Spark.
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':' || p_spark_id::text, 0));

  select * into v_spark
  from tongs.barstock_sparks
  where id = p_spark_id
    and workspace_id = p_workspace_id
    and deleted_at is null
  for update;

  if not found then
    return jsonb_build_object('outcome', 'not_found', 'reason', 'spark_not_found');
  end if;

  if v_spark.linked_workpiece_id is not null then
    return jsonb_build_object(
      'outcome', 'existing',
      'created', false,
      'spark_id', p_spark_id,
      'workpiece_id', v_spark.linked_workpiece_id
    );
  end if;

  v_workpiece_id := tongs.create_episode_identity_internal(
    p_workspace_id,
    v_title,
    v_user,
    'hearth_spark'
  );

  update tongs.barstock_sparks
  set linked_workpiece_id = v_workpiece_id,
      status = 'forged',
      updated_at = now()
  where id = p_spark_id and workspace_id = p_workspace_id;

  return jsonb_build_object(
    'outcome', 'created',
    'created', true,
    'spark_id', p_spark_id,
    'workpiece_id', v_workpiece_id
  );
end;
$function$;

revoke all on function tongs.get_or_create_hearth_spark_episode(uuid,uuid,text) from public,anon;
grant execute on function tongs.get_or_create_hearth_spark_episode(uuid,uuid,text) to authenticated,service_role;
alter function tongs.get_or_create_hearth_spark_episode(uuid,uuid,text) owner to postgres;

-- Incident repair: preserve the original Seminole County episode as the Spark's
-- canonical target. The guards make this a no-op outside the affected site/data.
update tongs.barstock_sparks s
set linked_workpiece_id = 'b4cc4115-459a-439a-93e8-f33a1239df90'::uuid,
    status = 'forged',
    updated_at = now()
where s.id = '595d6b81-8605-47b0-af35-4c74cdaa7a0a'::uuid
  and s.workspace_id = '494c2ae5-9037-4208-b898-fab4898ab430'::uuid
  and s.linked_workpiece_id is null
  and exists (
    select 1 from tongs.episodes e
    where e.id = 'b4cc4115-459a-439a-93e8-f33a1239df90'::uuid
      and e.workspace_id = s.workspace_id
  );

commit;
