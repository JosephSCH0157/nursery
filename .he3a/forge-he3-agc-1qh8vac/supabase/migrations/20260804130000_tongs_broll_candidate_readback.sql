begin;

create or replace function tongs.read_current_broll_plan(p_workspace_id uuid,p_workpiece_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog,tongs as $$
select case when not tongs.has_workspace_role(p_workspace_id,'viewer') then null else (
 select jsonb_build_object('sequence',to_jsonb(s),'plan_revision',to_jsonb(p),'beats',coalesce((
   select jsonb_agg(jsonb_build_object(
     'membership',to_jsonb(m),
     'beat_revision',to_jsonb(b),
     'prompt_revision',to_jsonb(pr),
     'selected_candidate_revision',to_jsonb(selected_cr),
     'candidate_revisions',coalesce(candidates.items,'[]'::jsonb)
   ) order by m.ordinal)
   from tongs.broll_plan_beat_membership m
   join tongs.broll_beat_revisions b on b.id=m.beat_revision_id
   left join tongs.broll_prompt_sequences ps on ps.workspace_id=m.workspace_id and ps.workpiece_id=m.workpiece_id and ps.beat_id=m.beat_id
   left join tongs.broll_prompt_revisions pr on pr.id=ps.current_prompt_revision_id
   left join lateral (
     select sel.* from tongs.broll_selections sel
     where sel.workspace_id=m.workspace_id and sel.workpiece_id=m.workpiece_id and sel.beat_id=m.beat_id and sel.plan_revision_id=m.plan_revision_id
     order by sel.revision desc limit 1
   ) sel on true
   left join tongs.broll_candidate_revisions selected_cr on selected_cr.id=sel.candidate_revision_id
   left join lateral (
     select jsonb_agg(jsonb_build_object(
       'candidate_revision',to_jsonb(cr),
       'video_asset',to_jsonb(video_asset),
       'poster_asset',to_jsonb(poster_asset)
     ) order by cr.created_at,cr.revision) as items
     from tongs.broll_candidate_revisions cr
     join tongs.assets video_asset on video_asset.id=cr.asset_id
     left join tongs.assets poster_asset on poster_asset.id=cr.poster_asset_id
     where cr.workspace_id=m.workspace_id and cr.workpiece_id=m.workpiece_id and cr.beat_id=m.beat_id
   ) candidates on true
   where m.plan_revision_id=s.current_plan_revision_id
 ),'[]'::jsonb))
 from tongs.broll_plan_sequences s
 left join tongs.broll_plan_revisions p on p.id=s.current_plan_revision_id
 where s.workspace_id=p_workspace_id and s.workpiece_id=p_workpiece_id
) end
$$;

revoke all on function tongs.read_current_broll_plan(uuid,uuid) from public,anon;
grant execute on function tongs.read_current_broll_plan(uuid,uuid) to authenticated,service_role;
notify pgrst,'reload schema';

commit;
