-- Run after 20261011730000 in an isolated or linked read-only proof session.
begin;

do $$
declare
  quote_acl record;
  reserve_acl record;
  quote_source text;
  reserve_source text;
begin
  if not exists(select 1 from tongs.private_pricing_revisions
    where id='19730000-0000-4000-8000-000000000002' and revision=2
      and lifecycle_state='review_ready' and markup_basis_points=3300
      and full_cost_ceiling_micros=600000 and failure_cost_ceiling_micros=600000
      and unrounded_customer_price_micros=798000 and rounding_adjustment_micros=2000
      and settled_customer_price_micros=800000 and customer_credit_units=160
      and billable_failure_ceiling_micros=0) then
    raise exception 'pricing contract failed';
  end if;
  if not exists(select 1 from tongs.private_pricing_publications
    where pricing_revision_id='19730000-0000-4000-8000-000000000002' and action='published') then
    raise exception 'current pricing publication missing';
  end if;
  if exists(select 1 from tongs.private_pricing_publications publication
    join tongs.private_pricing_revisions revision on revision.id=publication.pricing_revision_id
    join tongs.private_pricing_policies policy on policy.id=revision.policy_id
    where lower(policy.provider)='runway' and lower(policy.sku)='gen4.5:5s:1280:720'
      and revision.revision=1 and publication.action='published') then
    raise exception 'historical owner-pilot price was published';
  end if;
  if not exists(select 1 from tongs.restricted_beta_policy_capabilities
    where id='19730000-0000-4000-8000-000000000006'
      and capability_code='runway.video' and admission_mode='covered'
      and maximum_attempts=1 and maximum_concurrency=1
      and per_operation_supplier_ceiling_micros=600000
      and per_operation_supporting_ceiling_micros=0
      and exact_model_or_sku='gen4.5:5s:1280:720') then
    raise exception 'aggregate capability contract failed';
  end if;
  if (select lifecycle_state from tongs.financial_environment_configuration_revisions
      where environment='live' order by revision desc limit 1)<>'inactive_ready' then
    raise exception 'Live is not inactive-ready';
  end if;
  if exists(select 1 from tongs.runway_customer_test_authorizations
    where financial_environment<>'test' or route_code<>'tongs_broll_v2'
      or provider<>'runway' or model<>'gen4.5' or duration_seconds<>5
      or ratio<>'1280:720' or reference_image_count<>0
      or maximum_provider_attempts<>1 or maximum_operation_count<>1
      or maximum_concurrency<>1 or maximum_customer_charge_micros<>800000
      or maximum_wholesale_exposure_micros<>600000) then
    raise exception 'Test scope escaped exact bounds';
  end if;
  if exists(select 1 from tongs.customer_spending_quotes
    where operation_id='forge:broll:acquire:9b83645ed2fd1bb4d563f045d57c6a54c485aa300a57071856fdcb39db4bad32')
     or exists(select 1 from tongs.funding_reservations
       where operation_id='forge:broll:acquire:9b83645ed2fd1bb4d563f045d57c6a54c485aa300a57071856fdcb39db4bad32')
     or exists(select 1 from tongs.runway_funding_bindings
       where operation_id='forge:broll:acquire:9b83645ed2fd1bb4d563f045d57c6a54c485aa300a57071856fdcb39db4bad32')
     or exists(select 1 from tongs.runway_submission_boundary_events
       where operation_id='forge:broll:acquire:9b83645ed2fd1bb4d563f045d57c6a54c485aa300a57071856fdcb39db4bad32') then
    raise exception 'activation created quote, reservation, binding, or provider attempt';
  end if;

  select pg_get_functiondef('tongs.create_customer_runway_quote(uuid,uuid,text,uuid,text,text,integer,text,timestamptz)'::regprocedure) into quote_source;
  select pg_get_functiondef('tongs.reserve_customer_runway_quote(uuid,uuid,text,text,text,integer,text)'::regprocedure) into reserve_source;
  if position('runway_customer_test_authorizations' in quote_source)=0
     or position('customer_spending_enabled' in quote_source)=0
     or position('customer_spending_quote_acceptances' in reserve_source)=0
     or position('runway_test_authorization_id' in reserve_source)=0 then
    raise exception 'final quote/reservation functions are not exact-scope wrappers';
  end if;
  if has_function_privilege('public','tongs.create_customer_runway_quote(uuid,uuid,text,uuid,text,text,integer,text,timestamptz)','execute')
     or has_function_privilege('anon','tongs.create_customer_runway_quote(uuid,uuid,text,uuid,text,text,integer,text,timestamptz)','execute')
     or has_function_privilege('authenticated','tongs.create_customer_runway_quote(uuid,uuid,text,uuid,text,text,integer,text,timestamptz)','execute')
     or not has_function_privilege('service_role','tongs.create_customer_runway_quote(uuid,uuid,text,uuid,text,text,integer,text,timestamptz)','execute')
     or has_function_privilege('public','tongs.reserve_customer_runway_quote(uuid,uuid,text,text,text,integer,text)','execute')
     or has_function_privilege('anon','tongs.reserve_customer_runway_quote(uuid,uuid,text,text,text,integer,text)','execute')
     or has_function_privilege('authenticated','tongs.reserve_customer_runway_quote(uuid,uuid,text,text,text,integer,text)','execute')
     or not has_function_privilege('service_role','tongs.reserve_customer_runway_quote(uuid,uuid,text,text,text,integer,text)','execute') then
    raise exception 'RPC privilege matrix failed';
  end if;
  if not (select relrowsecurity and relforcerowsecurity from pg_class where oid='tongs.runway_customer_test_authorizations'::regclass)
     or has_table_privilege('authenticated','tongs.runway_customer_test_authorizations','select')
     or has_table_privilege('anon','tongs.runway_customer_test_authorizations','select')
     or not has_table_privilege('service_role','tongs.runway_customer_test_authorizations','select') then
    raise exception 'authority table RLS/privilege matrix failed';
  end if;
end $$;

rollback;
