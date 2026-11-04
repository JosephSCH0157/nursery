-- Align the bounded Luna provider request with its complete supplier exposure,
-- and stage (but do not activate) the successor customer authority.
begin;

do $$
begin
  if not exists (
    select 1 from tongs.openai_text_cost_policy_revisions
    where id='10000000-0000-4000-8000-000000000010'::uuid
      and route_code='hearth.chat_completion' and revision=3
      and maximum_input_units=2000 and maximum_output_units=512 and maximum_attempts=1
      and direct_provider_ceiling_micros=1015 and supporting_cost_ceiling_micros=10000
      and full_cost_ceiling_micros=11015
  ) then raise exception 'reviewed Luna predecessor policy changed'; end if;
  if not exists (
    select 1 from tongs.openai_text_rate_condition_revisions
    where id='51100000-0000-4000-8000-000000000004'::uuid
      and provider_rate_revision_id='56560000-0000-4000-8000-000000000001'::uuid
      and service_tier='standard' and cache_write_micros_per_million_tokens=250000
      and source_retrieved_at='2026-09-09T16:00:00Z'::timestamptz
      and lifecycle_state='draft'
  ) then raise exception 'reviewed Luna cache-write rate condition changed'; end if;
  if not exists (
    select 1 from tongs.private_pricing_revisions
    where id='b4c4472f-0325-4c2e-b2ef-9aef5e59e64a'::uuid
      and full_cost_ceiling_micros=11015 and customer_price_ceiling_micros=15000
      and customer_credit_units=3 and markup_basis_points=3300
  ) then raise exception 'reviewed Luna customer price changed'; end if;
  if not exists (
    select 1 from tongs.openai_text_rollout_revisions
    where route_code='hearth.chat_completion' and revision=12 and mode='enforce'
      and funding_scope='all'
      and cost_policy_revision_id='10000000-0000-4000-8000-000000000010'::uuid
  ) or exists (
    select 1 from tongs.openai_text_rollout_revisions
    where route_code='hearth.chat_completion' and revision>12
  ) then raise exception 'reviewed Luna rollout predecessor changed'; end if;
end $$;

-- This is an approval/classification successor for the already-reviewed rate
-- condition. It deliberately preserves the original source observation time;
-- it is not a supplier-rate refresh.
insert into tongs.openai_text_rate_condition_revisions(
 id,provider_rate_revision_id,revision,service_tier,cache_write_micros_per_million_tokens,
 long_context_threshold_tokens,long_context_input_multiplier_millis,
 long_context_cached_input_multiplier_millis,long_context_output_multiplier_millis,
 reasoning_billing_rule,source_url,source_retrieved_at,lifecycle_state,notes
) values (
 '51100000-0000-4000-8000-000000000014','56560000-0000-4000-8000-000000000001',2,
 'standard',250000,null,null,null,null,
 'Reasoning tokens are included in billed output tokens. Only default 30-minute cache writes are permitted; extended retention is prohibited.',
 'https://developers.openai.com/api/docs/models/gpt-5.6-luna','2026-09-09T16:00:00Z','approved',
 'Owner-approved classification successor for the retained historical source observation; this row does not renew supplier evidence.'
);

insert into tongs.openai_text_cost_policy_revisions(
 id,route_code,revision,policy_code,attempt_plan,maximum_input_units,maximum_output_units,
 maximum_attempts,direct_provider_ceiling_micros,supporting_cost_ceiling_micros,
 full_cost_ceiling_micros,cost_coverage,lifecycle_state,notes
) values (
 '10000000-0000-4000-8000-000000000011','hearth.chat_completion',4,
 'openai-text:hearth-chat:luna-bounded-pilot-v2',
 '[{"attempt":1,"rate_revision_id":"56560000-0000-4000-8000-000000000001","rate_condition_revision_id":"51100000-0000-4000-8000-000000000014","input_max":2000,"output_max":512,"service_tier":"default","cache_ttl":"30m"}]'::jsonb,
 2000,512,1,1115,10000,11115,'complete','pilot_candidate',
 'Approved successor to the historically inactive-proposal row. Explicit default service tier; 30-minute cache writes included; extended retention prohibited; no activation in this migration.'
);

insert into tongs.private_pricing_revisions(
 id,policy_id,revision,previous_revision_id,lifecycle_state,currency,markup_basis_points,
 full_cost_ceiling_micros,failure_cost_ceiling_micros,customer_price_ceiling_micros,
 billable_failure_ceiling_micros,customer_credit_units,billable_failure_classes,
 free_failure_classes,included_quantity,retention_policy,change_reason,content_hash,actor_id,
 unrounded_customer_price_micros,rounding_adjustment_micros,settled_customer_price_micros
)
select 'b4c4472f-0325-4c2e-b2ef-9aef5e59e64b',policy_id,revision+1,id,'review_ready',currency,3300,
 11115,failure_cost_ceiling_micros,15000,billable_failure_ceiling_micros,3,
 billable_failure_classes,free_failure_classes,included_quantity,retention_policy,
 'Luna cache-write-complete authority: ceil(11,115 x 1.33)=14,783 micros; rounded to 3 credits = 15,000 micros.',
 encode(extensions.digest(convert_to('forge-standard-customer-hearth-luna-v2:11115:14783:217:15000:3','utf8'),'sha256'),'hex'),
 actor_id,14783,217,15000
from tongs.private_pricing_revisions where id='b4c4472f-0325-4c2e-b2ef-9aef5e59e64a';

insert into tongs.private_pricing_cost_components(
 pricing_revision_id,ordinal,component_code,component_kind,credential_funding,provider_label,
 success_ceiling_micros,failure_ceiling_micros,cost_policy_revision,tail_policy,tail_policy_details
)
select 'b4c4472f-0325-4c2e-b2ef-9aef5e59e64b',ordinal,component_code,component_kind,
 credential_funding,provider_label,
 case when component_code='openai_text' then 1115 else success_ceiling_micros end,
 failure_ceiling_micros,
 case when component_code='openai_text' then 'openai-text:hearth-chat:luna-bounded-pilot-v2' else cost_policy_revision end,
 tail_policy,tail_policy_details
from tongs.private_pricing_cost_components
where pricing_revision_id='b4c4472f-0325-4c2e-b2ef-9aef5e59e64a';

insert into tongs.private_pricing_revision_markup_sources(pricing_revision_id,markup_rule_revision_id,effective_markup_basis_points)
select 'b4c4472f-0325-4c2e-b2ef-9aef5e59e64b',markup_rule_revision_id,3300
from tongs.private_pricing_revision_markup_sources
where pricing_revision_id='b4c4472f-0325-4c2e-b2ef-9aef5e59e64a';

insert into tongs.private_pricing_publications(id,policy_id,pricing_revision_id,publication_revision,action,reason,actor_id)
select 'b4c4472f-0325-4c2e-b2ef-9aef5e59e64c',policy_id,'b4c4472f-0325-4c2e-b2ef-9aef5e59e64b',
 coalesce((select max(publication_revision)+1 from tongs.private_pricing_publications p2 where p2.policy_id=p.policy_id),1),
 'published','Preserve the three-credit customer price while recognizing bounded 30-minute Luna cache writes.',actor_id
from tongs.private_pricing_revisions p where p.id='b4c4472f-0325-4c2e-b2ef-9aef5e59e64a';

-- Stage a fail-closed cutover. A later, separately approved migration must
-- publish catalog/configuration/scope successors and append enforce.
insert into tongs.openai_text_rollout_revisions(route_code,revision,mode,cost_policy_revision_id,reason,actor_id,funding_scope)
select 'hearth.chat_completion',max(revision)+1,'halt_new','10000000-0000-4000-8000-000000000011',
 'Provider-request and cache-write financial-authority alignment staged; explicit owner approval is required before reactivation.',
 (select user_id from tongs.platform_operators order by granted_at limit 1),'all'
from tongs.openai_text_rollout_revisions where route_code='hearth.chat_completion';

-- Preserve the deployed signature. Add the approved cache-write rate to the
-- returned execution context without changing any caller-supplied parameter.
do $$
declare source text; changed text;
begin
  select pg_get_functiondef('tongs.resolve_openai_text_paid_execution_context(text,text,uuid,uuid,uuid,text,text)'::regprocedure) into source;
  changed:=replace(source,
    '''cached_input_micros_per_million_tokens'',v_rate.cached_input_micros_per_million_tokens,',
    '''cached_input_micros_per_million_tokens'',v_rate.cached_input_micros_per_million_tokens,' || chr(10) ||
    '  ''cache_write_micros_per_million_tokens'',coalesce((select rc.cache_write_micros_per_million_tokens from tongs.openai_text_rate_condition_revisions rc where rc.provider_rate_revision_id=v_rate.id and rc.service_tier=''standard'' and rc.lifecycle_state=''approved'' order by rc.revision desc limit 1),0),');
  if changed=source or position('cache_write_micros_per_million_tokens' in changed)=0 then
    raise exception 'paid execution context cache-write patch did not match authoritative definition';
  end if;
  execute changed;
end $$;

notify pgrst,'reload schema';
commit;
