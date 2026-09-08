-- Auditable, service-role-only activation and closure controls for the approved
-- bounded Hearth/OpenAI owner pilot. This migration creates no budget, quote,
-- reservation, pricing publication, or provider authorization by itself.

begin;

create table tongs.openai_text_activation_decisions (
  id uuid primary key,
  proposal_id uuid not null references tongs.openai_text_activation_proposals(id) on delete restrict,
  decision text not null check (decision in ('approved','rejected','expired')),
  operator_user_id uuid not null references auth.users(id) on delete restrict,
  reason text not null check (nullif(btrim(reason),'') is not null),
  created_at timestamptz not null default now(),
  unique (proposal_id)
);

create trigger openai_text_activation_decisions_immutable
before update or delete on tongs.openai_text_activation_decisions
for each row execute function tongs._reject_accounting_mutation();

alter table tongs.openai_text_activation_decisions enable row level security;
alter table tongs.openai_text_activation_decisions force row level security;
revoke all on tongs.openai_text_activation_decisions from public, anon, authenticated;
grant select, insert on tongs.openai_text_activation_decisions to service_role;

create or replace function tongs.activate_owner_hearth_chat_pilot(
  p_operator_user_id uuid,
  p_workspace_id uuid,
  p_budget_id uuid,
  p_pricing_policy_id uuid,
  p_pricing_revision_id uuid,
  p_markup_rule_revision_id uuid,
  p_failure_loss_policy_revision_id uuid,
  p_decision_id uuid,
  p_authorization_expires_at timestamptz,
  p_reason text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_now timestamptz:=clock_timestamp();
  v_reason text:=nullif(btrim(coalesce(p_reason,'')),'');
  v_rules tongs.private_markup_rule_revisions%rowtype;
  v_current_rollout tongs.openai_text_rollout_revisions%rowtype;
  v_control tongs.paid_execution_control_revisions%rowtype;
  v_budget tongs.owner_operating_budgets%rowtype;
  v_budget_revision tongs.owner_operating_budget_revisions%rowtype;
  v_pricing jsonb;
  v_budget_draft jsonb;
  v_budget_active jsonb;
  v_rollout_revision integer;
  v_loss_revision integer;
begin
  perform tongs._require_pricing_service_role();
  if p_operator_user_id is null or not tongs.is_platform_operator(p_operator_user_id)
     or p_workspace_id is null or p_budget_id is null or p_pricing_policy_id is null
     or p_pricing_revision_id is null or p_markup_rule_revision_id is null
     or p_failure_loss_policy_revision_id is null or p_decision_id is null
     or v_reason is null or p_authorization_expires_at<=v_now
     or p_authorization_expires_at>v_now+interval '24 hours' then
    raise exception 'invalid bounded owner Hearth pilot activation' using errcode='22023';
  end if;
  if not exists(select 1 from tongs.workspaces w where w.id=p_workspace_id and
    (w.created_by=p_operator_user_id or exists(select 1 from tongs.workspace_members m
      where m.workspace_id=w.id and m.user_id=p_operator_user_id))) then
    raise exception 'operator cannot access pilot workspace' using errcode='42501';
  end if;
  select * into v_rules from tongs.private_markup_rule_revisions where id=p_markup_rule_revision_id;
  if not found or v_rules.default_markup_basis_points<>3300
     or tongs._effective_markup_basis_points(v_rules.id,'openai','gpt-5.3-chat-latest')<>3300 then
    raise exception 'approved 33 percent markup revision required' using errcode='P0001';
  end if;
  if not exists(select 1 from tongs.openai_text_activation_proposals p
    where p.id='30000000-0000-4000-8000-000000000001'::uuid
      and p.route_code='hearth.chat_completion'
      and p.cost_policy_revision_id='10000000-0000-4000-8000-000000000009'::uuid
      and p.model='gpt-5.3-chat-latest' and p.maximum_input_units=2000
      and p.maximum_output_units=512 and p.maximum_attempts=1
      and p.direct_provider_ceiling_micros=10668
      and p.supporting_cost_ceiling_micros=10000
      and p.total_cost_ceiling_micros=20668
      and p.proposed_owner_budget_micros=30000
      and p.authorization_window_seconds=86400) then
    raise exception 'exact bounded Hearth activation proposal missing' using errcode='P0002';
  end if;
  select * into v_control from tongs._current_paid_execution_control();
  if not v_control.pricing_activation_enabled or not v_control.owner_budget_spending_enabled
     or not v_control.provider_execution_enabled or v_control.customer_settlement_enabled then
    raise exception 'owner-only provider controls are not safely configured' using errcode='42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('owner-hearth-openai-pilot',0));
  select * into v_budget from tongs.owner_operating_budgets where id=p_budget_id;
  if found then
    select * into v_budget_revision from tongs.owner_operating_budget_revisions
      where budget_id=p_budget_id order by revision desc limit 1;
    if v_budget.environment<>'production' or v_budget.workspace_id is distinct from p_workspace_id
       or lower(coalesce(v_budget.provider,''))<>'openai'
       or lower(coalesce(v_budget.route,''))<>'hearth.chat_completion'
       or lower(coalesce(v_budget.sku,''))<>'gpt-5.3-chat-latest'
       or v_budget.currency<>'USD' or v_budget_revision.status not in ('active','closed')
       or v_budget_revision.maximum_amount_micros<>30000 then
      raise exception 'owner Hearth pilot activation replay conflict' using errcode='23505';
    end if;
    return jsonb_build_object('replay',true,'budget_id',p_budget_id,
      'budget_status',v_budget_revision.status,'maximum_amount_micros',30000,
      'customer_settlement_enabled',false);
  end if;
  if exists(select 1 from tongs.owner_operating_budgets b
    join lateral(select r.status from tongs.owner_operating_budget_revisions r
      where r.budget_id=b.id order by r.revision desc limit 1) latest on true
    where b.environment='production' and lower(coalesce(b.provider,''))='openai'
      and lower(coalesce(b.route,''))='hearth.chat_completion' and latest.status='active') then
    raise exception 'another active owner Hearth OpenAI budget exists' using errcode='P0001';
  end if;

  perform set_config('request.jwt.claim.sub',p_operator_user_id::text,true);
  v_pricing:=tongs.commit_operator_pricing_revision(
    p_markup_rule_revision_id,p_pricing_policy_id,
    'owner-openai-hearth-chat-bounded-pilot','sku','openai','gpt-5.3-chat-latest',0,
    p_pricing_revision_id,3,'USD',
    jsonb_build_array(
      jsonb_build_object('component_code','openai_text','component_kind','direct_provider',
        'credential_funding','forge','provider_label','OpenAI','success_ceiling_micros',10668,
        'failure_ceiling_micros',0,'cost_policy_revision','openai-text:hearth-chat:bounded-pilot-v1',
        'tail_policy','none'),
      jsonb_build_object('component_code','bounded_support','component_kind','compute',
        'credential_funding','forge','provider_label','Forge validation and persistence',
        'success_ceiling_micros',10000,'failure_ceiling_micros',0,
        'cost_policy_revision','openai-text:hearth-chat:bounded-pilot-v1','tail_policy','none')
    ),
    '[]'::jsonb,'["provider_failure","forge_failure","unknown_fault"]'::jsonb,
    '{"input_tokens":2000,"output_tokens":512,"attempts":1,"concurrency":1}'::jsonb,
    '{"kind":"none"}'::jsonb,v_reason
  );
  v_budget_draft:=tongs.create_owner_operating_budget_draft(
    p_budget_id,'production',p_workspace_id,'openai','hearth.chat_completion',
    'gpt-5.3-chat-latest','USD',v_now,p_authorization_expires_at,v_reason
  );
  v_budget_active:=tongs.revise_owner_operating_budget(p_budget_id,'active',30000,v_reason);

  select coalesce(max(revision),0)+1 into v_loss_revision
    from tongs.openai_text_failure_loss_policy_revisions
    where route_code='hearth.chat_completion' and environment='production';
  insert into tongs.openai_text_failure_loss_policy_revisions(
    id,route_code,environment,revision,per_operation_limit_micros,aggregate_limit_micros,
    rolling_window_seconds,maximum_concurrency,lifecycle_state,reason,actor_id
  ) values (
    p_failure_loss_policy_revision_id,'hearth.chat_completion','production',v_loss_revision,
    20668,20668,86400,1,'active',v_reason,p_operator_user_id
  );
  select * into v_current_rollout from tongs._current_openai_text_rollout('hearth.chat_completion');
  if v_current_rollout.mode not in ('inactive','halt_new') then
    raise exception 'Hearth OpenAI rollout is already active' using errcode='P0001';
  end if;
  select coalesce(max(revision),0)+1 into v_rollout_revision
    from tongs.openai_text_rollout_revisions where route_code='hearth.chat_completion';
  insert into tongs.openai_text_rollout_revisions(
    route_code,revision,mode,cost_policy_revision_id,reason,actor_id
  ) values (
    'hearth.chat_completion',v_rollout_revision,'enforce',
    '10000000-0000-4000-8000-000000000009',v_reason,p_operator_user_id
  );
  insert into tongs.openai_text_activation_decisions(
    id,proposal_id,decision,operator_user_id,reason
  ) values (
    p_decision_id,'30000000-0000-4000-8000-000000000001','approved',p_operator_user_id,v_reason
  );
  return jsonb_build_object(
    'replay',false,'budget',v_budget_active,'pricing',v_pricing,
    'rollout_revision',v_rollout_revision,'rollout_mode','enforce',
    'failure_loss_policy_revision',v_loss_revision,'maximum_amount_micros',30000,
    'customer_settlement_enabled',false,'pricing_published',false
  );
end $$;

create or replace function tongs.close_owner_hearth_chat_pilot(
  p_operator_user_id uuid,
  p_budget_id uuid,
  p_reason text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_reason text:=nullif(btrim(coalesce(p_reason,'')),'');
  v_budget tongs.owner_operating_budgets%rowtype;
  v_budget_revision tongs.owner_operating_budget_revisions%rowtype;
  v_rollout tongs.openai_text_rollout_revisions%rowtype;
  v_next_rollout integer;
  v_closed jsonb;
begin
  perform tongs._require_pricing_service_role();
  if p_operator_user_id is null or not tongs.is_platform_operator(p_operator_user_id)
     or p_budget_id is null or v_reason is null then
    raise exception 'invalid owner Hearth pilot closure' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('owner-hearth-openai-pilot',0));
  select * into v_budget from tongs.owner_operating_budgets where id=p_budget_id for update;
  select * into v_budget_revision from tongs.owner_operating_budget_revisions
    where budget_id=p_budget_id order by revision desc limit 1;
  if not found or v_budget.created_by<>p_operator_user_id or v_budget.environment<>'production'
     or lower(coalesce(v_budget.provider,''))<>'openai'
     or lower(coalesce(v_budget.route,''))<>'hearth.chat_completion'
     or lower(coalesce(v_budget.sku,''))<>'gpt-5.3-chat-latest'
     or v_budget_revision.maximum_amount_micros<>30000 then
    raise exception 'exact owner Hearth pilot budget not found' using errcode='P0002';
  end if;
  if exists(select 1 from tongs.funding_reservations r
    where r.funding_source_type='owner_budget' and r.funding_source_id=p_budget_id
      and tongs._funding_reservation_state(r.id) not in ('settled','released')) then
    raise exception 'owner Hearth pilot has unresolved funding reservations' using errcode='P0001';
  end if;
  select * into v_rollout from tongs._current_openai_text_rollout('hearth.chat_completion');
  if v_rollout.mode<>'halt_new' then
    select coalesce(max(revision),0)+1 into v_next_rollout
      from tongs.openai_text_rollout_revisions where route_code='hearth.chat_completion';
    insert into tongs.openai_text_rollout_revisions(
      route_code,revision,mode,cost_policy_revision_id,reason,actor_id
    ) values (
      'hearth.chat_completion',v_next_rollout,'halt_new',v_rollout.cost_policy_revision_id,
      v_reason,p_operator_user_id
    );
  else
    v_next_rollout:=v_rollout.revision;
  end if;
  if v_budget_revision.status<>'closed' then
    perform set_config('request.jwt.claim.sub',p_operator_user_id::text,true);
    v_closed:=tongs.revise_owner_operating_budget(p_budget_id,'closed',30000,v_reason);
  else
    v_closed:=jsonb_build_object('budget_id',p_budget_id,'revision',v_budget_revision.revision,
      'status','closed','maximum_amount_micros',30000,'spending_enabled',false);
  end if;
  return jsonb_build_object('budget',v_closed,'rollout_mode','halt_new',
    'rollout_revision',v_next_rollout,'new_reservations_enabled',false);
end $$;

revoke all on function tongs.activate_owner_hearth_chat_pilot(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,timestamptz,text)
  from public,anon,authenticated;
grant execute on function tongs.activate_owner_hearth_chat_pilot(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,timestamptz,text)
  to service_role;
revoke all on function tongs.close_owner_hearth_chat_pilot(uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function tongs.close_owner_hearth_chat_pilot(uuid,uuid,text)
  to service_role;

comment on function tongs.activate_owner_hearth_chat_pilot(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,timestamptz,text) is
  'Service-role-only exact activation for the approved 0.03 USD owner Hearth/OpenAI pilot; customer settlement and pricing publication remain disabled.';
comment on function tongs.close_owner_hearth_chat_pilot(uuid,uuid,text) is
  'Closes the exact owner pilot budget and moves the Hearth OpenAI route to halt_new after all reservations are terminal.';

commit;
