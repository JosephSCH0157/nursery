begin;

create or replace function tongs.read_workspace_cost_ledger(
  p_workspace_id uuid,
  p_from timestamptz,
  p_to timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_components jsonb;
  v_fly_count bigint;
begin
  if auth.uid() is null or not tongs.has_workspace_role(p_workspace_id, 'viewer') then
    raise exception 'workspace viewer authority required' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to <= p_from then
    raise exception 'invalid ledger time range' using errcode = '22023';
  end if;

  with component_rows as (
    select e.created_at as incurred_at, 'ai_request'::text as category, e.feature, e.subfeature,
      coalesce(nullif(e.provider, ''), 'unknown') as provider,
      coalesce(nullif(e.effective_ai_key_source, ''), nullif(e.key_source, ''),
        case when e.lane = 'byo' then 'user_byo' else 'forge_managed' end) as key_source,
      case when coalesce(nullif(e.effective_ai_key_source, ''), nullif(e.key_source, ''), '') in ('user_byo', 'byo')
        then 'customer_provider_account' else 'forge' end as payer,
      'pricing_estimate'::text as cost_basis,
      coalesce(e.estimated_cost_usd, e.actual_cost_usd, 0)::numeric as cost_usd,
      e.workpiece_id
    from tongs.ai_usage_events e
    where e.workspace_id = p_workspace_id and e.status = 'success'
      and e.created_at >= p_from and e.created_at < p_to

    union all

    select coalesce(a.completed_at, a.created_at), 'paid_media'::text, o.originating_tool, o.media_kind,
      coalesce(nullif(a.provider, ''), nullif(o.provider, ''), 'unknown'),
      o.credential_source, o.payer, 'provider_usage_actual'::text,
      usage_totals.cost_usd, o.workpiece_id
    from tongs.paid_media_provider_attempts a
    join tongs.paid_media_operations o on o.id = a.paid_media_operation_id
    join lateral (
      select (sum(u.expense_numerator / u.expense_denominator) / 1000000)::numeric as cost_usd
      from tongs.paid_media_actual_usage_components u
      where u.provider_attempt_id = a.id
    ) usage_totals on usage_totals.cost_usd is not null
    where o.workspace_id = p_workspace_id
      and coalesce(a.completed_at, a.created_at) >= p_from
      and coalesce(a.completed_at, a.created_at) < p_to

    union all

    select x.incurred_at, 'infrastructure'::text, x.service, null::text, x.provider,
      'external_billing'::text, x.payer, x.cost_basis, x.amount_usd::numeric, x.workpiece_id
    from tongs.external_cost_observations x
    where x.workspace_id = p_workspace_id
      and x.incurred_at >= p_from and x.incurred_at < p_to
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'incurred_at', incurred_at, 'category', category, 'feature', feature,
    'subfeature', subfeature, 'provider', provider, 'key_source', key_source,
    'payer', payer, 'cost_basis', cost_basis, 'cost_usd', cost_usd,
    'workpiece_id', workpiece_id
  ) order by incurred_at desc), '[]'::jsonb)
  into v_components from component_rows where cost_usd > 0;

  select count(*) into v_fly_count
  from tongs.external_cost_observations x
  where x.workspace_id = p_workspace_id
    and lower(x.provider) in ('fly', 'fly.io', 'fly_io')
    and x.incurred_at >= p_from and x.incurred_at < p_to;

  return jsonb_build_object(
    'contract_version', 'forge.workspace-cost-ledger.v1',
    'workspace_id', p_workspace_id, 'from', p_from, 'to', p_to,
    'components', v_components,
    'coverage', jsonb_build_object(
      'ai_requests', jsonb_build_object('state', 'estimated', 'detail', 'Provider-list pricing estimate; includes Forge and BYO key usage.'),
      'paid_media', jsonb_build_object('state', 'provider_usage_actual', 'detail', 'Provider-rated usage recorded by canonical paid-media attempts.'),
      'fly_io', case when v_fly_count > 0
        then jsonb_build_object('state', 'invoice_actual', 'detail', 'Imported Fly.io billing observations are included.')
        else jsonb_build_object('state', 'unavailable', 'detail', 'No Fly.io invoice or billing observations are connected for this workspace and range.')
      end
    )
  );
end;
$$;

commit;
