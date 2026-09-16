-- A settled operation with its canonical deliverable is successful economic
-- history. A later replay/continuation error must never reinterpret it as a
-- failed customer operation or automatically restore the original credits.

begin;

create or replace function tongs.settle_openai_customer_failure_without_duplicate_expense(
  p_reservation_id uuid,
  p_relief_id uuid,
  p_event_key text,
  p_failure_class text,
  p_evidence_json jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog
as $$
declare
  state text;
  relief jsonb;
  released jsonb;
  original_customer_charge_micros bigint:=0;
begin
  perform tongs._require_pricing_service_role();
  if p_relief_id is null
     or length(btrim(coalesce(p_event_key,'')))<8
     or nullif(btrim(coalesce(p_failure_class,'')),'') is null
     or jsonb_typeof(coalesce(p_evidence_json,'null'::jsonb))<>'object' then
    raise exception 'invalid OpenAI customer failure settlement' using errcode='22023';
  end if;
  if not exists(
    select 1
    from tongs.openai_text_funding_bindings
    where reservation_id=p_reservation_id
  ) then
    raise exception 'OpenAI funding binding required' using errcode='P0002';
  end if;

  state:=tongs._funding_reservation_state(p_reservation_id);
  if state='submission_unknown' then
    raise exception 'ambiguous submission reservation requires reconciliation' using errcode='P0001';
  elsif state='settled' then
    -- The immutable generic paid result is written only after route validation
    -- and canonical domain persistence. Match it back to the exact immutable
    -- funding binding so an unrelated result can never suppress valid relief.
    if exists(
      select 1
      from tongs.openai_text_persisted_results result
      join tongs.openai_text_funding_bindings binding
        on binding.reservation_id=result.reservation_id
       and binding.operation_id=result.operation_id
       and binding.route_code=result.route_code
      where result.reservation_id=p_reservation_id
    ) then
      select coalesce(event.customer_charge_micros,0)
      into original_customer_charge_micros
      from tongs.funding_reservation_events event
      where event.reservation_id=p_reservation_id
        and event.event_type='settled'
      order by event.sequence desc
      limit 1;

      return jsonb_build_object(
        'reservation_id',p_reservation_id,
        'state','settled_result_preserved',
        'replay',true,
        'customer_charge_micros',coalesce(original_customer_charge_micros,0),
        'customer_relief',null,
        'supplier_expense_created',false,
        'reason','canonical_result_already_persisted'
      );
    end if;

    -- Preserve the existing customer-protection path for a genuinely failed
    -- paid operation that settled without delivering a canonical result.
    relief:=tongs.relieve_failed_customer_operation(
      p_relief_id,
      p_reservation_id,
      btrim(p_event_key)||':customer-relief',
      'Forge/provider failure customer protection',
      coalesce(p_evidence_json,'{}'::jsonb)
    );
    return jsonb_build_object(
      'reservation_id',p_reservation_id,
      'state','relieved',
      'customer_charge_micros',0,
      'customer_relief',relief,
      'supplier_expense_created',false
    );
  elsif state='released' then
    return jsonb_build_object(
      'reservation_id',p_reservation_id,
      'state','released',
      'replay',true,
      'customer_charge_micros',0,
      'supplier_expense_created',false
    );
  end if;

  released:=tongs.release_operation(
    p_reservation_id,
    btrim(p_event_key)||':zero-charge-release',
    'Confirmed '||btrim(p_failure_class)||'; customer charge zero',
    coalesce(p_evidence_json,'{}'::jsonb)
  );
  return released||jsonb_build_object(
    'customer_charge_micros',0,
    'supplier_expense_created',false
  );
end
$$;

revoke all on function tongs.settle_openai_customer_failure_without_duplicate_expense(uuid,uuid,text,text,jsonb)
  from public,anon,authenticated;
grant execute on function tongs.settle_openai_customer_failure_without_duplicate_expense(uuid,uuid,text,text,jsonb)
  to service_role;

comment on function tongs.settle_openai_customer_failure_without_duplicate_expense(uuid,uuid,text,text,jsonb) is
  'Releases or relieves genuine failed paid operations without duplicating supplier expense; settled operations with an immutable canonical result are preserved and cannot receive automatic failure relief.';

notify pgrst,'reload schema';

commit;
