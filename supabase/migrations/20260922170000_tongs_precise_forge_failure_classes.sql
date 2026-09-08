-- Preserve older accepted quotes that disclosed the broad forge_failure class
-- while recording precise Forge validation and persistence subclasses.
begin;

create or replace function tongs.record_provider_failure(
  p_reservation_id uuid,
  p_event_key text,
  p_failure_class text,
  p_evidence_json jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_reservation tongs.funding_reservations%rowtype;
  v_quote tongs.customer_spending_quotes%rowtype;
  v_existing tongs.funding_reservation_events%rowtype;
  v_sequence integer;
  v_billable boolean;
  v_disclosed_class text;
begin
  perform tongs._require_pricing_service_role();
  if length(btrim(coalesce(p_event_key, ''))) < 8
     or nullif(btrim(coalesce(p_failure_class, '')), '') is null
     or jsonb_typeof(coalesce(p_evidence_json, 'null'::jsonb)) <> 'object' then
    raise exception 'invalid provider failure' using errcode = '22023';
  end if;
  v_disclosed_class := case btrim(p_failure_class)
    when 'forge_validation_failure' then 'forge_failure'
    when 'persistence_failure' then 'forge_failure'
    else btrim(p_failure_class)
  end;
  perform pg_advisory_xact_lock(hashtextextended('provider-attempt:' || p_reservation_id::text, 0));
  select * into v_reservation from tongs.funding_reservations where id = p_reservation_id for update;
  if not found then raise exception 'funding reservation not found' using errcode = 'P0002'; end if;
  select * into v_quote from tongs.customer_spending_quotes where id = v_reservation.quote_id;
  select * into v_existing from tongs.funding_reservation_events where event_key = btrim(p_event_key);
  if found then return jsonb_build_object('reservation_id', p_reservation_id,
    'failure_class', v_existing.failure_class, 'replay', true); end if;
  if tongs._funding_reservation_state(p_reservation_id) in ('settled', 'released') then
    raise exception 'reservation is terminal' using errcode = 'P0001';
  end if;
  v_billable := exists (select 1 from jsonb_array_elements_text(v_quote.billable_failure_classes) value
    where value in (btrim(p_failure_class), v_disclosed_class));
  if not v_billable and not exists (
    select 1 from jsonb_array_elements_text(v_quote.free_failure_classes) value
    where value in (btrim(p_failure_class), v_disclosed_class)
  ) then raise exception 'failure class was not disclosed by accepted quote' using errcode = 'P0001'; end if;
  select coalesce(max(sequence),0)+1 into v_sequence from tongs.funding_reservation_events
    where reservation_id = p_reservation_id;
  insert into tongs.funding_reservation_events(
    id, reservation_id, sequence, event_type, event_key, failure_class, evidence_json
  ) values (gen_random_uuid(), p_reservation_id, v_sequence, 'provider_failure_recorded',
    btrim(p_event_key), btrim(p_failure_class), coalesce(p_evidence_json, '{}'::jsonb));
  return jsonb_build_object('reservation_id', p_reservation_id, 'failure_class', btrim(p_failure_class),
    'disclosed_as',v_disclosed_class,'billable',v_billable,
    'maximum_customer_charge_micros',case when v_billable then v_quote.billable_failure_maximum_charge_micros else 0 end,
    'replay', false);
end;
$$;

revoke all on function tongs.record_provider_failure(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function tongs.record_provider_failure(uuid,text,text,jsonb) to service_role;

comment on function tongs.record_provider_failure(uuid,text,text,jsonb) is
  'Records precise failure attribution. forge_validation_failure and persistence_failure inherit an accepted broad forge_failure term without changing the quote.';

notify pgrst,'reload schema';
commit;
