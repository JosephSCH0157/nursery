-- Give an unchanged, pre-provider owner compatibility operation a short
-- append-only recovery window without mutating its accepted quote.
begin;

create table tongs.owner_hearth_operation_recovery_authorizations (
  id uuid primary key,
  operation_authorization_id uuid not null unique
    references tongs.owner_hearth_operation_authorizations(id) on delete restrict,
  reservation_id uuid not null unique references tongs.funding_reservations(id) on delete restrict,
  event_key text not null unique,
  authorized_by uuid not null references auth.users(id) on delete restrict,
  reason text not null,
  expires_at timestamptz not null,
  evidence_json jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_json)='object'),
  created_at timestamptz not null default now(),
  check (expires_at>created_at)
);

alter table tongs.owner_hearth_operation_recovery_authorizations enable row level security;
alter table tongs.owner_hearth_operation_recovery_authorizations force row level security;
revoke all on tongs.owner_hearth_operation_recovery_authorizations from public,anon,authenticated,service_role;
grant select,insert on tongs.owner_hearth_operation_recovery_authorizations to service_role;
create trigger owner_hearth_operation_recovery_authorizations_immutable
before update or delete on tongs.owner_hearth_operation_recovery_authorizations
for each row execute function tongs._reject_accounting_mutation();

create or replace function tongs.rearm_owner_hearth_preprovider_release(
  p_reservation_id uuid,p_operator_user_id uuid,p_event_key text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare op tongs.owner_hearth_operation_authorizations%rowtype;
 authz tongs.owner_hearth_authorizations%rowtype;
 auth_event tongs.owner_hearth_authorization_events%rowtype;
 latest tongs.funding_reservation_events%rowtype;
 released tongs.funding_reservation_events%rowtype;
 reserved_event tongs.funding_reservation_events%rowtype;
 recovery tongs.owner_hearth_operation_recovery_authorizations%rowtype;
 nextseq integer;
 recovery_expiry timestamptz;
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
 select * into released from tongs.funding_reservation_events
 where reservation_id=p_reservation_id and event_type='released'
 order by sequence desc limit 1;
 if released.id is null or released.evidence_json->>'reason'<>'aggregate_concurrency_exhausted'
    or coalesce((released.evidence_json->>'transmitted')::boolean,true) then
  raise exception 'aggregate-concurrency pre-provider release evidence required' using errcode='P0001'; end if;
 if exists(select 1 from tongs.funding_reservation_events e where e.reservation_id=p_reservation_id and e.event_type='provider_attempt_shadowed')
    or exists(select 1 from tongs.openai_text_failure_exposure_holds h where h.reservation_id=p_reservation_id)
    or exists(select 1 from tongs.openai_text_usage_evidence u where u.reservation_id=p_reservation_id)
    or exists(select 1 from tongs.supplier_expenses s where s.reservation_id=p_reservation_id)
    or exists(select 1 from tongs.owner_hearth_compatibility_results r where r.operation_authorization_id=op.id) then
  raise exception 'provider or terminal evidence prevents pre-provider recovery' using errcode='P0001'; end if;
 select * into latest from tongs.funding_reservation_events where reservation_id=p_reservation_id order by sequence desc limit 1;
 if latest.event_type='released' then
  select coalesce(max(sequence),0)+1 into nextseq from tongs.funding_reservation_events where reservation_id=p_reservation_id;
  insert into tongs.funding_reservation_events(id,reservation_id,sequence,event_type,event_key,evidence_json)
  values(extensions.uuid_generate_v5(p_reservation_id,btrim(p_event_key)),p_reservation_id,nextseq,'reserved',btrim(p_event_key),
   jsonb_build_object('operator_user_id',p_operator_user_id,'recovery','aggregate_terminal_concurrency_fix',
    'transmitted',false,'provider_submission_count',0,'original_operation_identity_preserved',true))
  returning * into reserved_event;
 elsif latest.event_type='reserved' and latest.evidence_json->>'recovery'='aggregate_terminal_concurrency_fix' then
  reserved_event:=latest;
 else
  raise exception 'reservation is not eligible for pre-provider recovery' using errcode='P0001'; end if;
 select * into recovery from tongs.owner_hearth_operation_recovery_authorizations
 where operation_authorization_id=op.id;
 if not found then
  recovery_expiry:=least(auth_event.expires_at,now()+interval '10 minutes');
  insert into tongs.owner_hearth_operation_recovery_authorizations(
   id,operation_authorization_id,reservation_id,event_key,authorized_by,reason,expires_at,evidence_json
  ) values(
   extensions.uuid_generate_v5(op.id,'preprovider-recovery'),op.id,p_reservation_id,btrim(p_event_key)||':quote-recovery',
   p_operator_user_id,'Continue unchanged accepted compatibility operation after pre-provider aggregate-concurrency defect.',
   recovery_expiry,jsonb_build_object('original_quote_expires_at',op.expires_at,'request_fingerprint',op.request_fingerprint,
    'serialized_body_sha256',op.serialized_body_sha256,'pricing_revision_id',op.pricing_revision_id,
    'cost_policy_revision_id',op.cost_policy_revision_id,'customer_charge_micros',0)
  ) returning * into recovery;
 end if;
 return jsonb_build_object('reservation_id',p_reservation_id,'operation_id',op.operation_id,'model',op.provider_model_id,
  'reservation_state','reserved','recovery_expires_at',recovery.expires_at,'replay',reserved_event.id=latest.id);
end $$;

create or replace function tongs.resolve_owner_hearth_paid_execution_context(
 p_operation_id text,p_reservation_id uuid,p_user_id uuid,p_workspace_id uuid,p_workpiece_id text,p_request_fingerprint text
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare op tongs.owner_hearth_operation_authorizations%rowtype; authz tongs.owner_hearth_authorizations%rowtype; latest tongs.owner_hearth_authorization_events%rowtype;
 res tongs.funding_reservations%rowtype; cost tongs.openai_text_cost_policy_revisions%rowtype; rate tongs.openai_text_provider_rate_revisions%rowtype;
 reservation_state text; recovery_expiry timestamptz;
begin
 perform tongs._require_pricing_service_role();
 select * into op from tongs.owner_hearth_operation_authorizations where operation_id=btrim(p_operation_id) and reservation_id=p_reservation_id;
 select * into authz from tongs.owner_hearth_authorizations where id=op.authorization_id;
 select * into latest from tongs.owner_hearth_authorization_events where authorization_id=authz.id order by sequence desc limit 1;
 select * into res from tongs.funding_reservations where id=p_reservation_id;
 reservation_state:=tongs._funding_reservation_state(p_reservation_id);
 if op.id is null or authz.id is null or res.id is null or op.owner_user_id<>p_user_id or op.workspace_id<>p_workspace_id
   or op.workpiece_id<>btrim(p_workpiece_id) or op.request_fingerprint<>p_request_fingerprint or res.funding_source_id<>authz.budget_id
   or not exists(select 1 from tongs.customer_spending_quote_acceptances where quote_id=op.quote_id and user_id=p_user_id)
   then raise exception 'exact owner Hearth funding context required' using errcode='42501'; end if;
 if latest.state not in ('active','closed') or (latest.state='active' and latest.expires_at<=now()) then
  raise exception 'owner Hearth authorization halted' using errcode='42501'; end if;
 select expires_at into recovery_expiry from tongs.owner_hearth_operation_recovery_authorizations
 where operation_authorization_id=op.id;
 if reservation_state not in ('settled','released') and op.expires_at<=now()
    and coalesce(recovery_expiry,'-infinity'::timestamptz)<=now() then
  raise exception 'owner Hearth accepted quote expired' using errcode='42501'; end if;
 select * into cost from tongs.openai_text_cost_policy_revisions where id=op.cost_policy_revision_id;
 select r.* into rate from tongs.openai_text_provider_rate_revisions r where r.id=nullif(cost.attempt_plan->0->>'rate_revision_id','')::uuid;
 if cost.id is null or rate.id is null or rate.provider_model_id<>op.provider_model_id or res.reserved_wholesale_spend_micros<>cost.full_cost_ceiling_micros then
  raise exception 'exact owner Hearth model cost revision required' using errcode='P0001'; end if;
 return jsonb_build_object('operation_id',op.operation_id,'reservation_id',op.reservation_id,'quote_id',op.quote_id,'route_code','hearth.chat_completion',
  'user_id',op.owner_user_id,'workspace_id',op.workspace_id,'workpiece_id',op.workpiece_id,'request_fingerprint',op.request_fingerprint,
  'funding_source_type','owner_budget','funding_source_id',authz.budget_id,'credential_funding','forge','model',op.provider_model_id,
  'maximum_input_units',cost.maximum_input_units,'maximum_output_units',cost.maximum_output_units,'maximum_attempts',1,
  'maximum_failure_exposure_micros',cost.full_cost_ceiling_micros+3,'direct_provider_ceiling_micros',cost.direct_provider_ceiling_micros,
  'supporting_cost_ceiling_micros',cost.supporting_cost_ceiling_micros,'full_cost_ceiling_micros',cost.full_cost_ceiling_micros,
  'input_micros_per_million_tokens',rate.input_micros_per_million_tokens,'cached_input_micros_per_million_tokens',rate.cached_input_micros_per_million_tokens,
  'output_micros_per_million_tokens',rate.output_micros_per_million_tokens,'cost_policy_revision_id',cost.id,'pricing_revision_id',op.pricing_revision_id,
  'owner_hearth_authorization_id',authz.id,'reservation_state',reservation_state,
  'recovery_authorized',recovery_expiry>now(),'effective_expires_at',greatest(op.expires_at,recovery_expiry));
end $$;

revoke all on function tongs.rearm_owner_hearth_preprovider_release(uuid,uuid,text)
 from public,anon,authenticated;
grant execute on function tongs.rearm_owner_hearth_preprovider_release(uuid,uuid,text) to service_role;
revoke all on function tongs.resolve_owner_hearth_paid_execution_context(text,uuid,uuid,uuid,text,text)
 from public,anon,authenticated;
grant execute on function tongs.resolve_owner_hearth_paid_execution_context(text,uuid,uuid,uuid,text,text) to service_role;

comment on table tongs.owner_hearth_operation_recovery_authorizations is
 'Append-only short recovery authority for an unchanged accepted owner compatibility operation that was rejected before provider transmission.';

notify pgrst,'reload schema';
commit;
