-- Server-owned OpenAI model catalog, per-user preferences, supporting-cost evidence,
-- and non-additive organization-cost reconciliation. This release deliberately
-- leaves every new catalog revision draft and every Live route/price unpublished.
begin;

insert into tongs.openai_text_provider_rate_revisions(
  id,provider,runtime_model_alias,provider_model_id,revision,
  input_micros_per_million_tokens,cached_input_micros_per_million_tokens,
  output_micros_per_million_tokens,maximum_context_tokens,maximum_output_tokens,
  source_url,source_checked_at,content_hash
) values
 ('60000000-0000-4000-8000-000000000001','openai','gpt-6-astra','gpt-6-astra',1,10000000,1000000,50000000,1050000,128000,'https://developers.openai.com/api/docs/models/gpt-6-astra','2026-09-09T00:00:00Z',encode(extensions.digest(convert_to('openai:gpt-6-astra:1:10000000:1000000:50000000:1050000:128000:2026-09-09','utf8'),'sha256'),'hex')),
 ('56000000-0000-4000-8000-000000000001','openai','gpt-5.6-sol','gpt-5.6-sol',1,4000000,400000,20000000,1050000,128000,'https://developers.openai.com/api/docs/models/gpt-5.6-sol','2026-09-09T00:00:00Z',encode(extensions.digest(convert_to('openai:gpt-5.6-sol:1:4000000:400000:20000000:1050000:128000:2026-09-09','utf8'),'sha256'),'hex')),
 ('56000000-0000-4000-8000-000000000002','openai','gpt-5.6-terra','gpt-5.6-terra',1,2000000,200000,12000000,1050000,128000,'https://developers.openai.com/api/docs/models/gpt-5.6-terra','2026-09-09T00:00:00Z',encode(extensions.digest(convert_to('openai:gpt-5.6-terra:1:2000000:200000:12000000:1050000:128000:2026-09-09','utf8'),'sha256'),'hex')),
 ('56000000-0000-4000-8000-000000000003','openai','gpt-5.6-luna','gpt-5.6-luna',1,200000,20000,1200000,1050000,128000,'https://developers.openai.com/api/docs/models/gpt-5.6-luna','2026-09-09T00:00:00Z',encode(extensions.digest(convert_to('openai:gpt-5.6-luna:1:200000:20000:1200000:1050000:128000:2026-09-09','utf8'),'sha256'),'hex'))
on conflict(provider_model_id,revision) do nothing;

create table tongs.openai_text_model_catalog_revisions (
 id uuid primary key,
 revision integer not null unique check(revision>0),
 lifecycle_state text not null check(lifecycle_state in ('draft','active','retired')),
 quality_method text not null check(nullif(btrim(quality_method),'') is not null),
 source_checked_at timestamptz not null,
 content_hash text not null unique check(content_hash ~ '^[0-9a-f]{64}$'),
 actor_id uuid references auth.users(id) on delete restrict,
 created_at timestamptz not null default now()
);

create table tongs.openai_text_model_catalog_entries (
 id uuid primary key,
 catalog_revision_id uuid not null references tongs.openai_text_model_catalog_revisions(id) on delete restrict,
 runtime_model_id text not null check(length(btrim(runtime_model_id)) between 2 and 160),
 provider_model_id text not null check(length(btrim(provider_model_id)) between 2 and 160),
 display_name text not null check(length(btrim(display_name)) between 2 and 120),
 tradeoff_summary text not null check(length(btrim(tradeoff_summary)) between 4 and 300),
 quality_rank integer not null check(quality_rank between 1 and 1000),
 quality_basis text not null check(nullif(btrim(quality_basis),'') is not null),
 supported_apis jsonb not null check(jsonb_typeof(supported_apis)='array'),
 availability_status text not null check(availability_status in ('unverified','visible','generation_compatible','inaccessible')),
 availability_evidence jsonb not null default '{}'::jsonb check(jsonb_typeof(availability_evidence)='object'),
 lifecycle_state text not null check(lifecycle_state in ('candidate','active','deprecated','retired')),
 rate_revision_id uuid not null references tongs.openai_text_provider_rate_revisions(id) on delete restrict,
 created_at timestamptz not null default now(),
 unique(catalog_revision_id,runtime_model_id),
 unique(catalog_revision_id,provider_model_id)
);

create table tongs.openai_text_model_route_compatibility (
 id uuid primary key,
 catalog_entry_id uuid not null references tongs.openai_text_model_catalog_entries(id) on delete restrict,
 route_code text not null references tongs.openai_text_route_policies(route_code) on delete restrict,
 compatibility_status text not null check(compatibility_status in ('unverified','fixture_verified','generation_verified','incompatible')),
 maximum_input_tokens bigint not null check(maximum_input_tokens>0),
 maximum_output_tokens bigint not null check(maximum_output_tokens>0),
 maximum_attempts smallint not null check(maximum_attempts between 1 and 4),
 supporting_cost_coverage text not null check(supporting_cost_coverage in ('unresolved','complete')),
 cost_policy_revision_id uuid references tongs.openai_text_cost_policy_revisions(id) on delete restrict,
 evidence_json jsonb not null default '{}'::jsonb check(jsonb_typeof(evidence_json)='object'),
 created_at timestamptz not null default now(),
 unique(catalog_entry_id,route_code)
);

create table tongs.openai_text_user_model_preference_revisions (
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 revision integer not null check(revision>0),
 preference_kind text not null check(preference_kind in ('best_available','specific')),
 provider_model_id text,
 catalog_revision_id uuid references tongs.openai_text_model_catalog_revisions(id) on delete restrict,
 created_at timestamptz not null default now(),
 unique(user_id,revision),
 check((preference_kind='best_available' and provider_model_id is null) or (preference_kind='specific' and nullif(btrim(provider_model_id),'') is not null))
);

create table tongs.openai_text_supporting_cost_evidence (
 id uuid primary key,
 route_code text not null references tongs.openai_text_route_policies(route_code) on delete restrict,
 component_code text not null check(component_code in ('validation','persistence','hosting','storage','egress','search','extraction','enrichment','transcription')),
 revision integer not null check(revision>0),
 evidence_class text not null check(evidence_class in ('verified_rate','measured_usage','estimated_allocation','unresolved')),
 amount_ceiling_micros bigint check(amount_ceiling_micros is null or amount_ceiling_micros>=0),
 allocation_method text not null,
 source_reference text,
 source_checked_at timestamptz,
 double_counting_scope text not null,
 lifecycle_state text not null check(lifecycle_state in ('draft','approved','retired')),
 created_at timestamptz not null default now(),
 unique(route_code,component_code,revision),
 check((evidence_class='unresolved' and amount_ceiling_micros is null and lifecycle_state='draft') or evidence_class<>'unresolved')
);

create table tongs.openai_supplier_expense_reconciliation_adjustments (
 id uuid primary key,
 supplier_expense_id uuid not null references tongs.supplier_expenses(id) on delete restrict,
 reconciliation_batch_id uuid not null references tongs.openai_organization_reconciliation_batches(id) on delete restrict,
 operation_allocation_id uuid not null references tongs.openai_text_operation_cost_allocations(id) on delete restrict,
 source_key text not null unique,
 estimated_amount_micros bigint not null check(estimated_amount_micros>=0),
 confirmed_amount_micros bigint not null check(confirmed_amount_micros>=0),
 adjustment_micros bigint not null,
 currency text not null check(currency ~ '^[A-Z]{3}$'),
 matching_method text not null check(matching_method in ('provider_request_id','documented_allocation')),
 evidence_json jsonb not null default '{}'::jsonb check(jsonb_typeof(evidence_json)='object'),
 created_at timestamptz not null default now(),
 unique(supplier_expense_id,reconciliation_batch_id)
);

insert into tongs.openai_text_model_catalog_revisions(id,revision,lifecycle_state,quality_method,source_checked_at,content_hash)
values('29000000-0000-4000-8000-000000000001',1,'draft','Operator-reviewed ranking grounded in official OpenAI positioning: Astra most capable; Sol complex professional work; Terra balanced; GPT-5 Mini strong lower-cost intelligence; Luna cost-sensitive high-volume. Rank is not inferred from price or name.','2026-09-09T00:00:00Z',encode(extensions.digest(convert_to('openai-model-catalog:1:draft:2026-09-09','utf8'),'sha256'),'hex'));

insert into tongs.openai_text_model_catalog_entries(id,catalog_revision_id,runtime_model_id,provider_model_id,display_name,tradeoff_summary,quality_rank,quality_basis,supported_apis,availability_status,availability_evidence,lifecycle_state,rate_revision_id)
select v.id,'29000000-0000-4000-8000-000000000001',v.runtime_id,v.provider_id,v.display_name,v.tradeoff,v.quality_rank,v.quality_basis,
 '["responses","chat_completions","structured_outputs"]'::jsonb,v.availability,v.evidence::jsonb,v.lifecycle,r.id
from (values
 ('29000000-0000-4000-8000-000000000101'::uuid,'gpt-6-astra','gpt-6-astra','GPT-6 Astra','Highest-quality candidate; slower and highest cost.',100,'Official catalog calls Astra the most capable model for complex, demanding work.','unverified','{"check":"credentials_unavailable","visibility":"unverified","generation_compatibility":"unverified"}','candidate'),
 ('29000000-0000-4000-8000-000000000102'::uuid,'gpt-5.6-sol','gpt-5.6-sol','GPT-5.6 Sol','Strong professional reasoning at lower cost than Astra.',90,'Official documentation positions Sol for complex professional work.','unverified','{"check":"credentials_unavailable","visibility":"unverified","generation_compatibility":"unverified"}','candidate'),
 ('29000000-0000-4000-8000-000000000103'::uuid,'gpt-5.6-terra','gpt-5.6-terra','GPT-5.6 Terra','Balanced capability, latency, and cost.',80,'Official documentation positions Terra as the balanced model.','unverified','{"check":"credentials_unavailable","visibility":"unverified","generation_compatibility":"unverified"}','candidate'),
 ('29000000-0000-4000-8000-000000000104'::uuid,'gpt-5-mini','gpt-5-mini-2025-08-07','GPT-5 Mini','Strong lower-cost model for well-defined work.',70,'Official documentation describes GPT-5 Mini as a faster, cost-efficient GPT-5 variant for well-defined tasks.','unverified','{"check":"credentials_unavailable","visibility":"unverified","generation_compatibility":"fixture_only"}','candidate'),
 ('29000000-0000-4000-8000-000000000105'::uuid,'gpt-5.6-luna','gpt-5.6-luna','GPT-5.6 Luna','Fastest, lowest-cost candidate for high-volume work.',60,'Official documentation positions Luna for cost-sensitive high-volume work.','unverified','{"check":"credentials_unavailable","visibility":"unverified","generation_compatibility":"fixture_only"}','candidate'),
 ('29000000-0000-4000-8000-000000000106'::uuid,'gpt-5.3','gpt-5.3-chat-latest','GPT-5.3 Chat (deprecated)','Historical configuration only; not executable.',50,'Historical route model retained for audit; deprecated status and prior model_not_found prevent selection.','inaccessible','{"visibility":"model_not_found_in_forge_project","lifecycle":"deprecated","evidence":"bounded Hearth pilot"}','deprecated')
) as v(id,runtime_id,provider_id,display_name,tradeoff,quality_rank,quality_basis,availability,evidence,lifecycle)
join lateral(select id from tongs.openai_text_provider_rate_revisions r where r.provider_model_id=v.provider_id order by revision desc limit 1) r on true;

with routes(route_code,input_max,output_max) as (values
 ('hearth.research_synthesis',128000::bigint,16384::bigint),('visual.unified_plan',64000,16384),
 ('visual.narrative_interpretation',32000,8000),('motion.broll_interpretation',32000,8000),
 ('hammer.transcript_cleanup',128000,16384),('shorts.discovery',64000,16384),('quench.metadata',32000,8000)
)
insert into tongs.openai_text_model_route_compatibility(id,catalog_entry_id,route_code,compatibility_status,maximum_input_tokens,maximum_output_tokens,maximum_attempts,supporting_cost_coverage,evidence_json)
select extensions.uuid_generate_v5('29000000-0000-4000-8000-000000000001'::uuid,e.id::text||':'||r.route_code),e.id,r.route_code,'fixture_verified',r.input_max,r.output_max,1,'unresolved',
 jsonb_build_object('external_boundary','simulated','actual_handler_certified',true,'live_generation_compatibility',false)
from tongs.openai_text_model_catalog_entries e cross join routes r
where e.catalog_revision_id='29000000-0000-4000-8000-000000000001' and e.lifecycle_state='candidate';

insert into tongs.openai_text_supporting_cost_evidence(id,route_code,component_code,revision,evidence_class,allocation_method,double_counting_scope,lifecycle_state)
select extensions.uuid_generate_v5('29000000-0000-4000-8000-000000000001'::uuid,r.route_code||':'||c.component),r.route_code,c.component,1,'unresolved',
 'Requires measured route resource use multiplied by the applicable production service-plan unit rate; no flat allowance is inferred.',
 'Allocate once to the originating operation; exclude subscription baseline and any separately billed supporting operation.','draft'
from (values('hearth.research_synthesis'),('visual.unified_plan'),('visual.narrative_interpretation'),('motion.broll_interpretation'),('hammer.transcript_cleanup'),('shorts.discovery'),('quench.metadata')) r(route_code)
cross join (values('validation'),('persistence'),('hosting'),('storage'),('egress')) c(component);

alter table tongs.openai_text_customer_quote_bindings
 add column model_catalog_revision_id uuid references tongs.openai_text_model_catalog_revisions(id) on delete restrict,
 add column model_catalog_entry_id uuid references tongs.openai_text_model_catalog_entries(id) on delete restrict;

do $$ declare n text; begin
 foreach n in array array['openai_text_model_catalog_revisions','openai_text_model_catalog_entries','openai_text_model_route_compatibility','openai_text_user_model_preference_revisions','openai_text_supporting_cost_evidence','openai_supplier_expense_reconciliation_adjustments'] loop
  execute format('alter table tongs.%I enable row level security',n); execute format('alter table tongs.%I force row level security',n);
  execute format('revoke all on tongs.%I from public,anon,authenticated,service_role',n); execute format('grant select on tongs.%I to service_role',n);
 end loop;
end $$;

create trigger openai_text_model_catalog_revisions_immutable before update or delete on tongs.openai_text_model_catalog_revisions for each row execute function tongs._reject_accounting_mutation();
create trigger openai_text_model_catalog_entries_immutable before update or delete on tongs.openai_text_model_catalog_entries for each row execute function tongs._reject_accounting_mutation();
create trigger openai_text_model_route_compatibility_immutable before update or delete on tongs.openai_text_model_route_compatibility for each row execute function tongs._reject_accounting_mutation();
create trigger openai_text_user_model_preference_revisions_immutable before update or delete on tongs.openai_text_user_model_preference_revisions for each row execute function tongs._reject_accounting_mutation();
create trigger openai_text_supporting_cost_evidence_immutable before update or delete on tongs.openai_text_supporting_cost_evidence for each row execute function tongs._reject_accounting_mutation();
create trigger openai_supplier_expense_reconciliation_adjustments_immutable before update or delete on tongs.openai_supplier_expense_reconciliation_adjustments for each row execute function tongs._reject_accounting_mutation();

create or replace function tongs.read_my_openai_text_model_preference()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare uid uuid:=auth.uid(); p tongs.openai_text_user_model_preference_revisions%rowtype;
begin
 if uid is null then raise exception 'authentication required' using errcode='28000'; end if;
 select * into p from tongs.openai_text_user_model_preference_revisions where user_id=uid order by revision desc limit 1;
 if not found then return jsonb_build_object('preference_kind','best_available','provider_model_id',null,'revision',0); end if;
 return jsonb_build_object('preference_kind',p.preference_kind,'provider_model_id',p.provider_model_id,'revision',p.revision,'catalog_revision_id',p.catalog_revision_id,'updated_at',p.created_at);
end $$;

create or replace function tongs.read_openai_text_model_choices(p_route_code text default null)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare uid uuid:=auth.uid(); c tongs.openai_text_model_catalog_revisions%rowtype; p jsonb; choices jsonb; eligible jsonb;
begin
 if uid is null then raise exception 'authentication required' using errcode='28000'; end if;
 if p_route_code is not null and not exists(select 1 from tongs.openai_text_route_policies where route_code=p_route_code) then raise exception 'unknown route' using errcode='22023'; end if;
 select * into c from tongs.openai_text_model_catalog_revisions where lifecycle_state in ('active','draft') order by (lifecycle_state='active') desc,revision desc limit 1;
 p:=tongs.read_my_openai_text_model_preference();
 with candidate as (
  select distinct e.*,
   c.lifecycle_state='active' and e.lifecycle_state='active' and e.availability_status='generation_compatible'
   and exists(select 1 from tongs.openai_text_model_route_compatibility x
    join tongs.openai_text_cost_policy_revisions cp on cp.id=x.cost_policy_revision_id and cp.cost_coverage='complete' and cp.lifecycle_state in ('pilot_candidate','active')
    left join lateral tongs._published_pricing_revision('openai',lower('openai-text:'||x.route_code||':'||e.runtime_model_id||':'||cp.id::text)) pr on true
    where x.catalog_entry_id=e.id and (p_route_code is null or x.route_code=p_route_code) and x.compatibility_status='generation_verified' and x.supporting_cost_coverage='complete' and pr.id is not null) as is_eligible
  from tongs.openai_text_model_catalog_entries e where e.catalog_revision_id=c.id and e.lifecycle_state in ('candidate','active')
 )
 select coalesce(jsonb_agg(jsonb_build_object('provider_model_id',provider_model_id,'display_name',display_name,'tradeoff_summary',tradeoff_summary,'quality_rank',quality_rank,'executable',is_eligible,'blocker',case when is_eligible then null when availability_status<>'generation_compatible' then 'availability_not_verified' when c.lifecycle_state<>'active' then 'catalog_not_active' else 'pricing_or_supporting_cost_not_configured' end) order by quality_rank desc),'[]'::jsonb),
  coalesce(jsonb_agg(jsonb_build_object('provider_model_id',provider_model_id,'display_name',display_name,'tradeoff_summary',tradeoff_summary,'quality_rank',quality_rank,'executable',true,'blocker',null) order by quality_rank desc) filter(where is_eligible),'[]'::jsonb)
 into choices,eligible from candidate;
 return jsonb_build_object('catalog_revision',c.revision,'catalog_state',c.lifecycle_state,'preference',p,'eligible_choices',eligible,'candidate_status',choices,'executable',jsonb_array_length(eligible)>0,'blocker',case when jsonb_array_length(eligible)>0 then null else 'No active catalog entry has verified project availability, generation compatibility, complete supporting-cost coverage, and published pricing.' end);
end $$;

create or replace function tongs.set_my_openai_text_model_preference(p_preference_kind text,p_provider_model_id text default null,p_expected_revision integer default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare uid uuid:=auth.uid(); prior integer; c tongs.openai_text_model_catalog_revisions%rowtype; nextrev integer;
begin
 if uid is null then raise exception 'authentication required' using errcode='28000'; end if;
 if p_preference_kind not in ('best_available','specific') then raise exception 'invalid preference' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('openai-model-pref:'||uid::text,0));
 select coalesce(max(revision),0) into prior from tongs.openai_text_user_model_preference_revisions where user_id=uid;
 if p_expected_revision is not null and p_expected_revision<>prior then raise exception 'preference changed; reload' using errcode='40001'; end if;
 select * into c from tongs.openai_text_model_catalog_revisions where lifecycle_state='active' order by revision desc limit 1;
 if p_preference_kind='specific' then
  if c.id is null or not exists(select 1 from tongs.openai_text_model_catalog_entries e where e.catalog_revision_id=c.id and e.provider_model_id=btrim(p_provider_model_id) and e.lifecycle_state='active' and e.availability_status='generation_compatible') then raise exception 'selected model is not currently eligible; choose an offered alternative' using errcode='P0001'; end if;
 else p_provider_model_id:=null; end if;
 nextrev:=prior+1;
 insert into tongs.openai_text_user_model_preference_revisions(id,user_id,revision,preference_kind,provider_model_id,catalog_revision_id)
 values(gen_random_uuid(),uid,nextrev,p_preference_kind,nullif(btrim(p_provider_model_id),''),c.id);
 return tongs.read_my_openai_text_model_preference();
end $$;

create or replace function tongs.resolve_openai_text_model_for_quote(p_user_id uuid,p_route_code text,p_credential_funding text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare c tongs.openai_text_model_catalog_revisions%rowtype; pref tongs.openai_text_user_model_preference_revisions%rowtype; selected record;
begin
 perform tongs._require_pricing_service_role();
 if p_credential_funding<>'forge' then raise exception 'BYO model access and support-only pricing are not verified; no Forge credential fallback is permitted' using errcode='P0001'; end if;
 select * into c from tongs.openai_text_model_catalog_revisions where lifecycle_state='active' order by revision desc limit 1;
 if c.id is null then raise exception 'pricing_not_configured: no active model catalog' using errcode='P0001'; end if;
 select * into pref from tongs.openai_text_user_model_preference_revisions where user_id=p_user_id order by revision desc limit 1;
 select e.id entry_id,e.runtime_model_id,e.provider_model_id,e.display_name,e.tradeoff_summary,e.quality_rank,x.cost_policy_revision_id,r.revision rate_revision
 into selected from tongs.openai_text_model_catalog_entries e join tongs.openai_text_model_route_compatibility x on x.catalog_entry_id=e.id and x.route_code=p_route_code
 join tongs.openai_text_cost_policy_revisions cp on cp.id=x.cost_policy_revision_id and cp.cost_coverage='complete' and cp.lifecycle_state in ('pilot_candidate','active')
 join tongs.openai_text_provider_rate_revisions r on r.id=e.rate_revision_id
 join lateral tongs._published_pricing_revision('openai',lower('openai-text:'||x.route_code||':'||e.runtime_model_id||':'||cp.id::text)) pr on pr.full_cost_ceiling_micros=cp.full_cost_ceiling_micros
 where e.catalog_revision_id=c.id and e.lifecycle_state='active' and e.availability_status='generation_compatible' and x.compatibility_status='generation_verified' and x.supporting_cost_coverage='complete'
 and (coalesce(pref.preference_kind,'best_available')='best_available' or e.provider_model_id=pref.provider_model_id)
 order by e.quality_rank desc,e.provider_model_id limit 1;
 if not found then
  if pref.preference_kind='specific' then
   raise exception 'selected model is unavailable, incompatible, or unpriced; choose an eligible alternative' using errcode='P0001';
  else
   raise exception 'pricing_not_configured: no eligible model for route' using errcode='P0001';
  end if;
 end if;
 return jsonb_build_object('catalog_revision_id',c.id,'catalog_revision',c.revision,'model_catalog_entry_id',selected.entry_id,'runtime_model_id',selected.runtime_model_id,'provider_model_id',selected.provider_model_id,'display_name',selected.display_name,'tradeoff_summary',selected.tradeoff_summary,'quality_rank',selected.quality_rank,'rate_revision',selected.rate_revision,'cost_policy_revision_id',selected.cost_policy_revision_id);
end $$;

create or replace function tongs.read_openai_text_model_catalog_admin()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
begin
 if not tongs.is_platform_operator(auth.uid()) then raise exception 'platform operator required' using errcode='42501'; end if;
 return jsonb_build_object('catalogs',(select coalesce(jsonb_agg(to_jsonb(c) order by c.revision desc),'[]'::jsonb) from tongs.openai_text_model_catalog_revisions c),'entries',(select coalesce(jsonb_agg(to_jsonb(e) order by e.quality_rank desc),'[]'::jsonb) from tongs.openai_text_model_catalog_entries e),'route_compatibility',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from tongs.openai_text_model_route_compatibility x),'supporting_cost_evidence',(select coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) from tongs.openai_text_supporting_cost_evidence s));
end $$;

create or replace function tongs.bind_openai_text_quote_catalog()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare e tongs.openai_text_model_catalog_entries%rowtype;
begin
 select ce.* into e from tongs.openai_text_model_catalog_entries ce join tongs.openai_text_model_catalog_revisions c on c.id=ce.catalog_revision_id and c.lifecycle_state='active'
 join tongs.openai_text_model_route_compatibility x on x.catalog_entry_id=ce.id and x.route_code=new.route_code and x.cost_policy_revision_id=new.cost_policy_revision_id
 where ce.runtime_model_id=new.runtime_model and ce.lifecycle_state='active' and ce.availability_status='generation_compatible' order by c.revision desc limit 1;
 if not found then raise exception 'pricing_not_configured: quote model lacks an active exact catalog binding' using errcode='P0001'; end if;
 new.model_catalog_revision_id:=e.catalog_revision_id; new.model_catalog_entry_id:=e.id; return new;
end $$;
create trigger openai_text_quote_catalog_binding before insert on tongs.openai_text_customer_quote_bindings for each row execute function tongs.bind_openai_text_quote_catalog();

create or replace function tongs.record_openai_supplier_expense_reconciliation_adjustment(p_id uuid,p_supplier_expense_id uuid,p_batch_id uuid,p_allocation_id uuid,p_source_key text,p_confirmed_amount_micros bigint,p_matching_method text,p_evidence_json jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare e tongs.supplier_expenses%rowtype; a tongs.openai_text_operation_cost_allocations%rowtype; existing tongs.openai_supplier_expense_reconciliation_adjustments%rowtype;
begin
 perform tongs._require_pricing_service_role();
 select * into existing from tongs.openai_supplier_expense_reconciliation_adjustments where source_key=btrim(p_source_key);
 if found then return to_jsonb(existing)||jsonb_build_object('replay',true); end if;
 select * into e from tongs.supplier_expenses where id=p_supplier_expense_id;
 select * into a from tongs.openai_text_operation_cost_allocations where id=p_allocation_id and batch_id=p_batch_id;
 if e.id is null or a.id is null or a.allocation_status<>'confirmed' or a.allocated_cost_micros<>p_confirmed_amount_micros or e.reservation_id<>a.reservation_id then raise exception 'confirmed defensible operation allocation required' using errcode='P0001'; end if;
 insert into tongs.openai_supplier_expense_reconciliation_adjustments(id,supplier_expense_id,reconciliation_batch_id,operation_allocation_id,source_key,estimated_amount_micros,confirmed_amount_micros,adjustment_micros,currency,matching_method,evidence_json)
 values(p_id,e.id,p_batch_id,a.id,btrim(p_source_key),e.amount_micros,p_confirmed_amount_micros,p_confirmed_amount_micros-e.amount_micros,e.currency,p_matching_method,coalesce(p_evidence_json,'{}'::jsonb)) returning * into existing;
 return to_jsonb(existing)||jsonb_build_object('replay',false);
end $$;

create or replace function tongs.read_openai_reconciliation_summary()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare source_total bigint; matched bigint; adjustment bigint; batch_count bigint; unresolved_batches bigint;
begin
 if not tongs.is_platform_operator(auth.uid()) then raise exception 'platform operator required' using errcode='42501'; end if;
 select count(*),coalesce(sum(total_cost_micros),0),count(*) filter(where not exists(select 1 from tongs.openai_text_operation_cost_allocations a where a.batch_id=b.id and a.allocation_status='confirmed')) into batch_count,source_total,unresolved_batches from tongs.openai_organization_reconciliation_batches b;
 select coalesce(sum(allocated_cost_micros),0) into matched from tongs.openai_text_operation_cost_allocations where allocation_status='confirmed';
 select coalesce(sum(adjustment_micros),0) into adjustment from tongs.openai_supplier_expense_reconciliation_adjustments;
 return jsonb_build_object('source_total_micros',source_total,'matched_micros',matched,'estimate_replacement_adjustment_micros',adjustment,'unresolved_source_micros',greatest(source_total-matched,0),'batch_count',batch_count,'unresolved_batches',unresolved_batches,'source_granularity','organization/project/day aggregates; request-level matching required for confirmed operation expense');
end $$;

revoke all on function tongs.read_my_openai_text_model_preference() from public,anon;
revoke all on function tongs.read_openai_text_model_choices(text) from public,anon;
revoke all on function tongs.set_my_openai_text_model_preference(text,text,integer) from public,anon;
grant execute on function tongs.read_my_openai_text_model_preference() to authenticated;
grant execute on function tongs.read_openai_text_model_choices(text) to authenticated;
grant execute on function tongs.set_my_openai_text_model_preference(text,text,integer) to authenticated;
revoke all on function tongs.resolve_openai_text_model_for_quote(uuid,text,text) from public,anon,authenticated;
revoke all on function tongs.record_openai_supplier_expense_reconciliation_adjustment(uuid,uuid,uuid,uuid,text,bigint,text,jsonb) from public,anon,authenticated;
grant execute on function tongs.resolve_openai_text_model_for_quote(uuid,text,text) to service_role;
grant execute on function tongs.record_openai_supplier_expense_reconciliation_adjustment(uuid,uuid,uuid,uuid,text,bigint,text,jsonb) to service_role;
revoke all on function tongs.read_openai_text_model_catalog_admin() from public,anon,authenticated;
grant execute on function tongs.read_openai_text_model_catalog_admin() to authenticated;
revoke all on function tongs.read_openai_reconciliation_summary() from public,anon,authenticated;
grant execute on function tongs.read_openai_reconciliation_summary() to authenticated;

comment on table tongs.openai_text_user_model_preference_revisions is 'Append-only Supabase SSOT for each authenticated user OpenAI model preference; no localStorage authority.';
comment on table tongs.openai_supplier_expense_reconciliation_adjustments is 'Confirmed replacement delta against an existing estimate; reporting applies the delta and never adds the full confirmed amount to the estimate.';
comment on function tongs.read_openai_text_model_choices(text) is 'Customer-safe catalog view. It omits rates, wholesale ceilings, markup, margins, and internal evidence.';

commit;
