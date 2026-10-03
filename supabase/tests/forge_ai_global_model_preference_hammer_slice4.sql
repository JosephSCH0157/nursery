begin;

insert into auth.users(id,email) values
 ('40020000-0000-4000-8000-000000000001','slice4-customer@example.test'),
 ('40020000-0000-4000-8000-000000000002','slice4-stale@example.test');

set local request.jwt.claim.role='authenticated';
set local request.jwt.claim.sub='40020000-0000-4000-8000-000000000001';
set local role authenticated;

do $$ declare global_choices jsonb; operation_choices jsonb; begin
 global_choices:=tongs.read_ai_model_choices();
 if jsonb_array_length(global_choices->'choices')<>3
   or global_choices::text~'credit_charge|provider_model_id|catalog_revision|cost_policy|markup|micros'
   or global_choices::text~'Recommended|Best available|Premium' then
   raise exception 'global preference projection is not provider-neutral/customer-safe: %',global_choices; end if;
 perform tongs.set_my_ai_model_preference('40010000-0000-4000-9000-000000000001',0);
 operation_choices:=tongs.read_ai_operation_model_choices('hammer.transcript_cleanup');
 if jsonb_array_length(operation_choices->'eligible_choices')<>3
   or operation_choices->>'applicable_source'<>'global_preference'
   or (operation_choices->>'applicable_available')::boolean is not true
   or operation_choices::text~'provider_model_id|catalog_revision|cost_policy|markup|micros'
   or not operation_choices::text~'"credit_charge": 46'
   or not operation_choices::text~'"credit_charge": 129'
   or not operation_choices::text~'"credit_charge": 258' then
   raise exception 'Hammer operation projection failed: %',operation_choices; end if;
 perform tongs.set_my_ai_operation_model_override('hammer.transcript_cleanup','40010000-0000-4000-9000-000000000002',0);
end $$;

reset role;
set local request.jwt.claim.role='service_role';
set local request.jwt.claim.sub='';
set local role service_role;

do $$ declare resolved jsonb; begin
 resolved:=tongs.resolve_openai_text_model_for_quote('40020000-0000-4000-8000-000000000001','hammer.transcript_cleanup','forge');
 if resolved->>'runtime_model_id'<>'gpt-6.1-sol' or resolved->>'preference_source'<>'operation_override' then
   raise exception 'operation override did not precede global preference: %',resolved; end if;
end $$;

reset role;
set local request.jwt.claim.role='authenticated';
set local request.jwt.claim.sub='40020000-0000-4000-8000-000000000001';
set local role authenticated;
select tongs.set_my_ai_model_preference('40010000-0000-4000-9000-000000000003',1);

reset role;
set local request.jwt.claim.role='service_role';
set local request.jwt.claim.sub='';
set local role service_role;
do $$ declare resolved jsonb; begin
 resolved:=tongs.resolve_openai_text_model_for_quote('40020000-0000-4000-8000-000000000001','hammer.transcript_cleanup','forge');
 if resolved->>'runtime_model_id'<>'gpt-6.1-sol' or resolved->>'preference_source'<>'operation_override' then
   raise exception 'global preference silently superseded operation override: %',resolved; end if;
end $$;

reset role;
-- Create a provider-neutral identity that has no Hammer certification, then
-- append it as a newer explicit override to prove strict no-fall-through.
insert into tongs.ai_model_identities(id,model_code,provider_code,provider_model_id,customer_selection_key)
values('40020000-0000-4000-8000-000000000010','test:stale-model','test','stale-model','40020000-0000-4000-9000-000000000010');
insert into tongs.ai_model_identity_revisions(id,model_identity_id,revision,display_name,relative_cost_class,lifecycle_state,evidence_json)
values('40020000-0000-4000-8000-000000000011','40020000-0000-4000-8000-000000000010',1,'Stale model','lower_cost','active','{}');
insert into tongs.ai_operation_model_override_revisions(id,user_id,operation_code,revision,override_state,model_identity_id)
values('40020000-0000-4000-8000-000000000012','40020000-0000-4000-8000-000000000001','hammer.transcript_cleanup',2,'specific','40020000-0000-4000-8000-000000000010');

set local request.jwt.claim.role='service_role';
set local role service_role;
do $$ begin
 begin
  perform tongs.resolve_openai_text_model_for_quote('40020000-0000-4000-8000-000000000001','hammer.transcript_cleanup','forge');
  raise exception 'invalid explicit override silently fell through';
 exception when raise_exception then
  if sqlerrm='invalid explicit override silently fell through' or sqlerrm not like 'operation_model_override_unavailable:%' then raise; end if;
 end;
end $$;

reset role;
set local request.jwt.claim.role='authenticated';
set local request.jwt.claim.sub='40020000-0000-4000-8000-000000000001';
set local role authenticated;
select tongs.clear_my_ai_operation_model_override('hammer.transcript_cleanup',2);

reset role;
set local request.jwt.claim.role='service_role';
set local request.jwt.claim.sub='';
set local role service_role;
do $$ declare resolved jsonb; begin
 resolved:=tongs.resolve_openai_text_model_for_quote('40020000-0000-4000-8000-000000000001','hammer.transcript_cleanup','forge');
 if resolved->>'runtime_model_id'<>'gpt-5.6-sol' or resolved->>'preference_source'<>'global_preference' then
   raise exception 'explicit clear did not restore global preference: %',resolved; end if;
end $$;

reset role;
do $$ begin
 if (select mode from tongs.openai_text_rollout_revisions where route_code='hammer.transcript_cleanup' order by revision desc limit 1)<>'halt_new'
   or exists(select 1 from tongs.customer_paid_execution_scope_authorizations where route_code='hammer.transcript_cleanup') then
   raise exception 'Hammer execution was activated'; end if;
 if (select count(*) from tongs.private_pricing_revisions where id in ('40010000-0000-4000-8000-000000000402','40010000-0000-4000-8000-000000000412','40010000-0000-4000-8000-000000000422') and markup_basis_points=3300 and customer_price_ceiling_micros=settled_customer_price_micros and customer_credit_units*5000=settled_customer_price_micros)<>3 then
   raise exception 'Hammer pricing/credit invariants failed'; end if;
 if exists(select 1 from tongs.openai_text_model_route_compatibility c join tongs.openai_text_model_catalog_entries e on e.id=c.catalog_entry_id where c.route_code='hammer.transcript_cleanup' and e.catalog_revision_id='40010000-0000-4000-8000-000000000500' and e.provider_model_id not in ('gpt-5.4-mini-2026-03-17','gpt-6.1-sol','gpt-5.6-sol')) then
   raise exception 'unapproved Hammer model became eligible'; end if;
 if has_table_privilege('authenticated','tongs.ai_model_identities','select')
   or has_table_privilege('authenticated','tongs.ai_model_preference_revisions','select')
   or has_function_privilege('anon','tongs.read_ai_model_choices()','execute')
   or not has_function_privilege('authenticated','tongs.read_ai_model_choices()','execute')
   or has_function_privilege('authenticated','tongs.resolve_openai_text_model_for_quote(uuid,text,text)','execute') then
   raise exception 'provider-neutral preference RLS/grants are unsafe'; end if;
end $$;

rollback;
