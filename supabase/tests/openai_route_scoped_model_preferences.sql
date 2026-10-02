begin;

insert into auth.users(id,email) values
  ('3a000000-0000-4000-8000-000000000001','route-model-customer@example.test'),
  ('3a000000-0000-4000-8000-000000000002','route-model-unavailable@example.test'),
  ('3a000000-0000-4000-8000-000000000099','route-model-operator@example.test');
insert into tongs.platform_operators(user_id,reason,granted_by)
values('3a000000-0000-4000-8000-000000000099','route preference proof','3a000000-0000-4000-8000-000000000099');

-- A historical global preference remains history and is never inherited.
insert into tongs.openai_text_user_model_preference_revisions(
  id,user_id,revision,preference_kind,provider_model_id,catalog_revision_id,route_code
) values(
  '3a000000-0000-4000-8000-000000000010',
  '3a000000-0000-4000-8000-000000000001',1,'specific','historical-global-model',null,null
);

-- Build two synthetic, rollback-only certified Hammer choices plus provider-only
-- and unavailable records. No production authority is mutated by this proof.
insert into tongs.openai_text_model_catalog_revisions(
  id,revision,lifecycle_state,quality_method,source_checked_at,content_hash
) values(
  '3a000000-0000-4000-8000-000000000100',9001,'active',
  'Synthetic route-scoped preference proof only.',now(),repeat('a',64)
);

insert into tongs.openai_text_cost_policy_revisions
select (jsonb_populate_record(null::tongs.openai_text_cost_policy_revisions,
  to_jsonb(source)||jsonb_build_object(
    'id','3a000000-0000-4000-8000-000000000201',
    'route_code','hammer.transcript_cleanup','revision',9001,
    'policy_code','openai-text:hammer-cleanup:route-pref-proof-primary',
    'lifecycle_state','pilot_candidate','notes','Synthetic rollback-only complete cost proof.'
  ))).* from tongs.openai_text_cost_policy_revisions source
where source.cost_coverage='complete' order by source.created_at limit 1;

insert into tongs.openai_text_cost_policy_revisions
select (jsonb_populate_record(null::tongs.openai_text_cost_policy_revisions,
  to_jsonb(source)||jsonb_build_object(
    'id','3a000000-0000-4000-8000-000000000202',
    'route_code','hammer.transcript_cleanup','revision',9002,
    'policy_code','openai-text:hammer-cleanup:route-pref-proof-retiring',
    'lifecycle_state','pilot_candidate','notes','Synthetic rollback-only retiring cost proof.'
  ))).* from tongs.openai_text_cost_policy_revisions source
where source.cost_coverage='complete' order by source.created_at limit 1;

insert into tongs.openai_text_model_catalog_entries(
  id,catalog_revision_id,runtime_model_id,provider_model_id,display_name,
  tradeoff_summary,quality_rank,quality_basis,supported_apis,availability_status,
  availability_evidence,lifecycle_state,rate_revision_id,customer_selection_key,
  customer_selection_state
)
select values_row.id,'3a000000-0000-4000-8000-000000000100',values_row.runtime_id,
  values_row.provider_id,values_row.display_name,values_row.tradeoff,values_row.quality_rank,
  'Synthetic rollback-only route proof.','["chat_completions"]'::jsonb,
  values_row.availability,'{}'::jsonb,'active',rate.id,values_row.selection_key,
  values_row.selection_state
from (values
  ('3a000000-0000-4000-8000-000000000301'::uuid,'route-proof-primary','route-proof-primary-v1','Route Proof Primary','Balanced certified choice.',100,'generation_compatible','3a000000-0000-4000-8000-000000000401'::uuid,'selectable'),
  ('3a000000-0000-4000-8000-000000000302'::uuid,'route-proof-retiring','route-proof-retiring-v1','Route Proof Retiring','Still valid while retiring.',90,'generation_compatible','3a000000-0000-4000-8000-000000000402'::uuid,'retiring'),
  ('3a000000-0000-4000-8000-000000000303'::uuid,'route-proof-provider-only','route-proof-provider-only-v1','Provider Only','Must never be customer selectable.',80,'visible','3a000000-0000-4000-8000-000000000403'::uuid,'selectable'),
  ('3a000000-0000-4000-8000-000000000304'::uuid,'route-proof-unavailable','route-proof-unavailable-v1','Unavailable','Must never be customer selectable.',70,'inaccessible','3a000000-0000-4000-8000-000000000404'::uuid,'unavailable')
) values_row(id,runtime_id,provider_id,display_name,tradeoff,quality_rank,availability,selection_key,selection_state)
cross join lateral(select id from tongs.openai_text_provider_rate_revisions order by created_at limit 1) rate;

insert into tongs.openai_text_model_route_compatibility(
  id,catalog_entry_id,route_code,compatibility_status,maximum_input_tokens,
  maximum_output_tokens,maximum_attempts,supporting_cost_coverage,cost_policy_revision_id,evidence_json
) values
  ('3a000000-0000-4000-8000-000000000501','3a000000-0000-4000-8000-000000000301','hammer.transcript_cleanup','generation_verified',1000,100,1,'complete','3a000000-0000-4000-8000-000000000201','{}'),
  ('3a000000-0000-4000-8000-000000000502','3a000000-0000-4000-8000-000000000302','hammer.transcript_cleanup','generation_verified',1000,100,1,'complete','3a000000-0000-4000-8000-000000000202','{}'),
  ('3a000000-0000-4000-8000-000000000503','3a000000-0000-4000-8000-000000000303','hammer.transcript_cleanup','unverified',1000,100,1,'unresolved',null,'{}'),
  ('3a000000-0000-4000-8000-000000000504','3a000000-0000-4000-8000-000000000304','hammer.transcript_cleanup','generation_verified',1000,100,1,'complete','3a000000-0000-4000-8000-000000000201','{}');

insert into tongs.private_pricing_policies(id,policy_code,scope_kind,provider,sku,created_by)
values
 ('3a000000-0000-4000-8000-000000000601','route-pref-proof-primary','sku','openai','openai-text:hammer.transcript_cleanup:route-proof-primary:3a000000-0000-4000-8000-000000000201','3a000000-0000-4000-8000-000000000099'),
 ('3a000000-0000-4000-8000-000000000602','route-pref-proof-retiring','sku','openai','openai-text:hammer.transcript_cleanup:route-proof-retiring:3a000000-0000-4000-8000-000000000202','3a000000-0000-4000-8000-000000000099');

insert into tongs.private_pricing_revisions(
  id,policy_id,revision,previous_revision_id,lifecycle_state,currency,markup_basis_points,
  full_cost_ceiling_micros,failure_cost_ceiling_micros,customer_price_ceiling_micros,
  billable_failure_ceiling_micros,customer_credit_units,billable_failure_classes,
  free_failure_classes,included_quantity,retention_policy,change_reason,content_hash,actor_id
) values
 ('3a000000-0000-4000-8000-000000000701','3a000000-0000-4000-8000-000000000601',1,null,
  'review_ready','USD',0,
  (select full_cost_ceiling_micros from tongs.openai_text_cost_policy_revisions where id='3a000000-0000-4000-8000-000000000201'),
  0,10000,0,2,'[]','[]','{}','{}','Synthetic rollback-only proof.',repeat('b',64),'3a000000-0000-4000-8000-000000000099'),
 ('3a000000-0000-4000-8000-000000000702','3a000000-0000-4000-8000-000000000602',1,null,
  'review_ready','USD',0,
  (select full_cost_ceiling_micros from tongs.openai_text_cost_policy_revisions where id='3a000000-0000-4000-8000-000000000202'),
  0,10000,0,2,'[]','[]','{}','{}','Synthetic rollback-only proof.',repeat('c',64),'3a000000-0000-4000-8000-000000000099');

insert into tongs.private_pricing_publications(
  id,policy_id,pricing_revision_id,publication_revision,action,reason,actor_id
) values
 ('3a000000-0000-4000-8000-000000000801','3a000000-0000-4000-8000-000000000601','3a000000-0000-4000-8000-000000000701',1,'published','Synthetic rollback-only proof.','3a000000-0000-4000-8000-000000000099'),
 ('3a000000-0000-4000-8000-000000000802','3a000000-0000-4000-8000-000000000602','3a000000-0000-4000-8000-000000000702',1,'published','Synthetic rollback-only proof.','3a000000-0000-4000-8000-000000000099');

-- Simulate an immutable preference whose exact catalog entry later became
-- unavailable. The preference remains history even though it cannot execute.
insert into tongs.openai_text_user_model_preference_revisions(
  id,user_id,route_code,revision,preference_kind,provider_model_id,catalog_revision_id
) values(
  '3a000000-0000-4000-8000-000000000011',
  '3a000000-0000-4000-8000-000000000002','hammer.transcript_cleanup',1,
  'specific','route-proof-unavailable-v1','3a000000-0000-4000-8000-000000000100'
);

set local request.jwt.claim.role='authenticated';
set local request.jwt.claim.sub='3a000000-0000-4000-8000-000000000001';
set local role authenticated;

do $$ declare snapshot jsonb; pref jsonb; begin
  snapshot:=tongs.read_openai_text_model_choices('hammer.transcript_cleanup');
  if jsonb_array_length(snapshot->'eligible_choices')<>2
    or snapshot::text~'provider_model_id|model_catalog_entry_id|cost_policy_revision_id|markup_basis_points'
    or snapshot::text~'Provider Only|Unavailable' then
    raise exception 'customer catalog filtering/privacy failed: %',snapshot; end if;
  if not snapshot::text~'Route Proof Retiring' or not snapshot::text~'retiring' then
    raise exception 'retiring selectable model was not represented safely: %',snapshot; end if;
  if (snapshot->'preference'->>'revision')::integer<>0 then
    raise exception 'historical global preference leaked into route scope: %',snapshot; end if;

  pref:=tongs.set_my_openai_text_model_preference(
    'hammer.transcript_cleanup','specific','3a000000-0000-4000-8000-000000000401',0);
  if pref->>'route_code'<>'hammer.transcript_cleanup'
    or pref->>'selection_key'<>'3a000000-0000-4000-8000-000000000401'
    or (pref->>'revision')::integer<>1 then
    raise exception 'route preference did not persist exactly: %',pref; end if;

  perform tongs.set_my_openai_text_model_preference('shorts.discovery','best_available',null,0);
  if (tongs.read_my_openai_text_model_preference('hammer.transcript_cleanup')->>'revision')::integer<>1
    or (tongs.read_my_openai_text_model_preference('shorts.discovery')->>'revision')::integer<>1 then
    raise exception 'route revision scopes interfered'; end if;
  if coalesce((tongs.read_openai_text_model_choices('shorts.discovery')->>'executable')::boolean,true) then
    raise exception 'route with no eligible model remained executable'; end if;

  begin
    perform tongs.set_my_openai_text_model_preference(
      'hammer.transcript_cleanup','specific','3a000000-0000-4000-8000-000000000402',0);
    raise exception 'stale expected revision was accepted';
  exception when serialization_failure then null; end;

  begin
    perform tongs.set_my_openai_text_model_preference(
      'hammer.transcript_cleanup','specific','3a000000-0000-4000-8000-000000000403',1);
    raise exception 'provider-only model was accepted';
  exception when raise_exception then
    if sqlerrm='provider-only model was accepted' then raise; end if;
  end;
end $$;

reset role;
set local request.jwt.claim.role='authenticated';
set local request.jwt.claim.sub='3a000000-0000-4000-8000-000000000002';
set local role authenticated;

do $$ declare snapshot jsonb; begin
  snapshot:=tongs.read_openai_text_model_choices('hammer.transcript_cleanup');
  if snapshot->'preference'->>'selection_key'<>'3a000000-0000-4000-8000-000000000404'
    or snapshot->'preference'->>'display_name'<>'Unavailable'
    or coalesce((snapshot->'preference'->>'available')::boolean,true)
    or coalesce((snapshot->>'selection_unavailable')::boolean,false)=false
    or snapshot::text~'route-proof-unavailable-v1' then
    raise exception 'unavailable preference was not preserved safely: %',snapshot; end if;
end $$;

reset role;
set local request.jwt.claim.role='service_role';
set local request.jwt.claim.sub='';
set local role service_role;

do $$ declare resolved jsonb; begin
  resolved:=tongs.resolve_openai_text_model_for_quote(
    '3a000000-0000-4000-8000-000000000001','hammer.transcript_cleanup','forge');
  if resolved->>'customer_selection_key'<>'3a000000-0000-4000-8000-000000000401'
    or resolved->>'runtime_model_id'<>'route-proof-primary' then
    raise exception 'resolver did not bind exact selected model: %',resolved; end if;
  begin
    perform tongs.resolve_openai_text_model_for_quote(
      '3a000000-0000-4000-8000-000000000002','hammer.transcript_cleanup','forge');
    raise exception 'unavailable stored selection was silently substituted';
  exception when raise_exception then
    if sqlerrm='unavailable stored selection was silently substituted'
      or sqlerrm not like 'model_selection_unavailable:%' then raise; end if;
  end;
  if (select mode from tongs._current_openai_text_rollout('hammer.transcript_cleanup')) not in ('inactive','halt_new') then
    raise exception 'Hammer rollout was activated'; end if;
end $$;

reset role;
do $$ begin
  if has_table_privilege('authenticated','tongs.openai_text_user_model_preference_revisions','select')
    or has_table_privilege('authenticated','tongs.openai_text_model_catalog_entries','select')
    or has_function_privilege('anon','tongs.read_openai_text_model_choices(text)','execute')
    or not has_function_privilege('authenticated','tongs.read_openai_text_model_choices(text)','execute')
    or has_function_privilege('authenticated','tongs.resolve_openai_text_model_for_quote(uuid,text,text)','execute')
    or not has_function_privilege('service_role','tongs.resolve_openai_text_model_for_quote(uuid,text,text)','execute') then
    raise exception 'model preference/catalog RLS or function grants are unsafe'; end if;
end $$;

rollback;
