-- LOCAL CERTIFICATION FIXTURE ONLY. Never place this file under
-- supabase/migrations and never execute it against a linked database.
--
-- Supplies only the operator-created configuration rows that
-- 20261011720000 and 20261011730000 require on blank replay. Every value is
-- taken from those migrations' own guards or from the repository test
-- supabase/tests/runway_paid_execution_boundary.sql. It creates no user,
-- balance, deposit, quote, reservation, provider task, or accounting row.

begin;

do $$
begin
  if current_setting('forge.local_historical_replay', true)
       is distinct from 'post-checkpoint-v1' then
    raise exception 'local post-checkpoint replay guard is missing' using errcode='42501';
  end if;
  -- Only the disposable replay database carries the mid-September fixture operator.
  if not exists (
    select 1 from tongs.platform_operators
    where user_id='fe000000-0000-4000-8000-000000000001'
      and reason='Local-only historical prerequisite for 20260916110806'
  ) then
    raise exception 'post-checkpoint fixture requires the local replay fixture operator'
      using errcode='42501';
  end if;
  if not exists (
    select 1 from supabase_migrations.schema_migrations
    where version='20261011710000'
  ) or exists (
    select 1 from supabase_migrations.schema_migrations
    where version>'20261011710000'
  ) then
    raise exception 'post-checkpoint fixture requires the exact 20261011710000 boundary'
      using errcode='P0001';
  end if;
  if not exists (
       select 1 from tongs.openai_text_rollout_revisions
       where route_code='motion.broll_interpretation' and revision=2
         and mode='halt_new' and funding_scope='forge'
         and cost_policy_revision_id is null
         and reason='Synthetic historical replay of the approved 2026-09-12 coordinated OpenAI cutover; not production authority.'
     )
     or exists (select 1 from tongs.openai_text_rollout_revisions
       where route_code='motion.broll_interpretation' and revision>2)
  then
    raise exception 'post-checkpoint fixture requires the coordinated-cutover motion revision 2'
      using errcode='P0001';
  end if;
  if exists (select 1 from tongs.runway_execution_rollout_revisions where revision>=2)
     or exists (select 1 from tongs.private_pricing_policies
      where scope_kind='sku' and lower(provider)='runway' and lower(sku)='gen4.5:5s:1280:720') then
    raise exception 'post-checkpoint prerequisites already exist' using errcode='23505';
  end if;
end $$;

-- 20261011730000 guard: the existing Runway paid-execution boundary must be enforced.
insert into tongs.runway_execution_rollout_revisions(revision,mode,reason,actor_id)
values (
  2,'enforce',
  'Local-only replay prerequisite for 20261011730000 enforced Runway boundary.',
  null
);

-- 20261011730000 guard: owner-pilot Runway SKU policy with draft revision 1 at 750000 micros,
-- committed through the canonical operator RPC using the repository boundary-test cost stack.
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','fe000000-0000-4000-8000-000000000001',true);
select tongs.commit_private_pricing_revision(
  'fe000000-0000-4000-8000-000000000310','owner-runway-gen45-5s-16x9',
  'sku','runway','gen4.5:5s:1280:720',0,
  'fe000000-0000-4000-8000-000000000311',null,null,'usd',
  jsonb_build_array(
    jsonb_build_object('component_code','runway-generation','component_kind','direct_provider',
      'credential_funding','forge','provider_label','Runway','success_ceiling_micros',600000,
      'failure_ceiling_micros',600000,'cost_policy_revision','runway-12-credits-per-second-2026-09-07',
      'tail_policy','none'),
    jsonb_build_object('component_code','forge-processing','component_kind','compute',
      'credential_funding','forge','provider_label','Forge compute','success_ceiling_micros',75000,
      'failure_ceiling_micros',75000,'cost_policy_revision','test-support-ceiling-v1',
      'tail_policy','none'),
    jsonb_build_object('component_code','retained-output','component_kind','retention_tail',
      'credential_funding','forge','provider_label','Supabase Storage','success_ceiling_micros',75000,
      'failure_ceiling_micros',0,'cost_policy_revision','test-support-ceiling-v1',
      'tail_policy','included_until','tail_policy_details',jsonb_build_object('included_until','2026-10-07T00:00:00Z'))
  ),
  '["provider_billed_failure"]','["prebilling_rejection"]','{"duration_seconds":5,"outputs":1}',
  '{"kind":"included_until","included_until":"2026-10-07T00:00:00Z"}',
  'Local-only replay prerequisite for 20261011730000 historical owner-pilot Runway revision.'
);
select set_config('request.jwt.claim.role','',true);
select set_config('request.jwt.claim.sub','',true);

do $$
begin
  if not exists (
    select 1 from tongs.private_pricing_revisions revision
    join tongs.private_pricing_policies policy on policy.id=revision.policy_id
    where policy.scope_kind='sku' and lower(policy.provider)='runway'
      and lower(policy.sku)='gen4.5:5s:1280:720'
      and revision.revision=1 and revision.lifecycle_state='draft'
      and revision.full_cost_ceiling_micros=750000
  ) then
    raise exception 'owner-pilot Runway draft revision was not established';
  end if;
  if exists (select 1 from tongs.private_pricing_publications publication
      where publication.pricing_revision_id='fe000000-0000-4000-8000-000000000311') then
    raise exception 'owner-pilot Runway revision must remain unpublished';
  end if;
  if exists (select 1 from tongs.customer_deposits)
     or exists (select 1 from tongs.customer_spending_quotes where tool='tongs_broll_v2')
     or exists (select 1 from tongs.funding_reservations
       where operation_id like 'forge:broll:%')
     or exists (select 1 from tongs.runway_funding_bindings)
     or exists (select 1 from tongs.runway_submission_boundary_events) then
    raise exception 'post-checkpoint fixture created forbidden financial state';
  end if;
end $$;

commit;
