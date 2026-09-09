begin;

set local request.jwt.claim.role='service_role';
set local role service_role;
do $$
declare first jsonb; replay jsonb;
begin
 first:=tongs.record_openai_text_model_visibility(
  '39000000-0000-4000-8000-000000000101','isolated-model-visibility-proof-1',
  '29000000-0000-4000-8000-000000000001','29000000-0000-4000-8000-000000000101',
  repeat('a',64),'gpt-6-astra','2026-09-09T12:00:00Z',404,false,null,null,
  '{"endpoint":"GET /v1/models/{model}","generation_or_billable_request_made":false}'::jsonb);
 replay:=tongs.record_openai_text_model_visibility(
  '39000000-0000-4000-8000-000000000102','isolated-model-visibility-proof-1',
  '29000000-0000-4000-8000-000000000001','29000000-0000-4000-8000-000000000101',
  repeat('a',64),'gpt-6-astra','2026-09-09T12:00:00Z',404,false,null,null,
  '{"endpoint":"GET /v1/models/{model}","generation_or_billable_request_made":false}'::jsonb);
 if (first->>'replay')::boolean or not (replay->>'replay')::boolean then raise exception 'visibility evidence idempotency failed'; end if;
 if (select count(*) from tongs.openai_text_model_visibility_observations where source_key='isolated-model-visibility-proof-1')<>1 then raise exception 'visibility evidence duplicated'; end if;
 begin
  perform tongs.record_openai_text_model_visibility(
   gen_random_uuid(),'isolated-unsanitized-model-proof',
   '29000000-0000-4000-8000-000000000001','29000000-0000-4000-8000-000000000101',
   repeat('a',64),'gpt-6-astra',now(),200,true,'gpt-6-astra','openai','{"token":"forbidden"}'::jsonb);
  raise exception 'secret-bearing evidence was accepted';
 exception when sqlstate 'P0001' then null;
 end;
end $$;

reset role;
set local request.jwt.claim.role='authenticated';
set local request.jwt.claim.sub='42c3de1d-bd24-41fe-abd9-640f17518b2c';
set local role authenticated;
do $$ declare result jsonb; begin
 result:=tongs.read_openai_text_model_catalog_admin();
 if jsonb_array_length(result->'visibility_observations')<>1 then raise exception 'operator observation read failed'; end if;
 if jsonb_array_length(result->'supporting_cost_evidence')<35 then raise exception 'support evidence missing'; end if;
end $$;

reset role;
set local request.jwt.claim.role='authenticated';
set local request.jwt.claim.sub='71daf61b-57b3-4e5f-a8c8-64befecb5950';
set local role authenticated;
do $$ begin
 begin
  perform tongs.read_openai_text_model_catalog_admin();
  raise exception 'ordinary customer read private evidence';
 exception when insufficient_privilege then null;
 end;
end $$;

rollback;
