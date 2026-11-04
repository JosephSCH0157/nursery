-- Require owner-Hearth provider-attempt authorization to be bound to an
-- affirmative aggregate admission.  The shared aggregate helper intentionally
-- remains unchanged: normal-customer paths may legitimately run with aggregate
-- enforcement disabled, while these two owner-only paths may not.
begin;

do $repair$
declare
  v_signature regprocedure;
  v_source text;
  v_original text;
  v_declaration text;
  v_repaired_declaration text;
  v_gate text;
  v_repaired_gate text;
begin
  v_signature := to_regprocedure(
    'tongs.authorize_owner_hearth_provider_attempt_with_aggregate(uuid,text,smallint,text,bigint,integer,jsonb)'
  );
  if v_signature is null then
    raise exception 'owner Hearth provider-attempt authority is missing';
  end if;

  select pg_get_functiondef(v_signature) into v_source;
  v_original := v_source;
  v_declaration := 'hold tongs.openai_text_failure_exposure_holds%rowtype; res tongs.funding_reservations%rowtype; aggregate_result jsonb;';
  v_repaired_declaration := 'hold tongs.openai_text_failure_exposure_holds%rowtype; res tongs.funding_reservations%rowtype; aggregate_result jsonb;' || E'\n ' ||
    'aggregate_binding tongs.paid_operation_aggregate_bindings%rowtype; aggregate_hold tongs.restricted_beta_exposure_holds%rowtype;';
  if length(v_source)-length(replace(v_source,v_declaration,'')) <> length(v_declaration) then
    raise exception 'owner Hearth provider-attempt declaration changed upstream';
  end if;
  v_source := replace(v_source,v_declaration,v_repaired_declaration);

  v_gate := $old$
 aggregate_result:=tongs.begin_paid_operation_aggregate_attempt(p_reservation_id,p_attempt_key||':aggregate',1::smallint,p_caller_class);
 if coalesce((aggregate_result->>'enforcement_enabled')::boolean,false) and not coalesce((aggregate_result->>'authorized')::boolean,false) then
  return jsonb_build_object('provider_execution_authorized',false,'reason',aggregate_result->>'reason','aggregate_enforcement_enabled',true); end if;$old$;
  v_repaired_gate := $new$
 select * into aggregate_binding from tongs.paid_operation_aggregate_bindings where reservation_id=p_reservation_id;
 if aggregate_binding.reservation_id is null
   or aggregate_binding.policy_revision_id<>op.aggregate_policy_revision_id
   or aggregate_binding.capability_code<>'openai.text.hearth_chat'
   or aggregate_binding.provider<>'openai'
   or aggregate_binding.operation_id<>op.operation_id
   or aggregate_binding.user_id<>op.owner_user_id
   or aggregate_binding.workspace_id<>op.workspace_id
   or aggregate_binding.request_fingerprint<>op.request_fingerprint
   or aggregate_binding.model_or_sku<>op.provider_model_id
   or aggregate_binding.funding_source_type<>'owner_budget'
   or aggregate_binding.credential_funding<>'forge'
   or aggregate_binding.provider_mode<>'real'
   or aggregate_binding.pricing_revision_id<>op.pricing_revision_id
   or aggregate_binding.cost_policy_revision_id is distinct from op.cost_policy_revision_id then
  return jsonb_build_object('provider_execution_authorized',false,'reason','aggregate_admission_required','aggregate_enforcement_enabled',true); end if;
 select * into aggregate_hold from tongs.restricted_beta_exposure_holds where id=aggregate_binding.hold_id;
 if aggregate_hold.id is null
   or aggregate_hold.policy_revision_id<>aggregate_binding.policy_revision_id
   or aggregate_hold.operation_identity<>aggregate_binding.operation_id
   or aggregate_hold.user_id<>aggregate_binding.user_id
   or aggregate_hold.workspace_id<>aggregate_binding.workspace_id
   or aggregate_hold.request_fingerprint<>aggregate_binding.request_fingerprint
   or aggregate_hold.model_or_sku<>aggregate_binding.model_or_sku
   or aggregate_hold.funding_class<>'owner_operating_budget'
   or aggregate_hold.provider_mode<>'real'
   or aggregate_hold.lease_expires_at<=now() then
  return jsonb_build_object('provider_execution_authorized',false,'reason','aggregate_hold_unavailable','aggregate_enforcement_enabled',true); end if;
 aggregate_result:=tongs.begin_paid_operation_aggregate_attempt(p_reservation_id,p_attempt_key||':aggregate',1::smallint,p_caller_class);
 if not coalesce((aggregate_result->>'enforcement_enabled')::boolean,false)
   or not coalesce((aggregate_result->>'authorized')::boolean,false)
   or nullif(aggregate_result->>'hold_id','')::uuid is distinct from aggregate_binding.hold_id then
  return jsonb_build_object('provider_execution_authorized',false,'reason',coalesce(aggregate_result->>'reason','aggregate_admission_required'),'aggregate_enforcement_enabled',true); end if;$new$;
  if length(v_source)-length(replace(v_source,v_gate,'')) <> length(v_gate) then
    raise exception 'owner Hearth aggregate-attempt gate changed upstream';
  end if;
  v_source := replace(v_source,v_gate,v_repaired_gate);
  if v_source=v_original then raise exception 'owner Hearth aggregate enforcement repair made no change'; end if;
  execute v_source;

  v_signature := to_regprocedure(
    'tongs.authorize_owner_hearth_research_openai_attempt(uuid,text,smallint,text,bigint,integer,jsonb)'
  );
  if v_signature is null then
    raise exception 'owner Hearth Research provider-attempt authority is missing';
  end if;
  select pg_get_functiondef(v_signature) into v_source;
  v_original := v_source;
  v_declaration := 'aggregate_result jsonb; seq int;';
  v_repaired_declaration := 'aggregate_result jsonb; aggregate_binding tongs.paid_operation_aggregate_bindings%rowtype;' || E'\n ' ||
    'aggregate_hold tongs.restricted_beta_exposure_holds%rowtype; seq int;';
  if length(v_source)-length(replace(v_source,v_declaration,'')) <> length(v_declaration) then
    raise exception 'owner Hearth Research provider-attempt declaration changed upstream';
  end if;
  v_source := replace(v_source,v_declaration,v_repaired_declaration);

  v_gate := $old$
 aggregate_result:=tongs.begin_paid_operation_aggregate_attempt(p_reservation_id,p_attempt_key||':aggregate',1::smallint,p_caller_class);
 if coalesce((aggregate_result->>'enforcement_enabled')::boolean,false) and not coalesce((aggregate_result->>'authorized')::boolean,false) then
  return jsonb_build_object('provider_execution_authorized',false,'reason',aggregate_result->>'reason'); end if;$old$;
  v_repaired_gate := $new$
 select * into aggregate_binding from tongs.paid_operation_aggregate_bindings where reservation_id=p_reservation_id;
 if aggregate_binding.reservation_id is null
   or aggregate_binding.policy_revision_id<>o.aggregate_policy_revision_id
   or aggregate_binding.capability_code<>'openai.text.hearth_research'
   or aggregate_binding.provider<>'openai'
   or aggregate_binding.operation_id<>o.operation_id
   or aggregate_binding.user_id<>o.owner_user_id
   or aggregate_binding.workspace_id<>o.workspace_id
   or aggregate_binding.request_fingerprint<>o.request_fingerprint
   or aggregate_binding.model_or_sku<>o.provider_model_id
   or aggregate_binding.funding_source_type<>'owner_budget'
   or aggregate_binding.credential_funding<>'forge'
   or aggregate_binding.provider_mode<>'real'
   or aggregate_binding.pricing_revision_id<>o.pricing_revision_id
   or aggregate_binding.cost_policy_revision_id is distinct from o.cost_policy_revision_id then
  return jsonb_build_object('provider_execution_authorized',false,'reason','aggregate_admission_required','aggregate_enforcement_enabled',true); end if;
 select * into aggregate_hold from tongs.restricted_beta_exposure_holds where id=aggregate_binding.hold_id;
 if aggregate_hold.id is null
   or aggregate_hold.policy_revision_id<>aggregate_binding.policy_revision_id
   or aggregate_hold.operation_identity<>aggregate_binding.operation_id
   or aggregate_hold.user_id<>aggregate_binding.user_id
   or aggregate_hold.workspace_id<>aggregate_binding.workspace_id
   or aggregate_hold.request_fingerprint<>aggregate_binding.request_fingerprint
   or aggregate_hold.model_or_sku<>aggregate_binding.model_or_sku
   or aggregate_hold.funding_class<>'owner_operating_budget'
   or aggregate_hold.provider_mode<>'real'
   or aggregate_hold.lease_expires_at<=now() then
  return jsonb_build_object('provider_execution_authorized',false,'reason','aggregate_hold_unavailable','aggregate_enforcement_enabled',true); end if;
 aggregate_result:=tongs.begin_paid_operation_aggregate_attempt(p_reservation_id,p_attempt_key||':aggregate',1::smallint,p_caller_class);
 if not coalesce((aggregate_result->>'enforcement_enabled')::boolean,false)
   or not coalesce((aggregate_result->>'authorized')::boolean,false)
   or nullif(aggregate_result->>'hold_id','')::uuid is distinct from aggregate_binding.hold_id then
  return jsonb_build_object('provider_execution_authorized',false,'reason',coalesce(aggregate_result->>'reason','aggregate_admission_required'),'aggregate_enforcement_enabled',true); end if;$new$;
  if length(v_source)-length(replace(v_source,v_gate,'')) <> length(v_gate) then
    raise exception 'owner Hearth Research aggregate-attempt gate changed upstream';
  end if;
  v_source := replace(v_source,v_gate,v_repaired_gate);
  if v_source=v_original then raise exception 'owner Hearth Research aggregate enforcement repair made no change'; end if;
  execute v_source;
end
$repair$;

revoke all on function tongs.authorize_owner_hearth_provider_attempt_with_aggregate(uuid,text,smallint,text,bigint,integer,jsonb)
  from public,anon,authenticated;
grant execute on function tongs.authorize_owner_hearth_provider_attempt_with_aggregate(uuid,text,smallint,text,bigint,integer,jsonb)
  to service_role;
revoke all on function tongs.authorize_owner_hearth_research_openai_attempt(uuid,text,smallint,text,bigint,integer,jsonb)
  from public,anon,authenticated;
grant execute on function tongs.authorize_owner_hearth_research_openai_attempt(uuid,text,smallint,text,bigint,integer,jsonb)
  to service_role;

commit;
