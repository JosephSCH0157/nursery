-- Append-only failure attribution corrections and a fresh, explicitly bounded
-- Luna owner retest lane. This migration does not activate or fund anything.
begin;

create table tongs.funding_failure_class_corrections (
  id uuid primary key,
  reservation_id uuid not null references tongs.funding_reservations(id) on delete restrict,
  original_event_id uuid not null references tongs.funding_reservation_events(id) on delete restrict,
  correction_key text not null unique check (length(btrim(correction_key)) between 8 and 300),
  original_failure_class text not null,
  corrected_failure_class text not null check (corrected_failure_class in (
    'forge_validation_failure', 'persistence_failure', 'forge_failure', 'provider_failure'
  )),
  correction_reason text not null check (length(btrim(correction_reason)) between 8 and 2000),
  evidence_json jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_json)='object'),
  corrected_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (original_event_id)
);

create trigger funding_failure_class_corrections_immutable before update or delete
on tongs.funding_failure_class_corrections for each row execute function tongs._reject_accounting_mutation();

alter table tongs.funding_failure_class_corrections enable row level security;
revoke all on tongs.funding_failure_class_corrections from public,anon,authenticated,service_role;
grant select on tongs.funding_failure_class_corrections to service_role;

create or replace function tongs.append_funding_failure_class_correction(
  p_correction_id uuid,p_reservation_id uuid,p_original_event_id uuid,p_correction_key text,
  p_corrected_failure_class text,p_correction_reason text,p_operator_user_id uuid,
  p_evidence_json jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_original tongs.funding_reservation_events%rowtype;
  v_existing tongs.funding_failure_class_corrections%rowtype;
begin
  perform tongs._require_pricing_service_role();
  if p_correction_id is null or p_reservation_id is null or p_original_event_id is null
     or length(btrim(coalesce(p_correction_key,'')))<8
     or p_corrected_failure_class not in ('forge_validation_failure','persistence_failure','forge_failure','provider_failure')
     or length(btrim(coalesce(p_correction_reason,'')))<8
     or p_operator_user_id is null or not tongs.is_platform_operator(p_operator_user_id)
     or jsonb_typeof(coalesce(p_evidence_json,'null'::jsonb))<>'object' then
    raise exception 'invalid failure attribution correction' using errcode='22023';
  end if;
  select * into v_original from tongs.funding_reservation_events
    where id=p_original_event_id and reservation_id=p_reservation_id;
  if not found or v_original.event_type<>'provider_failure_recorded' then
    raise exception 'original failure event not found' using errcode='P0002';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('failure-correction:'||p_original_event_id::text,0));
  select * into v_existing from tongs.funding_failure_class_corrections where original_event_id=p_original_event_id;
  if found then
    if v_existing.correction_key<>btrim(p_correction_key)
       or v_existing.corrected_failure_class<>p_corrected_failure_class then
      raise exception 'failure correction replay conflict' using errcode='23505';
    end if;
    return jsonb_build_object('correction_id',v_existing.id,'replay',true,
      'original_failure_class',v_existing.original_failure_class,
      'effective_failure_class',v_existing.corrected_failure_class);
  end if;
  insert into tongs.funding_failure_class_corrections(
    id,reservation_id,original_event_id,correction_key,original_failure_class,
    corrected_failure_class,correction_reason,evidence_json,corrected_by
  ) values (
    p_correction_id,p_reservation_id,p_original_event_id,btrim(p_correction_key),
    coalesce(v_original.failure_class,'unknown'),p_corrected_failure_class,
    btrim(p_correction_reason),coalesce(p_evidence_json,'{}'::jsonb),p_operator_user_id
  ) returning * into v_existing;
  return jsonb_build_object('correction_id',v_existing.id,'replay',false,
    'original_failure_class',v_existing.original_failure_class,
    'effective_failure_class',v_existing.corrected_failure_class,
    'original_event_preserved',true,'supplier_expense_mutated',false);
end $$;

create or replace function tongs.read_failure_class_corrections(p_limit integer default 250)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_actor uuid:=auth.uid(); v_limit integer:=least(greatest(coalesce(p_limit,250),1),2000);
begin
  if coalesce(auth.role(),'')<>'service_role' and (v_actor is null or not tongs.is_platform_operator(v_actor)) then
    raise exception 'platform operator required' using errcode='42501'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) from (
    select c.id correction_id,c.reservation_id,r.operation_id,c.original_event_id,
      c.original_failure_class,c.corrected_failure_class effective_failure_class,
      c.correction_reason,c.evidence_json,c.corrected_by,c.created_at
    from tongs.funding_failure_class_corrections c
    join tongs.funding_reservations r on r.id=c.reservation_id
    order by c.created_at desc limit v_limit
  )x);
end $$;

create or replace function tongs.activate_owner_hearth_chat_luna_retest(
  p_operator_user_id uuid,p_workspace_id uuid,p_budget_id uuid,
  p_pricing_revision_id uuid,p_failure_loss_policy_revision_id uuid,p_authorization_expires_at timestamptz,
  p_corrected_reservation_id uuid,p_reason text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_now timestamptz:=clock_timestamp(); v_reason text:=nullif(btrim(coalesce(p_reason,'')),'');
  v_control tongs.paid_execution_control_revisions%rowtype;
  v_rollout tongs.openai_text_rollout_revisions%rowtype;
  v_budget tongs.owner_operating_budgets%rowtype;
  v_budget_revision tongs.owner_operating_budget_revisions%rowtype;
  v_budget_active jsonb; v_rollout_revision integer; v_loss_revision integer;
begin
  perform tongs._require_pricing_service_role();
  if p_operator_user_id is null or not tongs.is_platform_operator(p_operator_user_id)
     or p_workspace_id is null or p_budget_id is null or p_pricing_revision_id is null
     or p_failure_loss_policy_revision_id is null
     or p_corrected_reservation_id is null or v_reason is null
     or p_authorization_expires_at<=v_now or p_authorization_expires_at>v_now+interval '24 hours' then
    raise exception 'invalid bounded Luna owner retest activation' using errcode='22023';
  end if;
  if not exists(select 1 from tongs.workspaces w where w.id=p_workspace_id and
    (w.created_by=p_operator_user_id or exists(select 1 from tongs.workspace_members m
      where m.workspace_id=w.id and m.user_id=p_operator_user_id))) then
    raise exception 'operator cannot access retest workspace' using errcode='42501';
  end if;
  if not exists(select 1 from tongs.funding_failure_class_corrections c
    where c.reservation_id=p_corrected_reservation_id
      and c.original_failure_class='provider_failure'
      and c.corrected_failure_class='forge_validation_failure') then
    raise exception 'audited pilot failure correction required' using errcode='P0002';
  end if;
  if not exists(select 1 from tongs.openai_text_model_availability_checks
    where provider_model_id='gpt-5.6-luna' and credential_class='forge_project_scoped'
      and check_kind='model_metadata_read' and accessible and http_status=200) then
    raise exception 'Luna availability check missing' using errcode='P0002';
  end if;
  if not exists(select 1 from tongs.private_pricing_revisions p
    join tongs.private_pricing_policies policy on policy.id=p.policy_id
    where p.id=p_pricing_revision_id
      and p.lifecycle_state='review_ready' and p.full_cost_ceiling_micros=11015
      and p.markup_basis_points=3300 and lower(policy.provider)='openai'
      and lower(policy.sku)='gpt-5.6-luna') then
    raise exception 'exact reviewed Luna pricing revision missing' using errcode='P0002';
  end if;
  select * into v_control from tongs._current_paid_execution_control();
  if not v_control.pricing_activation_enabled or not v_control.owner_budget_spending_enabled
     or not v_control.provider_execution_enabled or v_control.customer_settlement_enabled then
    raise exception 'owner-only provider controls are not safely configured' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('owner-hearth-openai-luna-pilot',0));
  select * into v_budget from tongs.owner_operating_budgets where id=p_budget_id;
  if found then
    select * into v_budget_revision from tongs.owner_operating_budget_revisions
      where budget_id=p_budget_id order by revision desc limit 1;
    if v_budget.created_by<>p_operator_user_id or v_budget.workspace_id is distinct from p_workspace_id
       or v_budget.environment<>'production' or lower(coalesce(v_budget.provider,''))<>'openai'
       or lower(coalesce(v_budget.route,''))<>'hearth.chat_completion'
       or lower(coalesce(v_budget.sku,''))<>'gpt-5.6-luna'
       or v_budget_revision.maximum_amount_micros<>11015 then
      raise exception 'owner Luna retest replay conflict' using errcode='23505'; end if;
    return jsonb_build_object('replay',true,'budget_id',p_budget_id,
      'budget_status',v_budget_revision.status,'maximum_amount_micros',11015);
  end if;
  if exists(select 1 from tongs.owner_operating_budgets b
    join lateral(select r.status from tongs.owner_operating_budget_revisions r
      where r.budget_id=b.id order by r.revision desc limit 1) latest on true
    where b.environment='production' and lower(coalesce(b.provider,''))='openai'
      and lower(coalesce(b.route,''))='hearth.chat_completion' and latest.status='active') then
    raise exception 'another active owner Hearth OpenAI budget exists' using errcode='P0001';
  end if;
  perform set_config('request.jwt.claim.sub',p_operator_user_id::text,true);
  perform tongs.create_owner_operating_budget_draft(
    p_budget_id,'production',p_workspace_id,'openai','hearth.chat_completion','gpt-5.6-luna',
    'USD',v_now-interval '1 second',p_authorization_expires_at,v_reason
  );
  v_budget_active:=tongs.revise_owner_operating_budget(p_budget_id,'active',11015,v_reason);
  select coalesce(max(revision),0)+1 into v_loss_revision from tongs.openai_text_failure_loss_policy_revisions
    where route_code='hearth.chat_completion' and environment='production';
  insert into tongs.openai_text_failure_loss_policy_revisions(
    id,route_code,environment,revision,per_operation_limit_micros,aggregate_limit_micros,
    rolling_window_seconds,maximum_concurrency,lifecycle_state,reason,actor_id
  ) values (p_failure_loss_policy_revision_id,'hearth.chat_completion','production',v_loss_revision,
    11015,11015,86400,1,'active',v_reason,p_operator_user_id);
  select * into v_rollout from tongs._current_openai_text_rollout('hearth.chat_completion');
  if v_rollout.mode not in ('inactive','halt_new') then
    raise exception 'Hearth OpenAI rollout is already active' using errcode='P0001'; end if;
  select coalesce(max(revision),0)+1 into v_rollout_revision from tongs.openai_text_rollout_revisions
    where route_code='hearth.chat_completion';
  insert into tongs.openai_text_rollout_revisions(route_code,revision,mode,cost_policy_revision_id,reason,actor_id)
  values('hearth.chat_completion',v_rollout_revision,'enforce',
    '10000000-0000-4000-8000-000000000010'::uuid,v_reason,p_operator_user_id);
  return jsonb_build_object('replay',false,'budget',v_budget_active,'budget_id',p_budget_id,
    'maximum_amount_micros',11015,'rollout_mode','enforce','rollout_revision',v_rollout_revision,
    'failure_loss_policy_revision',v_loss_revision,'customer_settlement_enabled',false,
    'pricing_published',false,'maximum_attempts',1,'maximum_concurrency',1);
end $$;

revoke all on function tongs.append_funding_failure_class_correction(uuid,uuid,uuid,text,text,text,uuid,jsonb)
  from public,anon,authenticated;
grant execute on function tongs.append_funding_failure_class_correction(uuid,uuid,uuid,text,text,text,uuid,jsonb)
  to service_role;
revoke all on function tongs.read_failure_class_corrections(integer) from public,anon;
grant execute on function tongs.read_failure_class_corrections(integer) to authenticated,service_role;
revoke all on function tongs.activate_owner_hearth_chat_luna_retest(uuid,uuid,uuid,uuid,uuid,timestamptz,uuid,text)
  from public,anon,authenticated;
grant execute on function tongs.activate_owner_hearth_chat_luna_retest(uuid,uuid,uuid,uuid,uuid,timestamptz,uuid,text)
  to service_role;

comment on table tongs.funding_failure_class_corrections is
  'Append-only operator audit corrections. Original reservation events and supplier expenses remain immutable.';
comment on function tongs.activate_owner_hearth_chat_luna_retest(uuid,uuid,uuid,uuid,uuid,timestamptz,uuid,text) is
  'Creates one fresh $0.011015 owner-only Luna retest budget after the original provider-blame event has an audited Forge-validation correction.';

notify pgrst,'reload schema';
commit;
