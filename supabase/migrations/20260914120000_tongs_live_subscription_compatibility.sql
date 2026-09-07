-- Live subscription compatibility without activating the shared spending gate.
-- Cash receipt, legacy entitlement delivery, allowance allocation, and revenue
-- recognition remain separate actions. Existing legacy grants are adopted
-- without changing their balances; new compatibility grants are recorded as
-- legacy/unverified units and cannot fund the new reservation system.

begin;

create table tongs.legacy_plan_entitlement_compatibility_grants (
  id uuid primary key,
  receipt_id uuid not null unique references tongs.subscription_cycle_receipts(id) on delete restrict,
  plan_credit_grant_id bigint not null references tongs.plan_credit_grants(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  entitlement_units bigint not null check (entitlement_units > 0),
  adopted_existing boolean not null,
  opening_balance_already_captured boolean not null,
  eligible_for_shared_spending_gate boolean not null default false
    check (eligible_for_shared_spending_gate = false),
  journal_event_id uuid not null unique references tongs.accounting_journal_events(id) on delete restrict,
  metadata_json jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata_json) = 'object'),
  granted_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index legacy_plan_entitlement_compatibility_plan_grant_idx
  on tongs.legacy_plan_entitlement_compatibility_grants(plan_credit_grant_id);
create index legacy_plan_entitlement_compatibility_user_idx
  on tongs.legacy_plan_entitlement_compatibility_grants(user_id, granted_at desc);

alter table tongs.legacy_plan_entitlement_compatibility_grants enable row level security;
create trigger trg_legacy_plan_entitlement_compatibility_append_only
before update or delete on tongs.legacy_plan_entitlement_compatibility_grants
for each row execute function tongs._reject_accounting_mutation();

create or replace function tongs.grant_legacy_plan_entitlement_compatibility(
  p_compatibility_grant_id uuid,
  p_receipt_id uuid,
  p_granted_at timestamptz,
  p_metadata_json jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_receipt tongs.subscription_cycle_receipts%rowtype;
  v_existing tongs.legacy_plan_entitlement_compatibility_grants%rowtype;
  v_plan_grant tongs.plan_credit_grants%rowtype;
  v_credits bigint;
  v_adopted_existing boolean := false;
  v_opening_captured boolean := false;
  v_record_units boolean := false;
  v_payload jsonb;
begin
  perform tongs._require_accounting_service_role();
  if p_compatibility_grant_id is null or p_receipt_id is null
     or jsonb_typeof(coalesce(p_metadata_json, '{}'::jsonb)) <> 'object' then
    raise exception 'invalid legacy plan entitlement compatibility grant' using errcode = '22023';
  end if;

  select * into v_receipt
  from tongs.subscription_cycle_receipts
  where id = p_receipt_id
  for update;
  if not found then
    raise exception 'subscription cycle receipt not found' using errcode = 'P0002';
  end if;
  if v_receipt.stripe_mode <> 'live' or v_receipt.purchase_type <> 'subscription' then
    raise exception 'only live subscription receipts can preserve legacy plan entitlements'
      using errcode = '42501';
  end if;

  select * into v_existing
  from tongs.legacy_plan_entitlement_compatibility_grants
  where receipt_id = p_receipt_id;
  if found then
    return jsonb_build_object(
      'compatibility_grant_id', v_existing.id,
      'receipt_id', v_existing.receipt_id,
      'entitlement_units', v_existing.entitlement_units,
      'adopted_existing', v_existing.adopted_existing,
      'eligible_for_shared_spending_gate', false,
      'replay', true
    );
  end if;

  v_credits := tongs.plan_included_ai_credits(v_receipt.plan_item_id);
  if v_credits <= 0 then
    raise exception 'subscription plan has no configured legacy entitlement: %', v_receipt.plan_item_id
      using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'legacy-plan-cycle:' || v_receipt.stripe_subscription_id || ':' ||
    v_receipt.plan_item_id || ':' || v_receipt.period_start::text,
    0
  ));

  select * into v_plan_grant
  from tongs.plan_credit_grants
  where stripe_subscription_id = v_receipt.stripe_subscription_id
    and plan_item_id = v_receipt.plan_item_id
    and period_start = v_receipt.period_start;

  if found then
    if v_plan_grant.user_id <> v_receipt.user_id
       or v_plan_grant.credits_granted <> v_credits then
      raise exception 'existing plan entitlement conflicts with paid receipt' using errcode = '23505';
    end if;
    v_adopted_existing := true;
    select exists(
      select 1
      from tongs.legacy_credit_opening_balances opening
      where opening.user_id = v_receipt.user_id
        and opening.captured_at >= v_plan_grant.created_at
    ) into v_opening_captured;
    v_record_units := not v_opening_captured and not exists(
      select 1
      from tongs.legacy_plan_entitlement_compatibility_grants prior
      where prior.plan_credit_grant_id = v_plan_grant.id
    );
  else
    insert into tongs.ai_credits(user_id)
    values (v_receipt.user_id)
    on conflict (user_id) do nothing;

    insert into tongs.plan_credit_grants(
      user_id, stripe_subscription_id, plan_item_id, period_start, period_end,
      credits_granted, source_event_id
    ) values (
      v_receipt.user_id, v_receipt.stripe_subscription_id, v_receipt.plan_item_id,
      v_receipt.period_start, v_receipt.period_end, v_credits, v_receipt.stripe_event_id
    ) returning * into v_plan_grant;

    update tongs.ai_credits
    set token_balance = token_balance + v_credits,
        updated_at = now()
    where user_id = v_receipt.user_id;
    v_record_units := true;
  end if;

  v_payload := jsonb_build_object(
    'compatibility_grant_id', p_compatibility_grant_id,
    'receipt_id', p_receipt_id,
    'plan_credit_grant_id', v_plan_grant.id,
    'user_id', v_receipt.user_id,
    'entitlement_units', v_credits,
    'adopted_existing', v_adopted_existing,
    'opening_balance_already_captured', v_opening_captured,
    'eligible_for_shared_spending_gate', false,
    'metadata', coalesce(p_metadata_json, '{}'::jsonb)
  );
  perform tongs._create_accounting_event(
    p_compatibility_grant_id,
    'legacy-plan-entitlement:' || p_receipt_id::text,
    'legacy_plan_entitlement_preserved',
    'legacy_unverified',
    'subscription_cycle_receipt',
    p_receipt_id::text,
    null,
    v_receipt.user_id,
    null,
    null,
    v_payload,
    coalesce(p_granted_at, now())
  );

  insert into tongs.legacy_plan_entitlement_compatibility_grants(
    id, receipt_id, plan_credit_grant_id, user_id, entitlement_units,
    adopted_existing, opening_balance_already_captured,
    eligible_for_shared_spending_gate, journal_event_id, metadata_json, granted_at
  ) values (
    p_compatibility_grant_id, p_receipt_id, v_plan_grant.id, v_receipt.user_id, v_credits,
    v_adopted_existing, v_opening_captured, false, p_compatibility_grant_id,
    coalesce(p_metadata_json, '{}'::jsonb), coalesce(p_granted_at, now())
  );

  if v_record_units then
    insert into tongs.accounting_journal_entries(
      event_id, line_number, account_code, user_id, unit_kind, quantity_delta, metadata_json
    ) values (
      p_compatibility_grant_id, 1, 'legacy_unverified_credits', v_receipt.user_id,
      'forge_credit', v_credits,
      jsonb_build_object('compatibility_only', true, 'eligible_for_shared_spending_gate', false)
    );
  end if;

  return jsonb_build_object(
    'compatibility_grant_id', p_compatibility_grant_id,
    'receipt_id', p_receipt_id,
    'entitlement_units', v_credits,
    'adopted_existing', v_adopted_existing,
    'opening_balance_already_captured', v_opening_captured,
    'eligible_for_shared_spending_gate', false,
    'replay', false
  );
end;
$$;

-- Keep an old webhook instance safe during a coordinated rollout. The legacy
-- signature can no longer mint credits without a previously recorded live
-- subscription receipt, and delegates to the auditable compatibility path.
create or replace function tongs.grant_plan_cycle_ai_credits(
  p_user_id uuid,
  p_stripe_subscription_id text,
  p_plan_item_id text,
  p_period_start timestamptz,
  p_period_end timestamptz default null,
  p_source_event_id text default null
) returns bigint language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_receipt tongs.subscription_cycle_receipts%rowtype;
  v_result jsonb;
begin
  perform tongs._require_accounting_service_role();
  select * into v_receipt
  from tongs.subscription_cycle_receipts receipt
  where receipt.stripe_mode = 'live'
    and receipt.stripe_event_id = nullif(btrim(coalesce(p_source_event_id, '')), '')
  for update;
  if not found then
    raise exception 'recorded live subscription receipt required before entitlement grant'
      using errcode = '42501';
  end if;
  if v_receipt.user_id <> p_user_id
     or v_receipt.stripe_subscription_id <> nullif(btrim(coalesce(p_stripe_subscription_id, '')), '')
     or v_receipt.plan_item_id <> nullif(lower(btrim(coalesce(p_plan_item_id, ''))), '')
     or v_receipt.period_start <> p_period_start
     or (p_period_end is not null and v_receipt.period_end <> p_period_end) then
    raise exception 'legacy entitlement request conflicts with recorded receipt' using errcode = '23505';
  end if;
  v_result := tongs.grant_legacy_plan_entitlement_compatibility(
    gen_random_uuid(), v_receipt.id, v_receipt.received_at,
    jsonb_build_object('source', 'legacy_rpc_wrapper', 'source_event_id', p_source_event_id)
  );
  if (v_result->>'replay')::boolean then return 0; end if;
  return (v_result->>'entitlement_units')::bigint;
end;
$$;

revoke all on tongs.legacy_plan_entitlement_compatibility_grants from public, anon, authenticated;
grant all on tongs.legacy_plan_entitlement_compatibility_grants to service_role;
revoke all on function tongs.grant_legacy_plan_entitlement_compatibility(uuid, uuid, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function tongs.grant_legacy_plan_entitlement_compatibility(uuid, uuid, timestamptz, jsonb)
  to service_role;
revoke all on function tongs.grant_plan_cycle_ai_credits(uuid, text, text, timestamptz, timestamptz, text)
  from public, anon, authenticated;
grant execute on function tongs.grant_plan_cycle_ai_credits(uuid, text, text, timestamptz, timestamptz, text)
  to service_role;

comment on table tongs.legacy_plan_entitlement_compatibility_grants is
  'Audit bridge for existing paid-plan credit promises. Units remain legacy/unverified and never authorize the shared spending gate.';
comment on function tongs.grant_legacy_plan_entitlement_compatibility(uuid, uuid, timestamptz, jsonb) is
  'Separately preserves an existing live plan entitlement after cash receipt. Does not allocate revenue, create a paid allowance, or enable spending.';

notify pgrst, 'reload schema';
commit;
