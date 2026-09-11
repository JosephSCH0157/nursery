-- Keep retained supplier exposure separate from active execution concurrency.
-- Rearm only the exact owner compatibility reservations that were released
-- before provider submission by the former conflated counter.
begin;

create or replace function tongs._restricted_beta_policy_execution_concurrency(
  p_policy_revision_id uuid
) returns bigint
language sql stable security definer set search_path=pg_catalog as $$
  with selected_policy as (
    select environment
    from tongs.restricted_beta_policy_revisions
    where id=p_policy_revision_id
  ), latest as (
    select (
      select e.event_type
      from tongs.restricted_beta_exposure_events e
      where e.hold_id=h.id
      order by e.sequence desc
      limit 1
    ) as event_type
    from tongs.restricted_beta_exposure_holds h
    join tongs.restricted_beta_policy_revisions p on p.id=h.policy_revision_id
    where p.environment=(select environment from selected_policy)
  )
  select coalesce(count(*) filter (
    where event_type in ('reserved','attempt_started','ambiguous')
  ),0)::bigint
  from latest;
$$;

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
 if exists(select 1 from tongs.aggregate_financial_halt_events where policy_revision_id=pol.id) then
  return jsonb_build_object('authorized',false,'reason','aggregate_authoritative_overrun_halt'); end if;
 perform pg_advisory_xact_lock(hashtext('restricted-beta:'||pol.environment));
 select * into existing from tongs.restricted_beta_exposure_holds where operation_identity=btrim(p_operation_identity);
 if found then
  if existing.policy_revision_id<>pol.id or existing.request_fingerprint<>lower(p_request_fingerprint)
     or existing.model_or_sku<>p_model_or_sku or existing.user_id is distinct from p_user_id
     or existing.workspace_id is distinct from p_workspace_id then
   raise exception 'operation binding mismatch' using errcode='22023'; end if;
  return jsonb_build_object('authorized',true,'replay',true,'hold_id',existing.id);
 end if;
 select * into term from tongs.restricted_beta_policy_capabilities where policy_revision_id=pol.id and capability_code=p_capability_code;
 if not found or term.admission_mode='block' then return jsonb_build_object('authorized',false,'reason','capability_not_covered'); end if;
 select * into ev from tongs.restricted_beta_cost_evidence_revisions where id=term.cost_evidence_revision_id;
 if not found or ev.coverage_state<>'complete' or ev.evidence_state='unresolved' or ev.valid_until<=now()
    or ev.observed_at < now()-make_interval(secs=>pol.evidence_max_age_seconds) then
  return jsonb_build_object('authorized',false,'reason','cost_evidence_stale_or_incomplete'); end if;
 if p_model_or_sku<>term.exact_model_or_sku then return jsonb_build_object('authorized',false,'reason','model_or_sku_mismatch'); end if;
 if not(term.permitted_callers_json ? p_caller_class) then return jsonb_build_object('authorized',false,'reason','caller_not_permitted'); end if;
 if p_provider_mode='real' and p_funding_class='test_customer' then return jsonb_build_object('authorized',false,'reason','test_funding_real_provider_forbidden'); end if;
 if nullif(btrim(p_opaque_funding_handle),'') is null then return jsonb_build_object('authorized',false,'reason','funding_context_required'); end if;
 if p_supplier_exposure_ceiling_micros>term.per_operation_supplier_ceiling_micros
    or p_supporting_exposure_ceiling_micros>term.per_operation_supporting_ceiling_micros
    or p_tail_exposure_ceiling_micros>term.per_operation_tail_ceiling_micros then
  return jsonb_build_object('authorized',false,'reason','operation_ceiling_exceeded'); end if;
 requested:=p_supplier_exposure_ceiling_micros+p_supporting_exposure_ceiling_micros+p_tail_exposure_ceiling_micros+p_unreconciled_exposure_ceiling_micros+p_retry_exposure_ceiling_micros;
 select c.committed_micros into committed from tongs._restricted_beta_policy_commitment(pol.id)c;
 concurrent_count:=tongs._restricted_beta_policy_execution_concurrency(pol.id);
 if concurrent_count>=pol.maximum_concurrency then return jsonb_build_object('authorized',false,'reason','aggregate_concurrency_exhausted','committed_micros',committed); end if;
 if committed+requested+pol.reserved_headroom_micros>pol.aggregate_forge_exposure_limit_micros then
  return jsonb_build_object('authorized',false,'reason','aggregate_exposure_exhausted','committed_micros',committed,'requested_micros',requested); end if;
 insert into tongs.restricted_beta_exposure_holds(id,policy_revision_id,capability_term_id,operation_identity,user_id,workspace_id,request_fingerprint,model_or_sku,funding_class,funding_handle_hash,provider_mode,caller_class,customer_funding_ceiling_micros,supplier_exposure_ceiling_micros,supporting_exposure_ceiling_micros,tail_exposure_ceiling_micros,unreconciled_exposure_ceiling_micros,retry_exposure_ceiling_micros,lease_expires_at)
 values(p_hold_id,pol.id,term.id,btrim(p_operation_identity),p_user_id,p_workspace_id,lower(p_request_fingerprint),p_model_or_sku,p_funding_class,encode(extensions.digest(convert_to(p_opaque_funding_handle,'utf8'),'sha256'),'hex'),p_provider_mode,p_caller_class,p_customer_funding_ceiling_micros,p_supplier_exposure_ceiling_micros,p_supporting_exposure_ceiling_micros,p_tail_exposure_ceiling_micros,p_unreconciled_exposure_ceiling_micros,p_retry_exposure_ceiling_micros,now()+make_interval(secs=>p_lease_seconds));
 insert into tongs.restricted_beta_exposure_events(id,hold_id,sequence,event_key,event_type,customer_funding_delta_micros,evidence_json)
 values(extensions.uuid_generate_v5(p_hold_id,'reserved'),p_hold_id,1,p_event_key,'reserved',p_customer_funding_ceiling_micros,jsonb_build_object('caller_class',p_caller_class));
 return jsonb_build_object('authorized',true,'replay',false,'hold_id',p_hold_id,'aggregate_before_micros',committed,'reserved_exposure_micros',requested);
end $$;

create or replace function tongs.rearm_owner_hearth_preprovider_release(
  p_reservation_id uuid,p_operator_user_id uuid,p_event_key text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare op tongs.owner_hearth_operation_authorizations%rowtype;
 authz tongs.owner_hearth_authorizations%rowtype;
 auth_event tongs.owner_hearth_authorization_events%rowtype;
 latest tongs.funding_reservation_events%rowtype;
 existing tongs.funding_reservation_events%rowtype;
 nextseq integer;
begin
 perform tongs._require_pricing_service_role();
 if p_reservation_id is null or p_operator_user_id is null
    or not tongs.is_platform_operator(p_operator_user_id)
    or length(btrim(coalesce(p_event_key,'')))<8 then
  raise exception 'service-role platform operator required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('owner-hearth-preprovider-rearm:'||p_reservation_id::text,0));
 select * into op from tongs.owner_hearth_operation_authorizations where reservation_id=p_reservation_id;
 select * into authz from tongs.owner_hearth_authorizations where id=op.authorization_id;
 select * into auth_event from tongs.owner_hearth_authorization_events where authorization_id=authz.id order by sequence desc limit 1;
 if op.id is null or authz.authorization_kind<>'compatibility_batch'
    or authz.owner_user_id<>p_operator_user_id or auth_event.state<>'active'
    or auth_event.expires_at<=now() then
  raise exception 'active exact-owner compatibility authorization required' using errcode='42501'; end if;
 select * into existing from tongs.funding_reservation_events where event_key=btrim(p_event_key);
 if found then return to_jsonb(existing)||jsonb_build_object('replay',true); end if;
 select * into latest from tongs.funding_reservation_events where reservation_id=p_reservation_id order by sequence desc limit 1;
 if latest.event_type<>'released' or latest.evidence_json->>'reason'<>'aggregate_concurrency_exhausted'
    or coalesce((latest.evidence_json->>'transmitted')::boolean,true) then
  raise exception 'aggregate-concurrency pre-provider release evidence required (state %, reason %, transmitted %)',
    latest.event_type,latest.evidence_json->>'reason',latest.evidence_json->>'transmitted' using errcode='P0001'; end if;
 if exists(select 1 from tongs.funding_reservation_events e where e.reservation_id=p_reservation_id and e.event_type='provider_attempt_shadowed') then
  raise exception 'provider attempt funding evidence prevents rearm' using errcode='P0001'; end if;
 if exists(select 1 from tongs.openai_text_failure_exposure_holds h where h.reservation_id=p_reservation_id) then
  raise exception 'provider failure exposure prevents rearm' using errcode='P0001'; end if;
 if exists(select 1 from tongs.openai_text_usage_evidence u where u.reservation_id=p_reservation_id) then
  raise exception 'provider usage evidence prevents rearm' using errcode='P0001'; end if;
 if exists(select 1 from tongs.supplier_expenses s where s.reservation_id=p_reservation_id) then
  raise exception 'supplier expense evidence prevents rearm' using errcode='P0001'; end if;
 if exists(select 1 from tongs.owner_hearth_compatibility_results r where r.operation_authorization_id=op.id) then
  raise exception 'terminal compatibility result prevents rearm' using errcode='P0001'; end if;
 if exists(select 1 from tongs.paid_operation_aggregate_bindings b where b.reservation_id=p_reservation_id) then
  raise exception 'aggregate binding prevents rearm' using errcode='P0001'; end if;
 select coalesce(max(sequence),0)+1 into nextseq from tongs.funding_reservation_events where reservation_id=p_reservation_id;
 insert into tongs.funding_reservation_events(
  id,reservation_id,sequence,event_type,event_key,evidence_json
 ) values(
  extensions.uuid_generate_v5(p_reservation_id,btrim(p_event_key)),p_reservation_id,nextseq,'reserved',btrim(p_event_key),
  jsonb_build_object('operator_user_id',p_operator_user_id,'recovery','aggregate_terminal_concurrency_fix',
    'transmitted',false,'provider_submission_count',0,'original_operation_identity_preserved',true)
 ) returning * into existing;
 return to_jsonb(existing)||jsonb_build_object('replay',false,'operation_id',op.operation_id,'model',op.provider_model_id);
end $$;

revoke all on function tongs._restricted_beta_policy_execution_concurrency(uuid)
  from public,anon,authenticated;
grant execute on function tongs._restricted_beta_policy_execution_concurrency(uuid)
  to service_role;
revoke all on function tongs.rearm_owner_hearth_preprovider_release(uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function tongs.rearm_owner_hearth_preprovider_release(uuid,uuid,text)
  to service_role;

comment on function tongs._restricted_beta_policy_execution_concurrency(uuid) is
  'Counts active provider execution holds only. Retained terminal supplier exposure remains committed financially without consuming an execution concurrency slot.';
comment on function tongs.rearm_owner_hearth_preprovider_release(uuid,uuid,text) is
  'Append-only recovery for an exact owner compatibility operation rejected by aggregate concurrency before any provider attempt; preserves the original operation and accepted terms.';

notify pgrst,'reload schema';
commit;
