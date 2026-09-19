-- Supply the mandatory Forge-funded provider failure-loss boundary for the
-- standard-customer Hearth research route. Test and Live use the same
-- application path; Live remains inactive through its financial environment.
begin;

do $$
declare actor uuid;
begin
  if not exists (
    select 1 from tongs.openai_text_cost_policy_revisions
    where id='12000000-0000-4000-8000-000000000001'::uuid
      and route_code='hearth.research_synthesis'
      and direct_provider_ceiling_micros=45261
      and lifecycle_state='active'
  ) then
    raise exception 'active standard-customer Hearth research cost policy is required';
  end if;
  if not exists (
    select 1 from tongs.openai_text_rollout_revisions
    where route_code='hearth.research_synthesis' and revision=3
      and mode='enforce'
      and cost_policy_revision_id='12000000-0000-4000-8000-000000000001'::uuid
  ) then
    raise exception 'standard-customer Hearth research rollout is not active';
  end if;
  if exists (
    select 1 from tongs.openai_text_failure_loss_policy_revisions
    where route_code='hearth.research_synthesis' and environment='production'
      and lifecycle_state='active'
  ) then
    raise exception 'an active Hearth research failure-loss policy already exists';
  end if;

  select user_id into actor from tongs.platform_operators order by granted_at limit 1;
  if actor is null then raise exception 'platform operator required'; end if;

  insert into tongs.openai_text_failure_loss_policy_revisions(
    id,route_code,environment,revision,per_operation_limit_micros,
    aggregate_limit_micros,rolling_window_seconds,maximum_concurrency,
    lifecycle_state,reason,actor_id
  ) values (
    '12000000-0000-4000-8000-000000000006','hearth.research_synthesis','production',1,
    45261,45261,86400,1,'active',
    'One bounded Luna synthesis attempt at the exact direct-provider ceiling; customer failures remain zero-charge.',
    actor
  );
end $$;

comment on table tongs.openai_text_failure_loss_policy_revisions is
  'Immutable Forge-funded provider failure-loss limits. Standard-customer Hearth research is limited to one 45,261-micro synthesis exposure at a time; this does not activate Live customer funding.';

commit;

