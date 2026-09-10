-- Requested five-model Hearth catalog, recorded as a draft only. Published
-- provider rates are pricing evidence; they are not per-operation cost evidence
-- and do not prove that the Forge project can generate with a model.
begin;

insert into tongs.openai_text_provider_rate_revisions(
  id,provider,runtime_model_alias,provider_model_id,revision,
  input_micros_per_million_tokens,cached_input_micros_per_million_tokens,
  output_micros_per_million_tokens,maximum_context_tokens,maximum_output_tokens,
  source_url,source_checked_at,content_hash
) values
 ('60000000-0000-4000-8000-000000000002','openai','gpt-6-astra','gpt-6-astra',2,10000000,1000000,50000000,1050000,128000,'https://developers.openai.com/api/docs/models/gpt-6-astra','2026-09-10T00:00:00Z',encode(extensions.digest(convert_to('openai:gpt-6-astra:2:10000000:1000000:50000000:1050000:128000:2026-09-10','utf8'),'sha256'),'hex')),
 ('56000000-0000-4000-8000-000000000012','openai','gpt-5.6-sol','gpt-5.6-sol',2,4000000,400000,20000000,1050000,128000,'https://developers.openai.com/api/docs/models/gpt-5.6-sol','2026-09-10T00:00:00Z',encode(extensions.digest(convert_to('openai:gpt-5.6-sol:2:4000000:400000:20000000:1050000:128000:2026-09-10','utf8'),'sha256'),'hex')),
 ('56000000-0000-4000-8000-000000000022','openai','gpt-5.6-terra','gpt-5.6-terra',2,2000000,200000,12000000,1050000,128000,'https://developers.openai.com/api/docs/models/gpt-5.6-terra','2026-09-10T00:00:00Z',encode(extensions.digest(convert_to('openai:gpt-5.6-terra:2:2000000:200000:12000000:1050000:128000:2026-09-10','utf8'),'sha256'),'hex')),
 ('54000000-0000-4000-8000-000000000001','openai','gpt-5.4-mini','gpt-5.4-mini-2026-03-17',1,750000,75000,4500000,400000,128000,'https://developers.openai.com/api/docs/models/gpt-5.4-mini','2026-09-10T00:00:00Z',encode(extensions.digest(convert_to('openai:gpt-5.4-mini-2026-03-17:1:750000:75000:4500000:400000:128000:2026-09-10','utf8'),'sha256'),'hex')),
 ('56000000-0000-4000-8000-000000000032','openai','gpt-5.6-luna','gpt-5.6-luna',2,200000,20000,1200000,1050000,128000,'https://developers.openai.com/api/docs/models/gpt-5.6-luna','2026-09-10T00:00:00Z',encode(extensions.digest(convert_to('openai:gpt-5.6-luna:2:200000:20000:1200000:1050000:128000:2026-09-10','utf8'),'sha256'),'hex'))
on conflict(provider_model_id,revision) do nothing;

insert into tongs.openai_text_model_catalog_revisions(
  id,revision,lifecycle_state,quality_method,source_checked_at,content_hash
) values (
  '29000000-0000-4000-8000-000000000002',2,'draft',
  'Owner-requested five-model candidate set. Best available is server-ranked; visibility and generation compatibility remain independent eligibility gates.',
  '2026-09-10T00:00:00Z',
  encode(extensions.digest(convert_to('openai-model-catalog:2:draft:astra:sol:terra:gpt-5.4-mini:luna:2026-09-10','utf8'),'sha256'),'hex')
) on conflict(revision) do nothing;

insert into tongs.openai_text_model_catalog_entries(
  id,catalog_revision_id,runtime_model_id,provider_model_id,display_name,
  tradeoff_summary,quality_rank,quality_basis,supported_apis,
  availability_status,availability_evidence,lifecycle_state,rate_revision_id
) values
 ('29000000-0000-4000-8000-000000000201','29000000-0000-4000-8000-000000000002','gpt-6-astra','gpt-6-astra','GPT-6 Astra','Highest-quality candidate; highest price and potentially higher latency.',100,'Official OpenAI positioning: most capable for complex, demanding work.','["responses","chat_completions","structured_outputs"]','visible','{"model_visibility_checked_at":"2026-09-09","generation_compatibility":"unverified","evidence_scope":"forge_project_model_list"}','candidate','60000000-0000-4000-8000-000000000002'),
 ('29000000-0000-4000-8000-000000000202','29000000-0000-4000-8000-000000000002','gpt-5.6-sol','gpt-5.6-sol','GPT-5.6 Sol','Strong professional reasoning below Astra cost.',90,'Official OpenAI positioning: reliable model for complex professional work.','["responses","chat_completions","structured_outputs"]','visible','{"model_visibility_checked_at":"2026-09-09","generation_compatibility":"unverified","evidence_scope":"forge_project_model_list"}','candidate','56000000-0000-4000-8000-000000000012'),
 ('29000000-0000-4000-8000-000000000203','29000000-0000-4000-8000-000000000002','gpt-5.6-terra','gpt-5.6-terra','GPT-5.6 Terra','Balanced capability, latency, and price.',80,'Official OpenAI positioning: balanced agentic model for everyday work.','["responses","chat_completions","structured_outputs"]','visible','{"model_visibility_checked_at":"2026-09-09","generation_compatibility":"unverified","evidence_scope":"forge_project_model_list"}','candidate','56000000-0000-4000-8000-000000000022'),
 ('29000000-0000-4000-8000-000000000204','29000000-0000-4000-8000-000000000002','gpt-5.4-mini','gpt-5.4-mini-2026-03-17','GPT-5.4 Mini','Lower-cost option for well-bounded work.',70,'Official OpenAI pricing and model documentation; Forge project visibility has not been checked.','["responses","chat_completions","structured_outputs"]','unverified','{"model_visibility":"unverified","generation_compatibility":"unverified"}','candidate','54000000-0000-4000-8000-000000000001'),
 ('29000000-0000-4000-8000-000000000205','29000000-0000-4000-8000-000000000002','gpt-5.6-luna','gpt-5.6-luna','GPT-5.6 Luna','Fastest and lowest-cost candidate.',60,'Official OpenAI positioning: fast, cost-sensitive model for high-volume work.','["responses","chat_completions","structured_outputs"]','visible','{"model_visibility_checked_at":"2026-09-09","generation_compatibility":"bounded_hearth_pilot","authoritative_cost_reconciliation":"pending"}','candidate','56000000-0000-4000-8000-000000000032')
on conflict(catalog_revision_id,provider_model_id) do nothing;

with routes(route_code,input_max,output_max) as (values
 ('hearth.chat_completion',32000::bigint,8000::bigint),
 ('hearth.research_synthesis',128000,16384),('visual.unified_plan',64000,16384),
 ('visual.narrative_interpretation',32000,8000),('motion.broll_interpretation',32000,8000),
 ('hammer.transcript_cleanup',128000,16384),('shorts.discovery',64000,16384),('quench.metadata',32000,8000)
)
insert into tongs.openai_text_model_route_compatibility(
 id,catalog_entry_id,route_code,compatibility_status,maximum_input_tokens,
 maximum_output_tokens,maximum_attempts,supporting_cost_coverage,evidence_json
)
select extensions.uuid_generate_v5('29000000-0000-4000-8000-000000000002'::uuid,e.id::text||':'||r.route_code),
 e.id,r.route_code,'fixture_verified',least(r.input_max,rate.maximum_context_tokens),
 least(r.output_max,rate.maximum_output_tokens),1,'unresolved',
 jsonb_build_object('external_boundary','simulated','actual_handler_certified',true,
   'provider_generation_compatibility',false,'customer_price_published',false)
from tongs.openai_text_model_catalog_entries e
join tongs.openai_text_provider_rate_revisions rate on rate.id=e.rate_revision_id
cross join routes r
where e.catalog_revision_id='29000000-0000-4000-8000-000000000002'
on conflict(catalog_entry_id,route_code) do nothing;

comment on table tongs.openai_text_model_catalog_revisions is 'Versioned server-owned model choices. Draft or visible models are not executable until exact route compatibility, complete cost coverage, and pricing gates pass.';

commit;
