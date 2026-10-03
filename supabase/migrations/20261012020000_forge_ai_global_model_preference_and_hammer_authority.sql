-- Provider-neutral Forge-wide model preference, authoritative operation overrides,
-- and complete (but halted) Hammer transcript-cleanup financial authority.
begin;

do $$
begin
  if (select count(*) from tongs.private_markup_rule_revisions)<>1
    or not exists(select 1 from tongs.private_markup_rule_revisions where revision=1 and default_markup_basis_points=3300 and overrides_json='[]'::jsonb)
  then raise exception 'canonical 3300-basis-point markup authority drifted'; end if;
  if not exists(select 1 from tongs.openai_text_model_catalog_revisions where id='19720000-0000-4000-8000-000000000008' and revision=16 and lifecycle_state='active')
  then raise exception 'expected active catalog revision 16 is unavailable'; end if;
  if not exists(select 1 from tongs.openai_text_rollout_revisions where route_code='hammer.transcript_cleanup' and revision=2 and mode='halt_new' and cost_policy_revision_id is null and funding_scope='forge')
  then raise exception 'Hammer halt_new baseline drifted'; end if;
  if exists(select 1 from tongs.customer_paid_execution_scope_authorizations where route_code='hammer.transcript_cleanup')
  then raise exception 'Hammer execution scope unexpectedly exists'; end if;
  if (select count(*) from tongs.openai_text_cost_policy_revisions where route_code='hammer.transcript_cleanup')<>2
  then raise exception 'Hammer cost-policy baseline drifted'; end if;
end $$;

create table tongs.ai_model_identities(
  id uuid primary key,
  model_code text not null unique check(model_code ~ '^[a-z0-9][a-z0-9._:-]{2,159}$'),
  provider_code text not null check(provider_code ~ '^[a-z0-9][a-z0-9._-]{1,63}$'),
  provider_model_id text not null check(length(btrim(provider_model_id)) between 2 and 160),
  customer_selection_key uuid not null unique,
  created_at timestamptz not null default now(),
  unique(provider_code,provider_model_id)
);

create table tongs.ai_model_identity_revisions(
  id uuid primary key,
  model_identity_id uuid not null references tongs.ai_model_identities(id) on delete restrict,
  revision integer not null check(revision>0),
  display_name text not null check(length(btrim(display_name)) between 2 and 120),
  relative_cost_class text not null check(relative_cost_class in ('lower_cost','mid_range_cost','higher_cost')),
  lifecycle_state text not null check(lifecycle_state in ('active','deprecated','retired')),
  evidence_json jsonb not null check(jsonb_typeof(evidence_json)='object'),
  created_at timestamptz not null default now(),
  unique(model_identity_id,revision)
);

create table tongs.ai_model_preference_revisions(
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  revision integer not null check(revision>0),
  model_identity_id uuid not null references tongs.ai_model_identities(id) on delete restrict,
  migration_source_id uuid references tongs.openai_text_user_model_preference_revisions(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(user_id,revision)
);

create table tongs.ai_operation_model_override_revisions(
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_code text not null check(length(btrim(operation_code)) between 3 and 160),
  revision integer not null check(revision>0),
  override_state text not null check(override_state in ('specific','clear')),
  model_identity_id uuid references tongs.ai_model_identities(id) on delete restrict,
  migration_source_id uuid references tongs.openai_text_user_model_preference_revisions(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(user_id,operation_code,revision),
  check((override_state='specific' and model_identity_id is not null) or (override_state='clear' and model_identity_id is null))
);
create index ai_operation_model_override_latest_idx on tongs.ai_operation_model_override_revisions(user_id,operation_code,revision desc);

create table tongs.openai_text_catalog_ai_model_bindings(
  catalog_entry_id uuid primary key references tongs.openai_text_model_catalog_entries(id) on delete restrict,
  model_identity_id uuid not null references tongs.ai_model_identities(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(catalog_entry_id,model_identity_id)
);

do $$ declare n text; begin
  foreach n in array array['ai_model_identities','ai_model_identity_revisions','ai_model_preference_revisions','ai_operation_model_override_revisions','openai_text_catalog_ai_model_bindings'] loop
    execute format('alter table tongs.%I enable row level security',n);
    execute format('alter table tongs.%I force row level security',n);
    execute format('revoke all on tongs.%I from public,anon,authenticated,service_role',n);
    execute format('grant select on tongs.%I to service_role',n);
    execute format('create trigger %I before update or delete on tongs.%I for each row execute function tongs._reject_accounting_mutation()',n||'_immutable',n);
  end loop;
end $$;

insert into tongs.ai_model_identities(id,model_code,provider_code,provider_model_id,customer_selection_key) values
 ('40010000-0000-4000-8000-000000000001','openai:gpt-5.4-mini','openai','gpt-5.4-mini-2026-03-17','40010000-0000-4000-9000-000000000001'),
 ('40010000-0000-4000-8000-000000000002','openai:gpt-6.1-sol','openai','gpt-6.1-sol','40010000-0000-4000-9000-000000000002'),
 ('40010000-0000-4000-8000-000000000003','openai:gpt-5.6-sol','openai','gpt-5.6-sol','40010000-0000-4000-9000-000000000003');

insert into tongs.ai_model_identity_revisions(id,model_identity_id,revision,display_name,relative_cost_class,lifecycle_state,evidence_json) values
 ('40010000-0000-4000-8000-000000000101','40010000-0000-4000-8000-000000000001',1,'GPT-5.4 Mini','lower_cost','active','{"source":"official_openai_model_page","checked_at":"2026-10-03","customer_ranking":false}'),
 ('40010000-0000-4000-8000-000000000102','40010000-0000-4000-8000-000000000002',1,'GPT-6.1 Sol','mid_range_cost','active','{"source":"official_openai_model_page","checked_at":"2026-10-03","customer_ranking":false}'),
 ('40010000-0000-4000-8000-000000000103','40010000-0000-4000-8000-000000000003',1,'GPT-5.6 Sol','higher_cost','active','{"source":"official_openai_model_page","checked_at":"2026-10-03","customer_ranking":false}');

-- Fresh immutable rate evidence. Sol ceilings reserve the cache-write rate.
insert into tongs.openai_text_provider_rate_revisions(
 id,provider,runtime_model_alias,provider_model_id,revision,input_micros_per_million_tokens,
 cached_input_micros_per_million_tokens,output_micros_per_million_tokens,maximum_context_tokens,
 maximum_output_tokens,source_url,source_checked_at,content_hash
) values
 ('54000000-0000-4000-8000-000000000002','openai','gpt-5.4-mini','gpt-5.4-mini-2026-03-17',2,750000,75000,4500000,400000,128000,'https://developers.openai.com/api/docs/models/gpt-5.4-mini','2026-10-03T20:00:00Z',encode(extensions.digest(convert_to('gpt-5.4-mini:2:750000:75000:4500000:400000:128000:2026-10-03','utf8'),'sha256'),'hex')),
 ('61000000-0000-4000-8000-000000000001','openai','gpt-6.1-sol','gpt-6.1-sol',1,2000000,100000,10000000,1050000,128000,'https://developers.openai.com/api/docs/models/gpt-6.1-sol','2026-10-03T20:00:00Z',encode(extensions.digest(convert_to('gpt-6.1-sol:1:2000000:100000:2500000:10000000:1050000:128000:2026-10-03','utf8'),'sha256'),'hex')),
 ('56000000-0000-4000-8000-000000000013','openai','gpt-5.6-sol','gpt-5.6-sol',3,4000000,400000,20000000,1050000,128000,'https://developers.openai.com/api/docs/models/gpt-5.6-sol','2026-10-03T20:00:00Z',encode(extensions.digest(convert_to('gpt-5.6-sol:3:4000000:400000:5000000:20000000:1050000:128000:2026-10-03','utf8'),'sha256'),'hex'));

insert into tongs.openai_text_rate_condition_revisions(
 id,provider_rate_revision_id,revision,service_tier,cache_write_micros_per_million_tokens,
 long_context_threshold_tokens,long_context_input_multiplier_millis,long_context_cached_input_multiplier_millis,
 long_context_output_multiplier_millis,reasoning_billing_rule,source_url,source_retrieved_at,lifecycle_state,notes
) values
 ('40010000-0000-4000-8000-000000000201','54000000-0000-4000-8000-000000000002',1,'standard',null,null,null,null,null,'Reasoning tokens are billed as output and fit the output ceiling.','https://developers.openai.com/api/docs/models/gpt-5.4-mini','2026-10-03T20:00:00Z','approved','Pinned snapshot; Hammer is bounded to 128K input and one attempt.'),
 ('40010000-0000-4000-8000-000000000202','61000000-0000-4000-8000-000000000001',1,'standard',2500000,272000,2000,2000,1500,'Reasoning tokens are billed as output and fit the output ceiling.','https://developers.openai.com/api/docs/models/gpt-6.1-sol','2026-10-03T20:00:00Z','approved','Hammer remains below the long-context threshold; full bounded input reserves cache-write pricing.'),
 ('40010000-0000-4000-8000-000000000203','56000000-0000-4000-8000-000000000013',1,'standard',5000000,272000,2000,2000,1500,'Reasoning tokens are billed as output and fit the output ceiling.','https://developers.openai.com/api/docs/models/gpt-5.6-sol','2026-10-03T20:00:00Z','approved','Promotional rate rechecked 2026-10-03; full bounded input reserves cache-write pricing.');

insert into tongs.openai_text_cost_policy_revisions(
 id,route_code,revision,policy_code,attempt_plan,maximum_input_units,maximum_output_units,maximum_attempts,
 direct_provider_ceiling_micros,supporting_cost_ceiling_micros,full_cost_ceiling_micros,cost_coverage,lifecycle_state,notes
) values
 ('40010000-0000-4000-8000-000000000301','hammer.transcript_cleanup',3,'openai-text:hammer-cleanup:gpt-5.4-mini-v1','[{"attempt":1,"rate_revision_id":"54000000-0000-4000-8000-000000000002","runtime_model":"gpt-5.4-mini","provider_model_id":"gpt-5.4-mini-2026-03-17","input_max":128000,"output_max":16384,"temperature":0.2}]',128000,16384,1,169728,0,169728,'complete','active','One bounded Mini attempt; no attributable variable supporting cost.'),
 ('40010000-0000-4000-8000-000000000302','hammer.transcript_cleanup',4,'openai-text:hammer-cleanup:gpt-6.1-sol-v1','[{"attempt":1,"rate_revision_id":"61000000-0000-4000-8000-000000000001","runtime_model":"gpt-6.1-sol","provider_model_id":"gpt-6.1-sol","input_max":128000,"output_max":16384,"temperature":"omitted"}]',128000,16384,1,483840,0,483840,'complete','active','One bounded GPT-6.1 Sol attempt; input conservatively reserves cache-write pricing.'),
 ('40010000-0000-4000-8000-000000000303','hammer.transcript_cleanup',5,'openai-text:hammer-cleanup:gpt-5.6-sol-v1','[{"attempt":1,"rate_revision_id":"56000000-0000-4000-8000-000000000013","runtime_model":"gpt-5.6-sol","provider_model_id":"gpt-5.6-sol","input_max":128000,"output_max":16384,"temperature":"omitted"}]',128000,16384,1,967680,0,967680,'complete','active','One bounded GPT-5.6 Sol attempt; input conservatively reserves cache-write pricing.');

insert into tongs.openai_text_supporting_cost_inventory(id,route_code,cost_policy_revision_id,component_code,disposition,evidence_status,notes)
select extensions.uuid_generate_v5(cost.id,component.code),cost.route_code,cost.id,component.code,component.disposition,'verified',component.notes
from tongs.openai_text_cost_policy_revisions cost
cross join (values
 ('provider_attempt','attributable_metered','The single provider attempt is the only metered supplier cost.'),
 ('validation_persistence','platform_overhead','Validation and canonical persistence have no verified attributable variable allocation.'),
 ('hosting_storage_egress','platform_overhead','Fixed Netlify and Supabase plans and ordinary evidence retention are plan-funded overhead.')
) component(code,disposition,notes)
where cost.id in ('40010000-0000-4000-8000-000000000301','40010000-0000-4000-8000-000000000302','40010000-0000-4000-8000-000000000303');

do $$
declare actor uuid; markup_id uuid;
begin
 select user_id into actor from tongs.platform_operators order by granted_at limit 1;
 select id into markup_id from tongs.private_markup_rule_revisions where revision=1 and default_markup_basis_points=3300 and overrides_json='[]'::jsonb;
 if actor is null or markup_id is null then raise exception 'operator and markup authority required'; end if;

 insert into tongs.private_pricing_policies(id,policy_code,scope_kind,provider,sku,created_by) values
  ('40010000-0000-4000-8000-000000000401','forge-hammer-cleanup-mini-v1','sku','openai','openai-text:hammer.transcript_cleanup:gpt-5.4-mini:40010000-0000-4000-8000-000000000301',actor),
  ('40010000-0000-4000-8000-000000000411','forge-hammer-cleanup-gpt-6.1-sol-v1','sku','openai','openai-text:hammer.transcript_cleanup:gpt-6.1-sol:40010000-0000-4000-8000-000000000302',actor),
  ('40010000-0000-4000-8000-000000000421','forge-hammer-cleanup-gpt-5.6-sol-v1','sku','openai','openai-text:hammer.transcript_cleanup:gpt-5.6-sol:40010000-0000-4000-8000-000000000303',actor);

 insert into tongs.private_pricing_revisions(id,policy_id,revision,lifecycle_state,currency,markup_basis_points,full_cost_ceiling_micros,failure_cost_ceiling_micros,customer_price_ceiling_micros,billable_failure_ceiling_micros,customer_credit_units,billable_failure_classes,free_failure_classes,included_quantity,retention_policy,change_reason,content_hash,actor_id,unrounded_customer_price_micros,rounding_adjustment_micros,settled_customer_price_micros) values
  ('40010000-0000-4000-8000-000000000402','40010000-0000-4000-8000-000000000401',1,'review_ready','USD',3300,169728,0,230000,0,46,'[]','["provider_failure","forge_failure","validation_failure","persistence_failure","submission_unknown"]','{"input_tokens":128000,"output_tokens":16384,"provider_attempts":1,"tools":0,"search":0}','{"canonical_result":"platform_overhead","audit_evidence":"platform_overhead"}','Publish halted Hammer Mini authority.',encode(extensions.digest(convert_to('hammer-mini:169728:225739:4261:230000:46','utf8'),'sha256'),'hex'),actor,225739,4261,230000),
  ('40010000-0000-4000-8000-000000000412','40010000-0000-4000-8000-000000000411',1,'review_ready','USD',3300,483840,0,645000,0,129,'[]','["provider_failure","forge_failure","validation_failure","persistence_failure","submission_unknown"]','{"input_tokens":128000,"output_tokens":16384,"provider_attempts":1,"tools":0,"search":0}','{"canonical_result":"platform_overhead","audit_evidence":"platform_overhead"}','Publish halted Hammer GPT-6.1 Sol authority.',encode(extensions.digest(convert_to('hammer-61-sol:483840:643508:1492:645000:129','utf8'),'sha256'),'hex'),actor,643508,1492,645000),
  ('40010000-0000-4000-8000-000000000422','40010000-0000-4000-8000-000000000421',1,'review_ready','USD',3300,967680,0,1290000,0,258,'[]','["provider_failure","forge_failure","validation_failure","persistence_failure","submission_unknown"]','{"input_tokens":128000,"output_tokens":16384,"provider_attempts":1,"tools":0,"search":0}','{"canonical_result":"platform_overhead","audit_evidence":"platform_overhead"}','Publish halted Hammer GPT-5.6 Sol authority.',encode(extensions.digest(convert_to('hammer-56-sol:967680:1287015:2985:1290000:258','utf8'),'sha256'),'hex'),actor,1287015,2985,1290000);

 insert into tongs.private_pricing_revision_markup_sources(pricing_revision_id,markup_rule_revision_id,effective_markup_basis_points) values
  ('40010000-0000-4000-8000-000000000402',markup_id,3300),('40010000-0000-4000-8000-000000000412',markup_id,3300),('40010000-0000-4000-8000-000000000422',markup_id,3300);

 insert into tongs.private_pricing_cost_components(pricing_revision_id,ordinal,component_code,component_kind,credential_funding,provider_label,success_ceiling_micros,failure_ceiling_micros,cost_policy_revision,tail_policy,tail_policy_details)
 select price.id,component.ordinal,component.code,component.kind,'forge',component.label,
   case when component.ordinal=1 then price.full_cost_ceiling_micros else 0 end,0,
   case when component.ordinal=1 then 'Official standard rate 2026-10-03' else 'Direct-only approved basis 2026-10-03' end,
   component.tail,component.details
 from tongs.private_pricing_revisions price
 cross join (values
   (1::smallint,'openai_transcript_cleanup','direct_provider','OpenAI','none','{}'::jsonb),
   (2::smallint,'verified_variable_supporting_cost','compute','Forge','none','{"verified_attributable_variable_micros":0}'::jsonb),
   (3::smallint,'fixed_platform_and_audit_retention','retention_tail','Forge platform','plan_funded','{"classification":"platform_overhead","operation_allocation_micros":0}'::jsonb)
 ) component(ordinal,code,kind,label,tail,details)
 where price.id in ('40010000-0000-4000-8000-000000000402','40010000-0000-4000-8000-000000000412','40010000-0000-4000-8000-000000000422');

 insert into tongs.private_pricing_publications(id,policy_id,pricing_revision_id,publication_revision,action,reason,actor_id) values
  ('40010000-0000-4000-8000-000000000403','40010000-0000-4000-8000-000000000401','40010000-0000-4000-8000-000000000402',1,'published','Price authority only; Hammer remains halt_new.',actor),
  ('40010000-0000-4000-8000-000000000413','40010000-0000-4000-8000-000000000411','40010000-0000-4000-8000-000000000412',1,'published','Price authority only; Hammer remains halt_new.',actor),
  ('40010000-0000-4000-8000-000000000423','40010000-0000-4000-8000-000000000421','40010000-0000-4000-8000-000000000422',1,'published','Price authority only; Hammer remains halt_new.',actor);
end $$;

-- Catalog revision 17 preserves every unrelated entry/compatibility and replaces
-- only Hammer eligibility with the three approved exact identities.
insert into tongs.openai_text_model_catalog_revisions(id,revision,lifecycle_state,quality_method,source_checked_at,content_hash,actor_id)
select '40010000-0000-4000-8000-000000000500',17,'active','Revision 16 retained. Hammer choices are customer-selected and explicitly not quality-ranked.','2026-10-03T20:00:00Z',encode(extensions.digest(convert_to('openai-model-catalog:17:hammer-global-preference','utf8'),'sha256'),'hex'),user_id
from tongs.platform_operators order by granted_at limit 1;

insert into tongs.openai_text_model_catalog_entries(id,catalog_revision_id,runtime_model_id,provider_model_id,display_name,tradeoff_summary,quality_rank,quality_basis,supported_apis,availability_status,availability_evidence,lifecycle_state,rate_revision_id,customer_selection_state)
select extensions.uuid_generate_v5('40010000-0000-4000-8000-000000000500',entry.provider_model_id),'40010000-0000-4000-8000-000000000500',
 case when entry.provider_model_id='gpt-5.4-mini-2026-03-17' then 'gpt-5.4-mini' else entry.runtime_model_id end,
 entry.provider_model_id,entry.display_name,
 case when entry.provider_model_id='gpt-5.4-mini-2026-03-17' then 'Lower cost'
      when entry.provider_model_id='gpt-5.6-sol' then 'Higher cost' else entry.tradeoff_summary end,
 entry.quality_rank,entry.quality_basis,entry.supported_apis,entry.availability_status,
 case when entry.provider_model_id='gpt-5.4-mini-2026-03-17' then entry.availability_evidence||'{"dedicated_key_visible":true,"dedicated_key_visibility_checked_at":"2026-10-03","hammer_evaluation_manifest_sha256":"781efd40dcb6768c65016f133aa2f58bc4c3be11ab8c0161cd1883f0f8ca6b19"}'::jsonb
      when entry.provider_model_id='gpt-5.6-sol' then entry.availability_evidence||'{"dedicated_key_visible":true,"dedicated_key_visibility_checked_at":"2026-10-03","hammer_evaluation_manifest_sha256":"c4ba3910abebfec6b2ed6fc591bf03fbd1221b056f7095a07b31bd723162fb38","historical_nonselection_preserved":true}'::jsonb else entry.availability_evidence end,
 entry.lifecycle_state,
 case when entry.provider_model_id='gpt-5.4-mini-2026-03-17' then '54000000-0000-4000-8000-000000000002'::uuid
      when entry.provider_model_id='gpt-5.6-sol' then '56000000-0000-4000-8000-000000000013'::uuid else entry.rate_revision_id end,
 case when entry.provider_model_id in ('gpt-5.4-mini-2026-03-17','gpt-5.6-sol') then 'selectable' else entry.customer_selection_state end
from tongs.openai_text_model_catalog_entries entry where entry.catalog_revision_id='19720000-0000-4000-8000-000000000008';

insert into tongs.openai_text_model_catalog_entries(id,catalog_revision_id,runtime_model_id,provider_model_id,display_name,tradeoff_summary,quality_rank,quality_basis,supported_apis,availability_status,availability_evidence,lifecycle_state,rate_revision_id,customer_selection_state)
values(extensions.uuid_generate_v5('40010000-0000-4000-8000-000000000500','gpt-6.1-sol'),'40010000-0000-4000-8000-000000000500','gpt-6.1-sol','gpt-6.1-sol','GPT-6.1 Sol','Mid-range cost',1,'Not customer-ranked; operation eligibility only.','["chat_completions","structured_outputs"]','generation_compatible','{"dedicated_key_visible":true,"dedicated_key_visibility_checked_at":"2026-10-03","generation_calls":20,"provider_failures":0,"hammer_evaluation_manifest_sha256":"e531fc5596113d05d82a85104af43d64539d82051489069fb1ab252e13f7a4bc"}','active','61000000-0000-4000-8000-000000000001','selectable');

insert into tongs.openai_text_model_route_compatibility(id,catalog_entry_id,route_code,compatibility_status,maximum_input_tokens,maximum_output_tokens,maximum_attempts,supporting_cost_coverage,cost_policy_revision_id,evidence_json)
select extensions.uuid_generate_v5(extensions.uuid_generate_v5('40010000-0000-4000-8000-000000000500',old_entry.provider_model_id),compat.route_code),extensions.uuid_generate_v5('40010000-0000-4000-8000-000000000500',old_entry.provider_model_id),compat.route_code,compat.compatibility_status,compat.maximum_input_tokens,compat.maximum_output_tokens,compat.maximum_attempts,compat.supporting_cost_coverage,compat.cost_policy_revision_id,compat.evidence_json
from tongs.openai_text_model_route_compatibility compat join tongs.openai_text_model_catalog_entries old_entry on old_entry.id=compat.catalog_entry_id
where old_entry.catalog_revision_id='19720000-0000-4000-8000-000000000008' and compat.route_code<>'hammer.transcript_cleanup';

insert into tongs.openai_text_model_route_compatibility(id,catalog_entry_id,route_code,compatibility_status,maximum_input_tokens,maximum_output_tokens,maximum_attempts,supporting_cost_coverage,cost_policy_revision_id,evidence_json)
select extensions.uuid_generate_v5(entry.id,'hammer.transcript_cleanup'),entry.id,'hammer.transcript_cleanup','generation_verified',128000,16384,1,'complete',mapping.cost_id,
 jsonb_build_object('prompt_contract_unchanged',true,'structured_output_verified',true,'one_attempt',true,'temperature',mapping.temperature,'evaluation_manifest_sha256',mapping.manifest)
from tongs.openai_text_model_catalog_entries entry
join (values
 ('gpt-5.4-mini-2026-03-17','40010000-0000-4000-8000-000000000301'::uuid,'0.2','781efd40dcb6768c65016f133aa2f58bc4c3be11ab8c0161cd1883f0f8ca6b19'),
 ('gpt-6.1-sol','40010000-0000-4000-8000-000000000302'::uuid,'omitted','e531fc5596113d05d82a85104af43d64539d82051489069fb1ab252e13f7a4bc'),
 ('gpt-5.6-sol','40010000-0000-4000-8000-000000000303'::uuid,'omitted','c4ba3910abebfec6b2ed6fc591bf03fbd1221b056f7095a07b31bd723162fb38')
) mapping(provider_model_id,cost_id,temperature,manifest) on mapping.provider_model_id=entry.provider_model_id
where entry.catalog_revision_id='40010000-0000-4000-8000-000000000500';

insert into tongs.openai_text_catalog_ai_model_bindings(catalog_entry_id,model_identity_id)
select entry.id,mapping.model_id from tongs.openai_text_model_catalog_entries entry
join (values('gpt-5.4-mini-2026-03-17','40010000-0000-4000-8000-000000000001'::uuid),('gpt-6.1-sol','40010000-0000-4000-8000-000000000002'::uuid),('gpt-5.6-sol','40010000-0000-4000-8000-000000000003'::uuid)) mapping(provider_model_id,model_id) on mapping.provider_model_id=entry.provider_model_id
where entry.catalog_revision_id='40010000-0000-4000-8000-000000000500';

-- Legacy explicit choices become authoritative operation overrides. Automatic
-- best-available rows create neither an override nor a global preference.
with latest as (
 select distinct on (user_id,route_code) * from tongs.openai_text_user_model_preference_revisions
 where route_code is not null order by user_id,route_code,revision desc
), mapped as (
 select latest.*,identity.id model_id from latest join tongs.ai_model_identities identity
   on identity.provider_code='openai' and identity.provider_model_id=latest.provider_model_id
 where latest.preference_kind='specific'
)
insert into tongs.ai_operation_model_override_revisions(id,user_id,operation_code,revision,override_state,model_identity_id,migration_source_id,created_at)
select extensions.uuid_generate_v5('40010000-0000-4000-8000-000000000500',mapped.id::text||':override'),user_id,route_code,1,'specific',model_id,id,created_at from mapped;

with latest as (
 select distinct on (user_id,route_code) * from tongs.openai_text_user_model_preference_revisions
 where preference_kind='specific' order by user_id,route_code nulls first,revision desc
), mapped as (
 select latest.*,identity.id model_id from latest join tongs.ai_model_identities identity
   on identity.provider_code='openai' and identity.provider_model_id=latest.provider_model_id
), unanimous as (
 select user_id,min(model_id::text)::uuid model_id,min(id::text)::uuid source_id,min(created_at) created_at
 from mapped group by user_id having count(distinct model_id)=1
)
insert into tongs.ai_model_preference_revisions(id,user_id,revision,model_identity_id,migration_source_id,created_at)
select extensions.uuid_generate_v5('40010000-0000-4000-8000-000000000500',user_id::text||':global'),user_id,1,model_id,source_id,created_at from unanimous;

create or replace function tongs._eligible_ai_models_for_operation(p_operation_code text)
returns table(model_identity_id uuid,customer_selection_key uuid,display_name text,relative_cost_class text,catalog_revision_id uuid,catalog_revision integer,model_catalog_entry_id uuid,runtime_model_id text,provider_model_id text,cost_policy_revision_id uuid,customer_credit_units bigint)
language sql stable security definer set search_path=pg_catalog as $$
 select identity.id,identity.customer_selection_key,revision.display_name,revision.relative_cost_class,catalog.id,catalog.revision,entry.id,entry.runtime_model_id,entry.provider_model_id,compat.cost_policy_revision_id,pricing.customer_credit_units
 from tongs.ai_model_identities identity
 join lateral (select r.* from tongs.ai_model_identity_revisions r where r.model_identity_id=identity.id order by r.revision desc limit 1) revision on revision.lifecycle_state='active'
 join tongs.openai_text_catalog_ai_model_bindings binding on binding.model_identity_id=identity.id
 join tongs.openai_text_model_catalog_entries entry on entry.id=binding.catalog_entry_id
 join tongs.openai_text_model_catalog_revisions catalog on catalog.id=entry.catalog_revision_id and catalog.lifecycle_state='active'
 join tongs.openai_text_model_route_compatibility compat on compat.catalog_entry_id=entry.id and compat.route_code=p_operation_code and compat.compatibility_status='generation_verified' and compat.supporting_cost_coverage='complete'
 join tongs.openai_text_cost_policy_revisions cost on cost.id=compat.cost_policy_revision_id and cost.cost_coverage='complete' and cost.lifecycle_state in ('pilot_candidate','active')
 join lateral tongs._published_pricing_revision('openai',lower('openai-text:'||p_operation_code||':'||entry.runtime_model_id||':'||cost.id::text)) pricing on pricing.full_cost_ceiling_micros=cost.full_cost_ceiling_micros
 where catalog.id=(select id from tongs.openai_text_model_catalog_revisions where lifecycle_state='active' order by revision desc limit 1)
   and entry.lifecycle_state='active' and entry.availability_status='generation_compatible';
$$;

create or replace function tongs.read_my_ai_model_preference()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare uid uuid:=auth.uid(); pref tongs.ai_model_preference_revisions%rowtype; model record;
begin
 if uid is null then raise exception 'authentication required' using errcode='28000'; end if;
 select * into pref from tongs.ai_model_preference_revisions where user_id=uid order by revision desc limit 1;
 if not found then return jsonb_build_object('selection_key',null,'display_name',null,'relative_cost_class',null,'revision',0); end if;
 select i.customer_selection_key,r.display_name,r.relative_cost_class into model from tongs.ai_model_identities i join lateral(select * from tongs.ai_model_identity_revisions where model_identity_id=i.id order by revision desc limit 1)r on true where i.id=pref.model_identity_id;
 return jsonb_build_object('selection_key',model.customer_selection_key,'display_name',model.display_name,'relative_cost_class',model.relative_cost_class,'revision',pref.revision,'updated_at',pref.created_at);
end $$;

create or replace function tongs.read_ai_model_choices()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare uid uuid:=auth.uid(); choices jsonb;
begin
 if uid is null then raise exception 'authentication required' using errcode='28000'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('selection_key',i.customer_selection_key,'display_name',r.display_name,'relative_cost_class',r.relative_cost_class) order by case r.relative_cost_class when 'lower_cost' then 1 when 'mid_range_cost' then 2 else 3 end,r.display_name),'[]'::jsonb) into choices
 from tongs.ai_model_identities i join lateral(select * from tongs.ai_model_identity_revisions where model_identity_id=i.id order by revision desc limit 1)r on r.lifecycle_state='active';
 return jsonb_build_object('preference',tongs.read_my_ai_model_preference(),'choices',choices);
end $$;

create or replace function tongs.set_my_ai_model_preference(p_selection_key uuid,p_expected_revision integer default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare uid uuid:=auth.uid(); prior integer; identity_id uuid;
begin
 if uid is null then raise exception 'authentication required' using errcode='28000'; end if;
 select i.id into identity_id from tongs.ai_model_identities i join lateral(select * from tongs.ai_model_identity_revisions where model_identity_id=i.id order by revision desc limit 1)r on r.lifecycle_state='active' where i.customer_selection_key=p_selection_key;
 if identity_id is null then raise exception 'model selection unavailable' using errcode='P0001'; end if;
 perform pg_advisory_xact_lock(hashtextextended('ai-model-pref:'||uid::text,0));
 select coalesce(max(revision),0) into prior from tongs.ai_model_preference_revisions where user_id=uid;
 if p_expected_revision is not null and p_expected_revision<>prior then raise exception 'preference changed; reload' using errcode='40001'; end if;
 insert into tongs.ai_model_preference_revisions(id,user_id,revision,model_identity_id) values(gen_random_uuid(),uid,prior+1,identity_id);
 return tongs.read_my_ai_model_preference();
end $$;

create or replace function tongs.read_my_ai_operation_model_override(p_operation_code text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare uid uuid:=auth.uid(); override_row tongs.ai_operation_model_override_revisions%rowtype; model record; available boolean:=false;
begin
 if uid is null then raise exception 'authentication required' using errcode='28000'; end if;
 select * into override_row from tongs.ai_operation_model_override_revisions where user_id=uid and operation_code=p_operation_code order by revision desc limit 1;
 if not found or override_row.override_state='clear' then return jsonb_build_object('state','clear','selection_key',null,'display_name',null,'revision',coalesce(override_row.revision,0),'available',true); end if;
 select i.customer_selection_key,r.display_name into model from tongs.ai_model_identities i join lateral(select * from tongs.ai_model_identity_revisions where model_identity_id=i.id order by revision desc limit 1)r on true where i.id=override_row.model_identity_id;
 select exists(select 1 from tongs._eligible_ai_models_for_operation(p_operation_code) e where e.model_identity_id=override_row.model_identity_id) into available;
 return jsonb_build_object('state','specific','selection_key',model.customer_selection_key,'display_name',model.display_name,'revision',override_row.revision,'available',available,'updated_at',override_row.created_at);
end $$;

create or replace function tongs.set_my_ai_operation_model_override(p_operation_code text,p_selection_key uuid,p_expected_revision integer default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare uid uuid:=auth.uid(); prior integer; identity_id uuid;
begin
 if uid is null then raise exception 'authentication required' using errcode='28000'; end if;
 select model_identity_id into identity_id from tongs._eligible_ai_models_for_operation(p_operation_code) where customer_selection_key=p_selection_key;
 if identity_id is null then raise exception 'selected model is not currently eligible for this operation' using errcode='P0001'; end if;
 perform pg_advisory_xact_lock(hashtextextended('ai-operation-model:'||uid::text||':'||p_operation_code,0));
 select coalesce(max(revision),0) into prior from tongs.ai_operation_model_override_revisions where user_id=uid and operation_code=p_operation_code;
 if p_expected_revision is not null and p_expected_revision<>prior then raise exception 'operation override changed; reload' using errcode='40001'; end if;
 insert into tongs.ai_operation_model_override_revisions(id,user_id,operation_code,revision,override_state,model_identity_id) values(gen_random_uuid(),uid,p_operation_code,prior+1,'specific',identity_id);
 return tongs.read_my_ai_operation_model_override(p_operation_code);
end $$;

create or replace function tongs.clear_my_ai_operation_model_override(p_operation_code text,p_expected_revision integer default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare uid uuid:=auth.uid(); prior integer;
begin
 if uid is null then raise exception 'authentication required' using errcode='28000'; end if;
 perform pg_advisory_xact_lock(hashtextextended('ai-operation-model:'||uid::text||':'||p_operation_code,0));
 select coalesce(max(revision),0) into prior from tongs.ai_operation_model_override_revisions where user_id=uid and operation_code=p_operation_code;
 if p_expected_revision is not null and p_expected_revision<>prior then raise exception 'operation override changed; reload' using errcode='40001'; end if;
 insert into tongs.ai_operation_model_override_revisions(id,user_id,operation_code,revision,override_state,model_identity_id) values(gen_random_uuid(),uid,p_operation_code,prior+1,'clear',null);
 return tongs.read_my_ai_operation_model_override(p_operation_code);
end $$;

create or replace function tongs.read_ai_operation_model_choices(p_operation_code text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare uid uuid:=auth.uid(); choices jsonb; global_pref jsonb; override_pref jsonb; applicable_key uuid; applicable_source text; applicable_available boolean:=false;
begin
 if uid is null then raise exception 'authentication required' using errcode='28000'; end if;
 global_pref:=tongs.read_my_ai_model_preference(); override_pref:=tongs.read_my_ai_operation_model_override(p_operation_code);
 if override_pref->>'state'='specific' then applicable_key:=(override_pref->>'selection_key')::uuid; applicable_source:='operation_override'; applicable_available:=coalesce((override_pref->>'available')::boolean,false);
 else applicable_source:='global_preference'; if global_pref->>'selection_key' is not null then applicable_key:=(global_pref->>'selection_key')::uuid; select exists(select 1 from tongs._eligible_ai_models_for_operation(p_operation_code)e where e.customer_selection_key=applicable_key) into applicable_available; end if; end if;
 select coalesce(jsonb_agg(jsonb_build_object('selection_key',e.customer_selection_key,'display_name',e.display_name,'relative_cost_class',e.relative_cost_class,'credit_charge',e.customer_credit_units) order by case e.relative_cost_class when 'lower_cost' then 1 when 'mid_range_cost' then 2 else 3 end),'[]'::jsonb) into choices from tongs._eligible_ai_models_for_operation(p_operation_code)e;
 return jsonb_build_object('operation_code',p_operation_code,'global_preference',global_pref,'operation_override',override_pref,'applicable_source',applicable_source,'applicable_selection_key',applicable_key,'applicable_available',applicable_available,'eligible_choices',choices,'executable',applicable_available,'blocker',case when applicable_key is null then 'Choose a preferred AI model.' when not applicable_available and applicable_source='operation_override' then 'Your operation override is no longer eligible. Change or clear it.' when not applicable_available then 'Your preferred AI model is not eligible for this operation. Choose an operation override.' else null end);
end $$;

-- SQL record assignment cannot add an ad-hoc field, so the public resolver
-- performs the same strict precedence and returns the legacy private shape.
create or replace function tongs.resolve_openai_text_model_for_quote(p_user_id uuid,p_route_code text,p_credential_funding text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare override_row tongs.ai_operation_model_override_revisions%rowtype; global_row tongs.ai_model_preference_revisions%rowtype; selected record; source text;
begin
 perform tongs._require_pricing_service_role();
 if p_credential_funding<>'forge' then raise exception 'BYO model access and support-only pricing are not verified; no Forge fallback is permitted' using errcode='P0001'; end if;
 select * into override_row from tongs.ai_operation_model_override_revisions where user_id=p_user_id and operation_code=p_route_code order by revision desc limit 1;
 if found and override_row.override_state='specific' then
   select * into selected from tongs._eligible_ai_models_for_operation(p_route_code)e where e.model_identity_id=override_row.model_identity_id;
   if not found then raise exception 'operation_model_override_unavailable: change or clear the explicit operation override' using errcode='P0001'; end if; source:='operation_override';
 else
   select * into global_row from tongs.ai_model_preference_revisions where user_id=p_user_id order by revision desc limit 1;
   if not found then raise exception 'global_model_preference_required: choose a preferred AI model' using errcode='P0001'; end if;
   select * into selected from tongs._eligible_ai_models_for_operation(p_route_code)e where e.model_identity_id=global_row.model_identity_id;
   if not found then raise exception 'global_model_preference_unavailable: choose an eligible operation override' using errcode='P0001'; end if; source:='global_preference';
 end if;
 return jsonb_build_object('catalog_revision_id',selected.catalog_revision_id,'catalog_revision',selected.catalog_revision,'model_catalog_entry_id',selected.model_catalog_entry_id,'customer_selection_key',selected.customer_selection_key,'runtime_model_id',selected.runtime_model_id,'provider_model_id',selected.provider_model_id,'display_name',selected.display_name,'tradeoff_summary',case selected.relative_cost_class when 'lower_cost' then 'Lower cost' when 'mid_range_cost' then 'Mid-range cost' else 'Higher cost' end,'cost_policy_revision_id',selected.cost_policy_revision_id,'preference_source',source);
end $$;

create or replace function tongs.resolve_openai_text_model_for_funding_quote(p_user_id uuid,p_workspace_id uuid,p_route_code text,p_credential_funding text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
begin
 perform tongs._require_pricing_service_role();
 perform tongs._resolve_spending_authority(p_user_id,p_workspace_id,p_route_code);
 return tongs.resolve_openai_text_model_for_quote(p_user_id,p_route_code,p_credential_funding);
end $$;

-- Legacy customer RPC adapters retain their signatures. best_available now means
-- an explicit clear of the operation override, never automatic ranking.
create or replace function tongs.read_my_openai_text_model_preference(p_route_code text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare snapshot jsonb:=tongs.read_ai_operation_model_choices(p_route_code); chosen jsonb;
begin
 chosen:=case when snapshot->>'applicable_source'='operation_override' then snapshot->'operation_override' else snapshot->'global_preference' end;
 return jsonb_build_object('route_code',p_route_code,'preference_kind',case when chosen->>'selection_key' is null then 'best_available' else 'specific' end,'selection_key',chosen->'selection_key','display_name',chosen->'display_name','revision',coalesce((chosen->>'revision')::integer,0),'available',snapshot->'applicable_available','preference_source',snapshot->'applicable_source');
end $$;

create or replace function tongs.set_my_openai_text_model_preference(p_route_code text,p_preference_kind text,p_selection_key uuid default null,p_expected_revision integer default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
begin
 if p_preference_kind='specific' then perform tongs.set_my_ai_operation_model_override(p_route_code,p_selection_key,p_expected_revision);
 elsif p_preference_kind='best_available' and p_selection_key is null then perform tongs.clear_my_ai_operation_model_override(p_route_code,p_expected_revision);
 else raise exception 'invalid preference' using errcode='22023'; end if;
 return tongs.read_my_openai_text_model_preference(p_route_code);
end $$;

create or replace function tongs.read_openai_text_model_choices(p_route_code text default null)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare snapshot jsonb;
begin
 if p_route_code is null then raise exception 'known route required' using errcode='22023'; end if;
 snapshot:=tongs.read_ai_operation_model_choices(p_route_code);
 return jsonb_build_object('route_code',p_route_code,'catalog_revision',17,'catalog_state','active','preference',tongs.read_my_openai_text_model_preference(p_route_code),'eligible_choices',snapshot->'eligible_choices','selection_unavailable',not coalesce((snapshot->>'applicable_available')::boolean,false),'executable',snapshot->'executable','blocker',snapshot->'blocker');
end $$;

-- Customer quote creation remains impossible while Hammer is halt_new. These
-- adapters prepare catalog-selected multi-model pricing for a later rollout.
create or replace function tongs.create_customer_openai_text_quote(
 p_quote_id uuid,p_user_id uuid,p_operation_id text,p_route_code text,p_workspace_id uuid,p_workpiece_id text,
 p_request_fingerprint text,p_model text,p_credential_funding text,p_expires_at timestamptz
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_rollout tongs.openai_text_rollout_revisions%rowtype; v_cost tongs.openai_text_cost_policy_revisions%rowtype; selected record;
 v_pricing tongs.private_pricing_revisions%rowtype; v_quote tongs.customer_spending_quotes%rowtype; v_binding tongs.openai_text_customer_quote_bindings%rowtype;
 v_funding jsonb; v_authority jsonb; v_sku text; v_internal_operation text; v_create jsonb;
begin
 perform tongs._require_pricing_service_role();
 if p_quote_id is null or p_user_id is null or p_workspace_id is null or length(btrim(coalesce(p_operation_id,'')))<8 or length(btrim(coalesce(p_workpiece_id,'')))<1 or p_request_fingerprint!~'^[0-9a-f]{64}$' or length(btrim(coalesce(p_model,'')))<2 or p_credential_funding not in ('forge','byo_customer') or p_expires_at is null or p_expires_at<=now() then raise exception 'invalid OpenAI customer quote request' using errcode='22023'; end if;
 select * into v_rollout from tongs._openai_rollout_for_funding(p_route_code,p_credential_funding);
 if not found or v_rollout.mode<>'enforce' then raise exception 'OpenAI text customer spending is not active' using errcode='42501'; end if;
 select * into selected from tongs._eligible_ai_models_for_operation(p_route_code)e where btrim(p_model) in (e.runtime_model_id,e.provider_model_id);
 if not found then raise exception 'pricing_not_configured: exact eligible model required' using errcode='P0001'; end if;
 select * into v_cost from tongs.openai_text_cost_policy_revisions where id=selected.cost_policy_revision_id;
 if v_rollout.cost_policy_revision_id is not null and v_rollout.cost_policy_revision_id<>v_cost.id then raise exception 'OpenAI route is bound to a different cost revision' using errcode='42501'; end if;
 v_sku:=lower('openai-text:'||p_route_code||':'||selected.runtime_model_id||':'||v_cost.id::text);
 v_authority:=tongs._resolve_spending_authority(p_user_id,p_workspace_id,p_route_code);
 if v_authority->>'payer_kind'='owner_testing' then
  select revision.* into v_pricing from tongs.private_pricing_revisions revision
  join tongs.private_pricing_policies policy on policy.id=revision.policy_id
  where revision.lifecycle_state='review_ready' and revision.full_cost_ceiling_micros=v_cost.full_cost_ceiling_micros
    and revision.markup_basis_points=3300 and lower(coalesce(policy.provider,''))='openai'
    and lower(coalesce(policy.sku,''))=v_sku
  order by revision.revision desc limit 1;
 else
  select * into v_pricing from tongs._published_pricing_revision('openai',v_sku);
 end if;
 if not found or v_pricing.full_cost_ceiling_micros<>v_cost.full_cost_ceiling_micros then raise exception 'pricing_not_configured: published exact route price required' using errcode='P0001'; end if;
 select * into v_binding from tongs.openai_text_customer_quote_bindings where quote_id=p_quote_id;
 if found then
  if v_binding.user_id<>p_user_id or v_binding.canonical_operation_id<>btrim(p_operation_id) or v_binding.route_code<>p_route_code or v_binding.workspace_id<>p_workspace_id or v_binding.workpiece_id<>btrim(p_workpiece_id) or v_binding.request_fingerprint<>p_request_fingerprint or v_binding.runtime_model<>selected.runtime_model_id or v_binding.credential_funding<>p_credential_funding or v_binding.cost_policy_revision_id<>v_cost.id or v_binding.pricing_revision_id<>v_pricing.id then raise exception 'OpenAI quote replay conflict' using errcode='23505'; end if;
 else
  v_internal_operation:=left(btrim(p_operation_id),250)||':q:'||p_quote_id::text;
  v_create:=tongs.create_shadow_spending_quote(p_quote_id,p_user_id,v_internal_operation,p_route_code,p_workspace_id,v_pricing.id,p_request_fingerprint,jsonb_build_array(jsonb_build_object('component','ai_model','provider_label','AI provider','credential_source',case when p_credential_funding='forge' then 'forge' else 'byo_customer' end)),p_expires_at);
  insert into tongs.openai_text_customer_quote_bindings(quote_id,user_id,canonical_operation_id,route_code,workspace_id,workpiece_id,request_fingerprint,runtime_model,credential_funding,cost_policy_revision_id,pricing_revision_id,expires_at,model_catalog_revision_id,model_catalog_entry_id)
  values(p_quote_id,p_user_id,btrim(p_operation_id),p_route_code,p_workspace_id,btrim(p_workpiece_id),p_request_fingerprint,selected.runtime_model_id,p_credential_funding,v_cost.id,v_pricing.id,p_expires_at,selected.catalog_revision_id,selected.model_catalog_entry_id);
 end if;
 select * into v_quote from tongs.customer_spending_quotes where id=p_quote_id; v_funding:=tongs._select_customer_funding_for_quote(p_quote_id);
 return jsonb_build_object('quote_id',v_quote.id,'operation_id',btrim(p_operation_id),'quote_hash',v_quote.quote_hash,'request_fingerprint',v_quote.request_fingerprint,'currency',v_quote.currency,'customer_credit_units',case when v_funding->>'payer_kind'='owner_testing' then 0 else v_quote.customer_credit_units end,'maximum_customer_charge_micros',case when v_funding->>'payer_kind'='owner_testing' then 0 else v_quote.normal_maximum_charge_micros end,'failure_customer_charge_micros',0,'failure_terms','Forge-caused and provider-caused failures cost you $0. Uncertain submissions are not retried automatically.','funding_eligible',coalesce((v_funding->>'eligible')::boolean,false),'funding_source',coalesce(v_funding->>'funding_source','none'),'payer_kind',coalesce(v_funding->>'payer_kind','personal'),'funding_label',coalesce(v_funding->>'customer_label','No verified eligible funds'),'funding_environment',v_quote.financial_environment,'expires_at',v_quote.expires_at,'accepted',exists(select 1 from tongs.customer_spending_quote_acceptances a where a.quote_id=v_quote.id));
end $$;

create or replace function tongs.reserve_customer_openai_text_quote(p_quote_id uuid,p_reservation_id uuid,p_user_id uuid,p_operation_id text,p_route_code text,p_workspace_id uuid,p_workpiece_id text,p_request_fingerprint text,p_model text,p_credential_funding text,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_qb tongs.openai_text_customer_quote_bindings%rowtype; v_quote tongs.customer_spending_quotes%rowtype; v_funding jsonb; v_reserved jsonb; v_cost tongs.openai_text_cost_policy_revisions%rowtype; v_rollout tongs.openai_text_rollout_revisions%rowtype; v_existing tongs.openai_text_funding_bindings%rowtype;
begin
 perform tongs._require_pricing_service_role(); perform pg_advisory_xact_lock(hashtextextended('openai-text-ordinary:'||p_user_id::text||':'||btrim(p_operation_id),0));
 select * into v_qb from tongs.openai_text_customer_quote_bindings where quote_id=p_quote_id; select * into v_quote from tongs.customer_spending_quotes where id=p_quote_id;
 if v_qb.quote_id is null or v_quote.id is null or v_qb.user_id<>p_user_id or v_qb.canonical_operation_id<>btrim(p_operation_id) or v_qb.route_code<>p_route_code or v_qb.workspace_id<>p_workspace_id or v_qb.workpiece_id<>btrim(p_workpiece_id) or v_qb.request_fingerprint<>p_request_fingerprint or v_qb.runtime_model<>btrim(p_model) or v_qb.credential_funding<>p_credential_funding or not exists(select 1 from tongs.customer_spending_quote_acceptances a where a.quote_id=p_quote_id and a.user_id=p_user_id and a.accepted_quote_hash=v_quote.quote_hash) then raise exception 'accepted exact OpenAI quote required' using errcode='42501'; end if;
 if v_quote.expires_at<=now() and not exists(select 1 from tongs.funding_reservations r where r.quote_id=p_quote_id) then raise exception 'spending quote expired' using errcode='P0001'; end if;
 select * into v_cost from tongs.openai_text_cost_policy_revisions where id=v_qb.cost_policy_revision_id; select * into v_rollout from tongs._openai_rollout_for_funding(p_route_code,p_credential_funding);
 if v_rollout.mode<>'enforce' or (v_rollout.cost_policy_revision_id is not null and v_rollout.cost_policy_revision_id<>v_cost.id) or not exists(select 1 from tongs._eligible_ai_models_for_operation(p_route_code)e where e.model_catalog_entry_id=v_qb.model_catalog_entry_id and e.cost_policy_revision_id=v_cost.id and e.runtime_model_id=v_qb.runtime_model) then raise exception 'OpenAI text route is not active for this accepted cost revision' using errcode='42501'; end if;
 v_funding:=tongs._select_customer_funding_for_quote(p_quote_id); if coalesce((v_funding->>'eligible')::boolean,false) is not true then raise exception 'insufficient verified funding' using errcode='P0001'; end if;
 v_reserved:=tongs.reserve_operation(p_reservation_id,p_quote_id,v_funding->>'funding_source',(v_funding->>'funding_source_id')::uuid,p_idempotency_key);
 select * into v_existing from tongs.openai_text_funding_bindings where operation_id=btrim(p_operation_id);
 if found then if v_existing.reservation_id<>p_reservation_id or v_existing.route_code<>p_route_code or v_existing.model<>btrim(p_model) or v_existing.cost_policy_revision_id<>v_cost.id then raise exception 'OpenAI binding replay conflict' using errcode='23505'; end if;
 else insert into tongs.openai_text_funding_bindings(operation_id,route_code,reservation_id,credential_funding,model,pricing_revision_id,maximum_input_units,maximum_output_units,maximum_attempts,cost_policy_revision_id,rollout_revision) values(btrim(p_operation_id),p_route_code,p_reservation_id,p_credential_funding,btrim(p_model),v_qb.pricing_revision_id,v_cost.maximum_input_units,v_cost.maximum_output_units,v_cost.maximum_attempts,v_cost.id,v_rollout.revision); end if;
 return jsonb_build_object('paid_execution',jsonb_build_object('operation_id',btrim(p_operation_id),'reservation_id',p_reservation_id,'request_fingerprint',p_request_fingerprint,'funding_environment',(select funding_environment from tongs.funding_reservations where id=p_reservation_id)),'reservation_state',tongs._funding_reservation_state(p_reservation_id),'funding_source',v_funding->>'funding_source','replay',coalesce((v_reserved->>'replay')::boolean,false));
end $$;

insert into tongs.openai_text_failure_loss_policy_revisions(id,route_code,environment,revision,per_operation_limit_micros,aggregate_limit_micros,rolling_window_seconds,maximum_concurrency,lifecycle_state,reason,actor_id)
select row_value.id,'hammer.transcript_cleanup',row_value.environment,1,967680,967680,86400,1,'active',row_value.reason,operator.user_id
from (values('40010000-0000-4000-8000-000000000601'::uuid,'test','Defensive Hammer Test exposure ceiling; no execution scope exists.'),('40010000-0000-4000-8000-000000000602'::uuid,'live','Defensive Hammer Live exposure ceiling; no execution scope exists.'))row_value(id,environment,reason)
cross join lateral(select user_id from tongs.platform_operators order by granted_at limit 1)operator;

insert into tongs.openai_text_failure_loss_rollout_revisions(route_code,financial_environment,revision,mode,loss_policy_revision_id,source_limit_event_id,reason,actor_id)
select 'hammer.transcript_cleanup',row_value.environment,1,'halt_new',row_value.policy_id,null,'Financial authority prepared; Hammer exposure remains halted.',operator.user_id
from (values('test','40010000-0000-4000-8000-000000000601'::uuid),('live','40010000-0000-4000-8000-000000000602'::uuid))row_value(environment,policy_id)
cross join lateral(select user_id from tongs.platform_operators order by granted_at limit 1)operator;

insert into tongs.openai_text_rollout_revisions(route_code,revision,mode,cost_policy_revision_id,reason,actor_id,funding_scope)
select 'hammer.transcript_cleanup',3,'halt_new',null,'Three model-specific financial authorities prepared; no customer execution activation.',user_id,'forge'
from tongs.platform_operators order by granted_at limit 1;

do $$ begin
 if exists(select 1 from tongs.customer_paid_execution_scope_authorizations where route_code='hammer.transcript_cleanup') then raise exception 'Hammer execution scope must remain absent'; end if;
 if (select mode from tongs.openai_text_rollout_revisions where route_code='hammer.transcript_cleanup' order by revision desc limit 1)<>'halt_new' then raise exception 'Hammer must remain halt_new'; end if;
 if (select count(*) from tongs._eligible_ai_models_for_operation('hammer.transcript_cleanup'))<>3 then raise exception 'Hammer must expose exactly three eligible models'; end if;
end $$;

revoke all on function tongs._eligible_ai_models_for_operation(text) from public,anon,authenticated,service_role;
revoke all on function tongs.read_my_ai_model_preference() from public,anon;
revoke all on function tongs.read_ai_model_choices() from public,anon;
revoke all on function tongs.set_my_ai_model_preference(uuid,integer) from public,anon;
revoke all on function tongs.read_my_ai_operation_model_override(text) from public,anon;
revoke all on function tongs.read_ai_operation_model_choices(text) from public,anon;
revoke all on function tongs.set_my_ai_operation_model_override(text,uuid,integer) from public,anon;
revoke all on function tongs.clear_my_ai_operation_model_override(text,integer) from public,anon;
grant execute on function tongs.read_my_ai_model_preference(),tongs.read_ai_model_choices(),tongs.set_my_ai_model_preference(uuid,integer),tongs.read_my_ai_operation_model_override(text),tongs.read_ai_operation_model_choices(text),tongs.set_my_ai_operation_model_override(text,uuid,integer),tongs.clear_my_ai_operation_model_override(text,integer) to authenticated;
revoke all on function tongs.resolve_openai_text_model_for_quote(uuid,text,text),tongs.resolve_openai_text_model_for_funding_quote(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function tongs.resolve_openai_text_model_for_quote(uuid,text,text),tongs.resolve_openai_text_model_for_funding_quote(uuid,uuid,text,text) to service_role;

comment on table tongs.ai_model_preference_revisions is 'Provider-neutral Forge-wide customer model intent. It grants no operation eligibility, price, funding, rollout, or execution authority.';
comment on table tongs.ai_operation_model_override_revisions is 'Explicit operation override authority. A specific latest row remains authoritative until the customer appends a change or clear revision.';
comment on function tongs.resolve_openai_text_model_for_quote(uuid,text,text) is 'Strict resolution: explicit operation override, otherwise global preference, otherwise stop. Ineligible explicit choices never fall through.';

notify pgrst,'reload schema';
commit;
