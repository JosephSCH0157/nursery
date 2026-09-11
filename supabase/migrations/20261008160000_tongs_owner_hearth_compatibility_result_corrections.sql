-- Preserve immutable compatibility results while allowing an audited
-- correction when later inspection proves a recorded billed failure was a
-- definitive, nonbillable provider rejection.
begin;

create table tongs.owner_hearth_compatibility_result_corrections (
  id uuid primary key,
  compatibility_result_id uuid not null unique references tongs.owner_hearth_compatibility_results(id) on delete restrict,
  event_key text not null unique check (length(btrim(event_key)) between 8 and 300),
  original_status text not null check (original_status='billed_failure'),
  corrected_status text not null check (corrected_status='definitive_rejection'),
  reason text not null check (length(btrim(reason)) between 3 and 500),
  evidence_json jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_json)='object'),
  created_at timestamptz not null default now()
);

alter table tongs.owner_hearth_compatibility_result_corrections enable row level security;
alter table tongs.owner_hearth_compatibility_result_corrections force row level security;
revoke all on tongs.owner_hearth_compatibility_result_corrections from public,anon,authenticated,service_role;
grant select,insert on tongs.owner_hearth_compatibility_result_corrections to service_role;
create trigger owner_hearth_compatibility_result_corrections_immutable
before update or delete on tongs.owner_hearth_compatibility_result_corrections
for each row execute function tongs._reject_accounting_mutation();

create or replace function tongs.correct_owner_hearth_compatibility_result_after_nonbillable_rejection(
 p_reservation_id uuid,p_event_key text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare released jsonb; op tongs.owner_hearth_operation_authorizations%rowtype;
 resultrow tongs.owner_hearth_compatibility_results%rowtype;
 existing tongs.owner_hearth_compatibility_result_corrections%rowtype;
begin
 perform tongs._require_pricing_service_role();
 released:=tongs.release_owner_hearth_definitive_nonbillable_rejection(p_reservation_id,btrim(p_event_key)||':exposure');
 if coalesce((released->>'released')::boolean,false) is not true then
  return released||jsonb_build_object('corrected',false); end if;
 select * into op from tongs.owner_hearth_operation_authorizations where reservation_id=p_reservation_id;
 select * into resultrow from tongs.owner_hearth_compatibility_results where operation_authorization_id=op.id;
 if resultrow.id is null then return released||jsonb_build_object('corrected',false,'effective_status','definitive_rejection'); end if;
 if resultrow.status='definitive_rejection' then
  return released||jsonb_build_object('corrected',false,'effective_status','definitive_rejection'); end if;
 if resultrow.status<>'billed_failure' then
  raise exception 'only a billed-failure compatibility result can receive this correction' using errcode='P0001'; end if;
 insert into tongs.owner_hearth_compatibility_result_corrections(
  id,compatibility_result_id,event_key,original_status,corrected_status,reason,evidence_json
 ) values(
  extensions.uuid_generate_v5(resultrow.id,btrim(p_event_key)||':result-correction'),resultrow.id,btrim(p_event_key)||':result-correction',
  'billed_failure','definitive_rejection','Provider returned credit_balance_exhausted before billable generation; original result remains immutable.',
  jsonb_build_object('provider_request_id',coalesce(released->>'provider_request_id',resultrow.provider_request_id),
   'provider_status',released->>'provider_status','provider_code',released->>'provider_code',
   'provider_cost_reconciled_authoritative',false,'original_history_preserved',true)
 ) on conflict(compatibility_result_id) do nothing;
 select * into existing from tongs.owner_hearth_compatibility_result_corrections where compatibility_result_id=resultrow.id;
 return released||jsonb_build_object('corrected',true,'correction_id',existing.id,'effective_status',existing.corrected_status,
  'provider_request_id',coalesce(released->>'provider_request_id',resultrow.provider_request_id));
end $$;

revoke all on function tongs.correct_owner_hearth_compatibility_result_after_nonbillable_rejection(uuid,text)
 from public,anon,authenticated;
grant execute on function tongs.correct_owner_hearth_compatibility_result_after_nonbillable_rejection(uuid,text)
 to service_role;

comment on table tongs.owner_hearth_compatibility_result_corrections is
 'Append-only audited corrections; original compatibility results are never rewritten.';

notify pgrst,'reload schema';
commit;
