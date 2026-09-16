-- Restore the immutable financial-environment field on existing ordinary
-- OpenAI funding handles. The initial reservation contract and paid execution
-- context already expose this field; settled replay must expose the same shape.

begin;

create or replace function tongs.read_existing_openai_text_funding_handle(
  p_user_id uuid,
  p_operation_id text,
  p_route_code text,
  p_request_fingerprint text
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_binding tongs.openai_text_funding_bindings%rowtype;
  v_res tongs.funding_reservations%rowtype;
  v_quote_binding tongs.openai_text_customer_quote_bindings%rowtype;
begin
  perform tongs._require_pricing_service_role();

  select * into v_binding
  from tongs.openai_text_funding_bindings
  where operation_id = btrim(p_operation_id)
    and route_code = p_route_code;
  if not found then
    return null;
  end if;

  select * into v_res
  from tongs.funding_reservations
  where id = v_binding.reservation_id;

  select * into v_quote_binding
  from tongs.openai_text_customer_quote_bindings
  where quote_id = v_res.quote_id;

  if not found
    or v_res.id is null
    or v_res.funding_environment not in ('test', 'live', 'owner_internal')
    or v_quote_binding.user_id <> p_user_id
    or v_quote_binding.request_fingerprint <> p_request_fingerprint then
    raise exception 'existing funding context mismatch' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'operation_id', v_binding.operation_id,
    'reservation_id', v_binding.reservation_id,
    'request_fingerprint', v_quote_binding.request_fingerprint,
    'funding_environment', v_res.funding_environment,
    'reservation_state', tongs._funding_reservation_state(v_binding.reservation_id)
  );
end $$;

revoke all on function tongs.read_existing_openai_text_funding_handle(uuid,text,text,text)
  from public, anon, authenticated;
grant execute on function tongs.read_existing_openai_text_funding_handle(uuid,text,text,text)
  to service_role;

comment on function tongs.read_existing_openai_text_funding_handle(uuid,text,text,text) is
  'Returns the strict immutable paid-execution handle shape for an authorized existing ordinary OpenAI operation, including its bound financial environment.';

notify pgrst, 'reload schema';

commit;
