-- Align the aggregate-assignment guard with the published whole-credit Luna
-- price installed by the standard-customer catalog revision.
begin;

create or replace function tongs.create_standard_customer_certification_aggregate_assignment(
  p_assignment_id uuid,
  p_actor_id uuid,
  p_scope_authorization_id uuid,
  p_reason text
) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare
  scope_auth tongs.customer_paid_execution_scope_authorizations%rowtype;
  existing tongs.paid_execution_aggregate_assignments%rowtype;
begin
  perform tongs._require_pricing_service_role();
  if p_assignment_id is null or p_actor_id is null
     or not tongs.is_platform_operator(p_actor_id)
     or p_scope_authorization_id is null
     or nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'service-role platform operator and exact scope are required'
      using errcode = '42501';
  end if;
  select * into existing
  from tongs.paid_execution_aggregate_assignments
  where id = p_assignment_id;
  if found then
    return to_jsonb(existing) || jsonb_build_object('replay', true);
  end if;
  select * into scope_auth
  from tongs.customer_paid_execution_scope_authorizations
  where id = p_scope_authorization_id;
  if not found
     or scope_auth.created_by <> p_actor_id
     or scope_auth.status <> 'active'
     or scope_auth.valid_from > now()
     or scope_auth.valid_until <= now()
     or scope_auth.financial_environment <> 'test'
     or scope_auth.route_code <> 'hearth.chat_completion'
     or scope_auth.provider <> 'openai'
     or scope_auth.model_or_sku <> 'gpt-5.6-luna'
     or scope_auth.pricing_revision_id <> 'b4c4472f-0325-4c2e-b2ef-9aef5e59e64a'::uuid
     or scope_auth.cost_policy_revision_id <> '10000000-0000-4000-8000-000000000010'::uuid
     or scope_auth.maximum_operation_count <> 1
     or scope_auth.maximum_customer_charge_micros <> 15000
     or scope_auth.maximum_wholesale_exposure_micros <> 11015
     or scope_auth.maximum_concurrency <> 1
     or scope_auth.rolling_window_seconds <> 86400 then
    raise exception 'exact active bounded Luna customer scope required'
      using errcode = '42501';
  end if;
  if exists (
    select 1 from tongs.paid_execution_aggregate_assignments a
    join tongs.restricted_beta_policy_revisions p on p.id = a.policy_revision_id
    where a.user_id = scope_auth.user_id
      and a.workspace_id = scope_auth.workspace_id
      and a.state = 'active'
      and a.valid_from <= now() and a.valid_until > now()
      and p.environment = 'test'
  ) then
    raise exception 'an active Test aggregate assignment already exists'
      using errcode = '23505';
  end if;
  insert into tongs.paid_execution_aggregate_assignments(
    id, policy_revision_id, user_id, workspace_id, state,
    valid_from, valid_until, reason
  ) values (
    p_assignment_id, 'c0000000-0000-4000-8000-000000000002',
    scope_auth.user_id, scope_auth.workspace_id, 'active', now(),
    scope_auth.valid_until, btrim(p_reason)
  ) returning * into existing;
  return to_jsonb(existing) || jsonb_build_object('replay', false);
end $$;

revoke all on function tongs.create_standard_customer_certification_aggregate_assignment(uuid,uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function tongs.create_standard_customer_certification_aggregate_assignment(uuid,uuid,uuid,text)
  to service_role;

notify pgrst, 'reload schema';
commit;

