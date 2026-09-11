-- Repair the owner attempt wrapper's call into the canonical aggregate gate.
-- The canonical attempt-number parameter is smallint; an uncast SQL literal
-- resolves as integer and prevented execution before provider submission.
begin;

create or replace function tongs.authorize_owner_hearth_provider_attempt_with_aggregate(
 p_reservation_id uuid,p_attempt_key text,p_attempt_number smallint,p_caller_class text,p_failure_exposure_micros bigint,
 p_lease_seconds integer,p_evidence_json jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare op tongs.owner_hearth_operation_authorizations%rowtype; authz tongs.owner_hearth_authorizations%rowtype; latest tongs.owner_hearth_authorization_events%rowtype;
 hold tongs.openai_text_failure_exposure_holds%rowtype; res tongs.funding_reservations%rowtype; aggregate_result jsonb;
 current_failure bigint; current_concurrency bigint; seq integer; lease timestamptz;
begin
 perform tongs._require_pricing_service_role();
 if p_attempt_number<>1 or p_caller_class not in ('interactive','recovery') or p_lease_seconds not between 5 and 900 then
  raise exception 'owner Hearth attempt outside authorization' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('owner-hearth-attempt:'||p_reservation_id::text,0));
 select * into op from tongs.owner_hearth_operation_authorizations where reservation_id=p_reservation_id;
 select * into authz from tongs.owner_hearth_authorizations where id=op.authorization_id;
 select * into latest from tongs.owner_hearth_authorization_events where authorization_id=authz.id order by sequence desc limit 1;
 select * into res from tongs.funding_reservations where id=p_reservation_id for update;
 if op.id is null or authz.id is null or latest.state<>'active' or latest.expires_at<=now() or res.id is null
   or p_failure_exposure_micros>authz.maximum_amount_micros then raise exception 'owner Hearth authorization unavailable' using errcode='42501'; end if;
 select * into hold from tongs.openai_text_failure_exposure_holds where attempt_key=btrim(p_attempt_key);
 if found then return jsonb_build_object('provider_execution_authorized',false,'replay',true,'reason','duplicate_attempt_blocked'); end if;
 select coalesce(sum(coalesce(e.actual_supplier_cost_micros,h.authorized_exposure_micros)),0) into current_failure
 from tongs.openai_text_failure_exposure_holds h join lateral(select * from tongs.openai_text_failure_exposure_events x where x.hold_id=h.id order by sequence desc limit 1)e on true
 join tongs.owner_hearth_operation_authorizations o on o.reservation_id=h.reservation_id
 where o.authorization_id=authz.id and e.event_type in ('failure_realized','unresolved');
 if current_failure+p_failure_exposure_micros>authz.failure_loss_limit_micros then raise exception 'owner Hearth failure-loss cap exhausted' using errcode='42501'; end if;
 select count(*) into current_concurrency from tongs.owner_hearth_operation_authorizations o where o.authorization_id=authz.id
   and o.reservation_id<>p_reservation_id and tongs._funding_reservation_state(o.reservation_id) in ('provider_attempt_shadowed','submission_unknown');
 if current_concurrency>=authz.maximum_concurrency then raise exception 'owner Hearth concurrency cap exhausted' using errcode='42501'; end if;
 aggregate_result:=tongs.begin_paid_operation_aggregate_attempt(p_reservation_id,p_attempt_key||':aggregate',1::smallint,p_caller_class);
 if coalesce((aggregate_result->>'enforcement_enabled')::boolean,false) and not coalesce((aggregate_result->>'authorized')::boolean,false) then
  return jsonb_build_object('provider_execution_authorized',false,'reason',aggregate_result->>'reason','aggregate_enforcement_enabled',true); end if;
 insert into tongs.openai_text_failure_exposure_holds(id,reservation_id,route_code,attempt_key,attempt_number,loss_policy_revision_id,
  authorized_exposure_micros,lease_expires_at)
 values(gen_random_uuid(),p_reservation_id,'hearth.chat_completion',btrim(p_attempt_key),1,null,p_failure_exposure_micros,now()+make_interval(secs=>p_lease_seconds)) returning * into hold;
 insert into tongs.openai_text_failure_exposure_events(id,hold_id,sequence,event_key,event_type,evidence_json)
 values(gen_random_uuid(),hold.id,1,btrim(p_attempt_key)||':loss-authorized','authorized',coalesce(p_evidence_json,'{}'::jsonb));
 if tongs._funding_reservation_state(res.id)<>'reserved' then raise exception 'owner Hearth reservation is not attemptable' using errcode='42501'; end if;
 select coalesce(max(sequence),0)+1 into seq from tongs.funding_reservation_events where reservation_id=res.id;
 lease:=now()+make_interval(secs=>p_lease_seconds);
 insert into tongs.funding_reservation_events(id,reservation_id,sequence,event_type,event_key,provider_attempt_key,lease_expires_at,evidence_json)
 values(gen_random_uuid(),res.id,seq,'provider_attempt_shadowed','reservation:'||res.id::text||':attempt:'||btrim(p_attempt_key),btrim(p_attempt_key),lease,
  coalesce(p_evidence_json,'{}'::jsonb)||jsonb_build_object('owner_hearth_authorization_id',authz.id,'isolated_credential_required',true));
 return jsonb_build_object('provider_execution_authorized',true,'reason','owner_hearth_authorized','replay',false,
  'failure_exposure_hold_id',hold.id,'aggregate_hold_id',aggregate_result->>'hold_id','lease_expires_at',lease);
end $$;

revoke all on function tongs.authorize_owner_hearth_provider_attempt_with_aggregate(uuid,text,smallint,text,bigint,integer,jsonb)
 from public,anon,authenticated;
grant execute on function tongs.authorize_owner_hearth_provider_attempt_with_aggregate(uuid,text,smallint,text,bigint,integer,jsonb)
 to service_role;

commit;
