-- Quote the explicit settled customer price when a pricing revision carries a
-- whole-Forge-Credit rounding adjustment. Historical revisions without those
-- fields retain the prior cent-up calculation.
begin;

create or replace function tongs.create_shadow_spending_quote(
  p_quote_id uuid,p_user_id uuid,p_operation_id text,p_tool text,p_workspace_id uuid,
  p_pricing_revision_id uuid,p_request_fingerprint text,p_provider_funding_summary jsonb,p_expires_at timestamptz
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_revision tongs.private_pricing_revisions%rowtype; v_existing tongs.customer_spending_quotes%rowtype;
  v_operation text:=nullif(btrim(coalesce(p_operation_id,'')),''); v_tool text:=nullif(btrim(coalesce(p_tool,'')),'');
  v_hash text; v_price bigint; v_free jsonb;
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
    tongs.round_customer_price_micros(
      v_revision.full_cost_ceiling_micros::numeric*(10000::numeric+v_revision.markup_basis_points)/10000::numeric,
      v_revision.currency));
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
  select * into v_existing from tongs.customer_spending_quotes where user_id=p_user_id and operation_id=v_operation;
  if found then
    if v_existing.id<>p_quote_id or v_existing.request_fingerprint<>p_request_fingerprint or v_existing.pricing_revision_id<>p_pricing_revision_id then
      raise exception 'shadow spending quote replay conflict' using errcode='23505'; end if;
    return jsonb_build_object('quote_id',v_existing.id,'quote_hash',v_existing.quote_hash,'replay',true,'execution_authorized',false);
  end if;
  insert into tongs.customer_spending_quotes(id,user_id,operation_id,tool,workspace_id,pricing_revision_id,pricing_revision,currency,
    normal_maximum_charge_micros,billable_failure_maximum_charge_micros,customer_credit_units,full_cost_ceiling_micros,
    billable_failure_classes,free_failure_classes,included_quantity,retention_policy,provider_funding_summary,request_fingerprint,quote_hash,expires_at)
  values(p_quote_id,p_user_id,v_operation,v_tool,p_workspace_id,v_revision.id,v_revision.revision,v_revision.currency,v_price,0,
    v_revision.customer_credit_units,v_revision.full_cost_ceiling_micros,'[]'::jsonb,v_free,v_revision.included_quantity,v_revision.retention_policy,
    p_provider_funding_summary,p_request_fingerprint,v_hash,p_expires_at);
  return jsonb_build_object('quote_id',p_quote_id,'quote_hash',v_hash,'replay',false,'execution_authorized',false);
end $$;

do $$
declare definition text;
begin
  select pg_get_functiondef(
    'tongs.create_shadow_spending_quote(uuid,uuid,text,text,uuid,uuid,text,jsonb,timestamptz)'::regprocedure
  ) into definition;
  if position('settled_customer_price_micros' in definition)=0
     or position('settled customer price must equal the published ceiling' in definition)=0 then
    raise exception 'whole-Forge-Credit settled price quote authority was not installed';
  end if;
end $$;

notify pgrst,'reload schema';
commit;
