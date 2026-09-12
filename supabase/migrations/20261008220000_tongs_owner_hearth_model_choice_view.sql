-- Expose compatibility-passed owner Hearth model choices without publishing
-- customer prices or leaking the private owner pricing/cost terms.
begin;

create or replace function tongs.read_openai_text_model_choices(p_route_code text default null)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare uid uuid:=auth.uid(); c tongs.openai_text_model_catalog_revisions%rowtype; p jsonb; choices jsonb; eligible jsonb;
 owner_auth tongs.owner_hearth_authorizations%rowtype;
begin
 if uid is null then raise exception 'authentication required' using errcode='28000'; end if;
 if p_route_code is not null and not exists(select 1 from tongs.openai_text_route_policies where route_code=p_route_code) then raise exception 'unknown route' using errcode='22023'; end if;
 select * into c from tongs.openai_text_model_catalog_revisions where lifecycle_state in ('active','draft') order by (lifecycle_state='active') desc,revision desc limit 1;
 p:=tongs.read_my_openai_text_model_preference();

 if p_route_code is null or p_route_code='hearth.chat_completion' then
  select a.* into owner_auth
  from tongs.owner_hearth_authorizations a
  join lateral(
   select * from tongs.owner_hearth_authorization_events e
   where e.authorization_id=a.id order by sequence desc limit 1
  ) latest on true
  where a.owner_user_id=uid
    and exists(select 1 from tongs.owner_testing_principals otp where otp.user_id=uid and otp.status='enabled')
    and exists(select 1 from tongs.workspace_members wm where wm.workspace_id=a.workspace_id and wm.user_id=uid)
    and latest.state in ('active','dormant')
    and (latest.expires_at is null or latest.expires_at>now())
  order by (a.authorization_kind='creator_session') desc,a.created_at desc limit 1;
  if found then
   select coalesce(jsonb_agg(jsonb_build_object(
      'provider_model_id',t.provider_model_id,
      'display_name',t.display_name,
      'tradeoff_summary',case t.ordinal
        when 1 then 'Highest quality and highest cost.'
        when 2 then 'Strong professional reasoning.'
        when 3 then 'Balanced capability and price.'
        when 4 then 'Lower-cost bounded work.'
        else 'Fastest and lowest-cost option.' end,
      'quality_rank',110-(t.ordinal*10),
      'executable',true,
      'blocker',null
    ) order by t.ordinal),'[]'::jsonb)
   into eligible from tongs.owner_hearth_model_terms t where t.authorization_id=owner_auth.id;
   choices:=eligible;
   return jsonb_build_object(
    'catalog_revision',c.revision,
    'catalog_state',c.lifecycle_state,
    'preference',p,
    'eligible_choices',eligible,
    'candidate_status',choices,
    'executable',jsonb_array_length(eligible)>0,
    'blocker',case when jsonb_array_length(eligible)>0 then null else 'No compatibility-passed model is authorized for this owner session.' end,
    'funding_label','Private owner testing'
   );
  end if;
 end if;

 with candidate as (
  select distinct e.*,
   c.lifecycle_state='active' and e.lifecycle_state='active' and e.availability_status='generation_compatible'
   and exists(select 1 from tongs.openai_text_model_route_compatibility x
    join tongs.openai_text_cost_policy_revisions cp on cp.id=x.cost_policy_revision_id and cp.cost_coverage='complete' and cp.lifecycle_state in ('pilot_candidate','active')
    left join lateral tongs._published_pricing_revision('openai',lower('openai-text:'||x.route_code||':'||e.runtime_model_id||':'||cp.id::text)) pr on true
    where x.catalog_entry_id=e.id and (p_route_code is null or x.route_code=p_route_code) and x.compatibility_status='generation_verified' and x.supporting_cost_coverage='complete' and pr.id is not null) as is_eligible
  from tongs.openai_text_model_catalog_entries e where e.catalog_revision_id=c.id and e.lifecycle_state in ('candidate','active')
 )
 select coalesce(jsonb_agg(jsonb_build_object('provider_model_id',provider_model_id,'display_name',display_name,'tradeoff_summary',tradeoff_summary,'quality_rank',quality_rank,'executable',is_eligible,'blocker',case when is_eligible then null when availability_status<>'generation_compatible' then 'availability_not_verified' when c.lifecycle_state<>'active' then 'catalog_not_active' else 'pricing_or_supporting_cost_not_configured' end) order by quality_rank desc),'[]'::jsonb),
  coalesce(jsonb_agg(jsonb_build_object('provider_model_id',provider_model_id,'display_name',display_name,'tradeoff_summary',tradeoff_summary,'quality_rank',quality_rank,'executable',true,'blocker',null) order by quality_rank desc) filter(where is_eligible),'[]'::jsonb)
 into choices,eligible from candidate;
 return jsonb_build_object('catalog_revision',c.revision,'catalog_state',c.lifecycle_state,'preference',p,'eligible_choices',eligible,'candidate_status',choices,'executable',jsonb_array_length(eligible)>0,'blocker',case when jsonb_array_length(eligible)>0 then null else 'No active catalog entry has verified project availability, generation compatibility, complete supporting-cost coverage, and published pricing.' end);
end $$;

revoke all on function tongs.read_openai_text_model_choices(text) from public,anon;
grant execute on function tongs.read_openai_text_model_choices(text) to authenticated;

comment on function tongs.read_openai_text_model_choices(text) is
 'Customer-safe model catalog. Exact owner-session choices use compatibility-passed private terms without exposing costs or publishing customer prices.';

notify pgrst,'reload schema';
commit;
