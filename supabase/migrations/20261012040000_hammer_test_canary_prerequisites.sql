-- Establish the two inert Test prerequisites approved for a later Hammer
-- transcript-cleanup owner canary:
--   * the canonical owner's explicit GPT-5.4 Mini operation override; and
--   * one active, unassigned Test aggregate policy for the exact Hammer/Mini
--     capability.
--
-- This migration creates no execution scope, aggregate assignment, quote,
-- reservation, exposure hold, provider-attempt authority, or rollout change.
begin;

do $$
declare
  v_owner uuid;
  v_mini_selection_key uuid;
  v_prior_subject text := current_setting('request.jwt.claim.sub', true);
  v_prior_role text := current_setting('request.jwt.claim.role', true);
  v_override jsonb;
begin
  select user_id into v_owner
  from tongs.account_authority_classifications
  where account_class = 'owner';

  if v_owner is null
     or (select count(*) from tongs.account_authority_classifications where account_class = 'owner') <> 1
     or not tongs._transition_owner_authority_agrees(v_owner)
     or not exists (select 1 from tongs.platform_operators where user_id = v_owner) then
    raise exception 'canonical owner authority is absent, ambiguous, or disagrees';
  end if;

  if (select financial_environment from tongs.financial_runtime_environment_revisions order by revision desc limit 1) <> 'test' then
    raise exception 'canonical financial environment must remain Test';
  end if;
  if not exists (
    select 1 from tongs.openai_text_rollout_revisions
    where route_code = 'hammer.transcript_cleanup'
      and revision = 3 and mode = 'halt_new' and funding_scope = 'forge'
  ) or (select revision from tongs.openai_text_rollout_revisions
        where route_code = 'hammer.transcript_cleanup' order by revision desc limit 1) <> 3 then
    raise exception 'Hammer halt_new revision 3 authority drifted';
  end if;
  if exists (
    select 1 from tongs.customer_paid_execution_scope_authorizations
    where route_code = 'hammer.transcript_cleanup'
  ) then raise exception 'Hammer execution scope unexpectedly exists'; end if;
  if exists (
    select 1 from tongs.paid_execution_aggregate_assignments assignment
    join tongs.restricted_beta_policy_capabilities capability
      on capability.policy_revision_id = assignment.policy_revision_id
    where capability.capability_code = 'openai.text.hammer_cleanup'
  ) then raise exception 'Hammer aggregate assignment unexpectedly exists'; end if;
  if exists (
    select 1 from tongs.openai_text_customer_quote_bindings
    where route_code = 'hammer.transcript_cleanup'
  ) or exists (
    select 1 from tongs.openai_text_funding_bindings
    where route_code = 'hammer.transcript_cleanup'
  ) or exists (
    select 1 from tongs.paid_operation_aggregate_bindings
    where capability_code = 'openai.text.hammer_cleanup'
  ) or exists (
    select 1 from tongs.restricted_beta_exposure_holds hold_row
    join tongs.restricted_beta_policy_capabilities capability
      on capability.id = hold_row.capability_term_id
    where capability.capability_code = 'openai.text.hammer_cleanup'
  ) then raise exception 'Hammer financial activity unexpectedly exists'; end if;

  if exists (select 1 from tongs.ai_model_preference_revisions where user_id = v_owner)
     or exists (
       select 1 from tongs.ai_operation_model_override_revisions
       where user_id = v_owner and operation_code = 'hammer.transcript_cleanup'
     ) then raise exception 'owner model preference baseline drifted'; end if;

  select eligible.customer_selection_key into v_mini_selection_key
  from tongs._eligible_ai_models_for_operation('hammer.transcript_cleanup') eligible
  where eligible.runtime_model_id = 'gpt-5.4-mini'
    and eligible.display_name = 'GPT-5.4 Mini'
    and eligible.customer_credit_units = 46;
  if v_mini_selection_key is null then
    raise exception 'GPT-5.4 Mini is not exact eligible 46-credit Hammer authority';
  end if;
  if (select count(*) from tongs._eligible_ai_models_for_operation('hammer.transcript_cleanup')) <> 3 then
    raise exception 'Hammer eligible model set drifted';
  end if;
  if (select count(*) from tongs.private_markup_rule_revisions) <> 1
     or not exists (
       select 1 from tongs.private_markup_rule_revisions
       where revision = 1 and default_markup_basis_points = 3300 and overrides_json = '[]'::jsonb
     ) then raise exception 'canonical 3300-basis-point markup authority drifted'; end if;
  if (select jsonb_agg(customer_credit_units order by customer_credit_units)
      from tongs.private_pricing_revisions
      where id in (
        '40010000-0000-4000-8000-000000000402',
        '40010000-0000-4000-8000-000000000412',
        '40010000-0000-4000-8000-000000000422'
      )) <> '[46,129,258]'::jsonb then
    raise exception 'Hammer customer prices drifted';
  end if;

  if not exists (
    select 1 from tongs.openai_text_failure_loss_policy_revisions
    where route_code = 'hammer.transcript_cleanup' and environment = 'test'
      and revision = 1 and lifecycle_state = 'active'
      and per_operation_limit_micros = 967680
      and aggregate_limit_micros = 967680
      and rolling_window_seconds = 86400 and maximum_concurrency = 1
  ) then raise exception 'Hammer Test failure-loss authority drifted'; end if;
  if exists (
    select 1 from tongs.restricted_beta_policy_capabilities
    where capability_code = 'openai.text.hammer_cleanup' and admission_mode <> 'block'
  ) or exists (
    select 1 from tongs.restricted_beta_cost_evidence_revisions
    where capability_code = 'openai.text.hammer_cleanup'
  ) then raise exception 'Hammer aggregate authority unexpectedly exists'; end if;
  if coalesce((select max(revision) from tongs.restricted_beta_policy_revisions where environment = 'test'), 0) <> 2 then
    raise exception 'Test aggregate policy revision baseline drifted';
  end if;

  -- Invoke the existing authenticated, provider-neutral append-only RPC. The
  -- canonical owner was resolved from authority above; no owner identifier or
  -- preference row is hard-coded and no global preference is created.
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  v_override := tongs.set_my_ai_operation_model_override(
    'hammer.transcript_cleanup', v_mini_selection_key, 0
  );
  perform set_config('request.jwt.claim.sub', coalesce(v_prior_subject, ''), true);
  perform set_config('request.jwt.claim.role', coalesce(v_prior_role, ''), true);

  if v_override->>'state' <> 'specific'
     or v_override->>'display_name' <> 'GPT-5.4 Mini'
     or coalesce((v_override->>'available')::boolean, false) is not true then
    raise exception 'canonical Hammer Mini override RPC did not resolve exactly';
  end if;
end
$$;

insert into tongs.restricted_beta_cost_evidence_revisions(
  id, capability_code, revision, evidence_state, coverage_state,
  source_reference, observed_at, valid_until, included_capacity_json,
  reserved_headroom_json, latency_json, hard_cap_scope, notes
) values (
  '40010000-0000-4000-8000-000000000702',
  'openai.text.hammer_cleanup', 1, 'verified_rate', 'complete',
  'Forge Slice 4 GPT-5.4 Mini cost policy 40010000-0000-4000-8000-000000000301',
  clock_timestamp(), clock_timestamp() + interval '30 days',
  jsonb_build_object(
    'runtime_model', 'gpt-5.4-mini',
    'maximum_input_tokens', 128000,
    'maximum_output_tokens', 16384,
    'maximum_attempts', 1,
    'verified_direct_provider_ceiling_micros', 169728
  ),
  jsonb_build_object('approved_test_envelope_micros', 967680),
  '{}'::jsonb,
  'One exact Hammer transcript-cleanup GPT-5.4 Mini operation in Test.',
  'Existing complete cost authority is bounded beneath the separately approved 967,680-micro Test aggregate envelope.'
);

insert into tongs.restricted_beta_policy_revisions(
  id, environment, revision, lifecycle_state,
  aggregate_forge_exposure_limit_micros, reserved_headroom_micros,
  maximum_concurrency, rolling_window_seconds, evidence_max_age_seconds,
  reason
) values (
  '40010000-0000-4000-8000-000000000701', 'test', 3, 'active',
  967680, 0, 1, 86400, 2592000,
  'Approved Hammer transcript-cleanup Test prerequisite; inert without an assignment and while Hammer rollout remains halt_new.'
);

insert into tongs.restricted_beta_policy_capabilities(
  id, policy_revision_id, capability_code, admission_mode,
  cost_evidence_revision_id, maximum_attempts, maximum_concurrency,
  per_operation_supplier_ceiling_micros,
  per_operation_supporting_ceiling_micros,
  per_operation_tail_ceiling_micros, permitted_callers_json,
  exact_model_or_sku, notes
) values (
  '40010000-0000-4000-8000-000000000703',
  '40010000-0000-4000-8000-000000000701',
  'openai.text.hammer_cleanup', 'covered',
  '40010000-0000-4000-8000-000000000702',
  1, 1, 967680, 0, 0, '["interactive","recovery"]'::jsonb,
  'gpt-5.4-mini',
  'Exact owner-selected Hammer Mini Test term; no fallback, assignment, Live authority, or rollout activation.'
);

do $$
declare
  v_owner uuid;
  v_resolved jsonb;
  v_prior_role text := current_setting('request.jwt.claim.role', true);
begin
  select user_id into v_owner
  from tongs.account_authority_classifications
  where account_class = 'owner';
  perform set_config('request.jwt.claim.role', 'service_role', true);
  v_resolved := tongs.resolve_openai_text_model_for_quote(
    v_owner, 'hammer.transcript_cleanup', 'forge'
  );
  perform set_config('request.jwt.claim.role', coalesce(v_prior_role, ''), true);
  if v_resolved->>'runtime_model_id' <> 'gpt-5.4-mini'
     or v_resolved->>'preference_source' <> 'operation_override' then
    raise exception 'authoritative Hammer resolution did not retain explicit Mini override';
  end if;
  if exists (select 1 from tongs.ai_model_preference_revisions where user_id = v_owner)
     or (select count(*) from tongs.ai_operation_model_override_revisions
         where user_id = v_owner and operation_code = 'hammer.transcript_cleanup') <> 1 then
    raise exception 'global preference or duplicate Hammer override was created';
  end if;
  if (select mode from tongs.openai_text_rollout_revisions
      where route_code = 'hammer.transcript_cleanup' order by revision desc limit 1) <> 'halt_new'
     or exists (select 1 from tongs.customer_paid_execution_scope_authorizations
                where route_code = 'hammer.transcript_cleanup')
     or exists (
       select 1 from tongs.paid_execution_aggregate_assignments assignment
       where assignment.policy_revision_id = '40010000-0000-4000-8000-000000000701'
     ) then raise exception 'Hammer prerequisite authority became operational'; end if;
end
$$;

notify pgrst, 'reload schema';
commit;
