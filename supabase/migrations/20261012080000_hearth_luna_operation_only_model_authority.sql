-- Register the already-certified Hearth Luna model in the provider-neutral
-- identity system without publishing it as a Forge-wide preference choice.
begin;

create temporary table luna_authority_reconciliation_snapshot on commit drop as
select
  (select count(*) from tongs.ai_model_preference_revisions) as preference_count,
  (select count(*) from tongs.ai_operation_model_override_revisions) as override_count,
  (select count(*) from tongs.openai_text_provider_rate_revisions) as provider_rate_count,
  (select count(*) from tongs.openai_text_model_catalog_revisions) as catalog_revision_count,
  (select count(*) from tongs.openai_text_model_catalog_entries) as catalog_entry_count,
  (select count(*) from tongs.openai_text_model_route_compatibility) as compatibility_count,
  (select count(*) from tongs.openai_text_cost_policy_revisions) as cost_policy_count,
  (select count(*) from tongs.private_pricing_revisions) as pricing_revision_count,
  (select count(*) from tongs.private_pricing_publications) as pricing_publication_count,
  (select count(*) from tongs.openai_text_rollout_revisions) as rollout_count,
  (select count(*) from tongs.customer_paid_execution_scope_authorizations) as execution_scope_count,
  (select count(*) from tongs.paid_execution_aggregate_assignments) as aggregate_assignment_count;

do $$
declare
  luna_entry_id uuid;
  luna_entry_count integer;
  certified_routes text[];
  luna_rate tongs.openai_text_provider_rate_revisions%rowtype;
begin
  if not exists(
    select 1 from tongs.openai_text_model_catalog_revisions
    where id='40010000-0000-4000-8000-000000000500' and revision=17 and lifecycle_state='active'
  ) then raise exception 'expected active catalog revision 17 is unavailable'; end if;

  select count(*) into luna_entry_count
  from tongs.openai_text_model_catalog_entries entry
  where entry.catalog_revision_id='40010000-0000-4000-8000-000000000500'
    and entry.runtime_model_id='gpt-5.6-luna'
    and entry.provider_model_id='gpt-5.6-luna'
    and entry.lifecycle_state='active'
    and entry.availability_status='generation_compatible';
  if luna_entry_count<>1 then
    raise exception 'expected exactly one active catalog revision 17 Luna entry, found %',luna_entry_count;
  end if;
  select entry.id into luna_entry_id
  from tongs.openai_text_model_catalog_entries entry
  where entry.catalog_revision_id='40010000-0000-4000-8000-000000000500'
    and entry.runtime_model_id='gpt-5.6-luna'
    and entry.provider_model_id='gpt-5.6-luna'
    and entry.lifecycle_state='active'
    and entry.availability_status='generation_compatible';

  select array_agg(compat.route_code order by compat.route_code) into certified_routes
  from tongs.openai_text_model_route_compatibility compat
  join tongs.openai_text_cost_policy_revisions cost on cost.id=compat.cost_policy_revision_id
  join lateral tongs._published_pricing_revision(
    'openai',lower('openai-text:'||compat.route_code||':gpt-5.6-luna:'||cost.id::text)
  ) pricing on pricing.full_cost_ceiling_micros=cost.full_cost_ceiling_micros
  where compat.catalog_entry_id=luna_entry_id
    and compat.compatibility_status='generation_verified'
    and compat.supporting_cost_coverage='complete'
    and cost.cost_coverage='complete'
    and cost.lifecycle_state in ('pilot_candidate','active');
  if certified_routes is distinct from array[
    'hearth.chat_completion',
    'hearth.framing_pack_generation',
    'hearth.research_synthesis',
    'hearth.script_generation',
    'hearth.tag_generation',
    'hearth.thumbnail_direction_generation',
    'hearth.title_generation'
  ]::text[] then raise exception 'Luna Hearth certification/pricing authority drifted: %',certified_routes; end if;

  if exists(
    select 1 from tongs.openai_text_model_route_compatibility
    where catalog_entry_id=luna_entry_id and route_code like 'hammer.%'
  ) then raise exception 'Luna unexpectedly has Hammer compatibility'; end if;
  if exists(select 1 from tongs.ai_model_identities where provider_code='openai' and provider_model_id='gpt-5.6-luna')
    or exists(select 1 from tongs.openai_text_catalog_ai_model_bindings where catalog_entry_id=luna_entry_id)
  then raise exception 'Luna provider-neutral authority already exists'; end if;

  if (select count(*) from tongs.ai_model_identities where model_code in(
    'openai:gpt-5.4-mini','openai:gpt-6.1-sol','openai:gpt-5.6-sol'
  ))<>3 then raise exception 'approved global identity baseline drifted'; end if;

  select rate.* into luna_rate
  from tongs.openai_text_model_catalog_entries entry
  join tongs.openai_text_provider_rate_revisions rate on rate.id=entry.rate_revision_id
  where entry.id=luna_entry_id;
  if luna_rate.input_micros_per_million_tokens is null
    or luna_rate.cached_input_micros_per_million_tokens is null
    or luna_rate.output_micros_per_million_tokens is null
    or exists(
      select 1
      from tongs.ai_model_identities identity
      join tongs.openai_text_catalog_ai_model_bindings binding on binding.model_identity_id=identity.id
      join tongs.openai_text_model_catalog_entries entry on entry.id=binding.catalog_entry_id
      join tongs.openai_text_provider_rate_revisions rate on rate.id=entry.rate_revision_id
      where identity.model_code in('openai:gpt-5.4-mini','openai:gpt-6.1-sol','openai:gpt-5.6-sol')
        and (luna_rate.input_micros_per_million_tokens>=rate.input_micros_per_million_tokens
          or luna_rate.cached_input_micros_per_million_tokens>=rate.cached_input_micros_per_million_tokens
          or luna_rate.output_micros_per_million_tokens>=rate.output_micros_per_million_tokens)
    )
  then raise exception 'retained provider rates do not support Luna lower_cost classification'; end if;
end $$;

create table tongs.ai_global_model_choice_revisions(
  id uuid primary key,
  model_identity_id uuid not null references tongs.ai_model_identities(id) on delete restrict,
  revision integer not null check(revision>0),
  authority_state text not null check(authority_state in('selectable','operation_only')),
  reason text not null check(length(btrim(reason)) between 3 and 500),
  evidence_json jsonb not null check(jsonb_typeof(evidence_json)='object'),
  created_at timestamptz not null default now(),
  unique(model_identity_id,revision)
);
create index ai_global_model_choice_latest_idx
  on tongs.ai_global_model_choice_revisions(model_identity_id,revision desc);
alter table tongs.ai_global_model_choice_revisions enable row level security;
alter table tongs.ai_global_model_choice_revisions force row level security;
revoke all on tongs.ai_global_model_choice_revisions from public,anon,authenticated,service_role;
grant select on tongs.ai_global_model_choice_revisions to service_role;
create trigger ai_global_model_choice_revisions_immutable
before update or delete on tongs.ai_global_model_choice_revisions
for each row execute function tongs._reject_accounting_mutation();

insert into tongs.ai_model_identities(
  id,model_code,provider_code,provider_model_id,customer_selection_key
) values(
  '40010000-0000-4000-8000-000000000004','openai:gpt-5.6-luna','openai','gpt-5.6-luna',
  '40010000-0000-4000-9000-000000000004'
);
insert into tongs.ai_model_identity_revisions(
  id,model_identity_id,revision,display_name,relative_cost_class,lifecycle_state,evidence_json
) values(
  '40010000-0000-4000-8000-000000000104','40010000-0000-4000-8000-000000000004',1,
  'GPT-5.6 Luna','lower_cost','active',
  '{"authority":"operation_only","classification_basis":"retained provider rates are lower component-by-component than all globally selectable models","customer_ranking":false}'
);

insert into tongs.ai_global_model_choice_revisions(
  id,model_identity_id,revision,authority_state,reason,evidence_json
) values
 ('40010000-0000-4000-8000-000000000701','40010000-0000-4000-8000-000000000001',1,'selectable','Preserve the approved Forge-wide GPT-5.4 Mini choice.','{"source":"approved_slice_4_global_choices"}'),
 ('40010000-0000-4000-8000-000000000702','40010000-0000-4000-8000-000000000002',1,'selectable','Preserve the approved Forge-wide GPT-6.1 Sol choice.','{"source":"approved_slice_4_global_choices"}'),
 ('40010000-0000-4000-8000-000000000703','40010000-0000-4000-8000-000000000003',1,'selectable','Preserve the approved Forge-wide GPT-5.6 Sol choice.','{"source":"approved_slice_4_global_choices"}'),
 ('40010000-0000-4000-8000-000000000704','40010000-0000-4000-8000-000000000004',1,'operation_only','Expose Luna only through exact operation eligibility and explicit operation overrides.','{"source":"approved_hearth_luna_reconciliation","global_preference":false}');

insert into tongs.openai_text_catalog_ai_model_bindings(catalog_entry_id,model_identity_id)
select entry.id,'40010000-0000-4000-8000-000000000004'
from tongs.openai_text_model_catalog_entries entry
where entry.catalog_revision_id='40010000-0000-4000-8000-000000000500'
  and entry.runtime_model_id='gpt-5.6-luna'
  and entry.provider_model_id='gpt-5.6-luna'
  and entry.lifecycle_state='active'
  and entry.availability_status='generation_compatible';

create or replace function tongs.read_ai_model_choices()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare uid uuid:=auth.uid(); choices jsonb;
begin
 if uid is null then raise exception 'authentication required' using errcode='28000'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'selection_key',identity.customer_selection_key,
   'display_name',revision.display_name,
   'relative_cost_class',revision.relative_cost_class
 ) order by case revision.relative_cost_class when 'lower_cost' then 1 when 'mid_range_cost' then 2 else 3 end,revision.display_name),'[]'::jsonb)
 into choices
 from tongs.ai_model_identities identity
 join lateral(
   select r.* from tongs.ai_model_identity_revisions r
   where r.model_identity_id=identity.id order by r.revision desc limit 1
 ) revision on revision.lifecycle_state='active'
 join lateral(
   select choice.* from tongs.ai_global_model_choice_revisions choice
   where choice.model_identity_id=identity.id order by choice.revision desc limit 1
 ) global_choice on global_choice.authority_state='selectable';
 return jsonb_build_object('preference',tongs.read_my_ai_model_preference(),'choices',choices);
end $$;

create or replace function tongs.set_my_ai_model_preference(
  p_selection_key uuid,p_expected_revision integer default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare uid uuid:=auth.uid(); prior integer; identity_id uuid;
begin
 if uid is null then raise exception 'authentication required' using errcode='28000'; end if;
 select identity.id into identity_id
 from tongs.ai_model_identities identity
 join lateral(
   select r.* from tongs.ai_model_identity_revisions r
   where r.model_identity_id=identity.id order by r.revision desc limit 1
 ) revision on revision.lifecycle_state='active'
 join lateral(
   select choice.* from tongs.ai_global_model_choice_revisions choice
   where choice.model_identity_id=identity.id order by choice.revision desc limit 1
 ) global_choice on global_choice.authority_state='selectable'
 where identity.customer_selection_key=p_selection_key;
 if identity_id is null then raise exception 'model selection unavailable' using errcode='P0001'; end if;
 perform pg_advisory_xact_lock(hashtextextended('ai-model-pref:'||uid::text,0));
 select coalesce(max(revision),0) into prior from tongs.ai_model_preference_revisions where user_id=uid;
 if p_expected_revision is not null and p_expected_revision<>prior then raise exception 'preference changed; reload' using errcode='40001'; end if;
 insert into tongs.ai_model_preference_revisions(id,user_id,revision,model_identity_id)
 values(gen_random_uuid(),uid,prior+1,identity_id);
 return tongs.read_my_ai_model_preference();
end $$;

create or replace function tongs.resolve_openai_text_model_for_quote(
  p_user_id uuid,p_route_code text,p_credential_funding text
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare override_row tongs.ai_operation_model_override_revisions%rowtype; global_row tongs.ai_model_preference_revisions%rowtype; selected record; source text;
begin
 perform tongs._require_pricing_service_role();
 if p_credential_funding<>'forge' then raise exception 'BYO model access and support-only pricing are not verified; no Forge fallback is permitted' using errcode='P0001'; end if;
 select * into override_row from tongs.ai_operation_model_override_revisions where user_id=p_user_id and operation_code=p_route_code order by revision desc limit 1;
 if found and override_row.override_state='specific' then
   select * into selected from tongs._eligible_ai_models_for_operation(p_route_code)e where e.model_identity_id=override_row.model_identity_id;
   if not found then raise exception 'operation_model_override_unavailable: change or clear the explicit operation override' using errcode='P0001'; end if;
   source:='operation_override';
 else
   select * into global_row from tongs.ai_model_preference_revisions where user_id=p_user_id order by revision desc limit 1;
   if not found then raise exception 'global_model_preference_required: choose a preferred AI model' using errcode='P0001'; end if;
   if not exists(
     select 1 from tongs.ai_global_model_choice_revisions choice
     where choice.model_identity_id=global_row.model_identity_id
       and choice.revision=(select max(latest.revision) from tongs.ai_global_model_choice_revisions latest where latest.model_identity_id=choice.model_identity_id)
       and choice.authority_state='selectable'
   ) then raise exception 'global_model_preference_unavailable: choose an eligible operation override' using errcode='P0001'; end if;
   select * into selected from tongs._eligible_ai_models_for_operation(p_route_code)e where e.model_identity_id=global_row.model_identity_id;
   if not found then raise exception 'global_model_preference_unavailable: choose an eligible operation override' using errcode='P0001'; end if;
   source:='global_preference';
 end if;
 return jsonb_build_object(
   'catalog_revision_id',selected.catalog_revision_id,'catalog_revision',selected.catalog_revision,
   'model_catalog_entry_id',selected.model_catalog_entry_id,'customer_selection_key',selected.customer_selection_key,
   'runtime_model_id',selected.runtime_model_id,'provider_model_id',selected.provider_model_id,
   'display_name',selected.display_name,
   'tradeoff_summary',case selected.relative_cost_class when 'lower_cost' then 'Lower cost' when 'mid_range_cost' then 'Mid-range cost' else 'Higher cost' end,
   'cost_policy_revision_id',selected.cost_policy_revision_id,'preference_source',source
 );
end $$;

do $$
declare
  snapshot luna_authority_reconciliation_snapshot%rowtype;
  hearth_routes text[]:=array[
    'hearth.chat_completion','hearth.framing_pack_generation','hearth.research_synthesis',
    'hearth.script_generation','hearth.tag_generation','hearth.thumbnail_direction_generation',
    'hearth.title_generation'
  ];
  route_code text;
begin
 select * into snapshot from luna_authority_reconciliation_snapshot;
 if (select count(*) from tongs.ai_global_model_choice_revisions choice
     where choice.revision=(select max(latest.revision) from tongs.ai_global_model_choice_revisions latest where latest.model_identity_id=choice.model_identity_id)
       and choice.authority_state='selectable')<>3
 then raise exception 'global model choice count changed'; end if;
 if not exists(
   select 1 from tongs.ai_global_model_choice_revisions
   where model_identity_id='40010000-0000-4000-8000-000000000004' and revision=1 and authority_state='operation_only'
 ) then raise exception 'Luna operation-only authority is missing'; end if;
 foreach route_code in array hearth_routes loop
   if (select count(*) from tongs._eligible_ai_models_for_operation(route_code)e
       where e.model_identity_id='40010000-0000-4000-8000-000000000004' and e.runtime_model_id='gpt-5.6-luna')<>1
   then raise exception 'Luna eligibility missing for %',route_code; end if;
 end loop;
 if exists(
   select 1 from tongs._eligible_ai_models_for_operation('hammer.transcript_cleanup')e
   where e.model_identity_id='40010000-0000-4000-8000-000000000004'
 ) or (select count(*) from tongs._eligible_ai_models_for_operation('hammer.transcript_cleanup'))<>3
 then raise exception 'Hammer model authority expanded'; end if;
 if snapshot.preference_count<>(select count(*) from tongs.ai_model_preference_revisions)
   or snapshot.override_count<>(select count(*) from tongs.ai_operation_model_override_revisions)
   or snapshot.provider_rate_count<>(select count(*) from tongs.openai_text_provider_rate_revisions)
   or snapshot.catalog_revision_count<>(select count(*) from tongs.openai_text_model_catalog_revisions)
   or snapshot.catalog_entry_count<>(select count(*) from tongs.openai_text_model_catalog_entries)
   or snapshot.compatibility_count<>(select count(*) from tongs.openai_text_model_route_compatibility)
   or snapshot.cost_policy_count<>(select count(*) from tongs.openai_text_cost_policy_revisions)
   or snapshot.pricing_revision_count<>(select count(*) from tongs.private_pricing_revisions)
   or snapshot.pricing_publication_count<>(select count(*) from tongs.private_pricing_publications)
   or snapshot.rollout_count<>(select count(*) from tongs.openai_text_rollout_revisions)
   or snapshot.execution_scope_count<>(select count(*) from tongs.customer_paid_execution_scope_authorizations)
   or snapshot.aggregate_assignment_count<>(select count(*) from tongs.paid_execution_aggregate_assignments)
 then raise exception 'financial, preference, or execution authority changed'; end if;
end $$;

revoke all on function tongs.read_ai_model_choices() from public,anon;
revoke all on function tongs.set_my_ai_model_preference(uuid,integer) from public,anon;
revoke all on function tongs.resolve_openai_text_model_for_quote(uuid,text,text) from public,anon,authenticated;
grant execute on function tongs.read_ai_model_choices(),tongs.set_my_ai_model_preference(uuid,integer) to authenticated;
grant execute on function tongs.resolve_openai_text_model_for_quote(uuid,text,text) to service_role;

comment on table tongs.ai_global_model_choice_revisions is
  'Append-only provider-neutral authority distinguishing Forge-wide selectable identities from operation-only identities.';
comment on function tongs.read_ai_model_choices() is
  'Returns only active identities whose latest global-choice authority is selectable.';

notify pgrst,'reload schema';
commit;
