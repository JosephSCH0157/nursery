-- Honest workspace cost ledger across AI, paid media, and invoice-backed infrastructure.
-- Cost basis is explicit: pricing estimates are never presented as invoice actuals.

begin;

create table if not exists tongs.external_cost_observations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references tongs.workspaces(id) on delete restrict,
  workpiece_id uuid references tongs.episodes(id) on delete restrict,
  provider text not null check (nullif(btrim(provider), '') is not null),
  service text not null check (nullif(btrim(service), '') is not null),
  incurred_at timestamptz not null,
  amount_usd numeric(18, 8) not null check (amount_usd >= 0),
  cost_basis text not null check (cost_basis in ('invoice_actual', 'provider_usage_actual')),
  payer text not null check (payer in ('forge', 'customer_provider_account')),
  allocation_method text not null check (allocation_method in ('direct', 'metered', 'pro_rata', 'equal_share', 'manual')),
  allocation_basis_json jsonb not null default '{}'::jsonb check (jsonb_typeof(allocation_basis_json) = 'object'),
  external_line_item_id text not null check (nullif(btrim(external_line_item_id), '') is not null),
  evidence_json jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_json) = 'object'),
  created_at timestamptz not null default now(),
  unique (provider, external_line_item_id)
);

create index if not exists external_cost_observations_workspace_incurred_idx
  on tongs.external_cost_observations (workspace_id, incurred_at desc);

alter table tongs.external_cost_observations enable row level security;

alter table tongs.paid_media_operations
  add column if not exists credential_source text not null default 'forge_managed'
    check (credential_source in ('forge_managed', 'user_byo', 'org_shared', 'unknown')),
  add column if not exists payer text not null default 'forge'
    check (payer in ('forge', 'customer_provider_account', 'unknown'));

drop policy if exists external_cost_observations_workspace_viewer on tongs.external_cost_observations;
create policy external_cost_observations_workspace_viewer
  on tongs.external_cost_observations
  for select to authenticated
  using (tongs.has_workspace_role(workspace_id, 'viewer'));

revoke all on tongs.external_cost_observations from public, anon, authenticated;
grant select on tongs.external_cost_observations to authenticated, service_role;
grant insert on tongs.external_cost_observations to service_role;

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
    select
      e.created_at as incurred_at,
      'ai_request'::text as category,
      e.feature,
      e.subfeature,
      coalesce(nullif(e.provider, ''), 'unknown') as provider,
      coalesce(nullif(e.effective_ai_key_source, ''), nullif(e.key_source, ''),
        case when e.lane = 'byo' then 'user_byo' else 'forge_managed' end) as key_source,
      case when coalesce(nullif(e.effective_ai_key_source, ''), nullif(e.key_source, ''), '') in ('user_byo', 'byo')
        then 'customer_provider_account' else 'forge' end as payer,
      'pricing_estimate'::text as cost_basis,
      coalesce(e.estimated_cost_usd, e.actual_cost_usd, 0)::numeric as cost_usd,
      e.workpiece_id
    from tongs.ai_usage_events e
    where e.workspace_id = p_workspace_id
      and e.status = 'success'
      and e.created_at >= p_from and e.created_at < p_to

    union all

    select
      coalesce(a.completed_at, a.created_at) as incurred_at,
      'paid_media'::text as category,
      o.originating_tool as feature,
      o.media_kind as subfeature,
      coalesce(nullif(a.provider, ''), nullif(o.provider, ''), 'unknown') as provider,
      o.credential_source as key_source,
      o.payer,
      'provider_usage_actual'::text as cost_basis,
      (sum(u.expense_numerator / u.expense_denominator) / 1000000)::numeric as cost_usd,
      o.workpiece_id
    from tongs.paid_media_actual_usage_components u
    join tongs.paid_media_provider_attempts a on a.id = u.provider_attempt_id
    join tongs.paid_media_operations o on o.id = a.paid_media_operation_id
    where o.workspace_id = p_workspace_id
      and coalesce(a.completed_at, a.created_at) >= p_from
      and coalesce(a.completed_at, a.created_at) < p_to
    group by a.id, a.completed_at, a.created_at, o.originating_tool, o.media_kind,
      a.provider, o.provider, o.workpiece_id

    union all

    select
      x.incurred_at,
      'infrastructure'::text as category,
      x.service as feature,
      null::text as subfeature,
      x.provider,
      'external_billing'::text as key_source,
      x.payer,
      x.cost_basis,
      x.amount_usd::numeric as cost_usd,
      x.workpiece_id
    from tongs.external_cost_observations x
    where x.workspace_id = p_workspace_id
      and x.incurred_at >= p_from and x.incurred_at < p_to
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'incurred_at', incurred_at,
    'category', category,
    'feature', feature,
    'subfeature', subfeature,
    'provider', provider,
    'key_source', key_source,
    'payer', payer,
    'cost_basis', cost_basis,
    'cost_usd', cost_usd,
    'workpiece_id', workpiece_id
  ) order by incurred_at desc), '[]'::jsonb)
  into v_components
  from component_rows
  where cost_usd > 0;

  select count(*) into v_fly_count
  from tongs.external_cost_observations x
  where x.workspace_id = p_workspace_id
    and lower(x.provider) in ('fly', 'fly.io', 'fly_io')
    and x.incurred_at >= p_from and x.incurred_at < p_to;

  return jsonb_build_object(
    'contract_version', 'forge.workspace-cost-ledger.v1',
    'workspace_id', p_workspace_id,
    'from', p_from,
    'to', p_to,
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

revoke all on function tongs.read_workspace_cost_ledger(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function tongs.read_workspace_cost_ledger(uuid, timestamptz, timestamptz) to authenticated, service_role;

commit;
