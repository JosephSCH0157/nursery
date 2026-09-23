-- Forward-only v2 parser evidence. Historical v1 quotes and the failed canary
-- remain immutable; this does not change pricing, risk limits, or Live scope.
begin;

create table tongs.hearth_tag_validation_failure_evidence (
  id uuid primary key,
  operation_id text not null unique check (length(btrim(operation_id)) between 8 and 300),
  reservation_id uuid not null unique references tongs.funding_reservations(id) on delete restrict,
  provider_request_id text,
  model text not null check (model = 'gpt-5.6-luna'),
  input_units bigint not null check (input_units between 0 and 12000),
  output_units bigint not null check (output_units between 0 and 256),
  raw_provider_response_text text not null
    check (octet_length(raw_provider_response_text) between 1 and 65536),
  validation_error_code text not null
    check (validation_error_code in (
      'invalid_tag_output','invalid_tag_structure','invalid_tag_count',
      'invalid_tag_candidate','duplicate_tag_candidate'
    )),
  validation_contract_revision text not null
    check (validation_contract_revision = 'tags_top10_comma_block.v2'),
  recorded_at timestamptz not null default now()
);
alter table tongs.hearth_tag_validation_failure_evidence enable row level security;
alter table tongs.hearth_tag_validation_failure_evidence force row level security;
revoke all on tongs.hearth_tag_validation_failure_evidence
  from public, anon, authenticated, service_role;
grant select on tongs.hearth_tag_validation_failure_evidence to service_role;
create trigger hearth_tag_validation_failure_evidence_immutable
before update or delete on tongs.hearth_tag_validation_failure_evidence
for each row execute function tongs._reject_accounting_mutation();

create function tongs.record_hearth_tag_validation_failure_evidence(
  p_operation_id text,
  p_reservation_id uuid,
  p_provider_request_id text,
  p_model text,
  p_input_units bigint,
  p_output_units bigint,
  p_raw_provider_response_text text,
  p_validation_error_code text,
  p_validation_contract_revision text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  binding tongs.openai_text_funding_bindings%rowtype;
  capture tongs.openai_text_provider_captures%rowtype;
  existing tongs.hearth_tag_validation_failure_evidence%rowtype;
  evidence_id uuid := extensions.uuid_generate_v5(
    p_reservation_id, 'hearth-tag-validation-failure-v2');
begin
  perform tongs._require_pricing_service_role();
  perform pg_advisory_xact_lock(hashtextextended(
    'hearth-tag-validation-failure:' || p_reservation_id::text, 0));

  select * into binding from tongs.openai_text_funding_bindings
  where operation_id=btrim(p_operation_id) and reservation_id=p_reservation_id
    and route_code='hearth.tag_generation';
  select * into capture from tongs.openai_text_provider_captures
  where reservation_id=p_reservation_id and attempt_number=1;
  if binding.reservation_id is null or binding.model<>'gpt-5.6-luna'
    or binding.maximum_attempts<>1 or capture.id is null
    or capture.provider_request_id is distinct from nullif(btrim(coalesce(p_provider_request_id,'')), '')
    or capture.input_units is distinct from p_input_units
    or capture.output_units is distinct from p_output_units
    or capture.response_evidence_json->>'raw_provider_response_text'
      is distinct from p_raw_provider_response_text
    or p_model is distinct from binding.model
    or p_validation_contract_revision is distinct from 'tags_top10_comma_block.v2'
    or p_validation_error_code not in (
      'invalid_tag_output','invalid_tag_structure','invalid_tag_count',
      'invalid_tag_candidate','duplicate_tag_candidate'
    )
    or p_raw_provider_response_text is null
    or octet_length(p_raw_provider_response_text) not between 1 and 65536
  then raise exception 'invalid Hearth tag validation evidence' using errcode='22023'; end if;

  select * into existing from tongs.hearth_tag_validation_failure_evidence
  where reservation_id=p_reservation_id or operation_id=btrim(p_operation_id);
  if found then
    if existing.operation_id is distinct from btrim(p_operation_id)
      or existing.reservation_id is distinct from p_reservation_id
      or existing.provider_request_id is distinct from capture.provider_request_id
      or existing.model is distinct from p_model
      or existing.input_units is distinct from p_input_units
      or existing.output_units is distinct from p_output_units
      or existing.raw_provider_response_text is distinct from p_raw_provider_response_text
      or existing.validation_error_code is distinct from p_validation_error_code
      or existing.validation_contract_revision is distinct from p_validation_contract_revision
    then raise exception 'Hearth tag validation evidence replay conflict' using errcode='23505'; end if;
    return jsonb_build_object('evidence_id',existing.id,'replay',true);
  end if;

  insert into tongs.hearth_tag_validation_failure_evidence (
    id,operation_id,reservation_id,provider_request_id,model,input_units,
    output_units,raw_provider_response_text,validation_error_code,
    validation_contract_revision
  ) values (
    evidence_id,btrim(p_operation_id),p_reservation_id,capture.provider_request_id,
    p_model,p_input_units,p_output_units,p_raw_provider_response_text,
    p_validation_error_code,p_validation_contract_revision
  );
  return jsonb_build_object('evidence_id',evidence_id,'replay',false);
end $$;

revoke all on function tongs.record_hearth_tag_validation_failure_evidence(
  text,uuid,text,text,bigint,bigint,text,text,text
) from public, anon, authenticated;
grant execute on function tongs.record_hearth_tag_validation_failure_evidence(
  text,uuid,text,text,bigint,bigint,text,text,text
) to service_role;

commit;
