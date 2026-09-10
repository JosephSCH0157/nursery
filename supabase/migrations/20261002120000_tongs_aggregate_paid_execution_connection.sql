-- Connect existing paid OpenAI text and Runway execution boundaries to the
-- aggregate Forge-exposure gate. This release creates no assignment, active
-- policy, funding, price, credential, or provider execution authorization.
begin;

alter table tongs.restricted_beta_exposure_events
  drop constraint restricted_beta_exposure_events_event_type_check;
alter table tongs.restricted_beta_exposure_events
  add constraint restricted_beta_exposure_events_event_type_check check (event_type in (
    'reserved','attempt_started','ambiguous','customer_relieved_supplier_obligation',
    'settled_unconfirmed','supplier_recovery','released','reconciled'
  ));

create table tongs.paid_execution_aggregate_assignments (
  id uuid primary key,
  policy_revision_id uuid not null references tongs.restricted_beta_policy_revisions(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  workspace_id uuid not null references tongs.workspaces(id) on delete restrict,
  state text not null check (state in ('active','closed')),
  valid_from timestamptz not null,
  valid_until timestamptz not null check (valid_until > valid_from),
  reason text not null check (nullif(btrim(reason),'') is not null),
  created_at timestamptz not null default now(),
  unique(policy_revision_id,user_id,workspace_id,valid_from)
);

create table tongs.paid_operation_aggregate_bindings (
  reservation_id uuid primary key references tongs.funding_reservations(id) on delete restrict,
  hold_id uuid not null unique references tongs.restricted_beta_exposure_holds(id) on delete restrict,
  policy_revision_id uuid not null references tongs.restricted_beta_policy_revisions(id) on delete restrict,
  capability_code text not null,
  provider text not null check (provider in ('openai','runway')),
  operation_id text not null unique,
  user_id uuid not null references auth.users(id) on delete restrict,
  workspace_id uuid not null references tongs.workspaces(id) on delete restrict,
  request_fingerprint text not null check(request_fingerprint ~ '^[0-9a-f]{64}$'),
  model_or_sku text not null,
  funding_source_type text not null check(funding_source_type in ('customer_deposit','paid_allowance','owner_budget','none')),
  credential_funding text not null check(credential_funding in ('forge','byo_customer')),
  provider_mode text not null check(provider_mode in ('real','simulated','byo')),
  pricing_revision_id uuid not null references tongs.private_pricing_revisions(id) on delete restrict,
  cost_policy_revision_id uuid,
  customer_funding_ceiling_micros bigint not null check(customer_funding_ceiling_micros>=0),
  supplier_exposure_ceiling_micros bigint not null check(supplier_exposure_ceiling_micros>=0),
  supporting_exposure_ceiling_micros bigint not null check(supporting_exposure_ceiling_micros>=0),
  created_at timestamptz not null default now()
);

create or replace function tongs._validate_paid_execution_aggregate_assignment()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare capability record; route_code text; runway_mode text;
begin
 if new.state<>'active' then return new; end if;
 for capability in select capability_code from tongs.restricted_beta_policy_capabilities
   where policy_revision_id=new.policy_revision_id and admission_mode<>'block'
 loop
  route_code:=case capability.capability_code
   when 'openai.text.hearth_chat' then 'hearth.chat_completion'
   when 'openai.text.hearth_research' then 'hearth.research_synthesis'
   when 'openai.text.visual_unified_plan' then 'visual.unified_plan'
   when 'openai.text.visual_narrative' then 'visual.narrative_interpretation'
   when 'openai.text.motion_broll' then 'motion.broll_interpretation'
   when 'openai.text.hammer_cleanup' then 'hammer.transcript_cleanup'
   when 'openai.text.shorts_discovery' then 'shorts.discovery'
   when 'openai.text.quench_metadata' then 'quench.metadata'
   else null end;
  if route_code is not null and (select mode from tongs._current_openai_text_rollout(route_code))<>'enforce' then
   raise exception 'aggregate assignment cannot precede existing OpenAI route enforcement: %',route_code using errcode='42501';
  end if;
  if capability.capability_code='runway.video' then
   select mode into runway_mode from tongs._current_runway_execution_rollout();
   if runway_mode<>'enforce' then raise exception 'aggregate assignment cannot precede existing Runway enforcement' using errcode='42501'; end if;
  end if;
 end loop;
 return new;
end $$;

create trigger paid_execution_aggregate_assignment_guard
before insert on tongs.paid_execution_aggregate_assignments
for each row execute function tongs._validate_paid_execution_aggregate_assignment();

do $$ declare n text; begin
 foreach n in array array['paid_execution_aggregate_assignments','paid_operation_aggregate_bindings'] loop
  execute format('alter table tongs.%I enable row level security',n);
  execute format('alter table tongs.%I force row level security',n);
  execute format('revoke all on tongs.%I from public,anon,authenticated,service_role',n);
  execute format('grant select,insert on tongs.%I to service_role',n);
  execute format('create trigger %I_immutable before update or delete on tongs.%I for each row execute function tongs._reject_accounting_mutation()',n,n);
 end loop;
end $$;

-- Outstanding supplier obligations remain admitted until an explicit release
-- or authoritative reconciliation. Lease expiry and rolling-window rollover
-- intentionally do not make them disappear.
create or replace function tongs.reserve_restricted_beta_exposure(
 p_hold_id uuid,p_policy_revision_id uuid,p_capability_code text,p_operation_identity text,
 p_user_id uuid,p_workspace_id uuid,p_request_fingerprint text,p_model_or_sku text,
 p_funding_class text,p_opaque_funding_handle text,p_provider_mode text,p_caller_class text,
 p_customer_funding_ceiling_micros bigint,p_supplier_exposure_ceiling_micros bigint,
 p_supporting_exposure_ceiling_micros bigint,p_tail_exposure_ceiling_micros bigint,
 p_unreconciled_exposure_ceiling_micros bigint,p_retry_exposure_ceiling_micros bigint,
 p_lease_seconds integer,p_event_key text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare pol tongs.restricted_beta_policy_revisions%rowtype; term tongs.restricted_beta_policy_capabilities%rowtype;
 existing tongs.restricted_beta_exposure_holds%rowtype; ev tongs.restricted_beta_cost_evidence_revisions%rowtype;
 requested bigint; committed bigint; concurrent_count bigint;
begin
 perform tongs._require_pricing_service_role();
 select * into pol from tongs.restricted_beta_policy_revisions where id=p_policy_revision_id;
 if not found or pol.lifecycle_state='draft' then return jsonb_build_object('authorized',false,'reason','restricted_beta_inactive'); end if;
 if pol.lifecycle_state<>'active' then return jsonb_build_object('authorized',false,'reason','halt_new'); end if;
 perform pg_advisory_xact_lock(hashtext('restricted-beta:'||pol.environment));
 select * into existing from tongs.restricted_beta_exposure_holds where operation_identity=btrim(p_operation_identity);
 if found then
  if existing.policy_revision_id<>pol.id or existing.request_fingerprint<>lower(p_request_fingerprint)
     or existing.model_or_sku<>p_model_or_sku or existing.user_id is distinct from p_user_id
     or existing.workspace_id is distinct from p_workspace_id then
    raise exception 'operation binding mismatch' using errcode='22023';
  end if;
  return jsonb_build_object('authorized',true,'replay',true,'hold_id',existing.id);
 end if;
 select * into term from tongs.restricted_beta_policy_capabilities where policy_revision_id=pol.id and capability_code=p_capability_code;
 if not found or term.admission_mode='block' then return jsonb_build_object('authorized',false,'reason','capability_not_covered'); end if;
 select * into ev from tongs.restricted_beta_cost_evidence_revisions where id=term.cost_evidence_revision_id;
 if not found or ev.coverage_state<>'complete' or ev.evidence_state='unresolved' or ev.valid_until<=now()
    or ev.observed_at < now()-make_interval(secs=>pol.evidence_max_age_seconds) then
  return jsonb_build_object('authorized',false,'reason','cost_evidence_stale_or_incomplete');
 end if;
 if p_model_or_sku<>term.exact_model_or_sku then return jsonb_build_object('authorized',false,'reason','model_or_sku_mismatch'); end if;
 if not(term.permitted_callers_json ? p_caller_class) then return jsonb_build_object('authorized',false,'reason','caller_not_permitted'); end if;
 if p_provider_mode='real' and p_funding_class='test_customer' then return jsonb_build_object('authorized',false,'reason','test_funding_real_provider_forbidden'); end if;
 if nullif(btrim(p_opaque_funding_handle),'') is null then return jsonb_build_object('authorized',false,'reason','funding_context_required'); end if;
 if p_supplier_exposure_ceiling_micros>term.per_operation_supplier_ceiling_micros
    or p_supporting_exposure_ceiling_micros>term.per_operation_supporting_ceiling_micros
    or p_tail_exposure_ceiling_micros>term.per_operation_tail_ceiling_micros then
  return jsonb_build_object('authorized',false,'reason','operation_ceiling_exceeded');
 end if;
 requested:=p_supplier_exposure_ceiling_micros+p_supporting_exposure_ceiling_micros+p_tail_exposure_ceiling_micros+p_unreconciled_exposure_ceiling_micros+p_retry_exposure_ceiling_micros;
 select coalesce(sum(h.supplier_exposure_ceiling_micros+h.supporting_exposure_ceiling_micros+h.tail_exposure_ceiling_micros+h.unreconciled_exposure_ceiling_micros+h.retry_exposure_ceiling_micros),0),count(*)
 into committed,concurrent_count
 from tongs.restricted_beta_exposure_holds h
 join lateral(select e.event_type from tongs.restricted_beta_exposure_events e where e.hold_id=h.id order by e.sequence desc limit 1) last on true
 where h.policy_revision_id=pol.id and last.event_type in ('reserved','attempt_started','ambiguous','customer_relieved_supplier_obligation','settled_unconfirmed','supplier_recovery');
 if concurrent_count>=pol.maximum_concurrency then return jsonb_build_object('authorized',false,'reason','aggregate_concurrency_exhausted','committed_micros',committed); end if;
 if committed+requested+pol.reserved_headroom_micros>pol.aggregate_forge_exposure_limit_micros then
  return jsonb_build_object('authorized',false,'reason','aggregate_exposure_exhausted','committed_micros',committed,'requested_micros',requested);
 end if;
 insert into tongs.restricted_beta_exposure_holds(id,policy_revision_id,capability_term_id,operation_identity,user_id,workspace_id,request_fingerprint,model_or_sku,funding_class,funding_handle_hash,provider_mode,caller_class,customer_funding_ceiling_micros,supplier_exposure_ceiling_micros,supporting_exposure_ceiling_micros,tail_exposure_ceiling_micros,unreconciled_exposure_ceiling_micros,retry_exposure_ceiling_micros,lease_expires_at)
 values(p_hold_id,pol.id,term.id,btrim(p_operation_identity),p_user_id,p_workspace_id,lower(p_request_fingerprint),p_model_or_sku,p_funding_class,encode(extensions.digest(convert_to(p_opaque_funding_handle,'utf8'),'sha256'),'hex'),p_provider_mode,p_caller_class,p_customer_funding_ceiling_micros,p_supplier_exposure_ceiling_micros,p_supporting_exposure_ceiling_micros,p_tail_exposure_ceiling_micros,p_unreconciled_exposure_ceiling_micros,p_retry_exposure_ceiling_micros,now()+make_interval(secs=>p_lease_seconds));
 insert into tongs.restricted_beta_exposure_events(id,hold_id,sequence,event_key,event_type,customer_funding_delta_micros,evidence_json)
 values(extensions.uuid_generate_v5(p_hold_id,'reserved'),p_hold_id,1,p_event_key,'reserved',p_customer_funding_ceiling_micros,jsonb_build_object('caller_class',p_caller_class));
 return jsonb_build_object('authorized',true,'replay',false,'hold_id',p_hold_id,'aggregate_before_micros',committed,'reserved_exposure_micros',requested);
end $$;

create or replace function tongs.record_restricted_beta_exposure_outcome(p_hold_id uuid,p_event_key text,p_event_type text,p_supplier_obligation_micros bigint default null,p_supplier_recovery_micros bigint default null,p_customer_funding_delta_micros bigint default 0,p_forge_loss_delta_micros bigint default 0,p_evidence_json jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare h tongs.restricted_beta_exposure_holds%rowtype; existing tongs.restricted_beta_exposure_events%rowtype; last_type text; attempts bigint;
begin
 perform tongs._require_pricing_service_role();
 if p_event_type not in ('ambiguous','customer_relieved_supplier_obligation','settled_unconfirmed','supplier_recovery','released','reconciled') then raise exception 'invalid outcome' using errcode='22023'; end if;
 select * into existing from tongs.restricted_beta_exposure_events where event_key=p_event_key;
 if found then return to_jsonb(existing)||jsonb_build_object('replay',true); end if;
 select * into h from tongs.restricted_beta_exposure_holds where id=p_hold_id for update;
 if not found then raise exception 'unknown exposure hold' using errcode='22023'; end if;
 select event_type into last_type from tongs.restricted_beta_exposure_events where hold_id=h.id order by sequence desc limit 1;
 if last_type in ('released','reconciled') then return jsonb_build_object('hold_id',h.id,'state',last_type,'replay',true); end if;
 select count(*) into attempts from tongs.restricted_beta_exposure_events where hold_id=h.id and event_type='attempt_started';
 if p_event_type='released' and attempts>0 and coalesce((p_evidence_json->>'transmitted')::boolean,true) is not false then raise exception 'attempted supplier work requires reconciliation' using errcode='P0001'; end if;
 if p_event_type='reconciled' and (p_supplier_obligation_micros is null or coalesce((p_evidence_json->>'authoritative')::boolean,false) is not true) then raise exception 'authoritative supplier obligation required for reconciliation' using errcode='P0001'; end if;
 if p_event_type='supplier_recovery' and coalesce(p_supplier_recovery_micros,0)<=0 then raise exception 'positive supplier recovery required' using errcode='22023'; end if;
 insert into tongs.restricted_beta_exposure_events(id,hold_id,sequence,event_key,event_type,supplier_obligation_micros,supplier_recovery_micros,customer_funding_delta_micros,forge_loss_delta_micros,evidence_json)
 select extensions.uuid_generate_v5(h.id,p_event_key),h.id,coalesce(max(sequence),0)+1,p_event_key,p_event_type,p_supplier_obligation_micros,p_supplier_recovery_micros,p_customer_funding_delta_micros,p_forge_loss_delta_micros,coalesce(p_evidence_json,'{}'::jsonb) from tongs.restricted_beta_exposure_events where hold_id=h.id returning * into existing;
 return to_jsonb(existing)||jsonb_build_object('replay',false);
end $$;

create or replace function tongs.begin_restricted_beta_attempt(p_hold_id uuid,p_event_key text,p_attempt_number smallint,p_caller_class text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare h tongs.restricted_beta_exposure_holds%rowtype; term tongs.restricted_beta_policy_capabilities%rowtype;
 pol tongs.restricted_beta_policy_revisions%rowtype; evidence tongs.restricted_beta_cost_evidence_revisions%rowtype;
 existing tongs.restricted_beta_exposure_events%rowtype;
begin
 perform tongs._require_pricing_service_role();
 select * into existing from tongs.restricted_beta_exposure_events where event_key=p_event_key;
 if found then return jsonb_build_object('authorized',false,'reason','duplicate_attempt','replay',true); end if;
 select * into h from tongs.restricted_beta_exposure_holds where id=p_hold_id for update;
 if not found then raise exception 'unknown exposure hold' using errcode='22023'; end if;
 select * into term from tongs.restricted_beta_policy_capabilities where id=h.capability_term_id;
 select * into pol from tongs.restricted_beta_policy_revisions where id=h.policy_revision_id;
 select * into evidence from tongs.restricted_beta_cost_evidence_revisions where id=term.cost_evidence_revision_id;
 if exists(select 1 from tongs.restricted_beta_exposure_events where hold_id=h.id and event_type in ('ambiguous','customer_relieved_supplier_obligation','settled_unconfirmed','released','reconciled')) then
  return jsonb_build_object('authorized',false,'reason','reconciliation_only');
 end if;
 if pol.lifecycle_state<>'active' then return jsonb_build_object('authorized',false,'reason','halt_new'); end if;
 if evidence.id is null or evidence.coverage_state<>'complete' or evidence.evidence_state='unresolved'
    or evidence.valid_until<=now() or evidence.observed_at<now()-make_interval(secs=>pol.evidence_max_age_seconds) then
  return jsonb_build_object('authorized',false,'reason','cost_evidence_stale_or_incomplete');
 end if;
 if p_attempt_number>term.maximum_attempts then return jsonb_build_object('authorized',false,'reason','attempt_limit'); end if;
 if not(term.permitted_callers_json ? p_caller_class) then return jsonb_build_object('authorized',false,'reason','caller_not_permitted'); end if;
 insert into tongs.restricted_beta_exposure_events(id,hold_id,sequence,event_key,event_type,attempt_number,evidence_json)
 select extensions.uuid_generate_v5(h.id,p_event_key),h.id,coalesce(max(sequence),0)+1,p_event_key,'attempt_started',p_attempt_number,jsonb_build_object('caller_class',p_caller_class) from tongs.restricted_beta_exposure_events where hold_id=h.id;
 return jsonb_build_object('authorized',true,'replay',false,'hold_id',h.id);
end $$;

create or replace function tongs._aggregate_funding_class(p_reservation tongs.funding_reservations)
returns text language plpgsql stable security definer set search_path=pg_catalog as $$
declare mode text;
begin
 if p_reservation.funding_source_type='customer_deposit' then
  select stripe_mode into mode from tongs.customer_deposits where id=p_reservation.funding_source_id;
  return case mode when 'test' then 'test_customer' else 'verified_customer_deposit' end;
 elsif p_reservation.funding_source_type='paid_allowance' then
  select receipt.stripe_mode into mode from tongs.paid_allowance_grants allowance join tongs.subscription_cycle_receipts receipt on receipt.id=allowance.receipt_id where allowance.id=p_reservation.funding_source_id;
  return case mode when 'test' then 'test_customer' else 'economically_backed_allowance' end;
 elsif p_reservation.funding_source_type='owner_budget' then return 'owner_operating_budget';
 elsif p_reservation.funding_source_type='none' then return 'byo';
 end if;
 raise exception 'unsupported aggregate funding source' using errcode='22023';
end $$;

create or replace function tongs._active_paid_execution_aggregate_assignment(p_user_id uuid,p_workspace_id uuid,p_environment text)
returns tongs.paid_execution_aggregate_assignments language sql stable security definer set search_path=pg_catalog as $$
 select assignment.* from tongs.paid_execution_aggregate_assignments assignment
 join tongs.restricted_beta_policy_revisions policy on policy.id=assignment.policy_revision_id
 where assignment.user_id=p_user_id and assignment.workspace_id=p_workspace_id and assignment.state='active'
   and assignment.valid_from<=now() and assignment.valid_until>now() and policy.environment=p_environment
 order by assignment.created_at desc limit 1
$$;

create or replace function tongs.acquire_openai_text_aggregate_admission(p_reservation_id uuid,p_caller_class text,p_provider_mode text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare b tongs.openai_text_funding_bindings%rowtype; r tongs.funding_reservations%rowtype; q tongs.customer_spending_quotes%rowtype;
 c tongs.openai_text_cost_policy_revisions%rowtype; a tongs.paid_execution_aggregate_assignments%rowtype; existing tongs.paid_operation_aggregate_bindings%rowtype;
 capability text; funding_class text; environment text; hold_id uuid; admitted jsonb; workspace uuid; supplier bigint;
begin
 perform tongs._require_pricing_service_role();
 if p_caller_class not in ('interactive','background','retry','recovery') or p_provider_mode not in ('real','simulated','byo') then raise exception 'invalid aggregate caller context' using errcode='22023'; end if;
 select * into existing from tongs.paid_operation_aggregate_bindings where reservation_id=p_reservation_id;
 if found then return jsonb_build_object('enforcement_enabled',true,'authorized',true,'replay',true,'hold_id',existing.hold_id,'reason','existing_authoritative_admission'); end if;
 select * into b from tongs.openai_text_funding_bindings where reservation_id=p_reservation_id;
 select * into r from tongs.funding_reservations where id=p_reservation_id;
 select * into q from tongs.customer_spending_quotes where id=r.quote_id;
 select * into c from tongs.openai_text_cost_policy_revisions where id=b.cost_policy_revision_id;
 if b.operation_id is null or r.id is null or q.id is null or c.id is null or q.workspace_id is null
    or not exists(select 1 from tongs.customer_spending_quote_acceptances accepted where accepted.quote_id=q.id and accepted.user_id=r.user_id)
    or b.operation_id<>r.operation_id or q.operation_id<>r.operation_id or q.request_fingerprint is null
    or c.cost_coverage<>'complete' or c.full_cost_ceiling_micros<>r.reserved_wholesale_spend_micros then
  raise exception 'exact accepted funding and complete cost policy required' using errcode='42501';
 end if;
 workspace:=q.workspace_id; funding_class:=tongs._aggregate_funding_class(r);
 environment:=case when funding_class='test_customer' then 'test' else 'production' end;
 select * into a from tongs._active_paid_execution_aggregate_assignment(r.user_id,workspace,environment);
 if not found then return jsonb_build_object('enforcement_enabled',false,'authorized',true,'replay',false,'reason','aggregate_assignment_inactive'); end if;
 capability:=case b.route_code
  when 'hearth.chat_completion' then 'openai.text.hearth_chat'
  when 'hearth.research_synthesis' then 'openai.text.hearth_research'
  when 'visual.unified_plan' then 'openai.text.visual_unified_plan'
  when 'visual.narrative_interpretation' then 'openai.text.visual_narrative'
  when 'motion.broll_interpretation' then 'openai.text.motion_broll'
  when 'hammer.transcript_cleanup' then 'openai.text.hammer_cleanup'
  when 'shorts.discovery' then 'openai.text.shorts_discovery'
  when 'quench.metadata' then 'openai.text.quench_metadata'
  else null end;
 if capability is null then raise exception 'unmapped paid OpenAI route' using errcode='P0001'; end if;
 if b.credential_funding='byo_customer' and p_provider_mode<>'byo' then raise exception 'BYO provider mode required' using errcode='42501'; end if;
 if b.credential_funding='forge' and p_provider_mode='byo' then raise exception 'Forge provider mode required' using errcode='42501'; end if;
 if funding_class='test_customer' and b.credential_funding='byo_customer' and c.supporting_cost_ceiling_micros>0 then
  return jsonb_build_object('enforcement_enabled',true,'authorized',false,'reason','test_supporting_real_provider_forbidden');
 end if;
 supplier:=case when b.credential_funding='forge' then c.direct_provider_ceiling_micros else 0 end;
 hold_id:=extensions.uuid_generate_v5(p_reservation_id,'aggregate-exposure');
 admitted:=tongs.reserve_restricted_beta_exposure(hold_id,a.policy_revision_id,capability,r.operation_id,r.user_id,workspace,q.request_fingerprint,b.model,funding_class,p_reservation_id::text,p_provider_mode,p_caller_class,r.reserved_customer_charge_micros,supplier,c.supporting_cost_ceiling_micros,0,0,0,180,p_reservation_id::text||':aggregate-reserved');
 if coalesce((admitted->>'authorized')::boolean,false) then
  insert into tongs.paid_operation_aggregate_bindings(reservation_id,hold_id,policy_revision_id,capability_code,provider,operation_id,user_id,workspace_id,request_fingerprint,model_or_sku,funding_source_type,credential_funding,provider_mode,pricing_revision_id,cost_policy_revision_id,customer_funding_ceiling_micros,supplier_exposure_ceiling_micros,supporting_exposure_ceiling_micros)
  values(r.id,hold_id,a.policy_revision_id,capability,'openai',r.operation_id,r.user_id,workspace,q.request_fingerprint,b.model,r.funding_source_type,b.credential_funding,p_provider_mode,q.pricing_revision_id,c.id,r.reserved_customer_charge_micros,supplier,c.supporting_cost_ceiling_micros);
 end if;
 return jsonb_build_object('enforcement_enabled',true)||admitted;
end $$;

create or replace function tongs.begin_paid_operation_aggregate_attempt(p_reservation_id uuid,p_event_key text,p_attempt_number smallint,p_caller_class text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare b tongs.paid_operation_aggregate_bindings%rowtype; result jsonb;
begin
 perform tongs._require_pricing_service_role();
 select * into b from tongs.paid_operation_aggregate_bindings where reservation_id=p_reservation_id;
 if not found then return jsonb_build_object('enforcement_enabled',false,'authorized',true,'reason','aggregate_assignment_inactive'); end if;
 result:=tongs.begin_restricted_beta_attempt(b.hold_id,p_event_key,p_attempt_number,p_caller_class);
 return jsonb_build_object('enforcement_enabled',true)||result;
end $$;

create or replace function tongs.record_paid_operation_aggregate_outcome(p_reservation_id uuid,p_event_key text,p_outcome text,p_supplier_obligation_micros bigint default null,p_supplier_recovery_micros bigint default null,p_evidence_json jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare b tongs.paid_operation_aggregate_bindings%rowtype; event_type text; loss bigint:=0;
begin
 perform tongs._require_pricing_service_role();
 select * into b from tongs.paid_operation_aggregate_bindings where reservation_id=p_reservation_id;
 if not found then return jsonb_build_object('enforcement_enabled',false,'recorded',false,'reason','aggregate_assignment_inactive'); end if;
 event_type:=case p_outcome when 'preprovider_release' then 'released' when 'ambiguous' then 'ambiguous'
  when 'failure' then 'customer_relieved_supplier_obligation' when 'settled_unconfirmed' then 'settled_unconfirmed'
  when 'reconciled' then 'reconciled' when 'supplier_recovery' then 'supplier_recovery' else null end;
 if event_type is null then raise exception 'invalid aggregate outcome' using errcode='22023'; end if;
 if p_outcome='failure' then loss:=coalesce(p_supplier_obligation_micros,0); end if;
 return jsonb_build_object('enforcement_enabled',true,'recorded',true)||tongs.record_restricted_beta_exposure_outcome(
  b.hold_id,p_event_key,event_type,p_supplier_obligation_micros,p_supplier_recovery_micros,
  case when p_outcome='failure' then -b.customer_funding_ceiling_micros else 0 end,loss,p_evidence_json);
end $$;

create or replace function tongs.authorize_openai_text_provider_attempt_with_aggregate(p_reservation_id uuid,p_attempt_key text,p_attempt_number smallint,p_caller_class text,p_failure_exposure_micros bigint,p_lease_seconds integer,p_evidence_json jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare aggregate_result jsonb; funding_result jsonb;
begin
 perform tongs._require_pricing_service_role();
 aggregate_result:=tongs.begin_paid_operation_aggregate_attempt(p_reservation_id,p_attempt_key||':aggregate',p_attempt_number,p_caller_class);
 if coalesce((aggregate_result->>'enforcement_enabled')::boolean,false) and not coalesce((aggregate_result->>'authorized')::boolean,false) then
  return jsonb_build_object('provider_execution_authorized',false,'reason',coalesce(aggregate_result->>'reason','aggregate_admission_denied'),'aggregate_enforcement_enabled',true);
 end if;
 funding_result:=tongs.authorize_openai_text_provider_attempt(p_reservation_id,p_attempt_key,p_attempt_number,p_failure_exposure_micros,p_lease_seconds,p_evidence_json);
 if coalesce((aggregate_result->>'enforcement_enabled')::boolean,false) and not coalesce((funding_result->>'provider_execution_authorized')::boolean,false) then
  perform tongs.record_paid_operation_aggregate_outcome(p_reservation_id,p_attempt_key||':aggregate-preprovider-release','preprovider_release',null,null,jsonb_build_object('reason',coalesce(funding_result->>'reason','funding_authority_denied'),'transmitted',false));
 end if;
 return funding_result||jsonb_build_object('aggregate_enforcement_enabled',coalesce((aggregate_result->>'enforcement_enabled')::boolean,false),'aggregate_hold_id',aggregate_result->>'hold_id');
end $$;

create or replace function tongs.acquire_runway_aggregate_admission(p_operation_id text,p_operation_fingerprint text,p_user_id uuid,p_workspace_id uuid,p_caller_class text,p_provider_mode text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare b tongs.runway_funding_bindings%rowtype; r tongs.funding_reservations%rowtype; a tongs.paid_execution_aggregate_assignments%rowtype;
 existing tongs.paid_operation_aggregate_bindings%rowtype; funding_class text; environment text; hold_id uuid; admitted jsonb;
begin
 perform tongs._require_pricing_service_role();
 select * into b from tongs.runway_funding_bindings where operation_id=btrim(p_operation_id);
 if not found or b.operation_fingerprint<>p_operation_fingerprint or b.user_id<>p_user_id or b.workspace_id<>p_workspace_id then raise exception 'exact Runway funding binding required' using errcode='42501'; end if;
 select * into existing from tongs.paid_operation_aggregate_bindings where reservation_id=b.reservation_id;
 if found then return jsonb_build_object('enforcement_enabled',true,'authorized',true,'replay',true,'hold_id',existing.hold_id,'reason','existing_authoritative_admission'); end if;
 select * into r from tongs.funding_reservations where id=b.reservation_id;
 funding_class:=tongs._aggregate_funding_class(r); environment:=case when funding_class='test_customer' then 'test' else 'production' end;
 select * into a from tongs._active_paid_execution_aggregate_assignment(p_user_id,p_workspace_id,environment);
 if not found then return jsonb_build_object('enforcement_enabled',false,'authorized',true,'replay',false,'reason','aggregate_assignment_inactive'); end if;
 if p_provider_mode<>'real' then raise exception 'Runway Forge credential requires real provider mode' using errcode='42501'; end if;
 hold_id:=extensions.uuid_generate_v5(b.reservation_id,'aggregate-exposure');
 admitted:=tongs.reserve_restricted_beta_exposure(hold_id,a.policy_revision_id,'runway.video',b.operation_id,b.user_id,b.workspace_id,b.operation_fingerprint,b.model||':'||b.duration_seconds::text||'s:'||b.ratio,funding_class,b.reservation_id::text,p_provider_mode,p_caller_class,r.reserved_customer_charge_micros,b.direct_provider_ceiling_micros,b.supporting_cost_ceiling_micros,0,0,0,300,b.reservation_id::text||':aggregate-reserved');
 if coalesce((admitted->>'authorized')::boolean,false) then
  insert into tongs.paid_operation_aggregate_bindings(reservation_id,hold_id,policy_revision_id,capability_code,provider,operation_id,user_id,workspace_id,request_fingerprint,model_or_sku,funding_source_type,credential_funding,provider_mode,pricing_revision_id,cost_policy_revision_id,customer_funding_ceiling_micros,supplier_exposure_ceiling_micros,supporting_exposure_ceiling_micros)
  values(r.id,hold_id,a.policy_revision_id,'runway.video','runway',b.operation_id,b.user_id,b.workspace_id,b.operation_fingerprint,b.model||':'||b.duration_seconds::text||'s:'||b.ratio,r.funding_source_type,'forge',p_provider_mode,b.pricing_revision_id,null,r.reserved_customer_charge_micros,b.direct_provider_ceiling_micros,b.supporting_cost_ceiling_micros);
 end if;
 return jsonb_build_object('enforcement_enabled',true)||admitted;
end $$;

create or replace function tongs.authorize_runway_submission_with_aggregate(p_operation_id text,p_operation_fingerprint text,p_submission_attempt_id text,p_user_id uuid,p_workspace_id uuid,p_model text,p_duration_seconds integer,p_ratio text,p_caller_class text,p_evidence_json jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare rollout tongs.runway_execution_rollout_revisions%rowtype; admission jsonb; aggregate_attempt jsonb; result jsonb; reservation uuid;
begin
 perform tongs._require_pricing_service_role();
 select * into rollout from tongs._current_runway_execution_rollout();
 if rollout.mode<>'enforce' then return tongs.authorize_runway_submission(p_operation_id,p_operation_fingerprint,p_submission_attempt_id,p_user_id,p_workspace_id,p_model,p_duration_seconds,p_ratio,p_evidence_json); end if;
 admission:=tongs.acquire_runway_aggregate_admission(p_operation_id,p_operation_fingerprint,p_user_id,p_workspace_id,p_caller_class,'real');
 if coalesce((admission->>'enforcement_enabled')::boolean,false) and not coalesce((admission->>'authorized')::boolean,false) then
  select reservation_id into reservation from tongs.runway_funding_bindings where operation_id=btrim(p_operation_id);
  if reservation is not null then
   perform tongs.release_operation(
    reservation,
    p_submission_attempt_id||':aggregate-admission-denied-release',
    coalesce(admission->>'reason','aggregate_admission_denied'),
    jsonb_build_object('transmitted',false,'aggregate_admission_denied',true));
  end if;
  return jsonb_build_object('mode',rollout.mode,'rollout_revision',rollout.revision,'provider_execution_authorized',false,'legacy_execution_allowed',false,'reason',admission->>'reason','replay',false,'reservation_id',null,'aggregate_enforcement_enabled',true);
 end if;
 select reservation_id into reservation from tongs.runway_funding_bindings where operation_id=btrim(p_operation_id);
 aggregate_attempt:=tongs.begin_paid_operation_aggregate_attempt(reservation,p_submission_attempt_id||':aggregate',1,p_caller_class);
 if coalesce((aggregate_attempt->>'enforcement_enabled')::boolean,false) and not coalesce((aggregate_attempt->>'authorized')::boolean,false) then
  return jsonb_build_object('mode',rollout.mode,'rollout_revision',rollout.revision,'provider_execution_authorized',false,'legacy_execution_allowed',false,'reason',aggregate_attempt->>'reason','replay',coalesce((aggregate_attempt->>'replay')::boolean,false),'reservation_id',reservation,'aggregate_enforcement_enabled',true);
 end if;
 result:=tongs.authorize_runway_submission(p_operation_id,p_operation_fingerprint,p_submission_attempt_id,p_user_id,p_workspace_id,p_model,p_duration_seconds,p_ratio,p_evidence_json);
 if coalesce((aggregate_attempt->>'enforcement_enabled')::boolean,false) and not coalesce((result->>'provider_execution_authorized')::boolean,false) then
  perform tongs.record_paid_operation_aggregate_outcome(reservation,p_submission_attempt_id||':aggregate-preprovider-release','preprovider_release',null,null,jsonb_build_object('reason',coalesce(result->>'reason','funding_authority_denied'),'transmitted',false));
 end if;
 return result||jsonb_build_object('aggregate_enforcement_enabled',coalesce((aggregate_attempt->>'enforcement_enabled')::boolean,false),'aggregate_hold_id',aggregate_attempt->>'hold_id');
end $$;

create or replace function tongs.read_paid_execution_aggregate_admin(p_limit integer default 250)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare lim integer:=least(greatest(coalesce(p_limit,250),1),2000);
begin
 if coalesce(auth.role(),'')<>'service_role' and not tongs.is_platform_operator(auth.uid()) then raise exception 'platform operator required' using errcode='42501'; end if;
 return jsonb_build_object(
  'assignments',(select coalesce(jsonb_agg(to_jsonb(x) order by created_at desc),'[]'::jsonb) from (select * from tongs.paid_execution_aggregate_assignments order by created_at desc limit lim)x),
  'bindings',(select coalesce(jsonb_agg(to_jsonb(x) order by created_at desc),'[]'::jsonb) from (select * from tongs.paid_operation_aggregate_bindings order by created_at desc limit lim)x),
  'holds',(select coalesce(jsonb_agg(to_jsonb(x) order by created_at desc),'[]'::jsonb) from (select * from tongs.restricted_beta_exposure_holds order by created_at desc limit lim)x),
  'events',(select coalesce(jsonb_agg(to_jsonb(x) order by created_at desc),'[]'::jsonb) from (select * from tongs.restricted_beta_exposure_events order by created_at desc limit lim)x));
end $$;

create or replace function tongs._record_runway_aggregate_reconciliation()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 if old.supporting_cost_status='pending' and new.supporting_cost_status='finalized' then
  perform tongs.record_paid_operation_aggregate_outcome(
    new.reservation_id,new.operation_id||':aggregate-authoritative-reconciliation','reconciled',
    new.direct_provider_actual_micros+new.supporting_actual_micros,null,
    coalesce(new.evidence_json,'{}'::jsonb)||jsonb_build_object('authoritative',true,'provider','runway','provider_task_id',new.provider_task_id));
 end if;
 return new;
end $$;

create trigger runway_aggregate_reconciliation_after_update
after update of supporting_cost_status on tongs.runway_execution_reconciliation_receipts
for each row execute function tongs._record_runway_aggregate_reconciliation();

revoke all on function tongs._aggregate_funding_class(tongs.funding_reservations) from public,anon,authenticated;
revoke all on function tongs._active_paid_execution_aggregate_assignment(uuid,uuid,text) from public,anon,authenticated;
revoke all on function tongs.acquire_openai_text_aggregate_admission(uuid,text,text) from public,anon,authenticated;
revoke all on function tongs.begin_paid_operation_aggregate_attempt(uuid,text,smallint,text) from public,anon,authenticated;
revoke all on function tongs.record_paid_operation_aggregate_outcome(uuid,text,text,bigint,bigint,jsonb) from public,anon,authenticated;
revoke all on function tongs.authorize_openai_text_provider_attempt_with_aggregate(uuid,text,smallint,text,bigint,integer,jsonb) from public,anon,authenticated;
revoke all on function tongs.acquire_runway_aggregate_admission(text,text,uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function tongs.authorize_runway_submission_with_aggregate(text,text,text,uuid,uuid,text,integer,text,text,jsonb) from public,anon,authenticated;
revoke all on function tongs.read_paid_execution_aggregate_admin(integer) from public,anon,authenticated;
grant execute on function tongs.acquire_openai_text_aggregate_admission(uuid,text,text) to service_role;
grant execute on function tongs.begin_paid_operation_aggregate_attempt(uuid,text,smallint,text) to service_role;
grant execute on function tongs.record_paid_operation_aggregate_outcome(uuid,text,text,bigint,bigint,jsonb) to service_role;
grant execute on function tongs.authorize_openai_text_provider_attempt_with_aggregate(uuid,text,smallint,text,bigint,integer,jsonb) to service_role;
grant execute on function tongs.acquire_runway_aggregate_admission(text,text,uuid,uuid,text,text) to service_role;
grant execute on function tongs.authorize_runway_submission_with_aggregate(text,text,text,uuid,uuid,text,integer,text,text,jsonb) to service_role;
grant execute on function tongs.read_paid_execution_aggregate_admin(integer) to authenticated;

comment on table tongs.paid_execution_aggregate_assignments is 'Empty-by-default scoped activation authority. This migration does not enroll or activate anyone.';
comment on table tongs.paid_operation_aggregate_bindings is 'Immutable one-to-one binding from the existing funding reservation to aggregate supplier exposure; not a second balance or expense ledger.';
comment on function tongs.authorize_openai_text_provider_attempt_with_aggregate(uuid,text,smallint,text,bigint,integer,jsonb) is 'Transactional dual authority: aggregate admission and existing funding attempt must both authorize before an OpenAI provider call.';
comment on function tongs.authorize_runway_submission_with_aggregate(text,text,text,uuid,uuid,text,integer,text,text,jsonb) is 'Transactional dual authority at the actual Runway submission boundary. Polling and reconciliation remain outside new-admission denial.';

commit;
