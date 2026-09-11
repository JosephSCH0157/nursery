-- Preserve the explicitly approved historical Runway ceiling even when the
-- legacy reservation row is no longer available. This creates exposure only:
-- never funding entitlement and never a duplicate supplier expense.
begin;

create or replace function tongs.import_legacy_runway_opening_commitment(
 p_reservation_id uuid,p_operator_user_id uuid,p_amount_micros bigint,p_reason text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare r tongs.funding_reservations%rowtype; existing tongs.legacy_supplier_opening_commitments%rowtype;
begin
 if coalesce(auth.role(),'')<>'service_role' or not tongs.is_platform_operator(p_operator_user_id) or p_amount_micros<>750000
   or p_reservation_id is null or length(btrim(coalesce(p_reason,'')))<3 then
  raise exception 'protected exact Runway opening commitment required' using errcode='42501';
 end if;

 select * into existing from tongs.legacy_supplier_opening_commitments
 where commitment_key='runway-owner-pilot:'||p_reservation_id::text;
 if found then return to_jsonb(existing)||jsonb_build_object('replay',true); end if;

 select * into r from tongs.funding_reservations where id=p_reservation_id;
 if found and (r.funding_source_type<>'owner_budget'
    or exists(select 1 from tongs.paid_operation_aggregate_bindings where reservation_id=r.id)) then
  raise exception 'unaggregated historical owner Runway reservation required' using errcode='P0001';
 end if;

 insert into tongs.legacy_supplier_opening_commitments(
  id,environment,provider,reservation_id,commitment_key,amount_micros,status,evidence_json
 ) values(
  gen_random_uuid(),'production','runway',case when r.id is null then null else r.id end,
  'runway-owner-pilot:'||p_reservation_id::text,750000,'unresolved',
  jsonb_build_object(
   'reason',p_reason,
   'legacy_reservation_reference',p_reservation_id,
   'reservation_record_available',r.id is not null,
   'funding_entitlement',false,
   'duplicate_supplier_expense',false,
   'provenance_status',case when r.id is null then 'legacy_reservation_unavailable' else 'canonical_reservation_verified' end
  )
 ) returning * into existing;
 return to_jsonb(existing)||jsonb_build_object('replay',false);
end $$;

revoke all on function tongs.import_legacy_runway_opening_commitment(uuid,uuid,bigint,text)
 from public,anon,authenticated;
grant execute on function tongs.import_legacy_runway_opening_commitment(uuid,uuid,bigint,text)
 to service_role;

commit;
