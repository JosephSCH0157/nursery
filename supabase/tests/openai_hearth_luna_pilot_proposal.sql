begin;

do $$ begin
  if not exists (
    select 1 from tongs.openai_text_model_availability_checks
    where id='56560000-0000-4000-8000-000000000002'
      and provider_model_id='gpt-5.6-luna' and credential_class='forge_project_scoped'
      and check_kind='model_metadata_read' and accessible and http_status=200
      and evidence_json->>'generating_request'='false'
      and evidence_json->>'credential_value_recorded'='false'
  ) then raise exception 'non-generating Luna availability evidence missing'; end if;

  if not exists (
    select 1 from tongs.openai_text_provider_rate_revisions
    where id='56560000-0000-4000-8000-000000000001'
      and input_micros_per_million_tokens=200000
      and cached_input_micros_per_million_tokens=20000
      and output_micros_per_million_tokens=1200000
  ) then raise exception 'exact Luna rate revision missing'; end if;

  if not exists (
    select 1 from tongs.openai_text_cost_policy_revisions
    where id='10000000-0000-4000-8000-000000000010'
      and maximum_input_units=2000 and maximum_output_units=512 and maximum_attempts=1
      and direct_provider_ceiling_micros=1015 and supporting_cost_ceiling_micros=10000
      and full_cost_ceiling_micros=11015 and lifecycle_state='pilot_candidate'
  ) then raise exception 'exact Luna cost policy missing'; end if;

  if not exists (
    select 1 from tongs.openai_text_activation_proposals
    where id='30000000-0000-4000-8000-000000000002'
      and model='gpt-5.6-luna' and status='awaiting_owner_approval'
      and total_cost_ceiling_micros=11015 and proposed_owner_budget_micros=11015
      and markup_basis_points=3300 and rounded_customer_price_micros=20000
  ) then raise exception 'inactive Luna activation proposal missing'; end if;

  if exists (
    select 1 from tongs.owner_operating_budgets
    where lower(coalesce(provider,''))='openai' and lower(coalesce(sku,''))='gpt-5.6-luna'
  ) then raise exception 'proposal created an owner budget'; end if;

  if exists (
    select 1 from tongs.private_pricing_publications publication
    join tongs.private_pricing_revisions revision on revision.id=publication.pricing_revision_id
    join tongs.private_pricing_policies policy on policy.id=revision.policy_id
    where lower(coalesce(policy.provider,''))='openai' and lower(coalesce(policy.sku,''))='gpt-5.6-luna'
  ) then raise exception 'proposal published customer pricing'; end if;

  if (select lifecycle_state from tongs.openai_text_failure_loss_policy_revisions
      where id='20000000-0000-4000-8000-000000000003')<>'draft' then
    raise exception 'proposal activated the loss budget'; end if;
end $$;

set local request.jwt.claim.role='authenticated';
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ begin
  if has_table_privilege('authenticated','tongs.openai_text_model_availability_checks','select') then
    raise exception 'model availability evidence leaked to authenticated users';
  end if;
  if has_table_privilege('authenticated','tongs.openai_text_provider_rate_revisions','select') then
    raise exception 'private Luna rate leaked to authenticated users';
  end if;
end $$;

rollback;
