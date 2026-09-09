-- Sanitized OpenAI model-visibility evidence and inactive supporting-cost proposal.
-- No catalog, route, price, or paid-execution state is activated by this migration.
begin;

create table tongs.openai_text_model_visibility_observations (
 id uuid primary key,
 source_key text not null unique check(length(btrim(source_key)) between 16 and 240),
 catalog_revision_id uuid not null references tongs.openai_text_model_catalog_revisions(id) on delete restrict,
 catalog_entry_id uuid not null references tongs.openai_text_model_catalog_entries(id) on delete restrict,
 provider_project_fingerprint text not null check(provider_project_fingerprint ~ '^[0-9a-f]{64}$'),
 provider_model_id text not null check(length(btrim(provider_model_id)) between 2 and 160),
 checked_at timestamptz not null,
 check_kind text not null default 'models_retrieve' check(check_kind='models_retrieve'),
 http_status integer check(http_status between 100 and 599),
 visible boolean not null,
 returned_model_id text,
 provider_owner_label text,
 sanitized_evidence_json jsonb not null default '{}'::jsonb check(jsonb_typeof(sanitized_evidence_json)='object'),
 created_at timestamptz not null default now(),
 check((visible and http_status=200 and returned_model_id=provider_model_id) or not visible)
);

create table tongs.supporting_service_plan_observations (
 id uuid primary key,
 source_key text not null unique check(length(btrim(source_key)) between 16 and 240),
 provider text not null check(length(btrim(provider)) between 2 and 80),
 plan_name text not null check(length(btrim(plan_name)) between 2 and 120),
 evidence_period_start date not null,
 evidence_period_end date not null,
 fixed_charge_micros bigint check(fixed_charge_micros is null or fixed_charge_micros>=0),
 usage_json jsonb not null default '{}'::jsonb check(jsonb_typeof(usage_json)='object'),
 evidence_class text not null check(evidence_class in ('authenticated_billing_view','authenticated_usage_view','authenticated_runtime_config')),
 source_reference text not null,
 observed_at timestamptz not null,
 created_at timestamptz not null default now(),
 check(evidence_period_end>=evidence_period_start)
);

alter table tongs.openai_text_model_visibility_observations enable row level security;
alter table tongs.openai_text_model_visibility_observations force row level security;
alter table tongs.supporting_service_plan_observations enable row level security;
alter table tongs.supporting_service_plan_observations force row level security;
revoke all on tongs.openai_text_model_visibility_observations from public,anon,authenticated,service_role;
revoke all on tongs.supporting_service_plan_observations from public,anon,authenticated,service_role;
grant select,insert on tongs.openai_text_model_visibility_observations to service_role;
grant select,insert on tongs.supporting_service_plan_observations to service_role;

create trigger openai_text_model_visibility_observations_immutable
 before update or delete on tongs.openai_text_model_visibility_observations
 for each row execute function tongs._reject_accounting_mutation();
create trigger supporting_service_plan_observations_immutable
 before update or delete on tongs.supporting_service_plan_observations
 for each row execute function tongs._reject_accounting_mutation();

create or replace function tongs.record_openai_text_model_visibility(
 p_id uuid,p_source_key text,p_catalog_revision_id uuid,p_catalog_entry_id uuid,
 p_provider_project_fingerprint text,p_provider_model_id text,p_checked_at timestamptz,
 p_http_status integer,p_visible boolean,p_returned_model_id text default null,
 p_provider_owner_label text default null,p_sanitized_evidence_json jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare existing tongs.openai_text_model_visibility_observations%rowtype; entry tongs.openai_text_model_catalog_entries%rowtype;
begin
 perform tongs._require_pricing_service_role();
 select * into existing from tongs.openai_text_model_visibility_observations where source_key=btrim(p_source_key);
 if found then return to_jsonb(existing)||jsonb_build_object('replay',true); end if;
 select * into entry from tongs.openai_text_model_catalog_entries where id=p_catalog_entry_id and catalog_revision_id=p_catalog_revision_id and provider_model_id=btrim(p_provider_model_id);
 if not found then raise exception 'model catalog binding mismatch' using errcode='P0001'; end if;
 if p_sanitized_evidence_json ?| array['authorization','api_key','secret','token','response_body'] then raise exception 'unsanitized model evidence rejected' using errcode='P0001'; end if;
 insert into tongs.openai_text_model_visibility_observations(id,source_key,catalog_revision_id,catalog_entry_id,provider_project_fingerprint,provider_model_id,checked_at,http_status,visible,returned_model_id,provider_owner_label,sanitized_evidence_json)
 values(p_id,btrim(p_source_key),p_catalog_revision_id,p_catalog_entry_id,lower(p_provider_project_fingerprint),btrim(p_provider_model_id),p_checked_at,p_http_status,p_visible,nullif(btrim(coalesce(p_returned_model_id,'')),''),nullif(btrim(coalesce(p_provider_owner_label,'')),''),coalesce(p_sanitized_evidence_json,'{}'::jsonb)) returning * into existing;
 return to_jsonb(existing)||jsonb_build_object('replay',false);
end $$;

create or replace function tongs.record_supporting_service_plan_observation(
 p_id uuid,p_source_key text,p_provider text,p_plan_name text,p_evidence_period_start date,
 p_evidence_period_end date,p_fixed_charge_micros bigint,p_usage_json jsonb,
 p_evidence_class text,p_source_reference text,p_observed_at timestamptz
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare existing tongs.supporting_service_plan_observations%rowtype;
begin
 perform tongs._require_pricing_service_role();
 select * into existing from tongs.supporting_service_plan_observations where source_key=btrim(p_source_key);
 if found then return to_jsonb(existing)||jsonb_build_object('replay',true); end if;
 insert into tongs.supporting_service_plan_observations(id,source_key,provider,plan_name,evidence_period_start,evidence_period_end,fixed_charge_micros,usage_json,evidence_class,source_reference,observed_at)
 values(p_id,btrim(p_source_key),lower(btrim(p_provider)),btrim(p_plan_name),p_evidence_period_start,p_evidence_period_end,p_fixed_charge_micros,coalesce(p_usage_json,'{}'::jsonb),p_evidence_class,btrim(p_source_reference),p_observed_at) returning * into existing;
 return to_jsonb(existing)||jsonb_build_object('replay',false);
end $$;

create or replace function tongs.read_openai_text_model_catalog_admin()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
begin
 if not tongs.is_platform_operator(auth.uid()) then raise exception 'platform operator required' using errcode='42501'; end if;
 return jsonb_build_object(
  'catalogs',(select coalesce(jsonb_agg(to_jsonb(c) order by c.revision desc),'[]'::jsonb) from tongs.openai_text_model_catalog_revisions c),
  'entries',(select coalesce(jsonb_agg(to_jsonb(e) order by e.quality_rank desc),'[]'::jsonb) from tongs.openai_text_model_catalog_entries e),
  'route_compatibility',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from tongs.openai_text_model_route_compatibility x),
  'supporting_cost_evidence',(select coalesce(jsonb_agg(to_jsonb(s) order by s.route_code,s.component_code,s.revision desc),'[]'::jsonb) from tongs.openai_text_supporting_cost_evidence s),
  'visibility_observations',(select coalesce(jsonb_agg(to_jsonb(v) order by v.checked_at desc),'[]'::jsonb) from tongs.openai_text_model_visibility_observations v),
  'service_plan_observations',(select coalesce(jsonb_agg(to_jsonb(p) order by p.observed_at desc),'[]'::jsonb) from tongs.supporting_service_plan_observations p)
 );
end $$;

revoke all on function tongs.record_openai_text_model_visibility(uuid,text,uuid,uuid,text,text,timestamptz,integer,boolean,text,text,jsonb) from public,anon,authenticated;
revoke all on function tongs.record_supporting_service_plan_observation(uuid,text,text,text,date,date,bigint,jsonb,text,text,timestamptz) from public,anon,authenticated;
grant execute on function tongs.record_openai_text_model_visibility(uuid,text,uuid,uuid,text,text,timestamptz,integer,boolean,text,text,jsonb) to service_role;
grant execute on function tongs.record_supporting_service_plan_observation(uuid,text,text,text,date,date,bigint,jsonb,text,text,timestamptz) to service_role;
revoke all on function tongs.read_openai_text_model_catalog_admin() from public,anon,authenticated;
grant execute on function tongs.read_openai_text_model_catalog_admin() to authenticated;

-- Conditional, inactive variable-cost proposal. A uniform 120-second server limit,
-- 1 MiB response/result envelope, and 30-day retention policy are approval gates,
-- not claims about current production behavior. Validation is included in hosting.
with routes(route_code) as (values
 ('hearth.research_synthesis'),('visual.unified_plan'),('visual.narrative_interpretation'),
 ('motion.broll_interpretation'),('hammer.transcript_cleanup'),('shorts.discovery'),('quench.metadata')
), components(component_code,amount,evidence_class,allocation_method,scope) as (values
 ('validation',0::bigint,'estimated_allocation','Included in the same Netlify function compute envelope; never add a second validation charge.','One operation function invocation; included in hosting.'),
 ('hosting',2225::bigint,'estimated_allocation','One request plus 120 seconds at 1 GB, using 2 credits/10k requests, 10 credits/GB-hour, and $20/3000 subscribed-plan credits; round each bound up to currency micros.','One operation; excludes the fixed $20 subscription baseline.'),
 ('storage',123::bigint,'estimated_allocation','At most 1 MiB of canonical result retained for 30 days at $0.125/GB-month overage replacement rate.','One operation/result/30-day window; fixed included quota is not also allocated.'),
 ('egress',219::bigint,'estimated_allocation','At most 1 MiB: Netlify bandwidth replacement rate plus Supabase uncached egress replacement rate.','One delivered result; do not add cached and uncached Supabase egress together.'),
 ('persistence',null::bigint,'unresolved','Requires owner choice: plan-funded baseline, or monthly attributable operation volume and product share for a fixed-plan allocation.','Supabase Pro/database compute baseline; cannot be charged again through hosting or storage.')
)
insert into tongs.openai_text_supporting_cost_evidence(id,route_code,component_code,revision,evidence_class,amount_ceiling_micros,allocation_method,source_reference,source_checked_at,double_counting_scope,lifecycle_state)
select extensions.uuid_generate_v5('39000000-0000-4000-8000-000000000001'::uuid,r.route_code||':'||c.component_code),r.route_code,c.component_code,2,c.evidence_class,c.amount,c.allocation_method,
 'Authenticated Forge plan/usage audit 2026-09-09; public unit-rate references recorded in OPENAI_TEXT_EVIDENCE_AND_SUPPORT_COSTS.md','2026-09-09T00:00:00Z',c.scope,'draft'
from routes r cross join components c
on conflict(route_code,component_code,revision) do nothing;

comment on table tongs.openai_text_model_visibility_observations is 'Append-only sanitized GET /v1/models/{model} observations. Visibility does not prove API parameter, fixture, or generation compatibility.';
comment on table tongs.supporting_service_plan_observations is 'Private append-only subscribed-plan and usage evidence; never exposed through customer RPCs.';
comment on function tongs.record_openai_text_model_visibility(uuid,text,uuid,uuid,text,text,timestamptz,integer,boolean,text,text,jsonb) is 'Service-only idempotent persistence for a non-generating model visibility check; rejects secret-bearing evidence fields.';

commit;
