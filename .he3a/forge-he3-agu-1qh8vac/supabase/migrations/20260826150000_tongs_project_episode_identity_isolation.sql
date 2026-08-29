begin;

alter table tongs.barstock_project_episode_links
  drop constraint if exists barstock_project_episode_links_project_unique;

alter table tongs.barstock_project_episode_links
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists creation_operation_key text,
  add column if not exists created_by uuid references auth.users(id) on delete set null;

update tongs.barstock_project_episode_links set id=gen_random_uuid() where id is null;
alter table tongs.barstock_project_episode_links alter column id set not null;

create unique index if not exists barstock_project_episode_links_id_idx
  on tongs.barstock_project_episode_links(id);
create unique index if not exists barstock_project_episode_links_membership_idx
  on tongs.barstock_project_episode_links(workspace_id,project_id,workpiece_id);
create unique index if not exists barstock_project_episode_links_creation_operation_idx
  on tongs.barstock_project_episode_links(workspace_id,project_id,creation_operation_key)
  where creation_operation_key is not null;
create index if not exists barstock_project_episode_links_project_created_idx
  on tongs.barstock_project_episode_links(workspace_id,project_id,created_at desc);

drop function if exists tongs.get_or_create_hearth_project_workpiece(uuid,uuid,text,text);

create or replace function tongs.create_hearth_project_episode(
  p_workspace_id uuid,p_project_id uuid,p_title text,p_operation_key text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare v_user uuid:=auth.uid();v_key text:=btrim(coalesce(p_operation_key,''));v_workpiece uuid;v_link uuid;v_created boolean:=false;
begin
  if v_user is null or not tongs.has_workspace_role(p_workspace_id,'editor') then return jsonb_build_object('outcome','denied');end if;
  if length(v_key) not between 16 and 200 then return jsonb_build_object('outcome','conflict','reason','invalid_operation_key');end if;
  if not exists(select 1 from tongs.barstock_assignments where id=p_project_id and workspace_id=p_workspace_id) then return jsonb_build_object('outcome','not_found','reason','project_not_found');end if;
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||p_project_id::text||':'||v_key,0));
  select id,workpiece_id into v_link,v_workpiece from tongs.barstock_project_episode_links
   where workspace_id=p_workspace_id and project_id=p_project_id and creation_operation_key=v_key;
  if v_workpiece is not null then return jsonb_build_object('outcome','existing','created',false,'link_id',v_link,'workpiece_id',v_workpiece,'operation_key',v_key);end if;
  insert into tongs.episodes(workspace_id,label) values(p_workspace_id,coalesce(nullif(btrim(p_title),''),'Untitled Episode')) returning id into v_workpiece;
  insert into tongs.barstock_project_episode_links(workspace_id,project_id,workpiece_id,creation_operation_key,created_by)
    values(p_workspace_id,p_project_id,v_workpiece,v_key,v_user) returning id into v_link;
  v_created:=true;
  return jsonb_build_object('outcome','created','created',v_created,'link_id',v_link,'workpiece_id',v_workpiece,'operation_key',v_key);
end$$;

create or replace function tongs.list_hearth_project_episodes(p_workspace_id uuid,p_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,tongs as $$
begin
 if not tongs.has_workspace_role(p_workspace_id,'viewer') then return jsonb_build_object('outcome','denied','episodes','[]'::jsonb);end if;
 if not exists(select 1 from tongs.barstock_assignments where id=p_project_id and workspace_id=p_workspace_id) then return jsonb_build_object('outcome','not_found','episodes','[]'::jsonb);end if;
 return jsonb_build_object('outcome','found','project_id',p_project_id,'episodes',coalesce((select jsonb_agg(jsonb_build_object('workpiece_id',e.id,'label',e.label,'status',e.lifecycle_state,'created_at',e.created_at,'updated_at',e.updated_at) order by l.created_at desc) from tongs.barstock_project_episode_links l join tongs.episodes e on e.id=l.workpiece_id and e.workspace_id=l.workspace_id where l.workspace_id=p_workspace_id and l.project_id=p_project_id),'[]'::jsonb));
end$$;

create or replace function tongs.validate_hearth_project_episode(p_workspace_id uuid,p_project_id uuid,p_workpiece_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,tongs as $$
begin
 if not tongs.has_workspace_role(p_workspace_id,'viewer') then return jsonb_build_object('outcome','denied','valid',false);end if;
 return jsonb_build_object('outcome','validated','valid',exists(select 1 from tongs.barstock_project_episode_links where workspace_id=p_workspace_id and project_id=p_project_id and workpiece_id=p_workpiece_id));
end$$;

revoke all on function tongs.create_hearth_project_episode(uuid,uuid,text,text) from public,anon;
revoke all on function tongs.list_hearth_project_episodes(uuid,uuid) from public,anon;
revoke all on function tongs.validate_hearth_project_episode(uuid,uuid,uuid) from public,anon;
grant execute on function tongs.create_hearth_project_episode(uuid,uuid,text,text) to authenticated;
grant execute on function tongs.list_hearth_project_episodes(uuid,uuid) to authenticated;
grant execute on function tongs.validate_hearth_project_episode(uuid,uuid,uuid) to authenticated;
grant execute on function tongs.create_hearth_project_episode(uuid,uuid,text,text) to service_role;
grant execute on function tongs.list_hearth_project_episodes(uuid,uuid) to service_role;
grant execute on function tongs.validate_hearth_project_episode(uuid,uuid,uuid) to service_role;

comment on function tongs.list_hearth_project_episodes(uuid,uuid) is 'Project-only authority returns episode summaries and never hydrates episode creative state.';
comment on function tongs.validate_hearth_project_episode(uuid,uuid,uuid) is 'Hard episode hydration fence: explicit project/workpiece membership validation.';

commit;
