begin;

create or replace function tongs.acknowledge_hammer_editorial_authority(
  p_workspace_id uuid,
  p_workpiece_id uuid,
  p_canonical_recording_id uuid,
  p_revision_id uuid,
  p_path text,
  p_fingerprint text,
  p_expected_revision_updated_at timestamptz,
  p_expected_authority_revision bigint,
  p_expected_authority_path text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, tongs
as $$
declare
  v_row tongs.recording_revisions%rowtype;
begin
  if not tongs.has_workspace_role(p_workspace_id, 'editor') then
    raise exception using errcode = '42501', message = 'editorial_authority_forbidden';
  end if;
  if p_path is null or btrim(p_path) = '' or p_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'editorial_authority_ack_invalid';
  end if;
  if p_path <> format('hammer/revisions/%s/editorial-authority.v1.json', p_revision_id) then
    raise exception using errcode = '22023', message = 'editorial_authority_path_invalid';
  end if;

  update tongs.recording_revisions
     set editorial_authority_path = p_path,
         editorial_authority_fingerprint = p_fingerprint,
         editorial_authority_revision = editorial_authority_revision + 1,
         updated_at = now(),
         updated_by = auth.uid()
   where id = p_revision_id
     and workspace_id = p_workspace_id
     and workpiece_id = p_workpiece_id
     and canonical_recording_id = p_canonical_recording_id
     and status = 'active'
     and updated_at = p_expected_revision_updated_at
     and editorial_authority_revision = p_expected_authority_revision
     and editorial_authority_path is not distinct from p_expected_authority_path
  returning * into v_row;

  if v_row.id is null then
    raise exception using errcode = 'PT409', message = 'editorial_authority_conflict';
  end if;

  return jsonb_build_object(
    'revision_id', v_row.id,
    'canonical_recording_id', v_row.canonical_recording_id,
    'path', v_row.editorial_authority_path,
    'fingerprint', v_row.editorial_authority_fingerprint,
    'authority_revision', v_row.editorial_authority_revision,
    'revision_updated_at', v_row.updated_at
  );
end;
$$;

revoke all on function tongs.acknowledge_hammer_editorial_authority(uuid,uuid,uuid,uuid,text,text,timestamptz,bigint,text) from public;
grant execute on function tongs.acknowledge_hammer_editorial_authority(uuid,uuid,uuid,uuid,text,text,timestamptz,bigint,text) to authenticated;
grant execute on function tongs.acknowledge_hammer_editorial_authority(uuid,uuid,uuid,uuid,text,text,timestamptz,bigint,text) to service_role;

alter function tongs.acknowledge_hammer_editorial_authority(uuid,uuid,uuid,uuid,text,text,timestamptz,bigint,text) owner to postgres;

commit;
