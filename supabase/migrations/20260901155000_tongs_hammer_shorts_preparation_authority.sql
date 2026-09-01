begin;
create or replace function tongs.authorize_hammer_short_derivative_preparation(p_derivative_id uuid) returns jsonb
language plpgsql security definer set search_path=tongs,public as $$
declare v_actor uuid:=auth.uid(); v_row tongs.hammer_short_derivatives%rowtype;
begin
  select * into v_row from tongs.hammer_short_derivatives where id=p_derivative_id;
  if v_actor is null or v_row.id is null or not tongs.has_workspace_role(v_row.workspace_id,'editor') then raise exception 'hammer_shorts_editor_required' using errcode='42501'; end if;
  if v_row.state not in('preparing','failed') then raise exception 'hammer_short_derivative_not_preparing' using errcode='40001'; end if;
  return to_jsonb(v_row);
end $$;
revoke all on function tongs.authorize_hammer_short_derivative_preparation(uuid) from public;
grant execute on function tongs.authorize_hammer_short_derivative_preparation(uuid) to authenticated,service_role;
commit;
