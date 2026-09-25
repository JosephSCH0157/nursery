begin;

set local request.jwt.claim.role='service_role';

alter table tongs.runway_customer_test_authorizations disable trigger runway_customer_test_authorizations_immutable;
alter table tongs.customer_spending_quotes disable trigger customer_spending_quotes_immutable;

do $$
declare
  scope_authorization tongs.runway_customer_test_authorizations%rowtype;
  first_result jsonb;
  second_result jsonb;
  third_failed boolean:=false;
begin
  select * into scope_authorization
  from tongs.runway_customer_test_authorizations
  order by created_at desc limit 1;
  if not found then raise exception 'local exact Runway authorization fixture missing'; end if;

  update tongs.runway_customer_test_authorizations
  set valid_until=clock_timestamp()+interval '30 minutes'
  where id=scope_authorization.id;

  first_result:=tongs.create_customer_runway_quote(
    '17400000-0000-4000-8000-000000000001',scope_authorization.user_id,
    scope_authorization.operation_id,scope_authorization.workspace_id,
    scope_authorization.operation_fingerprint,'gen4.5',5,'1280:720',
    clock_timestamp()+interval '5 minutes');

  update tongs.customer_spending_quotes
  set created_at=clock_timestamp()-interval '10 minutes',
      expires_at=clock_timestamp()-interval '1 minute'
  where id=(first_result->>'quote_id')::uuid;

  second_result:=tongs.create_customer_runway_quote(
    '17400000-0000-4000-8000-000000000002',scope_authorization.user_id,
    scope_authorization.operation_id,scope_authorization.workspace_id,
    scope_authorization.operation_fingerprint,'gen4.5',5,'1280:720',
    clock_timestamp()+interval '5 minutes');

  if first_result->>'quote_id'=second_result->>'quote_id'
     or (second_result->>'customer_credit_units')::integer<>160 then
    raise exception 'expired quote did not produce the bounded replacement';
  end if;
  if (select count(*) from tongs.runway_customer_test_quote_bindings
      where authorization_id=scope_authorization.id)<>2
     or (select count(*) from tongs.customer_spending_quotes
      where user_id=scope_authorization.user_id and operation_id=scope_authorization.operation_id)<>2 then
    raise exception 'immutable quote history was not retained';
  end if;

  update tongs.customer_spending_quotes
  set created_at=clock_timestamp()-interval '10 minutes',
      expires_at=clock_timestamp()-interval '1 minute'
  where id=(second_result->>'quote_id')::uuid;
  begin
    perform tongs.create_customer_runway_quote(
      '17400000-0000-4000-8000-000000000003',scope_authorization.user_id,
      scope_authorization.operation_id,scope_authorization.workspace_id,
      scope_authorization.operation_fingerprint,'gen4.5',5,'1280:720',
      clock_timestamp()+interval '5 minutes');
  exception when raise_exception then
    third_failed:=position('quote renewal limit reached' in sqlerrm)>0;
  end;
  if not third_failed then raise exception 'third quote was not rejected'; end if;
  if exists(select 1 from tongs.funding_reservations
    where user_id=scope_authorization.user_id and operation_id=scope_authorization.operation_id) then
    raise exception 'quote-only proof created a reservation';
  end if;
end $$;

rollback;
