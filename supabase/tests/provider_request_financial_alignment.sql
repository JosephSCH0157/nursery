begin;

do $test$
declare
  v_source text;
begin
  if (select count(*) from tongs.openai_text_rate_condition_revisions
      where id='51100000-0000-4000-8000-000000000014'
        and provider_rate_revision_id='56560000-0000-4000-8000-000000000001'
        and revision=2 and service_tier='standard'
        and cache_write_micros_per_million_tokens=250000
        and source_retrieved_at='2026-09-09T16:00:00Z'::timestamptz
        and lifecycle_state='approved') <> 1 then
    raise exception 'approved cache-write classification successor is missing or refreshed';
  end if;

  if (select count(*) from tongs.openai_text_cost_policy_revisions
      where id='10000000-0000-4000-8000-000000000011'
        and route_code='hearth.chat_completion' and revision=4
        and maximum_input_units=2000 and maximum_output_units=512 and maximum_attempts=1
        and direct_provider_ceiling_micros=1115
        and supporting_cost_ceiling_micros=10000 and full_cost_ceiling_micros=11115
        and attempt_plan @> '[{"service_tier":"default","cache_ttl":"30m","rate_condition_revision_id":"51100000-0000-4000-8000-000000000014"}]') <> 1 then
    raise exception 'bounded Luna successor policy differs from approved authority';
  end if;

  if (select count(*) from tongs.private_pricing_revisions
      where id='b4c4472f-0325-4c2e-b2ef-9aef5e59e64b'
        and full_cost_ceiling_micros=11115 and markup_basis_points=3300
        and unrounded_customer_price_micros=14783 and rounding_adjustment_micros=217
        and settled_customer_price_micros=15000 and customer_credit_units=3) <> 1 then
    raise exception 'Luna successor price or canonical rounding differs';
  end if;

  if (select count(*) from tongs.private_pricing_cost_components
      where pricing_revision_id='b4c4472f-0325-4c2e-b2ef-9aef5e59e64b'
        and ((component_code='openai_text' and success_ceiling_micros=1115
              and cost_policy_revision='openai-text:hearth-chat:luna-bounded-pilot-v2')
          or (component_code='bounded_support' and success_ceiling_micros=10000))) <> 2 then
    raise exception 'Luna successor price components differ';
  end if;

  if (select count(*) from tongs.openai_text_rollout_revisions
      where route_code='hearth.chat_completion' and revision=13 and mode='halt_new'
        and funding_scope='all'
        and cost_policy_revision_id='10000000-0000-4000-8000-000000000011') <> 1 then
    raise exception 'Luna halt-new cutover was not staged';
  end if;

  if exists(select 1 from tongs.customer_paid_execution_scope_authorizations
            where cost_policy_revision_id='10000000-0000-4000-8000-000000000011')
     or exists(select 1 from tongs.openai_text_funding_bindings
            where cost_policy_revision_id='10000000-0000-4000-8000-000000000011') then
    raise exception 'alignment migration created spending or funding authority';
  end if;

  select pg_get_functiondef(
    'tongs.resolve_openai_text_paid_execution_context(text,text,uuid,uuid,uuid,text,text)'::regprocedure
  ) into v_source;
  if position('cache_write_micros_per_million_tokens' in v_source)=0
     or position('lifecycle_state=''approved''' in v_source)=0 then
    raise exception 'paid execution context does not resolve approved cache-write authority';
  end if;
end $test$;

rollback;
