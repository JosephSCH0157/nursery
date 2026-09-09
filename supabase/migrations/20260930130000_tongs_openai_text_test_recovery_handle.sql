-- Keep actual-route Test certification on the original bounded reservation
-- when a domain workflow recurses or recovers after provider capture.

begin;

create or replace function tongs.read_existing_openai_text_test_certification_funding_handle(
  p_user_id uuid,
  p_operation_id text,
  p_route_code text,
  p_request_fingerprint text
) returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog
as $$
declare
  v_operation tongs.openai_text_test_certification_operations%rowtype;
  v_reservation tongs.openai_text_test_certification_reservations%rowtype;
begin
  perform tongs._require_pricing_service_role();

  select * into v_operation
  from tongs.openai_text_test_certification_operations
  where operation_id=btrim(p_operation_id)
    and route_code=btrim(p_route_code);

  if not found then
    return null;
  end if;

  select * into v_reservation
  from tongs.openai_text_test_certification_reservations
  where operation_record_id=v_operation.id;

  if not found
     or v_reservation.user_id<>p_user_id
     or v_operation.request_fingerprint<>lower(btrim(p_request_fingerprint)) then
    raise exception 'existing Test funding context mismatch' using errcode='42501';
  end if;

  return jsonb_build_object(
    'operation_id',v_reservation.operation_id,
    'reservation_id',v_reservation.id,
    'request_fingerprint',v_operation.request_fingerprint,
    'reservation_state',tongs._openai_text_test_certification_reservation_state(v_reservation.id),
    'execution_kind','simulated_test',
    'real_provider_authorized',false
  );
end $$;

revoke all on function tongs.read_existing_openai_text_test_certification_funding_handle(uuid,text,text,text)
  from public,anon,authenticated;
grant execute on function tongs.read_existing_openai_text_test_certification_funding_handle(uuid,text,text,text)
  to service_role;

comment on function tongs.read_existing_openai_text_test_certification_funding_handle(uuid,text,text,text)
  is 'Returns only the original synthetic-Test reservation handle for actual-route recursion/recovery; never grants real-provider authority.';

commit;
