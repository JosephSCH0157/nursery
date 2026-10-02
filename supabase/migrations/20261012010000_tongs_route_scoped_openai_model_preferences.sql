-- Route-scoped customer model preferences and customer-safe selection keys.
-- This migration changes selection authority only. It does not activate a model,
-- price, rollout, execution scope, provider credential, or financial environment.
begin;

alter table tongs.openai_text_model_catalog_entries
  add column customer_selection_key uuid not null default gen_random_uuid(),
  add column customer_selection_state text
    check (customer_selection_state in ('selectable','recommended','retiring','unavailable','historical'));

create unique index openai_text_model_catalog_entries_customer_selection_key_uidx
  on tongs.openai_text_model_catalog_entries(customer_selection_key);

alter table tongs.openai_text_user_model_preference_revisions
  add column route_code text references tongs.openai_text_route_policies(route_code) on delete restrict;

do $$
declare constraint_name text;
begin
  select constraint_record.conname into constraint_name
  from pg_constraint constraint_record
  where constraint_record.conrelid='tongs.openai_text_user_model_preference_revisions'::regclass
    and constraint_record.contype='u'
    and (select array_agg(attribute.attname order by key_column.ordinality)
      from unnest(constraint_record.conkey) with ordinality key_column(attnum,ordinality)
      join pg_attribute attribute on attribute.attrelid=constraint_record.conrelid
        and attribute.attnum=key_column.attnum)=array['user_id','revision']::name[];
  if constraint_name is null then raise exception 'global model preference revision constraint missing'; end if;
  execute format('alter table tongs.openai_text_user_model_preference_revisions drop constraint %I',constraint_name);
end $$;

create unique index openai_text_user_model_preference_historical_revision_uidx
  on tongs.openai_text_user_model_preference_revisions(user_id,revision)
  where route_code is null;

create unique index openai_text_user_model_preference_route_revision_uidx
  on tongs.openai_text_user_model_preference_revisions(user_id,route_code,revision)
  where route_code is not null;

create index openai_text_user_model_preference_route_latest_idx
  on tongs.openai_text_user_model_preference_revisions(user_id,route_code,revision desc)
  where route_code is not null;

create or replace function tongs._selectable_openai_text_models(p_route_code text)
returns table(
  catalog_revision_id uuid,
  catalog_revision integer,
  model_catalog_entry_id uuid,
  customer_selection_key uuid,
  customer_selection_state text,
  runtime_model_id text,
  provider_model_id text,
  display_name text,
  tradeoff_summary text,
  quality_rank integer,
  rate_revision integer,
  cost_policy_revision_id uuid,
  customer_credit_units bigint
)
language sql stable security definer set search_path=pg_catalog as $$
  select catalog.id,
    catalog.revision,
    entry.id,
    entry.customer_selection_key,
    coalesce(entry.customer_selection_state,case entry.lifecycle_state
      when 'active' then 'selectable'
      when 'deprecated' then 'historical'
      when 'retired' then 'historical'
      else 'unavailable' end),
    entry.runtime_model_id,
    entry.provider_model_id,
    entry.display_name,
    entry.tradeoff_summary,
    entry.quality_rank,
    rate.revision,
    compatibility.cost_policy_revision_id,
    pricing.customer_credit_units
  from tongs.openai_text_model_catalog_revisions catalog
  join tongs.openai_text_model_catalog_entries entry
    on entry.catalog_revision_id=catalog.id
  join tongs.openai_text_model_route_compatibility compatibility
    on compatibility.catalog_entry_id=entry.id
   and compatibility.route_code=p_route_code
  join tongs.openai_text_cost_policy_revisions cost
    on cost.id=compatibility.cost_policy_revision_id
   and cost.cost_coverage='complete'
   and cost.lifecycle_state in ('pilot_candidate','active')
  join tongs.openai_text_provider_rate_revisions rate
    on rate.id=entry.rate_revision_id
  join lateral tongs._published_pricing_revision(
    'openai',
    lower(
      (case when compatibility.route_code='hearth.thumbnail_base_generation'
        then 'openai-image:' else 'openai-text:' end)
      ||compatibility.route_code||':'||entry.runtime_model_id||':'||cost.id::text
    )
  ) pricing on pricing.full_cost_ceiling_micros=cost.full_cost_ceiling_micros
  where catalog.lifecycle_state='active'
    and catalog.id=(select latest.id from tongs.openai_text_model_catalog_revisions latest
      where latest.lifecycle_state='active' order by latest.revision desc limit 1)
    and entry.lifecycle_state='active'
    and coalesce(entry.customer_selection_state,'selectable') in ('selectable','recommended','retiring')
    and entry.availability_status='generation_compatible'
    and compatibility.compatibility_status='generation_verified'
    and compatibility.supporting_cost_coverage='complete';
$$;

revoke all on function tongs._selectable_openai_text_models(text)
  from public,anon,authenticated,service_role;

drop function tongs.read_my_openai_text_model_preference() cascade;

create function tongs.read_my_openai_text_model_preference(p_route_code text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare
  uid uuid:=auth.uid();
  pref tongs.openai_text_user_model_preference_revisions%rowtype;
  entry tongs.openai_text_model_catalog_entries%rowtype;
  is_available boolean:=false;
begin
  if uid is null then raise exception 'authentication required' using errcode='28000'; end if;
  if p_route_code is null or not exists(
    select 1 from tongs.openai_text_route_policies where route_code=p_route_code
  ) then raise exception 'known route required' using errcode='22023'; end if;

  select * into pref
  from tongs.openai_text_user_model_preference_revisions
  where user_id=uid and route_code=p_route_code
  order by revision desc limit 1;

  if not found then
    return jsonb_build_object(
      'route_code',p_route_code,
      'preference_kind','best_available',
      'selection_key',null,
      'display_name',null,
      'revision',0,
      'available',true
    );
  end if;

  if pref.preference_kind='specific' then
    select * into entry
    from tongs.openai_text_model_catalog_entries candidate
    where candidate.catalog_revision_id=pref.catalog_revision_id
      and candidate.provider_model_id=pref.provider_model_id;
    if found then
      select exists(
        select 1 from tongs._selectable_openai_text_models(p_route_code) selectable
        where selectable.model_catalog_entry_id=entry.id
      ) into is_available;
    end if;
  else
    is_available:=true;
  end if;

  return jsonb_build_object(
    'route_code',p_route_code,
    'preference_kind',pref.preference_kind,
    'selection_key',entry.customer_selection_key,
    'display_name',entry.display_name,
    'revision',pref.revision,
    'available',is_available,
    'updated_at',pref.created_at
  );
end $$;

drop function if exists tongs.set_my_openai_text_model_preference(text,text,integer);

create function tongs.set_my_openai_text_model_preference(
  p_route_code text,
  p_preference_kind text,
  p_selection_key uuid default null,
  p_expected_revision integer default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  uid uuid:=auth.uid();
  prior integer;
  selected record;
  selected_provider_model_id text;
  selected_catalog_revision_id uuid;
  nextrev integer;
begin
  if uid is null then raise exception 'authentication required' using errcode='28000'; end if;
  if p_route_code is null or not exists(
    select 1 from tongs.openai_text_route_policies where route_code=p_route_code
  ) then raise exception 'known route required' using errcode='22023'; end if;
  if p_preference_kind not in ('best_available','specific') then
    raise exception 'invalid preference' using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'openai-model-pref:'||uid::text||':'||p_route_code,0
  ));
  select coalesce(max(revision),0) into prior
  from tongs.openai_text_user_model_preference_revisions
  where user_id=uid and route_code=p_route_code;
  if p_expected_revision is not null and p_expected_revision<>prior then
    raise exception 'preference changed; reload' using errcode='40001';
  end if;

  if p_preference_kind='specific' then
    if p_selection_key is null then
      raise exception 'model selection required' using errcode='22023';
    end if;
    select * into selected
    from tongs._selectable_openai_text_models(p_route_code) candidate
    where candidate.customer_selection_key=p_selection_key;
    if not found then
      raise exception 'selected model is not currently eligible; choose an offered alternative' using errcode='P0001';
    end if;
    selected_provider_model_id:=selected.provider_model_id;
    selected_catalog_revision_id:=selected.catalog_revision_id;
  elsif p_selection_key is not null then
    raise exception 'best available cannot include a model selection' using errcode='22023';
  end if;

  nextrev:=prior+1;
  insert into tongs.openai_text_user_model_preference_revisions(
    id,user_id,route_code,revision,preference_kind,provider_model_id,catalog_revision_id
  ) values(
    gen_random_uuid(),uid,p_route_code,nextrev,p_preference_kind,
    selected_provider_model_id,
    selected_catalog_revision_id
  );
  return tongs.read_my_openai_text_model_preference(p_route_code);
end $$;

create or replace function tongs.read_openai_text_model_choices(p_route_code text default null)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare
  uid uuid:=auth.uid();
  pref jsonb;
  choices jsonb;
  catalog_revision integer:=0;
  catalog_state text:='unavailable';
  selection_unavailable boolean:=false;
begin
  if uid is null then raise exception 'authentication required' using errcode='28000'; end if;
  if p_route_code is null or not exists(
    select 1 from tongs.openai_text_route_policies where route_code=p_route_code
  ) then raise exception 'known route required' using errcode='22023'; end if;

  select revision,lifecycle_state into catalog_revision,catalog_state
  from tongs.openai_text_model_catalog_revisions
  where lifecycle_state in ('active','draft')
  order by (lifecycle_state='active') desc,revision desc limit 1;

  pref:=tongs.read_my_openai_text_model_preference(p_route_code);

  selection_unavailable:=(pref->>'preference_kind')='specific'
    and coalesce((pref->>'available')::boolean,false)=false;

  select coalesce(jsonb_agg(jsonb_build_object(
    'selection_key',model.customer_selection_key,
    'display_name',model.display_name,
    'tradeoff_summary',model.tradeoff_summary,
    'selection_state',model.customer_selection_state,
    'credit_charge',model.customer_credit_units
  ) order by (model.customer_selection_state='recommended') desc,model.quality_rank desc),'[]'::jsonb)
  into choices
  from tongs._selectable_openai_text_models(p_route_code) model;

  return jsonb_build_object(
    'route_code',p_route_code,
    'catalog_revision',coalesce(catalog_revision,0),
    'catalog_state',catalog_state,
    'preference',pref,
    'eligible_choices',choices,
    'selection_unavailable',selection_unavailable,
    'executable',not selection_unavailable and jsonb_array_length(choices)>0,
    'blocker',case
      when selection_unavailable then 'Your selected model is no longer available. Select another model.'
      when jsonb_array_length(choices)=0 then 'No approved model is currently available for this operation.'
      else null end
  );
end $$;

create or replace function tongs.resolve_openai_text_model_for_quote(
  p_user_id uuid,
  p_route_code text,
  p_credential_funding text
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare
  pref tongs.openai_text_user_model_preference_revisions%rowtype;
  pref_entry_id uuid;
  selected record;
begin
  perform tongs._require_pricing_service_role();
  if p_credential_funding<>'forge' then
    raise exception 'BYO model access and support-only pricing are not verified; no Forge credential fallback is permitted' using errcode='P0001';
  end if;
  select * into pref
  from tongs.openai_text_user_model_preference_revisions
  where user_id=p_user_id and route_code=p_route_code
  order by revision desc limit 1;

  if pref.preference_kind='specific' then
    select id into pref_entry_id
    from tongs.openai_text_model_catalog_entries
    where catalog_revision_id=pref.catalog_revision_id
      and provider_model_id=pref.provider_model_id;
  end if;

  select * into selected
  from tongs._selectable_openai_text_models(p_route_code) model
  where coalesce(pref.preference_kind,'best_available')='best_available'
    or model.model_catalog_entry_id=pref_entry_id
  order by (model.customer_selection_state='recommended') desc,model.quality_rank desc,model.provider_model_id
  limit 1;

  if not found then
    if pref.preference_kind='specific' then
      raise exception 'model_selection_unavailable: selected model is no longer available; select another model' using errcode='P0001';
    else
      raise exception 'pricing_not_configured: no eligible model for route' using errcode='P0001';
    end if;
  end if;
  return jsonb_build_object(
    'catalog_revision_id',selected.catalog_revision_id,
    'catalog_revision',selected.catalog_revision,
    'model_catalog_entry_id',selected.model_catalog_entry_id,
    'customer_selection_key',selected.customer_selection_key,
    'runtime_model_id',selected.runtime_model_id,
    'provider_model_id',selected.provider_model_id,
    'display_name',selected.display_name,
    'tradeoff_summary',selected.tradeoff_summary,
    'quality_rank',selected.quality_rank,
    'rate_revision',selected.rate_revision,
    'cost_policy_revision_id',selected.cost_policy_revision_id
  );
end $$;

-- Owner-funded resolution retains its private pricing authority while consuming
-- only the preference for the requested route. It never falls back from an
-- explicit selection to a different model.
create or replace function tongs.resolve_openai_text_model_for_funding_quote(
  p_user_id uuid,
  p_workspace_id uuid,
  p_route_code text,
  p_credential_funding text
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare
  authority jsonb;
  catalog tongs.openai_text_model_catalog_revisions%rowtype;
  pref tongs.openai_text_user_model_preference_revisions%rowtype;
  pref_entry_id uuid;
  selected record;
begin
  perform tongs._require_pricing_service_role();
  authority:=tongs._resolve_spending_authority(p_user_id,p_workspace_id,p_route_code);
  if authority->>'payer_kind'<>'owner_testing' then
    return tongs.resolve_openai_text_model_for_quote(p_user_id,p_route_code,p_credential_funding);
  end if;
  if p_credential_funding<>'forge' then
    raise exception 'BYO model access must use the exact customer provider credential; no Forge fallback is permitted' using errcode='P0001';
  end if;
  select * into catalog from tongs.openai_text_model_catalog_revisions
  where lifecycle_state='active' order by revision desc limit 1;
  if not found then raise exception 'pricing_not_configured: no active model catalog' using errcode='P0001'; end if;
  select * into pref from tongs.openai_text_user_model_preference_revisions
  where user_id=p_user_id and route_code=p_route_code order by revision desc limit 1;
  if pref.preference_kind='specific' then
    select id into pref_entry_id from tongs.openai_text_model_catalog_entries
    where catalog_revision_id=pref.catalog_revision_id and provider_model_id=pref.provider_model_id;
  end if;

  select entry.id entry_id,entry.customer_selection_key,entry.runtime_model_id,
    entry.provider_model_id,entry.display_name,entry.tradeoff_summary,entry.quality_rank,
    compatibility.cost_policy_revision_id,rate.revision rate_revision
  into selected
  from tongs.openai_text_model_catalog_entries entry
  join tongs.openai_text_model_route_compatibility compatibility
    on compatibility.catalog_entry_id=entry.id and compatibility.route_code=p_route_code
  join tongs.openai_text_cost_policy_revisions cost
    on cost.id=compatibility.cost_policy_revision_id
   and cost.cost_coverage='complete' and cost.lifecycle_state in ('pilot_candidate','active')
  join tongs.openai_text_provider_rate_revisions rate on rate.id=entry.rate_revision_id
  where entry.catalog_revision_id=catalog.id
    and entry.lifecycle_state='active'
    and coalesce(entry.customer_selection_state,'selectable') in ('selectable','recommended','retiring')
    and entry.availability_status='generation_compatible'
    and compatibility.compatibility_status='generation_verified'
    and compatibility.supporting_cost_coverage='complete'
    and (coalesce(pref.preference_kind,'best_available')='best_available' or entry.id=pref_entry_id)
    and exists(
      select 1 from tongs.private_pricing_revisions pricing
      join tongs.private_pricing_policies policy on policy.id=pricing.policy_id
      where pricing.lifecycle_state='review_ready'
        and pricing.markup_basis_points=3300
        and pricing.full_cost_ceiling_micros=cost.full_cost_ceiling_micros
        and lower(coalesce(policy.provider,''))='openai'
        and lower(coalesce(policy.sku,''))=lower(
          (case when p_route_code='hearth.thumbnail_base_generation'
            then 'openai-image:' else 'openai-text:' end)
          ||p_route_code||':'||entry.runtime_model_id||':'||cost.id::text
        )
    )
  order by (entry.customer_selection_state='recommended') desc,entry.quality_rank desc,entry.provider_model_id
  limit 1;
  if not found then
    if pref.preference_kind='specific' then
      raise exception 'model_selection_unavailable: selected model is no longer available; select another model' using errcode='P0001';
    end if;
    raise exception 'pricing_not_configured: no owner-testing model has verified generation compatibility and complete cost coverage' using errcode='P0001';
  end if;
  return jsonb_build_object(
    'catalog_revision_id',catalog.id,
    'catalog_revision',catalog.revision,
    'model_catalog_entry_id',selected.entry_id,
    'customer_selection_key',selected.customer_selection_key,
    'runtime_model_id',selected.runtime_model_id,
    'provider_model_id',selected.provider_model_id,
    'display_name',selected.display_name,
    'tradeoff_summary',selected.tradeoff_summary,
    'quality_rank',selected.quality_rank,
    'rate_revision',selected.rate_revision,
    'cost_policy_revision_id',selected.cost_policy_revision_id,
    'payer_kind','owner_testing'
  );
end $$;

revoke all on function tongs.read_my_openai_text_model_preference(text) from public,anon;
revoke all on function tongs.read_openai_text_model_choices(text) from public,anon;
revoke all on function tongs.set_my_openai_text_model_preference(text,text,uuid,integer) from public,anon;
grant execute on function tongs.read_my_openai_text_model_preference(text) to authenticated;
grant execute on function tongs.read_openai_text_model_choices(text) to authenticated;
grant execute on function tongs.set_my_openai_text_model_preference(text,text,uuid,integer) to authenticated;
revoke all on function tongs.resolve_openai_text_model_for_quote(uuid,text,text) from public,anon,authenticated;
revoke all on function tongs.resolve_openai_text_model_for_funding_quote(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function tongs.resolve_openai_text_model_for_quote(uuid,text,text) to service_role;
grant execute on function tongs.resolve_openai_text_model_for_funding_quote(uuid,uuid,text,text) to service_role;

comment on column tongs.openai_text_model_catalog_entries.customer_selection_key is
  'Stable opaque customer token resolving server-side to one immutable catalog entry; never a provider model id.';
comment on column tongs.openai_text_model_catalog_entries.customer_selection_state is
  'Optional customer-safe lifecycle projection. Null derives selectable only for an already-active entry; eligibility still requires every financial and compatibility gate.';
comment on column tongs.openai_text_user_model_preference_revisions.route_code is
  'Operation scope for new preferences. Null rows are immutable historical global preferences and are never inherited by route-scoped reads.';
comment on function tongs.read_openai_text_model_choices(text) is
  'Customer-safe route-specific model choices. Returns selectable choices only and omits provider ids, catalog ids, costs, rates, and private revisions.';

notify pgrst,'reload schema';
commit;
