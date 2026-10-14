-- Hammer Slice 6C.8B: make one-operation owner-canary eligibility reflect
-- current reservation admission and recognize only pinned, verified-zero
-- Hammer supporting cost. No rollout, execution scope, or pricing is activated.
begin;

create or replace function tongs._owner_paid_execution_canary_for_choice(
  p_user_id uuid,p_workspace_id uuid,p_route_code text,p_model text
) returns table(activation_id uuid,scope_id uuid,budget_id uuid,pricing_revision_id uuid,cost_policy_revision_id uuid)
language sql stable security definer set search_path=pg_catalog as $$
  select activation.id,scope_auth.id,activation.owner_budget_id,
    scope_auth.pricing_revision_id,scope_auth.cost_policy_revision_id
  from tongs.customer_paid_execution_scope_authorizations scope_auth
  cross join lateral tongs._active_owner_paid_execution_canary_for_scope(scope_auth.id,null) activation
  where activation.id is not null
    and scope_auth.user_id=p_user_id and scope_auth.workspace_id=p_workspace_id
    and scope_auth.financial_environment='test'
    and scope_auth.route_code=btrim(p_route_code)
    and scope_auth.provider='openai' and scope_auth.model_or_sku=btrim(p_model)
    and not exists(
      select 1 from tongs.funding_reservations reservation
      where reservation.rollout_authorization_id=scope_auth.id
    )
  order by scope_auth.created_at desc limit 1
$$;

comment on function tongs._owner_paid_execution_canary_for_choice(uuid,uuid,text,text) is
  'Returns a currently admissible owner-only Test canary choice only while an exact active activation/budget exists and its one-operation scope has never been consumed.';

create or replace function tongs._owner_paid_execution_canary_for_reservation(
  p_reservation_id uuid
) returns tongs.owner_paid_execution_canary_activation_revisions
language sql stable security definer set search_path=pg_catalog as $$
  select activation.*
  from tongs.funding_reservations reservation
  join tongs.openai_text_customer_quote_bindings quote_binding
    on quote_binding.quote_id=reservation.quote_id
  join tongs.customer_paid_execution_scope_authorizations scope_auth
    on scope_auth.id=reservation.rollout_authorization_id
  cross join lateral tongs._active_owner_paid_execution_canary_for_scope(
    scope_auth.id,reservation.funding_source_id
  ) activation
  where activation.id is not null
    and reservation.id=p_reservation_id
    and reservation.funding_source_type='owner_budget'
    and reservation.funding_environment='test'
    and reservation.user_id=scope_auth.user_id
    and quote_binding.user_id=scope_auth.user_id
    and quote_binding.workspace_id=scope_auth.workspace_id
    and quote_binding.route_code=scope_auth.route_code
    and quote_binding.runtime_model=scope_auth.model_or_sku
    and quote_binding.pricing_revision_id=scope_auth.pricing_revision_id
    and quote_binding.cost_policy_revision_id=scope_auth.cost_policy_revision_id
$$;

-- Keep the existing race-safe trigger body and insert only the missing
-- non-null activation predicate in its owner-budget scope lookup.
do $$
declare definition text; changed text;
begin
  select pg_get_functiondef('tongs._stamp_and_authorize_funding_reservation()'::regprocedure)
    into definition;
  changed:=replace(definition,
    'join lateral tongs._active_owner_paid_execution_canary_for_scope(scope.id,new.funding_source_id) canary on true',
    'join lateral tongs._active_owner_paid_execution_canary_for_scope(scope.id,new.funding_source_id) canary on canary.id is not null');
  if changed=definition or position('canary on canary.id is not null' in changed)=0 then
    raise exception 'owner canary reservation trigger activation patch did not match authoritative definition';
  end if;
  execute changed;
end $$;

create or replace function tongs._openai_text_verified_zero_supporting_cost(
  p_reservation_id uuid
) returns boolean
language sql stable security definer set search_path=pg_catalog as $$
  select exists(
    select 1
    from tongs.funding_reservations reservation
    join tongs.openai_text_funding_bindings binding
      on binding.reservation_id=reservation.id
    join tongs.openai_text_customer_quote_bindings quote_binding
      on quote_binding.quote_id=reservation.quote_id
    join tongs.openai_text_cost_policy_revisions cost
      on cost.id=binding.cost_policy_revision_id
    where reservation.id=p_reservation_id
      and binding.credential_funding='forge'
      and binding.route_code='hammer.transcript_cleanup'
      and quote_binding.route_code=binding.route_code
      and quote_binding.canonical_operation_id=binding.operation_id
      and quote_binding.runtime_model=binding.model
      and quote_binding.pricing_revision_id=binding.pricing_revision_id
      and quote_binding.cost_policy_revision_id=binding.cost_policy_revision_id
      and cost.route_code=binding.route_code
      and cost.lifecycle_state='active'
      and cost.cost_coverage='complete'
      and cost.supporting_cost_ceiling_micros=0
      and cost.full_cost_ceiling_micros=cost.direct_provider_ceiling_micros
      and (
        select count(*)=3
          and count(*) filter(where inventory.evidence_status='verified')=3
          and count(*) filter(where
            (inventory.component_code='provider_attempt' and inventory.disposition='attributable_metered')
            or (inventory.component_code='validation_persistence' and inventory.disposition='platform_overhead')
            or (inventory.component_code='hosting_storage_egress' and inventory.disposition='platform_overhead')
          )=3
        from tongs.openai_text_supporting_cost_inventory inventory
        where inventory.cost_policy_revision_id=cost.id
          and inventory.route_code=cost.route_code
      )
  )
$$;

create or replace function tongs.resolve_openai_text_verified_zero_supporting_cost(
  p_reservation_id uuid
) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare
  binding tongs.openai_text_funding_bindings%rowtype;
  authoritative boolean;
begin
  perform tongs._require_pricing_service_role();
  select * into binding from tongs.openai_text_funding_bindings
    where reservation_id=p_reservation_id;
  authoritative:=tongs._openai_text_verified_zero_supporting_cost(p_reservation_id);
  if not authoritative then
    return jsonb_build_object(
      'authoritative',false,
      'amount_micros',null,
      'reason','verified_zero_supporting_cost_authority_unavailable'
    );
  end if;
  return jsonb_build_object(
    'authoritative',true,
    'amount_micros',0,
    'evidence',jsonb_build_object(
      'authority_kind','immutable_verified_zero_supporting_cost_inventory',
      'route_code',binding.route_code,
      'cost_policy_revision_id',binding.cost_policy_revision_id,
      'reservation_id',binding.reservation_id,
      'component_count',3,
      'evidence_status','verified'
    )
  );
end $$;

revoke all on function tongs._openai_text_verified_zero_supporting_cost(uuid)
  from public,anon,authenticated,service_role;
revoke all on function tongs.resolve_openai_text_verified_zero_supporting_cost(uuid)
  from public,anon,authenticated;
grant execute on function tongs.resolve_openai_text_verified_zero_supporting_cost(uuid)
  to service_role;

-- Preserve the evolved completions/transcription reconciliation function and
-- patch only the other-cost completeness decision. An original zero expense
-- remains immutable; exact policy/inventory authority may make it effectively
-- complete, but can never confirm the direct OpenAI estimate.
do $$
declare definition text; changed text;
begin
  select pg_get_functiondef(
    'tongs._process_openai_organization_reconciliation(uuid)'::regprocedure
  ) into definition;
  changed:=replace(definition,
    $old$select count(*) filter(where evidence_status<>'confirmed' or amount_micros is null),coalesce(sum(amount_micros) filter(where evidence_status='confirmed'),0)
     into other_incomplete,other_confirmed from tongs.supplier_expenses e
     where e.reservation_id=candidate.reservation_id and e.provider<>'openai';$old$,
    $new$select summary.incomplete_count
       + case when authority.verified_zero and summary.verified_zero_expense_count<>1 then 1 else 0 end,
       summary.confirmed_amount
     into other_incomplete,other_confirmed
     from (select tongs._openai_text_verified_zero_supporting_cost(candidate.reservation_id) verified_zero) authority
     cross join lateral (
       select
         count(*) filter(where (e.evidence_status<>'confirmed' or e.amount_micros is null)
           and not (authority.verified_zero
             and e.provider='forge'
             and e.component_code='openai.text.hammer.transcript_cleanup.supporting'
             and e.amount_micros=0
             and e.obligation_status='closed'
             and e.evidence_status in ('estimated','confirmed'))) incomplete_count,
         coalesce(sum(e.amount_micros) filter(where e.evidence_status='confirmed'),0) confirmed_amount,
         count(*) filter(where
           e.provider='forge'
           and e.component_code='openai.text.hammer.transcript_cleanup.supporting'
           and e.amount_micros=0
           and e.obligation_status='closed'
           and e.evidence_status in ('estimated','confirmed')) verified_zero_expense_count
       from tongs.supplier_expenses e
       where e.reservation_id=candidate.reservation_id and e.provider<>'openai'
     ) summary;$new$);
  changed:=replace(changed,
    $old$'supporting_costs_confirmed',true));$old$,
    $new$'supporting_costs_confirmed',true,
        'verified_zero_supporting_cost_authority',tongs._openai_text_verified_zero_supporting_cost(candidate.reservation_id)));$new$);
  if changed=definition
     or position('verified_zero_expense_count' in changed)=0
     or position('verified_zero_supporting_cost_authority' in changed)=0 then
    raise exception 'verified-zero reconciliation patch did not match authoritative definition';
  end if;
  execute changed;
end $$;

revoke all on function tongs._process_openai_organization_reconciliation(uuid)
  from public,anon,authenticated;
grant execute on function tongs._process_openai_organization_reconciliation(uuid)
  to service_role;

comment on function tongs.resolve_openai_text_verified_zero_supporting_cost(uuid) is
  'Service-only resolver for exact Hammer verified-zero supporting cost pinned by reservation, quote, active complete cost policy, and complete verified inventory.';
comment on function tongs._process_openai_organization_reconciliation(uuid) is
  'Allocates exact aggregate OpenAI evidence and treats one immutable Hammer zero-support expense as complete only under pinned verified-zero policy/inventory authority; direct provider cost still requires accepted aggregate evidence.';

notify pgrst,'reload schema';
commit;
