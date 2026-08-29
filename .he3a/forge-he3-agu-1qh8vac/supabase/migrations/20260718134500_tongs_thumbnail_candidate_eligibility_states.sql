begin;
create or replace function tongs.thumbnail_candidate_eligibility(p_candidate_id uuid,p_active_binding_id uuid) returns text
language plpgsql stable security definer set search_path=pg_catalog,tongs as $$
declare c tongs.thumbnail_candidate_revisions%rowtype; d text; v_latest_set uuid; v_asset tongs.assets%rowtype;
begin select * into c from tongs.thumbnail_candidate_revisions where id=p_candidate_id;
 if c.id is null then return 'blocked'; end if;
 select * into v_asset from tongs.assets where id=c.composite_asset_id;
 if v_asset.id is null or v_asset.status<>'ready' or v_asset.content_hash<>c.composite_content_hash then return 'blocked'; end if;
 select id into v_latest_set from tongs.thumbnail_candidate_sets where workpiece_id=c.workpiece_id order by revision desc limit 1;
 if v_latest_set is null or not exists(select 1 from tongs.thumbnail_candidate_set_members where candidate_set_id=v_latest_set and candidate_revision_id=c.id) then return 'historical_brand'; end if;
 if c.candidate_binding_id=p_active_binding_id then return 'current'; end if;
 select decision into d from tongs.thumbnail_candidate_brand_decisions where candidate_revision_id=c.id and active_binding_id=p_active_binding_id order by decision_revision desc limit 1;
 if d='approved' then return 'approved_historical_brand'; end if;
 return 'requires_reapproval'; end $$;
revoke all on function tongs.thumbnail_candidate_eligibility(uuid,uuid) from public,anon,authenticated;
grant execute on function tongs.thumbnail_candidate_eligibility(uuid,uuid) to service_role;
commit;
