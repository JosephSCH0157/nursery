-- The shared paid-operation coordinator reserves the complete accepted
-- wholesale exposure at the final provider boundary: direct synthesis plus
-- already-authorized attributable supporting work. Supersede the narrower
-- direct-provider-only pilot limit with that exact 76,717-micro ceiling.
begin;

do $$
declare actor uuid;
begin
  if not exists (
    select 1 from tongs.openai_text_failure_loss_policy_revisions
    where id='12000000-0000-4000-8000-000000000006'::uuid
      and route_code='hearth.research_synthesis'
      and environment='production' and revision=1
      and per_operation_limit_micros=45261
      and aggregate_limit_micros=45261
      and lifecycle_state='active'
  ) then
    raise exception 'direct-provider research failure-loss baseline is required';
  end if;
  if not exists (
    select 1 from tongs.openai_text_cost_policy_revisions
    where id='12000000-0000-4000-8000-000000000001'::uuid
      and direct_provider_ceiling_micros=45261
      and supporting_cost_ceiling_micros=31456
      and full_cost_ceiling_micros=76717
      and lifecycle_state='active'
  ) then
    raise exception 'exact complete research wholesale ceiling is required';
  end if;

  select user_id into actor from tongs.platform_operators order by granted_at limit 1;
  if actor is null then raise exception 'platform operator required'; end if;

  insert into tongs.openai_text_failure_loss_policy_revisions(
    id,route_code,environment,revision,per_operation_limit_micros,
    aggregate_limit_micros,rolling_window_seconds,maximum_concurrency,
    lifecycle_state,reason,actor_id
  ) values (
    '12000000-0000-4000-8000-000000000007','hearth.research_synthesis','production',2,
    76717,76717,86400,1,'active',
    'Exact one-operation full wholesale exposure: 45,261 direct synthesis plus 31,456 attributable supporting execution; customer failures remain zero-charge.',
    actor
  );
end $$;

commit;

