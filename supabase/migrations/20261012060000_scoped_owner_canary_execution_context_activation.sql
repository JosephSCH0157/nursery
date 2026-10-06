-- Allow only an exact, active owner-only Test canary reservation to resolve a
-- paid OpenAI text execution context while the general route remains halt_new.
-- This consumes the authority installed by 20261012050000; it creates no new
-- activation, scope, budget, rollout, price, or customer authority.
begin;

create or replace function tongs.resolve_openai_text_paid_execution_context(
 p_route_code text,p_operation_id text,p_reservation_id uuid,p_user_id uuid,p_workspace_id uuid,p_workpiece_id text,p_request_fingerprint text
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare
 v_binding tongs.openai_text_funding_bindings%rowtype;
 v_res tongs.funding_reservations%rowtype;
 v_quote tongs.customer_spending_quotes%rowtype;
 v_qb tongs.openai_text_customer_quote_bindings%rowtype;
 v_cost tongs.openai_text_cost_policy_revisions%rowtype;
 v_rollout tongs.openai_text_rollout_revisions%rowtype;
 v_rate tongs.openai_text_provider_rate_revisions%rowtype;
 v_failure bigint;
 v_route_activated boolean;
 v_owner_canary_activated boolean;
begin
 perform tongs._require_pricing_service_role();
 select * into v_binding from tongs.openai_text_funding_bindings
  where operation_id=btrim(p_operation_id) and reservation_id=p_reservation_id and route_code=p_route_code;
 if not found then raise exception 'exact funded OpenAI text route binding required' using errcode='P0002'; end if;
 select * into v_res from tongs.funding_reservations where id=p_reservation_id;
 select * into v_quote from tongs.customer_spending_quotes where id=v_res.quote_id;
 select * into v_qb from tongs.openai_text_customer_quote_bindings where quote_id=v_quote.id;
 if not found or v_res.user_id<>p_user_id or v_quote.user_id<>p_user_id or v_qb.user_id<>p_user_id
  or v_qb.canonical_operation_id<>btrim(p_operation_id) or v_qb.route_code<>p_route_code or v_qb.workspace_id<>p_workspace_id
  or v_qb.workpiece_id<>btrim(p_workpiece_id) or v_qb.request_fingerprint<>p_request_fingerprint or v_quote.request_fingerprint<>p_request_fingerprint
  or v_qb.runtime_model<>v_binding.model or v_qb.pricing_revision_id<>v_binding.pricing_revision_id
  or v_qb.cost_policy_revision_id<>v_binding.cost_policy_revision_id
  or not exists(select 1 from tongs.customer_spending_quote_acceptances a where a.quote_id=v_quote.id and a.user_id=p_user_id)
  then raise exception 'accepted reserved OpenAI text funding context does not match request' using errcode='42501'; end if;
 select * into v_cost from tongs.openai_text_cost_policy_revisions where id=v_binding.cost_policy_revision_id;
 select * into v_rollout from tongs._current_openai_text_rollout(p_route_code);
 v_route_activated:=coalesce(v_rollout.mode='enforce' and v_rollout.cost_policy_revision_id=v_cost.id,false);
 v_owner_canary_activated:=coalesce(v_rollout.mode='halt_new' and exists(
   select 1 from tongs._owner_paid_execution_canary_for_reservation(p_reservation_id)
 ),false);
 if v_cost.id is null or not (v_route_activated or v_owner_canary_activated)
  or v_cost.lifecycle_state not in ('pilot_candidate','active') or v_cost.cost_coverage<>'complete'
  or v_res.reserved_wholesale_spend_micros<>v_cost.full_cost_ceiling_micros
  then raise exception 'OpenAI text route is not activated for the accepted complete cost revision' using errcode='42501'; end if;
 select rate.* into v_rate from tongs.openai_text_provider_rate_revisions rate
  where rate.id=nullif(v_cost.attempt_plan->0->>'rate_revision_id','')::uuid;
 if not found or v_binding.model not in (v_rate.runtime_model_alias,v_rate.provider_model_id)
  then raise exception 'pricing_not_configured: exact OpenAI model rate missing' using errcode='P0001'; end if;
 v_failure:=case when v_binding.credential_funding='forge' then v_cost.full_cost_ceiling_micros else 0 end;
 return jsonb_build_object(
  'operation_id',v_binding.operation_id,'reservation_id',v_binding.reservation_id,'quote_id',v_quote.id,'route_code',v_binding.route_code,
  'user_id',p_user_id,'workspace_id',p_workspace_id,'workpiece_id',btrim(p_workpiece_id),'request_fingerprint',p_request_fingerprint,
  'funding_source_type',v_res.funding_source_type,'funding_source_id',v_res.funding_source_id,'credential_funding',v_binding.credential_funding,'model',v_binding.model,
  'maximum_input_units',v_binding.maximum_input_units,'maximum_output_units',v_binding.maximum_output_units,'maximum_attempts',v_binding.maximum_attempts,
  'maximum_failure_exposure_micros',v_failure,'direct_provider_ceiling_micros',v_cost.direct_provider_ceiling_micros,
  'supporting_cost_ceiling_micros',v_cost.supporting_cost_ceiling_micros,'full_cost_ceiling_micros',v_cost.full_cost_ceiling_micros,
  'input_micros_per_million_tokens',v_rate.input_micros_per_million_tokens,
  'cached_input_micros_per_million_tokens',v_rate.cached_input_micros_per_million_tokens,
  'output_micros_per_million_tokens',v_rate.output_micros_per_million_tokens,
  'cost_policy_revision_id',v_cost.id,'pricing_revision_id',v_quote.pricing_revision_id,
  'rollout_revision',v_rollout.revision,'reservation_state',tongs._funding_reservation_state(p_reservation_id));
end $$;

revoke all on function tongs.resolve_openai_text_paid_execution_context(text,text,uuid,uuid,uuid,text,text)
  from public,anon,authenticated;
grant execute on function tongs.resolve_openai_text_paid_execution_context(text,text,uuid,uuid,uuid,text,text)
  to service_role;

comment on function tongs.resolve_openai_text_paid_execution_context(text,text,uuid,uuid,uuid,text,text) is
  'Resolves exact accepted complete-cost execution authority. General callers require route enforce; an exact active owner-only Test canary reservation may resolve while the route remains halt_new.';

notify pgrst,'reload schema';
commit;
