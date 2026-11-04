-- DISPOSABLE CERTIFICATION FIXTURE ONLY. This reconstructs the reviewed Luna
-- authority rows omitted from the schema-only canonical successor. It must
-- never be installed as a migration or used against a linked database.
begin;

do $guard$
declare v_head text;
begin
  if current_database() <> 'postgres'
     or current_setting('forge.provider_alignment_fixture', true) is distinct from 'disposable-baseline-v1'
     or not exists (select 1 from forge_meta.database_lineage where singleton and lineage='baseline-v1') then
    raise exception 'Luna provider-alignment fixture requires guarded disposable baseline' using errcode='42501';
  end if;
  select max(version) into v_head from supabase_migrations.schema_migrations;
  if v_head <> '20261104071802' then
    raise exception 'Luna provider-alignment fixture requires migration head 20261104071802, found %',v_head;
  end if;
  if exists(select 1 from auth.users where id='fe000000-0000-4000-8000-000000000001')
     or exists(select 1 from tongs.platform_operators
               where user_id='fe000000-0000-4000-8000-000000000001') then
    raise exception 'Luna provider-alignment fixture requires its synthetic operator identity to be absent';
  end if;
  if exists(select 1 from tongs.openai_text_provider_rate_revisions where id='56560000-0000-4000-8000-000000000001')
     or exists(select 1 from tongs.openai_text_cost_policy_revisions where id='10000000-0000-4000-8000-000000000010')
     or exists(select 1 from tongs.private_pricing_revisions where id='b4c4472f-0325-4c2e-b2ef-9aef5e59e64a')
     or exists(select 1 from tongs.openai_text_rollout_revisions where route_code='hearth.chat_completion') then
    raise exception 'Luna provider-alignment predecessor authority already exists' using errcode='23505';
  end if;
end $guard$;

-- The schema-only baseline intentionally carries no principal data. Establish
-- the same deterministic, disposable-only operator used by the governed replay
-- fixtures. It has no workspace, funding, balance, scope, or provider authority.
insert into auth.users(
  id,instance_id,aud,role,email,encrypted_password,
  email_confirmed_at,created_at,updated_at
) values (
  'fe000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated',
  'provider-alignment-certification@example.test','',now(),now(),now()
);

insert into tongs.platform_operators(user_id,reason,granted_by)
values (
  'fe000000-0000-4000-8000-000000000001',
  'Disposable-only provider request and Luna authority certification.',
  'fe000000-0000-4000-8000-000000000001'
);

insert into tongs.openai_text_provider_rate_revisions(
 id,provider,runtime_model_alias,provider_model_id,revision,input_micros_per_million_tokens,
 cached_input_micros_per_million_tokens,output_micros_per_million_tokens,maximum_context_tokens,
 maximum_output_tokens,source_url,source_checked_at,content_hash
) values (
 '56560000-0000-4000-8000-000000000001','openai','gpt-5.6-luna','gpt-5.6-luna',1,
 200000,20000,1200000,1050000,128000,'https://developers.openai.com/api/docs/models/gpt-5.6-luna',
 '2026-09-08T13:48:17.221114Z','03208a83eff360efe4c17f8c23ac01d405939cb8d5afb9166893edb4927c2bb8'
);

insert into tongs.openai_text_rate_condition_revisions(
 id,provider_rate_revision_id,revision,service_tier,cache_write_micros_per_million_tokens,
 reasoning_billing_rule,source_url,source_retrieved_at,lifecycle_state,notes
) values (
 '51100000-0000-4000-8000-000000000004','56560000-0000-4000-8000-000000000001',1,'standard',250000,
 'Reasoning tokens are included in billed output tokens and must fit the output ceiling.',
 'https://developers.openai.com/api/docs/models/gpt-5.6-luna','2026-09-09T16:00:00Z','draft',
 'Implicit cache writes can be reported; maximum pricing must reserve for writes or explicitly disable implicit caching.'
);

insert into tongs.openai_text_cost_policy_revisions(
 id,route_code,revision,policy_code,attempt_plan,maximum_input_units,maximum_output_units,
 maximum_attempts,direct_provider_ceiling_micros,supporting_cost_ceiling_micros,
 full_cost_ceiling_micros,cost_coverage,lifecycle_state,notes
) values (
 '10000000-0000-4000-8000-000000000010','hearth.chat_completion',3,
 'openai-text:hearth-chat:luna-bounded-pilot-v1',
 '[{"attempt":1,"rate_revision_id":"56560000-0000-4000-8000-000000000001","input_max":2000,"output_max":512}]',
 2000,512,1,1015,10000,11015,'complete','pilot_candidate',
 'Inactive replacement proposal. One neutral prompt, one attempt, no tools, search, media, or purchased assets.'
);

insert into tongs.private_markup_rule_revisions(
 id,revision,previous_revision_id,default_markup_basis_points,overrides_json,change_reason,content_hash,actor_id
) select '648f0593-de89-461a-b208-46900dd23268',1,null,3300,'[]',
 'Approved 33% private default markup on complete cost basis; customer prices remain unpublished',
 '758dc3c783f6100a9ea10cb95e7e702f424f0bda980a911bd943fd73d49ac85c',user_id
 from tongs.platform_operators order by granted_at limit 1;

insert into tongs.private_pricing_policies(id,policy_code,scope_kind,provider,sku,created_by)
select '7d3746e1-1ad7-47ce-95ad-bd6fcf9ddc8d','forge-standard-customer-hearth-luna-v1','sku','openai',
 'openai-text:hearth.chat_completion:gpt-5.6-luna:10000000-0000-4000-8000-000000000010',user_id
from tongs.platform_operators order by granted_at limit 1;

insert into tongs.private_pricing_revisions(
 id,policy_id,revision,previous_revision_id,lifecycle_state,currency,markup_basis_points,
 full_cost_ceiling_micros,failure_cost_ceiling_micros,customer_price_ceiling_micros,
 billable_failure_ceiling_micros,customer_credit_units,billable_failure_classes,free_failure_classes,
 included_quantity,retention_policy,change_reason,content_hash,actor_id,
 unrounded_customer_price_micros,rounding_adjustment_micros,settled_customer_price_micros
) select 'b4c4472f-0325-4c2e-b2ef-9aef5e59e64a','7d3746e1-1ad7-47ce-95ad-bd6fcf9ddc8d',1,null,
 'review_ready','USD',3300,11015,0,15000,0,3,'[]',
 '["forge_failure","forge_validation_failure","persistence_failure","prebilling_rejection","provider_billed_failure","provider_failure","unknown_fault"]',
 '{"attempts":1,"concurrency":1,"input_tokens":2000,"output_tokens":512}','{"kind":"none"}',
 'Bind the exact 3-credit Luna price to the standard-customer route and cost-policy SKU.',
 'bf74743cd54242ea3cbc17a200e6ac3713c6f1d21c45291b72db10cee513de24',user_id,14650,350,15000
from tongs.platform_operators order by granted_at limit 1;

insert into tongs.private_pricing_cost_components(
 pricing_revision_id,ordinal,component_code,component_kind,credential_funding,provider_label,
 success_ceiling_micros,failure_ceiling_micros,cost_policy_revision,tail_policy,tail_policy_details
) values
 ('b4c4472f-0325-4c2e-b2ef-9aef5e59e64a',1,'openai_text','direct_provider','forge','OpenAI',1015,0,'openai-text:hearth-chat:luna-bounded-pilot-v1','none','{}'),
 ('b4c4472f-0325-4c2e-b2ef-9aef5e59e64a',2,'bounded_support','compute','forge','Forge validation and persistence',10000,0,'openai-text:hearth-chat:luna-bounded-pilot-v1','none','{}');

insert into tongs.private_pricing_revision_markup_sources(
 pricing_revision_id,markup_rule_revision_id,effective_markup_basis_points
)
values ('b4c4472f-0325-4c2e-b2ef-9aef5e59e64a','648f0593-de89-461a-b208-46900dd23268',3300);

insert into tongs.private_pricing_publications(id,policy_id,pricing_revision_id,publication_revision,action,reason,actor_id)
select 'db0f0843-b67f-498b-9657-5843f92b2441','7d3746e1-1ad7-47ce-95ad-bd6fcf9ddc8d',
 'b4c4472f-0325-4c2e-b2ef-9aef5e59e64a',1,'published',
 'Publish the exact standard-customer Luna SKU without changing its economics.',user_id
from tongs.platform_operators order by granted_at limit 1;

insert into tongs.openai_text_rollout_revisions(route_code,revision,mode,cost_policy_revision_id,reason,actor_id,funding_scope)
select 'hearth.chat_completion',12,'enforce','10000000-0000-4000-8000-000000000010',
 'Route activation restored after automatic failure-loss halts became canonical-environment scoped.',user_id,'all'
from tongs.platform_operators order by granted_at limit 1;

commit;
