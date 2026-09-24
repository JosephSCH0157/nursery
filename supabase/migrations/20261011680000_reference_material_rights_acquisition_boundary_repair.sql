begin;

alter table tongs.reference_visual_acquisition_operations
  add column if not exists source_set_revision_id uuid
  references tongs.reference_visual_source_set_revisions(id) on delete restrict;

comment on column tongs.reference_visual_acquisition_operations.source_set_revision_id is
  'Exact immutable Source collection authority accepted for this archival acquisition. Historical operations created before this repair may be null.';

drop function if exists tongs.begin_reference_visual_acquisition(uuid,uuid,uuid,uuid,text,text,text,uuid);

create or replace function tongs.begin_reference_visual_acquisition(
  p_workspace_id uuid,
  p_workpiece_id uuid,
  p_opportunity_revision_id uuid,
  p_source_set_revision_id uuid,
  p_rights_declaration_revision_id uuid,
  p_acquisition_type text,
  p_operation_id text,
  p_operation_fingerprint text,
  p_actor_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog,tongs
as $$
declare
  op tongs.reference_visual_acquisition_operations%rowtype;
  opportunity tongs.reference_visual_opportunity_revisions%rowtype;
  current_plan_revision_id uuid;
  current_source_set tongs.reference_visual_source_set_revisions%rowtype;
begin
  if not tongs.has_workspace_role(p_workspace_id,'editor') or auth.uid() is distinct from p_actor_id then
    raise exception 'workspace editor authority required' using errcode='42501';
  end if;
  if p_acquisition_type not in ('upload','external_fetch') then
    return jsonb_build_object('disposition','invalid_acquisition_type');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_operation_id,0));
  select * into op from tongs.reference_visual_acquisition_operations where operation_id=p_operation_id for update;
  if found then
    if op.operation_fingerprint<>p_operation_fingerprint then
      return jsonb_build_object('disposition','operation_identity_conflict');
    end if;
    return jsonb_build_object('disposition','replay','operation',to_jsonb(op));
  end if;

  select * into opportunity from tongs.reference_visual_opportunity_revisions
   where id=p_opportunity_revision_id and workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;
  if not found then return jsonb_build_object('disposition','current_opportunity_revision_required');end if;
  if opportunity.visual_subtype not in ('archival_still','archival_sequence') then
    return jsonb_build_object('disposition','archival_opportunity_required','current_visual_subtype',opportunity.visual_subtype);
  end if;

  select sequence.current_plan_revision_id into current_plan_revision_id
    from tongs.reference_visual_plan_sequences sequence
    join tongs.reference_visual_plan_membership membership on membership.plan_revision_id=sequence.current_plan_revision_id
   where sequence.workspace_id=p_workspace_id and sequence.workpiece_id=p_workpiece_id
     and membership.opportunity_id=opportunity.opportunity_id
     and membership.opportunity_revision_id=opportunity.id;
  if current_plan_revision_id is null then return jsonb_build_object('disposition','current_opportunity_revision_required');end if;

  select * into current_source_set
    from tongs.reference_visual_source_set_revisions source_set
   where source_set.workspace_id=p_workspace_id and source_set.workpiece_id=p_workpiece_id
     and source_set.opportunity_id=opportunity.opportunity_id and source_set.plan_revision_id=current_plan_revision_id
   order by source_set.revision desc limit 1;
  if current_source_set.id is null or current_source_set.id<>p_source_set_revision_id or not exists(
    select 1 from tongs.reference_visual_source_set_members member where member.source_set_revision_id=current_source_set.id
  ) then
    return jsonb_build_object('disposition','current_source_collection_required',
      'current_source_set_revision_id',current_source_set.id,
      'supplied_source_set_revision_id',p_source_set_revision_id);
  end if;

  if not exists(
    select 1 from tongs.reference_visual_rights_declaration_sequences rights
    join tongs.reference_visual_rights_declaration_revisions declaration
      on declaration.id=rights.current_declaration_revision_id
     where rights.workspace_id=p_workspace_id and rights.workpiece_id=p_workpiece_id
       and rights.opportunity_id=opportunity.opportunity_id
       and rights.current_declaration_revision_id=p_rights_declaration_revision_id
       and declaration.source_set_revision_id=current_source_set.id
  ) then return jsonb_build_object('disposition','current_rights_declaration_required');end if;

  insert into tongs.reference_visual_acquisition_operations(
    operation_id,operation_fingerprint,workspace_id,workpiece_id,opportunity_revision_id,
    source_set_revision_id,rights_declaration_revision_id,acquisition_type,state,created_by
  ) values(
    p_operation_id,p_operation_fingerprint,p_workspace_id,p_workpiece_id,p_opportunity_revision_id,
    p_source_set_revision_id,p_rights_declaration_revision_id,p_acquisition_type,'pending',p_actor_id
  ) returning * into op;
  return jsonb_build_object('disposition','reserved','operation',to_jsonb(op));
end
$$;

revoke all on function tongs.begin_reference_visual_acquisition(uuid,uuid,uuid,uuid,uuid,text,text,text,uuid)
  from public,anon,authenticated;
grant execute on function tongs.begin_reference_visual_acquisition(uuid,uuid,uuid,uuid,uuid,text,text,text,uuid)
  to authenticated,service_role;

do $$
declare r record;
begin
  select c.relrowsecurity,c.relforcerowsecurity into r
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='tongs' and c.relname='reference_visual_acquisition_operations';
  if not coalesce(r.relrowsecurity,false) then
    raise exception 'Reference Visual acquisition operation RLS must remain enabled';
  end if;
  if has_table_privilege('authenticated','tongs.reference_visual_acquisition_operations','insert,update,delete') then
    raise exception 'authenticated must not mutate Reference Visual acquisition operations directly';
  end if;
end
$$;

notify pgrst,'reload schema';

commit;
