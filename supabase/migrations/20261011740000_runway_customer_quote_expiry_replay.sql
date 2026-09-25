-- Permit one bounded replacement quote after expiry without mutating or deleting
-- the historical quote. Reservation and provider execution remain one per exact
-- operation. Customer Test only; Live, Owner, and BYO authority are unchanged.
begin;

do $$
begin
  if not exists(select 1 from supabase_migrations.schema_migrations where version='20261011730000') then
    raise exception '20261011730000 must precede Runway quote-expiry replay repair';
  end if;
end $$;

alter table tongs.customer_spending_quotes
  drop constraint customer_spending_quotes_user_id_operation_id_key;
create index customer_spending_quotes_user_operation_idx
  on tongs.customer_spending_quotes(user_id,operation_id,created_at desc);

alter table tongs.runway_customer_test_quote_bindings
  drop constraint runway_customer_test_quote_bindings_pkey;
alter table tongs.runway_customer_test_quote_bindings
  add primary key(authorization_id,quote_id);

alter table tongs.runway_customer_test_authorizations
  add column maximum_quote_count integer not null default 2 check(maximum_quote_count=2);

revoke all on tongs.runway_customer_test_authorizations from public,anon,authenticated;
revoke all on tongs.runway_customer_test_quote_bindings from public,anon,authenticated;
grant select on tongs.runway_customer_test_authorizations to service_role;
grant select on tongs.runway_customer_test_quote_bindings to service_role;

create or replace function tongs.create_shadow_spending_quote(
  p_quote_id uuid,p_user_id uuid,p_operation_id text,p_tool text,p_workspace_id uuid,
  p_pricing_revision_id uuid,p_request_fingerprint text,p_provider_funding_summary jsonb,p_expires_at timestamptz
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_revision tongs.private_pricing_revisions%rowtype;
  v_existing tongs.customer_spending_quotes%rowtype;
  v_operation text:=nullif(btrim(coalesce(p_operation_id,'')),'');
  v_tool text:=nullif(btrim(coalesce(p_tool,'')),'');
  v_hash text;
  v_price bigint;
  v_free jsonb;
  v_runway_renewal_allowed boolean:=false;
begin
  perform tongs._require_pricing_service_role();
  if p_quote_id is null or p_user_id is null or v_operation is null or length(v_operation)<8 or v_tool is null
    or p_request_fingerprint!~'^[0-9a-f]{64}$' or jsonb_typeof(coalesce(p_provider_funding_summary,'null'::jsonb))<>'array'
    or p_expires_at is null or p_expires_at<=now() then raise exception 'invalid shadow spending quote' using errcode='22023'; end if;
  select * into v_revision from tongs.private_pricing_revisions where id=p_pricing_revision_id;
  if not found then raise exception 'private pricing revision not found' using errcode='P0002'; end if;
  if v_revision.lifecycle_state<>'review_ready' or v_revision.markup_basis_points is null or v_revision.customer_credit_units is null then
    raise exception 'pricing_not_configured' using errcode='P0001'; end if;
  if exists(select 1 from jsonb_array_elements(p_provider_funding_summary)item where jsonb_typeof(item)<>'object'
    or item->>'credential_source' not in ('forge','byo_customer') or nullif(btrim(coalesce(item->>'component','')),'') is null
    or nullif(btrim(coalesce(item->>'provider_label','')),'') is null) then raise exception 'invalid provider funding summary' using errcode='22023'; end if;
  v_price:=coalesce(v_revision.settled_customer_price_micros,
    tongs.round_customer_price_micros(v_revision.full_cost_ceiling_micros::numeric*(10000::numeric+v_revision.markup_basis_points)/10000::numeric,v_revision.currency));
  if v_price<>v_revision.customer_price_ceiling_micros then
    raise exception 'pricing_not_configured: settled customer price must equal the published ceiling' using errcode='P0001';
  end if;
  v_free:='["forge_failure","provider_failure","provider_billed_failure","unknown_fault","prebilling_rejection","forge_validation_failure","persistence_failure"]'::jsonb;
  v_hash:=encode(extensions.digest(convert_to(jsonb_build_object('quote_id',p_quote_id,'user_id',p_user_id,
    'operation_id',v_operation,'tool',v_tool,'workspace_id',p_workspace_id,'pricing_revision_id',v_revision.id,
    'pricing_revision',v_revision.revision,'currency',v_revision.currency,'normal_maximum_charge_micros',v_price,
    'billable_failure_maximum_charge_micros',0,'customer_credit_units',v_revision.customer_credit_units,
    'request_fingerprint',p_request_fingerprint,'provider_funding_summary',p_provider_funding_summary,'expires_at',p_expires_at)::text,'utf8'),'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended('spending-quote:'||p_user_id::text||':'||v_operation,0));
  select * into v_existing from tongs.customer_spending_quotes where id=p_quote_id;
  if found then
    if v_existing.user_id<>p_user_id or v_existing.operation_id<>v_operation
       or v_existing.request_fingerprint<>p_request_fingerprint or v_existing.pricing_revision_id<>p_pricing_revision_id then
      raise exception 'shadow spending quote replay conflict' using errcode='23505'; end if;
    return jsonb_build_object('quote_id',v_existing.id,'quote_hash',v_existing.quote_hash,'replay',true,'execution_authorized',false);
  end if;
  if exists(select 1 from tongs.customer_spending_quotes where user_id=p_user_id and operation_id=v_operation) then
    select exists(
      select 1 from tongs.runway_customer_test_authorizations scope_authorization
      where scope_authorization.user_id=p_user_id and scope_authorization.workspace_id=p_workspace_id
        and scope_authorization.operation_id=v_operation and scope_authorization.operation_fingerprint=p_request_fingerprint
        and scope_authorization.pricing_revision_id=p_pricing_revision_id and scope_authorization.financial_environment='test'
        and scope_authorization.status='active' and scope_authorization.valid_from<=now() and scope_authorization.valid_until>now()
        and scope_authorization.model='gen4.5' and scope_authorization.generation_mode='text_to_video'
        and scope_authorization.duration_seconds=5 and scope_authorization.ratio='1280:720'
        and scope_authorization.output_count=1 and scope_authorization.reference_image_count=0
        and scope_authorization.maximum_provider_attempts=1 and scope_authorization.maximum_operation_count=1
        and not exists(select 1 from tongs.customer_spending_quotes current_quote
          where current_quote.user_id=p_user_id and current_quote.operation_id=v_operation and current_quote.expires_at>now())
        and not exists(select 1 from tongs.customer_spending_quote_acceptances acceptance
          join tongs.customer_spending_quotes prior_quote on prior_quote.id=acceptance.quote_id
          where prior_quote.user_id=p_user_id and prior_quote.operation_id=v_operation)
        and not exists(select 1 from tongs.funding_reservations reservation
          where reservation.user_id=p_user_id and reservation.operation_id=v_operation)
    ) into v_runway_renewal_allowed;
    if not v_runway_renewal_allowed then
      raise exception 'shadow spending quote replay conflict' using errcode='23505';
    end if;
  end if;
  insert into tongs.customer_spending_quotes(id,user_id,operation_id,tool,workspace_id,pricing_revision_id,pricing_revision,currency,
    normal_maximum_charge_micros,billable_failure_maximum_charge_micros,customer_credit_units,full_cost_ceiling_micros,
    billable_failure_classes,free_failure_classes,included_quantity,retention_policy,provider_funding_summary,request_fingerprint,quote_hash,expires_at)
  values(p_quote_id,p_user_id,v_operation,v_tool,p_workspace_id,v_revision.id,v_revision.revision,v_revision.currency,v_price,0,
    v_revision.customer_credit_units,v_revision.full_cost_ceiling_micros,'[]'::jsonb,v_free,v_revision.included_quantity,v_revision.retention_policy,
    p_provider_funding_summary,p_request_fingerprint,v_hash,p_expires_at);
  return jsonb_build_object('quote_id',p_quote_id,'quote_hash',v_hash,'replay',false,'execution_authorized',false);
end $$;

create or replace function tongs.create_customer_runway_quote(
  p_quote_id uuid,p_user_id uuid,p_operation_id text,p_workspace_id uuid,
  p_operation_fingerprint text,p_model text,p_duration_seconds integer,
  p_ratio text,p_expires_at timestamptz
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_authorization tongs.runway_customer_test_authorizations%rowtype;
  result jsonb;
  q tongs.customer_spending_quotes%rowtype;
  v_replay boolean;
  v_quote_count integer;
begin
  perform tongs._require_pricing_service_role();
  select * into v_authorization from tongs.runway_customer_test_authorizations
  where user_id=p_user_id and workspace_id=p_workspace_id and status='active'
    and valid_from<=now() and valid_until>now() and operation_id=btrim(p_operation_id)
    and operation_fingerprint=lower(p_operation_fingerprint) and model=p_model
    and duration_seconds=p_duration_seconds and ratio=p_ratio and reference_image_count=0
    and pricing_revision_id='19730000-0000-4000-8000-000000000002'
  order by created_at desc limit 1;
  if not found then raise exception 'Runway customer Test scope is not authorized for this exact operation' using errcode='42501'; end if;
  if p_expires_at>v_authorization.valid_until or p_expires_at>clock_timestamp()+interval '10 minutes' then
    raise exception 'Runway quote expiry exceeds bounded authorization' using errcode='22023'; end if;
  select quote_row.* into q
  from tongs.runway_customer_test_quote_bindings binding
  join tongs.customer_spending_quotes quote_row on quote_row.id=binding.quote_id
  where binding.authorization_id=v_authorization.id and quote_row.expires_at>now()
    and not exists(select 1 from tongs.customer_spending_quote_acceptances acceptance where acceptance.quote_id=quote_row.id)
  order by quote_row.created_at desc limit 1;
  if found then
    p_quote_id:=q.id;
    p_expires_at:=q.expires_at;
  else
    select count(*) into v_quote_count from tongs.runway_customer_test_quote_bindings where authorization_id=v_authorization.id;
    if v_quote_count>=v_authorization.maximum_quote_count then
      raise exception 'Runway customer Test quote renewal limit reached' using errcode='P0001';
    end if;
  end if;
  select exists(select 1 from tongs.customer_spending_quotes where id=p_quote_id) into v_replay;
  result:=tongs._create_customer_runway_quote_before_gen45_customer_test(
    p_quote_id,p_user_id,p_operation_id,p_workspace_id,p_operation_fingerprint,p_model,p_duration_seconds,p_ratio,p_expires_at);
  select * into q from tongs.customer_spending_quotes where id=p_quote_id;
  if q.pricing_revision_id<>v_authorization.pricing_revision_id
     or q.normal_maximum_charge_micros<>v_authorization.maximum_customer_charge_micros
     or q.billable_failure_maximum_charge_micros<>0 or q.customer_credit_units<>160
     or q.full_cost_ceiling_micros<>v_authorization.maximum_wholesale_exposure_micros
     or q.financial_environment<>'test' then
    raise exception 'Runway quote escaped the exact Test product authority' using errcode='42501';
  end if;
  insert into tongs.runway_customer_test_quote_bindings(authorization_id,quote_id)
  values(v_authorization.id,q.id) on conflict do nothing;
  if not exists(select 1 from tongs.runway_customer_test_quote_bindings where authorization_id=v_authorization.id and quote_id=q.id) then
    raise exception 'Runway customer Test quote binding failed' using errcode='P0001';
  end if;
  return jsonb_build_object(
    'quote_id',q.id,'operation_id',q.operation_id,'quote_hash',q.quote_hash,
    'request_fingerprint',q.request_fingerprint,'currency',q.currency,
    'normal_maximum_charge_micros',q.normal_maximum_charge_micros,
    'billable_failure_maximum_charge_micros',q.billable_failure_maximum_charge_micros,
    'customer_credit_units',q.customer_credit_units,'billable_failure_classes',q.billable_failure_classes,
    'free_failure_classes',q.free_failure_classes,'included_quantity',q.included_quantity,
    'retention_policy',q.retention_policy,'provider_funding_summary',q.provider_funding_summary,
    'expires_at',q.expires_at,'funding',coalesce(result->'funding','{}'::jsonb),
    'customer_spending_enabled',true,'requires_confirmation',true,
    'activation_scope','normal_customer_test_exact_operation','replay',v_replay or coalesce((result->>'replay')::boolean,false));
end $$;

revoke all on function tongs.create_shadow_spending_quote(uuid,uuid,text,text,uuid,uuid,text,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function tongs.create_shadow_spending_quote(uuid,uuid,text,text,uuid,uuid,text,jsonb,timestamptz) to service_role;
revoke all on function tongs.create_customer_runway_quote(uuid,uuid,text,uuid,text,text,integer,text,timestamptz) from public,anon,authenticated;
grant execute on function tongs.create_customer_runway_quote(uuid,uuid,text,uuid,text,text,integer,text,timestamptz) to service_role;

do $$
begin
  if exists(select 1 from pg_constraint where conrelid='tongs.customer_spending_quotes'::regclass and conname='customer_spending_quotes_user_id_operation_id_key') then
    raise exception 'single immutable quote constraint still blocks expiry renewal';
  end if;
  if not exists(select 1 from pg_constraint where conrelid='tongs.runway_customer_test_quote_bindings'::regclass
    and conname='runway_customer_test_quote_bindings_pkey' and pg_get_constraintdef(oid)='PRIMARY KEY (authorization_id, quote_id)') then
    raise exception 'Runway quote history binding key mismatch';
  end if;
  if exists(select 1 from tongs.runway_customer_test_authorizations where maximum_quote_count<>2) then
    raise exception 'Runway quote renewal escaped two-quote bound';
  end if;
  if exists(select 1 from tongs.funding_reservations group by user_id,operation_id having count(*)>1) then
    raise exception 'one-reservation operation authority regressed';
  end if;
  if has_function_privilege('public','tongs.create_customer_runway_quote(uuid,uuid,text,uuid,text,text,integer,text,timestamptz)','execute')
     or has_function_privilege('anon','tongs.create_customer_runway_quote(uuid,uuid,text,uuid,text,text,integer,text,timestamptz)','execute')
     or has_function_privilege('authenticated','tongs.create_customer_runway_quote(uuid,uuid,text,uuid,text,text,integer,text,timestamptz)','execute')
     or not has_function_privilege('service_role','tongs.create_customer_runway_quote(uuid,uuid,text,uuid,text,text,integer,text,timestamptz)','execute') then
    raise exception 'Runway renewable quote privilege mismatch';
  end if;
  if has_table_privilege('authenticated','tongs.runway_customer_test_authorizations','select,insert,update,delete')
     or has_table_privilege('authenticated','tongs.runway_customer_test_quote_bindings','select,insert,update,delete')
     or has_table_privilege('anon','tongs.runway_customer_test_authorizations','select')
     or has_table_privilege('anon','tongs.runway_customer_test_quote_bindings','select')
     or not has_table_privilege('service_role','tongs.runway_customer_test_authorizations','select')
     or not has_table_privilege('service_role','tongs.runway_customer_test_quote_bindings','select') then
    raise exception 'Runway quote-expiry table privilege mismatch';
  end if;
  if not (select relrowsecurity and relforcerowsecurity from pg_class where oid='tongs.runway_customer_test_authorizations'::regclass)
     or not (select relrowsecurity and relforcerowsecurity from pg_class where oid='tongs.runway_customer_test_quote_bindings'::regclass) then
    raise exception 'Runway quote-expiry RLS mismatch';
  end if;
  if (select lifecycle_state from tongs.financial_environment_configuration_revisions where environment='live' order by revision desc limit 1)<>'inactive_ready' then
    raise exception 'Live changed during Runway quote-expiry repair';
  end if;
end $$;

comment on function tongs.create_customer_runway_quote(uuid,uuid,text,uuid,text,text,integer,text,timestamptz) is
  'Service-only exact-operation customer Test quote. Replays a current immutable quote or permits one immutable replacement after expiry; never reserves funds or calls Runway.';

notify pgrst,'reload schema';
commit;
