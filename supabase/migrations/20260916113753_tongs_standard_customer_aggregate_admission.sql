create or replace function tongs.acquire_openai_text_aggregate_admission(
 p_reservation_id uuid,p_caller_class text,p_provider_mode text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare b tongs.openai_text_funding_bindings%rowtype; r tongs.funding_reservations%rowtype;
 q tongs.customer_spending_quotes%rowtype; qb tongs.openai_text_customer_quote_bindings%rowtype;
 c tongs.openai_text_cost_policy_revisions%rowtype; a tongs.paid_execution_aggregate_assignments%rowtype;
 existing tongs.paid_operation_aggregate_bindings%rowtype; capability text; funding_class text;
 environment text; hold_id uuid; admitted jsonb; workspace uuid; supplier bigint;
begin
 perform tongs._require_pricing_service_role();
 if p_caller_class not in ('interactive','background','retry','recovery') or p_provider_mode not in ('real','simulated','byo') then raise exception 'invalid aggregate caller context' using errcode='22023'; end if;
 select * into existing from tongs.paid_operation_aggregate_bindings where reservation_id=p_reservation_id;
 if found then return jsonb_build_object('enforcement_enabled',true,'authorized',true,'replay',true,'hold_id',existing.hold_id,'reason','existing_authoritative_admission'); end if;
 select * into b from tongs.openai_text_funding_bindings where reservation_id=p_reservation_id;
 select * into r from tongs.funding_reservations where id=p_reservation_id;
 select * into q from tongs.customer_spending_quotes where id=r.quote_id;
 select * into qb from tongs.openai_text_customer_quote_bindings where quote_id=q.id;
 select * into c from tongs.openai_text_cost_policy_revisions where id=b.cost_policy_revision_id;
 if b.operation_id is null or r.id is null or q.id is null or qb.quote_id is null or c.id is null or q.workspace_id is null
    or not exists(select 1 from tongs.customer_spending_quote_acceptances accepted where accepted.quote_id=q.id and accepted.user_id=r.user_id)
    or q.operation_id<>r.operation_id or qb.canonical_operation_id<>b.operation_id
    or qb.user_id<>r.user_id or qb.workspace_id<>q.workspace_id or qb.request_fingerprint<>q.request_fingerprint
    or qb.runtime_model<>b.model or qb.cost_policy_revision_id<>b.cost_policy_revision_id
    or qb.pricing_revision_id<>q.pricing_revision_id or q.request_fingerprint is null
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
  when 'quench.metadata' then 'openai.text.quench_metadata' else null end;
 if capability is null then raise exception 'unmapped paid OpenAI route' using errcode='P0001'; end if;
 if b.credential_funding='byo_customer' and p_provider_mode<>'byo' then raise exception 'BYO provider mode required' using errcode='42501'; end if;
 if b.credential_funding='forge' and p_provider_mode='byo' then raise exception 'Forge provider mode required' using errcode='42501'; end if;
 if funding_class='test_customer' and b.credential_funding='byo_customer' and c.supporting_cost_ceiling_micros>0 then
  return jsonb_build_object('enforcement_enabled',true,'authorized',false,'reason','test_supporting_real_provider_forbidden'); end if;
 supplier:=case when b.credential_funding='forge' then c.direct_provider_ceiling_micros else 0 end;
 hold_id:=extensions.uuid_generate_v5(p_reservation_id,'aggregate-exposure');
 admitted:=tongs.reserve_restricted_beta_exposure(hold_id,a.policy_revision_id,capability,b.operation_id,r.user_id,workspace,q.request_fingerprint,
  b.model,funding_class,p_reservation_id::text,p_provider_mode,p_caller_class,r.reserved_customer_charge_micros,supplier,
  c.supporting_cost_ceiling_micros,0,0,0,180,p_reservation_id::text||':aggregate-reserved');
 if coalesce((admitted->>'authorized')::boolean,false) then
  insert into tongs.paid_operation_aggregate_bindings(
   reservation_id,hold_id,policy_revision_id,capability_code,provider,operation_id,user_id,workspace_id,
   request_fingerprint,model_or_sku,funding_source_type,credential_funding,provider_mode,pricing_revision_id,
   cost_policy_revision_id,customer_funding_ceiling_micros,supplier_exposure_ceiling_micros,supporting_exposure_ceiling_micros)
  values(r.id,hold_id,a.policy_revision_id,capability,'openai',b.operation_id,r.user_id,workspace,q.request_fingerprint,
   b.model,r.funding_source_type,b.credential_funding,p_provider_mode,q.pricing_revision_id,c.id,
   r.reserved_customer_charge_micros,supplier,c.supporting_cost_ceiling_micros);
 end if;
 return jsonb_build_object('enforcement_enabled',true)||admitted;
end $$;
do $$
declare definition text;
begin
 select pg_get_functiondef('tongs.acquire_openai_text_aggregate_admission(uuid,text,text)'::regprocedure) into definition;
 if position('qb.canonical_operation_id' in definition)=0 or position('capability,b.operation_id' in definition)=0 then
  raise exception 'canonical standard-customer aggregate admission was not installed';
 end if;
end $$;
notify pgrst,'reload schema';