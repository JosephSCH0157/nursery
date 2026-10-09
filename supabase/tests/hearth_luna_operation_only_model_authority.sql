begin;

create temporary table luna_test_financial_snapshot on commit drop as
select
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

insert into auth.users(id,email) values
 ('40080000-0000-4000-8000-000000000001','luna-operation-only@example.test'),
 ('40080000-0000-4000-8000-000000000002','luna-invalid-global@example.test');

set local request.jwt.claim.role='authenticated';
set local request.jwt.claim.sub='40080000-0000-4000-8000-000000000001';
set local role authenticated;

do $$
declare
  choices jsonb:=tongs.read_ai_model_choices();
  route_code text;
  operation_choices jsonb;
  routes text[]:=array[
    'hearth.chat_completion','hearth.framing_pack_generation','hearth.research_synthesis',
    'hearth.script_generation','hearth.tag_generation','hearth.thumbnail_direction_generation',
    'hearth.title_generation','motion.broll_interpretation','visual.narrative_interpretation',
    'visual.unified_plan'
  ];
begin
 if jsonb_array_length(choices->'choices')<>3
   or choices::text~'GPT-5.6 Luna|40010000-0000-4000-9000-000000000004'
   or choices::text~'credit_charge|provider_model_id|catalog_revision|cost_policy|markup|micros'
 then raise exception 'global choices escaped approved containment: %',choices; end if;

 begin
  perform tongs.set_my_ai_model_preference('40010000-0000-4000-9000-000000000004',0);
  raise exception 'operation-only Luna became a global preference';
 exception when raise_exception then
  if sqlerrm='operation-only Luna became a global preference' or sqlerrm<>'model selection unavailable' then raise; end if;
 end;

 foreach route_code in array routes loop
  operation_choices:=tongs.read_ai_operation_model_choices(route_code);
  if jsonb_array_length(operation_choices->'eligible_choices')<>1
    or operation_choices->'eligible_choices'->0->>'selection_key'<>'40010000-0000-4000-9000-000000000004'
    or operation_choices->'eligible_choices'->0->>'display_name'<>'GPT-5.6 Luna'
    or operation_choices->'eligible_choices'->0->>'relative_cost_class'<>'lower_cost'
    or (operation_choices->'eligible_choices'->0->>'credit_charge')::integer<1
    or operation_choices::text~'provider_model_id|catalog_revision|cost_policy|markup|micros'
  then raise exception 'Luna operation choice is invalid for %: %',route_code,operation_choices; end if;
  perform tongs.set_my_ai_operation_model_override(
    route_code,'40010000-0000-4000-9000-000000000004',0
  );
 end loop;
end $$;

reset role;
set local request.jwt.claim.role='service_role';
set local request.jwt.claim.sub='';
set local role service_role;

do $$
declare
  route_code text;
  resolved jsonb;
  routes text[]:=array[
    'hearth.chat_completion','hearth.framing_pack_generation','hearth.research_synthesis',
    'hearth.script_generation','hearth.tag_generation','hearth.thumbnail_direction_generation',
    'hearth.title_generation','motion.broll_interpretation','visual.narrative_interpretation',
    'visual.unified_plan'
  ];
begin
 foreach route_code in array routes loop
  resolved:=tongs.resolve_openai_text_model_for_quote(
    '40080000-0000-4000-8000-000000000001',route_code,'forge'
  );
  if resolved->>'runtime_model_id'<>'gpt-5.6-luna'
    or resolved->>'preference_source'<>'operation_override'
    or resolved->>'tradeoff_summary'<>'Lower cost'
  then raise exception 'Luna operation override did not resolve for %: %',route_code,resolved; end if;
 end loop;
end $$;

reset role;
insert into tongs.ai_model_preference_revisions(
  id,user_id,revision,model_identity_id
) values(
  '40080000-0000-4000-8000-000000000010','40080000-0000-4000-8000-000000000002',1,
  '40010000-0000-4000-8000-000000000004'
);
set local request.jwt.claim.role='service_role';
set local role service_role;
do $$ begin
 begin
  perform tongs.resolve_openai_text_model_for_quote(
    '40080000-0000-4000-8000-000000000002','hearth.chat_completion','forge'
  );
  raise exception 'operation-only global preference resolved';
 exception when raise_exception then
  if sqlerrm='operation-only global preference resolved'
    or sqlerrm not like 'global_model_preference_unavailable:%'
  then raise; end if;
 end;
end $$;

reset role;
do $$
declare
 snapshot luna_test_financial_snapshot%rowtype;
 expected_routes text[]:=array[
   'hearth.chat_completion','hearth.framing_pack_generation','hearth.research_synthesis',
   'hearth.script_generation','hearth.tag_generation','hearth.thumbnail_direction_generation',
   'hearth.title_generation','motion.broll_interpretation','visual.narrative_interpretation',
   'visual.unified_plan'
 ];
 eligible_routes text[];
begin
 select * into snapshot from luna_test_financial_snapshot;
 if (select count(*) from tongs.ai_global_model_choice_revisions choice
     where choice.revision=(select max(latest.revision) from tongs.ai_global_model_choice_revisions latest where latest.model_identity_id=choice.model_identity_id)
       and choice.authority_state='selectable')<>3
 then raise exception 'global selectable model count is not three'; end if;
 if (select count(*) from tongs._eligible_ai_models_for_operation('hammer.transcript_cleanup'))<>3
   or exists(select 1 from tongs._eligible_ai_models_for_operation('hammer.transcript_cleanup') where runtime_model_id='gpt-5.6-luna')
 then raise exception 'Hammer authority expanded'; end if;
 select array_agg(distinct compatibility.route_code order by compatibility.route_code)
 into eligible_routes
 from tongs.openai_text_model_route_compatibility compatibility
 where exists(
   select 1
   from tongs._eligible_ai_models_for_operation(compatibility.route_code) eligible
   where eligible.model_identity_id='40010000-0000-4000-8000-000000000004'
     and eligible.runtime_model_id='gpt-5.6-luna'
 );
 if eligible_routes is distinct from expected_routes
 then raise exception 'Luna eligible operation set is not exactly ten: %',eligible_routes; end if;
 if (select mode from tongs.openai_text_rollout_revisions
     where route_code='hammer.transcript_cleanup' order by revision desc limit 1)<>'halt_new'
   or exists(
     select 1 from tongs.customer_paid_execution_scope_authorizations
     where route_code='hammer.transcript_cleanup'
   )
 then raise exception 'Hammer spending boundary changed'; end if;
 if snapshot.provider_rate_count<>(select count(*) from tongs.openai_text_provider_rate_revisions)
   or snapshot.catalog_revision_count<>(select count(*) from tongs.openai_text_model_catalog_revisions)
   or snapshot.catalog_entry_count<>(select count(*) from tongs.openai_text_model_catalog_entries)
   or snapshot.compatibility_count<>(select count(*) from tongs.openai_text_model_route_compatibility)
   or snapshot.cost_policy_count<>(select count(*) from tongs.openai_text_cost_policy_revisions)
   or snapshot.pricing_revision_count<>(select count(*) from tongs.private_pricing_revisions)
   or snapshot.pricing_publication_count<>(select count(*) from tongs.private_pricing_publications)
   or snapshot.rollout_count<>(select count(*) from tongs.openai_text_rollout_revisions)
   or snapshot.execution_scope_count<>(select count(*) from tongs.customer_paid_execution_scope_authorizations)
   or snapshot.aggregate_assignment_count<>(select count(*) from tongs.paid_execution_aggregate_assignments)
 then raise exception 'test changed financial or execution authority'; end if;
 if has_table_privilege('authenticated','tongs.ai_global_model_choice_revisions','select')
   or has_table_privilege('anon','tongs.ai_global_model_choice_revisions','select')
   or not has_table_privilege('service_role','tongs.ai_global_model_choice_revisions','select')
   or has_function_privilege('anon','tongs.read_ai_model_choices()','execute')
   or not has_function_privilege('authenticated','tongs.read_ai_model_choices()','execute')
   or has_function_privilege('authenticated','tongs.resolve_openai_text_model_for_quote(uuid,text,text)','execute')
 then raise exception 'Luna/global-choice grants are unsafe'; end if;
 if not exists(
   select 1 from pg_class where oid='tongs.ai_global_model_choice_revisions'::regclass
     and relrowsecurity and relforcerowsecurity
 ) then raise exception 'global-choice RLS is not enabled and forced'; end if;
 begin
  update tongs.ai_global_model_choice_revisions
  set reason=reason
  where model_identity_id='40010000-0000-4000-8000-000000000004';
  raise exception 'global-choice authority became mutable';
 exception when sqlstate '55000' then
  if sqlerrm<>'accounting records are append-only' then raise; end if;
 end;
end $$;

rollback;
