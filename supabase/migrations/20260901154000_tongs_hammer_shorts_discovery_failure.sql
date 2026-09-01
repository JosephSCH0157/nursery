begin;

create or replace function tongs.fail_hammer_shorts_discovery(p_discovery_id uuid,p_failure_code text) returns jsonb
language plpgsql security definer set search_path=tongs,public as $$
declare v_actor uuid:=auth.uid(); v_row tongs.hammer_shorts_discoveries%rowtype;
begin
  select * into v_row from tongs.hammer_shorts_discoveries where id=p_discovery_id for update;
  if v_actor is null or v_row.id is null or not tongs.has_workspace_role(v_row.workspace_id,'editor') then
    raise exception 'hammer_shorts_editor_required' using errcode='42501';
  end if;
  if v_row.state='completed' then return to_jsonb(v_row); end if;
  update tongs.hammer_shorts_discoveries set state='failed',failure_code=left(coalesce(nullif(trim(p_failure_code),''),'provider_failed'),120),completed_at=now()
    where id=v_row.id returning * into v_row;
  return to_jsonb(v_row);
end $$;

revoke all on function tongs.fail_hammer_shorts_discovery(uuid,text) from public;
grant execute on function tongs.fail_hammer_shorts_discovery(uuid,text) to authenticated,service_role;

commit;
