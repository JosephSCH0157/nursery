begin;
set local request.jwt.claim.role = 'service_role';
set local session_replication_role = replica;

insert into auth.users(id,email) values
 ('6a000000-0000-4000-8000-000000000001','owner@example.test'),
 ('6a000000-0000-4000-8000-000000000002','operator@example.test'),
 ('6a000000-0000-4000-8000-000000000003','customer@example.test');
insert into tongs.orgs(id,name,created_by,personal_owner_user_id)
values('6a000000-0000-4000-8000-000000000010','Slice 6A isolated org','6a000000-0000-4000-8000-000000000001','6a000000-0000-4000-8000-000000000001');
insert into tongs.workspaces(id,name,created_by,org_id)
values('6a000000-0000-4000-8000-000000000011','Slice 6A isolated workspace','6a000000-0000-4000-8000-000000000001','6a000000-0000-4000-8000-000000000010');
insert into tongs.workspace_members(workspace_id,user_id,role,created_by) values
 ('6a000000-0000-4000-8000-000000000011','6a000000-0000-4000-8000-000000000001','owner','6a000000-0000-4000-8000-000000000001'),
 ('6a000000-0000-4000-8000-000000000011','6a000000-0000-4000-8000-000000000003','viewer','6a000000-0000-4000-8000-000000000001');
insert into tongs.platform_operators(user_id,reason,granted_by)
values('6a000000-0000-4000-8000-000000000002','Slice 6A isolated operator','6a000000-0000-4000-8000-000000000002');
insert into tongs.owner_testing_principals(user_id,status,revision,reason,configured_by)
values('6a000000-0000-4000-8000-000000000001','enabled',1,'Slice 6A isolated owner','6a000000-0000-4000-8000-000000000002');
insert into tongs.account_authority_classifications(user_id,account_class,revision,reason,configured_by) values
 ('6a000000-0000-4000-8000-000000000001','owner',1,'Slice 6A isolated owner','6a000000-0000-4000-8000-000000000002'),
 ('6a000000-0000-4000-8000-000000000003','customer',1,'Slice 6A isolated customer','6a000000-0000-4000-8000-000000000002');

insert into tongs.openai_text_route_policies(route_code,product_area,provider_operation,maximum_input_units,maximum_output_units,maximum_attempts,notes)
values('hearth.chat_completion','hearth','chat_completions',1000,100,1,'Slice 6A isolated route');
insert into tongs.openai_text_cost_policy_revisions(
 id,route_code,revision,policy_code,attempt_plan,maximum_input_units,maximum_output_units,
 maximum_attempts,direct_provider_ceiling_micros,supporting_cost_ceiling_micros,
 full_cost_ceiling_micros,cost_coverage,lifecycle_state,notes
) values(
 '6a000000-0000-4000-8000-000000000020','hearth.chat_completion',1,'slice6a-owner-cost',
 '[{"attempt":1}]',1000,100,1,1000,0,1000,'complete','active','Slice 6A isolated complete cost authority'
);
insert into tongs.private_pricing_policies(id,policy_code,scope_kind,provider,sku,created_by)
values('6a000000-0000-4000-8000-000000000021','slice6a-owner-price','sku','openai','slice6a-owner-sku','6a000000-0000-4000-8000-000000000002');
insert into tongs.private_pricing_revisions(
 id,policy_id,revision,lifecycle_state,currency,markup_basis_points,full_cost_ceiling_micros,
 failure_cost_ceiling_micros,customer_price_ceiling_micros,billable_failure_ceiling_micros,
 customer_credit_units,billable_failure_classes,free_failure_classes,included_quantity,
 retention_policy,change_reason,content_hash,actor_id,unrounded_customer_price_micros,
 rounding_adjustment_micros,settled_customer_price_micros
) values(
 '6a000000-0000-4000-8000-000000000022','6a000000-0000-4000-8000-000000000021',1,
 'review_ready','USD',3300,1000,0,2000,0,2,'[]','["provider_failure"]','{}','{}',
 'Slice 6A isolated price',repeat('6',64),'6a000000-0000-4000-8000-000000000002',1330,670,2000
);
insert into tongs.openai_text_failure_loss_policy_revisions(
 id,route_code,environment,revision,per_operation_limit_micros,aggregate_limit_micros,
 rolling_window_seconds,maximum_concurrency,lifecycle_state,reason,actor_id
) values
 ('6a000000-0000-4000-8000-000000000023','hearth.chat_completion','test',1,1000,1000,3600,1,'active','Slice 6A Test loss authority','6a000000-0000-4000-8000-000000000002'),
 ('6a000000-0000-4000-8000-000000000024','hearth.chat_completion','production',1,1000,1000,3600,1,'active','Slice 6A Live loss authority','6a000000-0000-4000-8000-000000000002');
insert into tongs.openai_text_rollout_revisions(route_code,revision,mode,cost_policy_revision_id,reason,actor_id,funding_scope)
values('hearth.chat_completion',1,'halt_new',null,'Slice 6A isolated halt','6a000000-0000-4000-8000-000000000002','forge');

insert into tongs.customer_paid_execution_scope_authorizations(
 id,user_id,workspace_id,financial_environment,route_code,provider,model_or_sku,
 pricing_revision_id,cost_policy_revision_id,maximum_operation_count,
 maximum_customer_charge_micros,maximum_wholesale_exposure_micros,maximum_concurrency,
 rolling_window_seconds,valid_from,valid_until,status,reason,created_by,authorization_kind
) values
 ('6a000000-0000-4000-8000-000000000030','6a000000-0000-4000-8000-000000000003','6a000000-0000-4000-8000-000000000011','test','hearth.chat_completion','openai','test-model','6a000000-0000-4000-8000-000000000022','6a000000-0000-4000-8000-000000000020',1,2000,1000,1,3600,now()-interval '1 minute',now()+interval '1 hour','active','Historical certification fixture','6a000000-0000-4000-8000-000000000002','certification'),
 ('6a000000-0000-4000-8000-000000000031','6a000000-0000-4000-8000-000000000003','6a000000-0000-4000-8000-000000000011','test','hearth.chat_completion','openai','test-model','6a000000-0000-4000-8000-000000000022','6a000000-0000-4000-8000-000000000020',null,2000,1000,1,null,now()-interval '1 minute',null,'active','Historical normal customer fixture','6a000000-0000-4000-8000-000000000002','normal_customer');

set local session_replication_role = origin;

create or replace function tongs._eligible_ai_models_for_operation(p_operation_code text)
returns table(model_identity_id uuid,customer_selection_key uuid,display_name text,relative_cost_class text,catalog_revision_id uuid,catalog_revision integer,model_catalog_entry_id uuid,runtime_model_id text,provider_model_id text,cost_policy_revision_id uuid,customer_credit_units bigint)
language sql stable security definer set search_path=pg_catalog as $$
 select '6a000000-0000-4000-8000-000000000040'::uuid,'6a000000-0000-4000-8000-000000000041'::uuid,
  'Test Model','lower_cost','6a000000-0000-4000-8000-000000000042'::uuid,1,
  '6a000000-0000-4000-8000-000000000043'::uuid,'test-model','test-model-provider',
  '6a000000-0000-4000-8000-000000000020'::uuid,2::bigint
 where p_operation_code='hearth.chat_completion'
$$;
create or replace function tongs._published_pricing_revision(p_provider text,p_sku text)
returns tongs.private_pricing_revisions language sql stable security definer set search_path=pg_catalog as $$
 select revision.* from tongs.private_pricing_revisions revision
 where revision.id='6a000000-0000-4000-8000-000000000022'
   and lower(p_provider)='openai' and p_sku like 'openai-text:hearth.chat_completion:test-model:%'
$$;

do $$
declare result jsonb;
begin
 result:=tongs.create_owner_only_openai_text_execution_scope_authorization(
  '6a000000-0000-4000-8000-000000000032','6a000000-0000-4000-8000-000000000002',
  '6a000000-0000-4000-8000-000000000001','6a000000-0000-4000-8000-000000000011',
  'test','hearth.chat_completion','test-model',now()-interval '1 minute',now()+interval '1 hour','Slice 6A owner-only test scope');
 if (result->>'authorization_kind')<>'owner_only' then raise exception 'owner-only scope was not created'; end if;
 if (select count(*) from tongs.customer_paid_execution_scope_authorizations where authorization_kind='certification')<>1
    or (select count(*) from tongs.customer_paid_execution_scope_authorizations where authorization_kind='normal_customer')<>1 then
  raise exception 'historical scope kinds changed';
 end if;
 if tongs._active_owner_only_paid_execution_scope(
   '6a000000-0000-4000-8000-000000000001','6a000000-0000-4000-8000-000000000011','live',
   'hearth.chat_completion','test-model','6a000000-0000-4000-8000-000000000022','6a000000-0000-4000-8000-000000000020') is not null then
  raise exception 'Test owner scope authorized Live';
 end if;
begin
 perform tongs.create_owner_only_openai_text_execution_scope_authorization(
  '6a000000-0000-4000-8000-000000000033','6a000000-0000-4000-8000-000000000002',
  '6a000000-0000-4000-8000-000000000003','6a000000-0000-4000-8000-000000000011',
  'test','hearth.chat_completion','test-model',now(),now()+interval '1 hour','Non-owner must fail');
 raise exception 'non-owner received owner-only scope';
exception when insufficient_privilege then null; end;
end
$$;

do $$ begin
 insert into tongs.account_authority_classifications(user_id,account_class,revision,reason,configured_by)
 values('6a000000-0000-4000-8000-000000000003','owner',2,'Ambiguity test owner','6a000000-0000-4000-8000-000000000002')
 on conflict(user_id) do update set account_class='owner',revision=2,reason='Ambiguity test owner';
 begin
  perform tongs.create_owner_only_openai_text_execution_scope_authorization(
   '6a000000-0000-4000-8000-000000000034','6a000000-0000-4000-8000-000000000002',
   '6a000000-0000-4000-8000-000000000001','6a000000-0000-4000-8000-000000000011',
   'test','hearth.chat_completion','test-model',now(),now()+interval '1 hour','Ambiguous owner must fail');
  raise exception 'ambiguous owner authority did not fail closed';
 exception when insufficient_privilege then null; end;
 update tongs.account_authority_classifications set account_class='customer',revision=3,reason='Ambiguity test restored'
 where user_id='6a000000-0000-4000-8000-000000000003';
end $$;

set local session_replication_role = replica;
insert into tongs.restricted_beta_policy_revisions(
 id,environment,revision,lifecycle_state,aggregate_forge_exposure_limit_micros,reserved_headroom_micros,
 maximum_concurrency,rolling_window_seconds,evidence_max_age_seconds,reason
) values('6a000000-0000-4000-8000-000000000050','test',1,'active',100000,0,1,3600,3600,'Slice 6A isolated aggregate policy');
insert into tongs.restricted_beta_policy_capabilities(
 id,policy_revision_id,capability_code,admission_mode,cost_evidence_revision_id,maximum_attempts,
 maximum_concurrency,per_operation_supplier_ceiling_micros,per_operation_supporting_ceiling_micros,
 per_operation_tail_ceiling_micros,permitted_callers_json,exact_model_or_sku,notes
) values('6a000000-0000-4000-8000-000000000051','6a000000-0000-4000-8000-000000000050',
 'openai.text.hearth_chat','covered','6a000000-0000-4000-8000-000000000052',1,1,1000,0,0,
 '["interactive"]','test-model','Slice 6A covered capability fixture');
set local session_replication_role = origin;

insert into tongs.paid_execution_aggregate_assignments(
 id,policy_revision_id,user_id,workspace_id,state,valid_from,valid_until,reason
) values('6a000000-0000-4000-8000-000000000053','6a000000-0000-4000-8000-000000000050',
 '6a000000-0000-4000-8000-000000000001','6a000000-0000-4000-8000-000000000011',
 'active',now()-interval '1 minute',now()+interval '1 hour','Valid staged assignment while rollout is halt_new');

do $$ begin
 if (select mode from tongs._current_openai_text_rollout('hearth.chat_completion'))<>'halt_new' then raise exception 'rollout fixture is not halted'; end if;
 if tongs._active_paid_execution_aggregate_assignment('6a000000-0000-4000-8000-000000000001','6a000000-0000-4000-8000-000000000011','production') is not null then raise exception 'Test assignment authorized production'; end if;
 begin
  insert into tongs.paid_execution_aggregate_assignments(id,policy_revision_id,user_id,workspace_id,state,valid_from,valid_until,reason)
  values(gen_random_uuid(),'6a000000-0000-4000-8000-000000000099','6a000000-0000-4000-8000-000000000001','6a000000-0000-4000-8000-000000000011','active',now(),now()+interval '1 hour','Invalid policy must fail');
  raise exception 'invalid aggregate assignment binding was accepted';
 exception when foreign_key_violation then null; end;
end $$;

set local session_replication_role = replica;
insert into tongs.customer_spending_quotes(
 id,user_id,operation_id,tool,workspace_id,pricing_revision_id,pricing_revision,currency,
 normal_maximum_charge_micros,billable_failure_maximum_charge_micros,customer_credit_units,
 full_cost_ceiling_micros,billable_failure_classes,free_failure_classes,included_quantity,
 retention_policy,provider_funding_summary,request_fingerprint,quote_hash,expires_at,financial_environment
) values('6a000000-0000-4000-8000-000000000060','6a000000-0000-4000-8000-000000000001','slice6a-operation','slice6a','6a000000-0000-4000-8000-000000000011','6a000000-0000-4000-8000-000000000022',1,'USD',2000,0,2,1000,'[]','[]','{}','{}','[]',repeat('a',64),repeat('b',64),now()+interval '1 hour','test');
insert into tongs.customer_spending_quote_acceptances(id,quote_id,user_id,acceptance_key,accepted_quote_hash)
values('6a000000-0000-4000-8000-000000000061','6a000000-0000-4000-8000-000000000060','6a000000-0000-4000-8000-000000000001','slice6a-acceptance',repeat('b',64));
insert into tongs.funding_reservations(
 id,quote_id,user_id,operation_id,funding_source_type,funding_source_id,currency,
 reserved_customer_charge_micros,reserved_credit_units,reserved_wholesale_spend_micros,
 idempotency_key,funding_environment,rollout_authorization_id
) values('6a000000-0000-4000-8000-000000000062','6a000000-0000-4000-8000-000000000060','6a000000-0000-4000-8000-000000000001','slice6a-operation','owner_budget','6a000000-0000-4000-8000-000000000063','USD',2000,2,1000,'slice6a-reservation','test','6a000000-0000-4000-8000-000000000032');
insert into tongs.openai_text_customer_quote_bindings(
 quote_id,user_id,canonical_operation_id,route_code,workspace_id,workpiece_id,request_fingerprint,
 runtime_model,credential_funding,cost_policy_revision_id,pricing_revision_id,expires_at
) values('6a000000-0000-4000-8000-000000000060','6a000000-0000-4000-8000-000000000001','slice6a-operation','hearth.chat_completion','6a000000-0000-4000-8000-000000000011','workpiece',repeat('a',64),'test-model','forge','6a000000-0000-4000-8000-000000000020','6a000000-0000-4000-8000-000000000022',now()+interval '1 hour');
insert into tongs.openai_text_funding_bindings(
 operation_id,route_code,reservation_id,credential_funding,model,pricing_revision_id,
 maximum_input_units,maximum_output_units,maximum_attempts,cost_policy_revision_id,rollout_revision
) values('slice6a-operation','hearth.chat_completion','6a000000-0000-4000-8000-000000000062','forge','test-model','6a000000-0000-4000-8000-000000000022',1000,100,1,'6a000000-0000-4000-8000-000000000020',1);
set local session_replication_role = origin;

do $$ declare result jsonb; provider_result jsonb; begin
 result:=tongs.acquire_openai_text_aggregate_admission('6a000000-0000-4000-8000-000000000062','interactive','real');
 if coalesce((result->>'authorized')::boolean,true) or result->>'reason'<>'rollout_halt_new'
    or coalesce((result->>'enforcement_enabled')::boolean,true) then
  raise exception 'halt_new admitted staged aggregate exposure: %',result;
 end if;
 if exists(select 1 from tongs.restricted_beta_exposure_holds) then raise exception 'halt_new created exposure hold'; end if;
 provider_result:=tongs.authorize_openai_text_provider_attempt_with_aggregate(
  '6a000000-0000-4000-8000-000000000062','slice6a-provider-attempt',1::smallint,'interactive',1000::bigint,60,'{}'::jsonb);
 if coalesce((provider_result->>'provider_execution_authorized')::boolean,true)
    or provider_result->>'reason'<>'aggregate_admission_required' then
  raise exception 'provider attempt escaped staged aggregate gate: %',provider_result;
 end if;
end $$;

create or replace function tongs.reserve_restricted_beta_exposure(
 p_hold_id uuid,p_policy_revision_id uuid,p_capability_code text,p_operation_identity text,
 p_user_id uuid,p_workspace_id uuid,p_request_fingerprint text,p_model_or_sku text,
 p_funding_class text,p_opaque_funding_handle text,p_provider_mode text,p_caller_class text,
 p_customer_funding_ceiling_micros bigint,p_supplier_exposure_ceiling_micros bigint,
 p_supporting_exposure_ceiling_micros bigint,p_tail_exposure_ceiling_micros bigint,
 p_unreconciled_exposure_ceiling_micros bigint,p_retry_exposure_ceiling_micros bigint,
 p_lease_seconds integer,p_event_key text
) returns jsonb language sql security definer set search_path=pg_catalog as $$
 select jsonb_build_object('authorized',false,'reason','fixture_assignment_participated')
$$;
insert into tongs.openai_text_rollout_revisions(route_code,revision,mode,cost_policy_revision_id,reason,actor_id,funding_scope)
values('hearth.chat_completion',2,'enforce','6a000000-0000-4000-8000-000000000020','Slice 6A isolated enforce','6a000000-0000-4000-8000-000000000002','forge');
do $$ declare result jsonb; begin
 result:=tongs.acquire_openai_text_aggregate_admission('6a000000-0000-4000-8000-000000000062','interactive','real');
 if coalesce((result->>'enforcement_enabled')::boolean,false) is not true
    or result->>'reason'<>'fixture_assignment_participated' then
  raise exception 'pre-staged assignment did not participate after enforce: %',result;
 end if;
end $$;
insert into tongs.openai_text_rollout_revisions(route_code,revision,mode,cost_policy_revision_id,reason,actor_id,funding_scope)
values('hearth.chat_completion',3,'halt_new',null,'Slice 6A isolated re-halt','6a000000-0000-4000-8000-000000000002','forge');
do $$ declare result jsonb; begin
 result:=tongs.acquire_openai_text_aggregate_admission('6a000000-0000-4000-8000-000000000062','interactive','real');
 if result->>'reason'<>'rollout_halt_new' then raise exception 're-halt did not block new admission: %',result; end if;
end $$;

set local session_replication_role = replica;
insert into tongs.paid_operation_aggregate_bindings(
 reservation_id,hold_id,policy_revision_id,capability_code,provider,operation_id,user_id,workspace_id,
 request_fingerprint,model_or_sku,funding_source_type,credential_funding,provider_mode,pricing_revision_id,
 cost_policy_revision_id,customer_funding_ceiling_micros,supplier_exposure_ceiling_micros,supporting_exposure_ceiling_micros
) values('6a000000-0000-4000-8000-000000000062','6a000000-0000-4000-8000-000000000070','6a000000-0000-4000-8000-000000000050','openai.text.hearth_chat','openai','slice6a-operation','6a000000-0000-4000-8000-000000000001','6a000000-0000-4000-8000-000000000011',repeat('a',64),'test-model','owner_budget','forge','real','6a000000-0000-4000-8000-000000000022','6a000000-0000-4000-8000-000000000020',2000,1000,0);
set local session_replication_role = origin;
do $$ declare result jsonb; begin
 result:=tongs.acquire_openai_text_aggregate_admission('6a000000-0000-4000-8000-000000000062','recovery','real');
 if coalesce((result->>'authorized')::boolean,false) is not true or coalesce((result->>'replay')::boolean,false) is not true then
  raise exception 'halt_new broke prior aggregate recovery replay: %',result;
 end if;
end $$;

do $$
declare funding_definition text:=pg_get_functiondef('tongs._stamp_and_authorize_funding_reservation()'::regprocedure);
 quote_definition text:=pg_get_functiondef('tongs.create_customer_openai_text_quote(uuid,uuid,text,text,uuid,text,text,text,text,timestamptz)'::regprocedure);
 reserve_definition text:=pg_get_functiondef('tongs.reserve_customer_openai_text_quote(uuid,uuid,uuid,text,text,uuid,text,text,text,text,text)'::regprocedure);
begin
 if position('authorization_kind in(''certification'',''normal_customer'')' in funding_definition)=0 then raise exception 'customer reservation can select owner-only scope'; end if;
 if position('v_rollout.mode<>''enforce''' in quote_definition)=0 then raise exception 'quote rollout gate missing'; end if;
 if position('v_rollout.mode<>''enforce''' in reserve_definition)=0 then raise exception 'reservation rollout gate missing'; end if;
 if has_function_privilege('authenticated','tongs.create_owner_only_openai_text_execution_scope_authorization(uuid,uuid,uuid,uuid,text,text,text,timestamptz,timestamptz,text)','EXECUTE') then raise exception 'authenticated can create owner-only scope'; end if;
 if not has_function_privilege('service_role','tongs.create_owner_only_openai_text_execution_scope_authorization(uuid,uuid,uuid,uuid,text,text,text,timestamptz,timestamptz,text)','EXECUTE') then raise exception 'service role cannot create owner-only scope'; end if;
 if has_table_privilege('authenticated','tongs.customer_paid_execution_scope_authorizations','SELECT') then raise exception 'authenticated can enumerate private scopes'; end if;
 if not exists(select 1 from pg_class where oid='tongs.customer_paid_execution_scope_authorizations'::regclass and relrowsecurity and relforcerowsecurity) then raise exception 'scope RLS is not enabled and forced'; end if;
 if exists(select 1 from tongs.customer_paid_execution_scope_authorizations where route_code='hammer.transcript_cleanup') then raise exception 'test created Hammer scope'; end if;
end $$;

rollback;
