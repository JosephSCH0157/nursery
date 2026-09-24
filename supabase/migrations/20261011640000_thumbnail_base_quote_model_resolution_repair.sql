-- Allow the shared paid OpenAI quote resolver to select the existing
-- openai-image Thumbnail Base pricing publication. No pricing, scope, risk,
-- or Live authority changes in this repair.
begin;

do $$
begin
  if not exists (
    select 1
    from tongs.private_pricing_policies policy
    join tongs.private_pricing_revisions pricing on pricing.policy_id = policy.id
    join tongs.private_pricing_publications publication
      on publication.pricing_revision_id = pricing.id
     and publication.action = 'published'
    where policy.sku = 'openai-image:hearth.thumbnail_base_generation:gpt-image-2-2026-04-21:19630000-0000-4000-8000-000000000002'
      and pricing.id = '19630000-0000-4000-8000-000000000007'
      and pricing.lifecycle_state = 'review_ready'
      and pricing.customer_credit_units = 45
      and pricing.full_cost_ceiling_micros = 167450
  ) then
    raise exception 'existing published Thumbnail Base pricing authority is unavailable';
  end if;
  if exists (
    select 1 from tongs.customer_paid_execution_scope_authorizations
    where financial_environment = 'live'
      and route_code = 'hearth.thumbnail_base_generation'
      and status = 'active'
  ) then
    raise exception 'Live Thumbnail Base scope must remain absent';
  end if;
end $$;

create or replace function tongs.resolve_openai_text_model_for_quote(
  p_user_id uuid,
  p_route_code text,
  p_credential_funding text
) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog as $$
declare
  c tongs.openai_text_model_catalog_revisions%rowtype;
  pref tongs.openai_text_user_model_preference_revisions%rowtype;
  selected record;
begin
  perform tongs._require_pricing_service_role();
  if p_credential_funding <> 'forge' then
    raise exception 'BYO model access and support-only pricing are not verified; no Forge credential fallback is permitted' using errcode = 'P0001';
  end if;
  select * into c
  from tongs.openai_text_model_catalog_revisions
  where lifecycle_state = 'active'
  order by revision desc limit 1;
  if c.id is null then
    raise exception 'pricing_not_configured: no active model catalog' using errcode = 'P0001';
  end if;
  select * into pref
  from tongs.openai_text_user_model_preference_revisions
  where user_id = p_user_id
  order by revision desc limit 1;
  select e.id entry_id, e.runtime_model_id, e.provider_model_id, e.display_name,
    e.tradeoff_summary, e.quality_rank, x.cost_policy_revision_id,
    r.revision rate_revision
  into selected
  from tongs.openai_text_model_catalog_entries e
  join tongs.openai_text_model_route_compatibility x
    on x.catalog_entry_id = e.id and x.route_code = p_route_code
  join tongs.openai_text_cost_policy_revisions cp
    on cp.id = x.cost_policy_revision_id
   and cp.cost_coverage = 'complete'
   and cp.lifecycle_state in ('pilot_candidate', 'active')
  join tongs.openai_text_provider_rate_revisions r on r.id = e.rate_revision_id
  join lateral tongs._published_pricing_revision(
    'openai',
    lower(
      (case when x.route_code = 'hearth.thumbnail_base_generation'
        then 'openai-image:' else 'openai-text:' end)
      || x.route_code || ':' || e.runtime_model_id || ':' || cp.id::text
    )
  ) pr on pr.full_cost_ceiling_micros = cp.full_cost_ceiling_micros
  where e.catalog_revision_id = c.id
    and e.lifecycle_state = 'active'
    and e.availability_status = 'generation_compatible'
    and x.compatibility_status = 'generation_verified'
    and x.supporting_cost_coverage = 'complete'
    and (coalesce(pref.preference_kind, 'best_available') = 'best_available'
      or e.provider_model_id = pref.provider_model_id)
  order by e.quality_rank desc, e.provider_model_id
  limit 1;
  if not found then
    if pref.preference_kind = 'specific' then
      raise exception 'selected model is unavailable, incompatible, or unpriced; choose an eligible alternative' using errcode = 'P0001';
    else
      raise exception 'pricing_not_configured: no eligible model for route' using errcode = 'P0001';
    end if;
  end if;
  return jsonb_build_object(
    'catalog_revision_id', c.id,
    'catalog_revision', c.revision,
    'model_catalog_entry_id', selected.entry_id,
    'runtime_model_id', selected.runtime_model_id,
    'provider_model_id', selected.provider_model_id,
    'display_name', selected.display_name,
    'tradeoff_summary', selected.tradeoff_summary,
    'quality_rank', selected.quality_rank,
    'rate_revision', selected.rate_revision,
    'cost_policy_revision_id', selected.cost_policy_revision_id
  );
end $$;

create or replace function tongs.resolve_openai_text_model_for_funding_quote(
  p_user_id uuid,
  p_workspace_id uuid,
  p_route_code text,
  p_credential_funding text
) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog as $$
declare
  v_authority jsonb;
  v_catalog tongs.openai_text_model_catalog_revisions%rowtype;
  v_preference tongs.openai_text_user_model_preference_revisions%rowtype;
  v_selected record;
begin
  perform tongs._require_pricing_service_role();
  v_authority := tongs._resolve_spending_authority(p_user_id, p_workspace_id, p_route_code);
  if v_authority ->> 'payer_kind' <> 'owner_testing' then
    return tongs.resolve_openai_text_model_for_quote(p_user_id, p_route_code, p_credential_funding);
  end if;
  if p_credential_funding <> 'forge' then
    raise exception 'BYO model access must use the exact customer provider credential; no Forge fallback is permitted' using errcode = 'P0001';
  end if;
  select * into v_catalog
  from tongs.openai_text_model_catalog_revisions
  where lifecycle_state = 'active'
  order by revision desc limit 1;
  if not found then
    raise exception 'pricing_not_configured: no active model catalog' using errcode = 'P0001';
  end if;
  select * into v_preference
  from tongs.openai_text_user_model_preference_revisions
  where user_id = p_user_id
  order by revision desc limit 1;
  select entry.id entry_id, entry.runtime_model_id, entry.provider_model_id,
    entry.display_name, entry.tradeoff_summary, entry.quality_rank,
    compatibility.cost_policy_revision_id, rate.revision rate_revision
  into v_selected
  from tongs.openai_text_model_catalog_entries entry
  join tongs.openai_text_model_route_compatibility compatibility
    on compatibility.catalog_entry_id = entry.id
   and compatibility.route_code = p_route_code
  join tongs.openai_text_cost_policy_revisions cost
    on cost.id = compatibility.cost_policy_revision_id
   and cost.cost_coverage = 'complete'
   and cost.lifecycle_state in ('pilot_candidate', 'active')
  join tongs.openai_text_provider_rate_revisions rate on rate.id = entry.rate_revision_id
  where entry.catalog_revision_id = v_catalog.id
    and entry.lifecycle_state = 'active'
    and entry.availability_status = 'generation_compatible'
    and compatibility.compatibility_status = 'generation_verified'
    and compatibility.supporting_cost_coverage = 'complete'
    and (coalesce(v_preference.preference_kind, 'best_available') = 'best_available'
      or entry.provider_model_id = v_preference.provider_model_id)
    and exists (
      select 1
      from tongs.private_pricing_revisions pricing
      join tongs.private_pricing_policies policy on policy.id = pricing.policy_id
      where pricing.lifecycle_state = 'review_ready'
        and pricing.markup_basis_points = 3300
        and pricing.full_cost_ceiling_micros = cost.full_cost_ceiling_micros
        and lower(coalesce(policy.provider, '')) = 'openai'
        and lower(coalesce(policy.sku, '')) = lower(
          (case when p_route_code = 'hearth.thumbnail_base_generation'
            then 'openai-image:' else 'openai-text:' end)
          || p_route_code || ':' || entry.runtime_model_id || ':' || cost.id::text
        )
    )
  order by entry.quality_rank desc, entry.provider_model_id
  limit 1;
  if not found then
    raise exception 'pricing_not_configured: no owner-testing model has verified generation compatibility and complete cost coverage' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'catalog_revision_id', v_catalog.id,
    'catalog_revision', v_catalog.revision,
    'model_catalog_entry_id', v_selected.entry_id,
    'runtime_model_id', v_selected.runtime_model_id,
    'provider_model_id', v_selected.provider_model_id,
    'display_name', v_selected.display_name,
    'tradeoff_summary', v_selected.tradeoff_summary,
    'quality_rank', v_selected.quality_rank,
    'rate_revision', v_selected.rate_revision,
    'cost_policy_revision_id', v_selected.cost_policy_revision_id,
    'payer_kind', 'owner_testing'
  );
end $$;

revoke all on function tongs.resolve_openai_text_model_for_quote(uuid,text,text)
  from public, anon, authenticated;
grant execute on function tongs.resolve_openai_text_model_for_quote(uuid,text,text)
  to service_role;
revoke all on function tongs.resolve_openai_text_model_for_funding_quote(uuid,uuid,text,text)
  from public, anon, authenticated;
grant execute on function tongs.resolve_openai_text_model_for_funding_quote(uuid,uuid,text,text)
  to service_role;

comment on function tongs.resolve_openai_text_model_for_quote(uuid,text,text) is
  'Resolves active paid OpenAI model authority. Thumbnail Base uses its published openai-image SKU; all other routes retain openai-text SKU resolution.';

commit;
