begin;
set request.jwt.claim.role='service_role';

do $$
declare
  owner_id uuid:='6b100000-0000-4000-8000-000000000001';
  workspace_id uuid:='6b100000-0000-4000-8000-000000000101';
  quote_id uuid:='6c100000-0000-4000-8000-000000000001';
  acceptance_id uuid:='6c100000-0000-4000-8000-000000000002';
  reservation_id uuid:='6c100000-0000-4000-8000-000000000003';
  operation_id text:='hammer-owner-canary-proof-0001';
  fingerprint text:=repeat('a',64);
  quote_result jsonb; bound_result jsonb; reserve_result jsonb;
  aggregate_result jsonb; provider_result jsonb; denied boolean:=false;
begin
  quote_result:=tongs.create_owner_openai_text_canary_quote(
    quote_id,owner_id,operation_id,'hammer.transcript_cleanup',workspace_id,'workpiece-proof',
    fingerprint,'gpt-5.4-mini','forge',now()+interval '10 minutes');
  if (quote_result->>'customer_credit_units')::bigint<>46
     or (quote_result->>'maximum_customer_charge_micros')::bigint<>230000
     or quote_result->>'funding_environment'<>'test'
     or quote_result ? 'full_cost_ceiling_micros'
     or quote_result ? 'pricing_revision_id'
     or quote_result ? 'provider_model_id' then
    raise exception 'owner canary quote is not the customer-safe 46-credit contract';
  end if;

  perform tongs.bind_bounded_provider_quote_request(
    quote_id,owner_id,operation_id,'hammer.transcript_cleanup',fingerprint,'gpt-5.4-mini',
    'default','slice6c1-proof','slice6c1-proof',repeat('b',64),1024,100,10,1024,1024,16384,1::smallint);
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform tongs.accept_quote(quote_id,acceptance_id,'owner-canary-proof-acceptance',quote_result->>'quote_hash');
  perform set_config('request.jwt.claim.role','service_role',true);

  reserve_result:=tongs.reserve_owner_openai_text_canary_quote(
    quote_id,reservation_id,owner_id,operation_id,'hammer.transcript_cleanup',workspace_id,
    'workpiece-proof',fingerprint,'gpt-5.4-mini','forge','owner-canary-proof-reservation');
  if reserve_result#>>'{paid_execution,funding_environment}'<>'test'
     or (select funding_source_type from tongs.funding_reservations where id=reservation_id)<>'owner_budget'
     or (select reserved_wholesale_spend_micros from tongs.funding_reservations where id=reservation_id)<>169728
     or (select reserved_customer_charge_micros from tongs.funding_reservations where id=reservation_id)<>0
     or (select rollout_authorization_id is null from tongs.funding_reservations where id=reservation_id) then
    raise exception 'owner canary reservation did not bind exact Test scope and budget';
  end if;

  aggregate_result:=tongs.acquire_openai_text_aggregate_admission(reservation_id,'interactive','real');
  if coalesce((aggregate_result->>'authorized')::boolean,false) is not true then
    raise exception 'owner canary aggregate admission failed: %',aggregate_result;
  end if;
  provider_result:=tongs.authorize_openai_text_provider_attempt_with_aggregate(
    reservation_id,'owner-canary-proof-attempt',1::smallint,'interactive',169728,60,
    jsonb_build_object('no_network',true,'proof','rollback_only'));
  if coalesce((provider_result->>'provider_execution_authorized')::boolean,false) is not true then
    raise exception 'owner canary did not reach provider boundary: %',provider_result;
  end if;

  -- Wrong operation, model, subject, workspace, and Live have no private lane.
  if exists(select 1 from tongs._owner_paid_execution_canary_for_choice(owner_id,workspace_id,'hearth.chat_completion','gpt-5.4-mini'))
     or exists(select 1 from tongs._owner_paid_execution_canary_for_choice(owner_id,workspace_id,'hammer.transcript_cleanup','gpt-5.6-sol'))
     or exists(select 1 from tongs._owner_paid_execution_canary_for_choice('6b100000-0000-4000-8000-000000000099',workspace_id,'hammer.transcript_cleanup','gpt-5.4-mini'))
     or exists(select 1 from tongs.customer_paid_execution_scope_authorizations
       where route_code='hammer.transcript_cleanup' and financial_environment='live') then
    raise exception 'owner canary identity/environment isolation failed';
  end if;

  -- A second provider attempt is impossible because the exact cost binding allows one.
  begin
    provider_result:=tongs.authorize_openai_text_provider_attempt_with_aggregate(
      reservation_id,'owner-canary-proof-attempt-two',2::smallint,'interactive',169728,60,'{}'::jsonb);
    denied:=coalesce((provider_result->>'provider_execution_authorized')::boolean,false) is not true;
  exception when others then denied:=true; end;
  if not denied then raise exception 'second provider attempt was not denied'; end if;

  if (select mode from tongs.openai_text_rollout_revisions
      where route_code='hammer.transcript_cleanup' order by revision desc limit 1)<>'halt_new'
     or exists(select 1 from tongs.customer_paid_execution_scope_authorizations
       where route_code='hammer.transcript_cleanup' and authorization_kind='normal_customer') then
    raise exception 'general Hammer halt/customer isolation regressed';
  end if;
end $$;

rollback;

-- The proof must leave no durable quote, reservation, hold, attempt, expense,
-- charge, or settlement row. The verifier checks those counts after rollback.
