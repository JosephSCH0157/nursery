begin;

-- The owner-funded migration added the reviewed nonnegative constraint but
-- attempted to remove the original inline constraint by a name PostgreSQL had
-- already truncated. Fail closed unless the catalog is exactly the reviewed
-- defective state, then remove only the obsolete positive-charge constraint.
do $repair$
declare
  old_definition text;
  current_definition text;
begin
  select pg_get_constraintdef(oid, true)
    into old_definition
    from pg_constraint
   where conrelid = 'tongs.hammer_transcription_operations'::regclass
     and conname = 'hammer_transcription_operati_accepted_customer_charge_mic_check';
  select pg_get_constraintdef(oid, true)
    into current_definition
    from pg_constraint
   where conrelid = 'tongs.hammer_transcription_operations'::regclass
     and conname = 'hammer_transcription_operations_accepted_customer_charge_micros_check';

  if old_definition is distinct from 'CHECK (accepted_customer_charge_micros > 0)' then
    raise exception 'unexpected obsolete Hammer customer-charge constraint: %', old_definition;
  end if;
  if current_definition is distinct from 'CHECK (accepted_customer_charge_micros >= 0)' then
    raise exception 'unexpected current Hammer customer-charge constraint: %', current_definition;
  end if;

  alter table tongs.hammer_transcription_operations
    drop constraint hammer_transcription_operati_accepted_customer_charge_mic_check;
end
$repair$;

create table tongs.hammer_transcription_preoperation_receipts (
  id uuid primary key,
  quote_id uuid not null references tongs.customer_spending_quotes(id) on delete restrict,
  operation_uuid uuid not null,
  operation_id text not null check (operation_id = 'hammer-assemblyai:' || operation_uuid::text),
  user_id uuid not null references auth.users(id) on delete restrict,
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  stage text not null check (stage in ('background_started', 'pre_admission_failed')),
  idempotency_key text not null unique check (length(btrim(idempotency_key)) > 0),
  failure_code text check (
    (stage = 'background_started' and failure_code is null)
    or (stage = 'pre_admission_failed' and length(btrim(failure_code)) > 0)
  ),
  evidence_json jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_json) = 'object'),
  recorded_at timestamptz not null default clock_timestamp(),
  unique (quote_id, stage)
);

alter table tongs.hammer_transcription_preoperation_receipts enable row level security;

create policy hammer_transcription_preoperation_receipts_customer_read
on tongs.hammer_transcription_preoperation_receipts
for select to authenticated
using ((select auth.uid()) = user_id);

create trigger hammer_transcription_preoperation_receipts_immutable
before update or delete on tongs.hammer_transcription_preoperation_receipts
for each row execute function tongs._reject_hammer_transcription_mutation();

create or replace function tongs.record_hammer_transcription_preoperation_receipt(
  p_quote_id uuid,
  p_operation_uuid uuid,
  p_request_fingerprint text,
  p_stage text,
  p_failure_code text default null,
  p_evidence_json jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  binding tongs.hammer_first_transcription_quote_bindings%rowtype;
  receipt tongs.hammer_transcription_preoperation_receipts%rowtype;
begin
  perform tongs._require_pricing_service_role();
  if p_stage not in ('background_started', 'pre_admission_failed')
     or jsonb_typeof(coalesce(p_evidence_json, '{}'::jsonb)) <> 'object'
  then raise exception 'invalid Hammer pre-operation receipt' using errcode = '22023'; end if;

  select * into binding
    from tongs.hammer_first_transcription_quote_bindings
   where quote_id = p_quote_id;
  if binding.quote_id is null
     or binding.operation_uuid <> p_operation_uuid
     or binding.request_fingerprint <> p_request_fingerprint
     or not exists (
       select 1 from tongs.customer_spending_quote_acceptances acceptance
        where acceptance.quote_id = p_quote_id
          and acceptance.user_id = binding.user_id
     )
  then raise exception 'accepted exact Hammer quote required' using errcode = '42501'; end if;

  insert into tongs.hammer_transcription_preoperation_receipts(
    id, quote_id, operation_uuid, operation_id, user_id, request_fingerprint,
    stage, idempotency_key, failure_code, evidence_json
  ) values (
    extensions.uuid_generate_v5(p_quote_id, p_stage), p_quote_id, p_operation_uuid,
    binding.operation_id, binding.user_id, p_request_fingerprint, p_stage,
    'hammer:' || p_quote_id::text || ':' || p_stage,
    case when p_stage = 'pre_admission_failed' then nullif(btrim(p_failure_code), '') else null end,
    coalesce(p_evidence_json, '{}'::jsonb)
  ) on conflict (quote_id, stage) do nothing;

  select * into receipt
    from tongs.hammer_transcription_preoperation_receipts
   where quote_id = p_quote_id and stage = p_stage;
  if receipt.operation_uuid <> p_operation_uuid
     or receipt.user_id <> binding.user_id
     or receipt.request_fingerprint <> p_request_fingerprint
     or receipt.failure_code is distinct from
        (case when p_stage = 'pre_admission_failed' then nullif(btrim(p_failure_code), '') else null end)
  then raise exception 'conflicting Hammer pre-operation receipt' using errcode = '23505'; end if;

  return jsonb_build_object('stage', receipt.stage, 'replay', receipt.recorded_at < clock_timestamp());
end
$function$;

create or replace function tongs.read_hammer_transcription_recovery(
  p_user_id uuid,
  p_request_fingerprint text
) returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog
as $function$
declare
  result jsonb;
begin
  perform tongs._require_pricing_service_role();
  select jsonb_build_object(
    'quote_id', quote.id,
    'operation_id', binding.operation_id,
    'quote_hash', quote.quote_hash,
    'request_fingerprint', binding.request_fingerprint,
    'state', case
      when exists (
        select 1 from tongs.hammer_transcription_preoperation_receipts receipt
         where receipt.quote_id = quote.id and receipt.stage = 'pre_admission_failed'
      ) then 'pre_admission_failed'
      else 'pending'
    end
  ) into result
    from tongs.hammer_first_transcription_quote_bindings binding
    join tongs.customer_spending_quotes quote on quote.id = binding.quote_id
   where binding.user_id = p_user_id
     and binding.request_fingerprint = p_request_fingerprint
     and exists (
       select 1 from tongs.customer_spending_quote_acceptances acceptance
        where acceptance.quote_id = quote.id and acceptance.user_id = p_user_id
     )
   order by quote.created_at desc
   limit 1;
  return result;
end
$function$;

revoke all on table tongs.hammer_transcription_preoperation_receipts from public, anon, authenticated;
grant select on table tongs.hammer_transcription_preoperation_receipts to authenticated;
grant all on table tongs.hammer_transcription_preoperation_receipts to service_role;

revoke all on function tongs.record_hammer_transcription_preoperation_receipt(uuid,uuid,text,text,text,jsonb)
  from public, anon, authenticated;
grant execute on function tongs.record_hammer_transcription_preoperation_receipt(uuid,uuid,text,text,text,jsonb)
  to service_role;
revoke all on function tongs.read_hammer_transcription_recovery(uuid,text)
  from public, anon, authenticated;
grant execute on function tongs.read_hammer_transcription_recovery(uuid,text)
  to service_role;

do $verify$
begin
  if exists (
    select 1 from pg_constraint
     where conrelid = 'tongs.hammer_transcription_operations'::regclass
       and pg_get_constraintdef(oid, true) = 'CHECK (accepted_customer_charge_micros > 0)'
  ) then raise exception 'obsolete positive Hammer customer-charge constraint remains'; end if;
  if (select count(*) from pg_constraint
       where conrelid = 'tongs.hammer_transcription_operations'::regclass
         and pg_get_constraintdef(oid, true) = 'CHECK (accepted_customer_charge_micros >= 0)') <> 1
  then raise exception 'exactly one nonnegative Hammer customer-charge constraint required'; end if;
end
$verify$;

notify pgrst, 'reload schema';
commit;
