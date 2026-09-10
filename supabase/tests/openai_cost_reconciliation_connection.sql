begin;

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
 ('58000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','reconciliation-customer@example.test','',now(),now(),now()),
 ('58000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','reconciliation-operator@example.test','',now(),now(),now()),
 ('58000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','reconciliation-viewer@example.test','',now(),now(),now());
insert into tongs.workspaces(id,name) values('58000000-0000-4000-8000-000000000010','Reconciliation isolated workspace');
insert into tongs.platform_operators(user_id,reason,granted_by)
values('58000000-0000-4000-8000-000000000002','isolated reconciliation proof','58000000-0000-4000-8000-000000000002');

set local request.jwt.claim.role='authenticated';
set local request.jwt.claim.sub='58000000-0000-4000-8000-000000000002';
set local role authenticated;
select tongs.commit_private_markup_rule_revision('58000000-0000-4000-8000-000000000019',0,3300,'[]','isolated reconciliation pricing');
select tongs.commit_operator_pricing_revision(
 '58000000-0000-4000-8000-000000000019','58000000-0000-4000-8000-000000000020','openai:reconciliation-fixture','sku','openai','reconciliation-fixture',0,
 '58000000-0000-4000-8000-000000000021',1,'USD',
 '[{"component_code":"openai_text","component_kind":"direct_provider","credential_funding":"forge","provider_label":"OpenAI","success_ceiling_micros":10668,"failure_ceiling_micros":10668,"cost_policy_revision":"openai-text:hearth-chat:bounded-pilot-v1","tail_policy":"none"},{"component_code":"support","component_kind":"supporting_provider","credential_funding":"forge","provider_label":"Forge support","success_ceiling_micros":10000,"failure_ceiling_micros":10000,"cost_policy_revision":"openai-text:hearth-chat:bounded-pilot-v1","tail_policy":"none"}]',
 '[]','[]','{"input_tokens":2000,"output_tokens":512,"attempts":1}','{"kind":"none"}','isolated reconciliation proof');

reset role;
set local request.jwt.claim.role='service_role';
set local request.jwt.claim.sub='';
set local role service_role;
select tongs.record_customer_deposit('58000000-0000-4000-8000-000000000030','58000000-0000-4000-8000-000000000001','evt_reconciliation_live','cs_reconciliation_live','pi_reconciliation_live',true,'pack',100000,'USD',100,now(),'{}');
select tongs.record_customer_deposit_processor_fee('58000000-0000-4000-8000-000000000031','58000000-0000-4000-8000-000000000030','txn_reconciliation_live',100,now(),'{}');
select tongs.create_shadow_spending_quote('58000000-0000-4000-8000-000000000040','58000000-0000-4000-8000-000000000001','reconciliation-openai-operation','hearth','58000000-0000-4000-8000-000000000010','58000000-0000-4000-8000-000000000021',repeat('a',64),'[{"component":"openai_text","provider_label":"OpenAI","credential_source":"forge"}]',now()+interval '1 hour');

reset role;
set local request.jwt.claim.role='authenticated';
set local request.jwt.claim.sub='58000000-0000-4000-8000-000000000001';
set local role authenticated;
select tongs.accept_quote('58000000-0000-4000-8000-000000000040','58000000-0000-4000-8000-000000000050','accept-reconciliation-fixture',(tongs.read_my_spending_quote('58000000-0000-4000-8000-000000000040')->>'quote_hash'));

reset role;
insert into tongs.paid_execution_control_revisions(revision,pricing_activation_enabled,reservation_shadow_enabled,customer_settlement_enabled,owner_budget_spending_enabled,provider_execution_enabled,reason)
select revision+1,true,true,true,owner_budget_spending_enabled,true,'isolated fake reconciliation proof only' from tongs.paid_execution_control_revisions order by revision desc limit 1;
insert into tongs.openai_text_failure_loss_policy_revisions(id,route_code,environment,revision,per_operation_limit_micros,aggregate_limit_micros,rolling_window_seconds,maximum_concurrency,lifecycle_state,reason)
values('58000000-0000-4000-8000-000000000060','hearth.chat_completion','production',99,20668,50000,86400,4,'active','isolated only');
insert into tongs.openai_text_rollout_revisions(route_code,revision,mode,cost_policy_revision_id,reason)
select 'hearth.chat_completion',coalesce(max(revision),0)+1,'enforce','10000000-0000-4000-8000-000000000009','isolated only' from tongs.openai_text_rollout_revisions where route_code='hearth.chat_completion';
insert into tongs.restricted_beta_cost_evidence_revisions(id,capability_code,revision,evidence_state,coverage_state,source_reference,observed_at,valid_until,hard_cap_scope,notes)
values('58000000-0000-4000-8000-000000000070','openai.text.hearth_chat',99,'synthetic_test','complete','isolated fake provider',now()-interval '1 minute',now()+interval '1 day','one bounded operation','isolated only');
insert into tongs.restricted_beta_policy_revisions(id,environment,revision,lifecycle_state,aggregate_forge_exposure_limit_micros,reserved_headroom_micros,maximum_concurrency,rolling_window_seconds,evidence_max_age_seconds,reason)
values('58000000-0000-4000-8000-000000000071','production',99,'active',25000,0,4,3600,3600,'isolated only');
insert into tongs.restricted_beta_policy_capabilities(id,policy_revision_id,capability_code,admission_mode,cost_evidence_revision_id,maximum_attempts,maximum_concurrency,per_operation_supplier_ceiling_micros,per_operation_supporting_ceiling_micros,per_operation_tail_ceiling_micros,permitted_callers_json,exact_model_or_sku,notes)
values('58000000-0000-4000-8000-000000000072','58000000-0000-4000-8000-000000000071','openai.text.hearth_chat','covered','58000000-0000-4000-8000-000000000070',1,1,10668,10000,0,'["interactive","recovery"]','gpt-5.3-chat-latest','isolated only');
insert into tongs.paid_execution_aggregate_assignments(id,policy_revision_id,user_id,workspace_id,state,valid_from,valid_until,reason)
values('58000000-0000-4000-8000-000000000073','58000000-0000-4000-8000-000000000071','58000000-0000-4000-8000-000000000001','58000000-0000-4000-8000-000000000010','active',now()-interval '1 minute',now()+interval '1 hour','isolated only');

set local request.jwt.claim.role='service_role';
set local request.jwt.claim.sub='';
set local role service_role;
select tongs.reserve_operation('58000000-0000-4000-8000-000000000080','58000000-0000-4000-8000-000000000040','customer_deposit','58000000-0000-4000-8000-000000000030','reserve-reconciliation-fixture');
select tongs.bind_openai_text_funding_reservation('reconciliation-openai-operation','hearth.chat_completion','58000000-0000-4000-8000-000000000080','forge','gpt-5.3-chat-latest','10000000-0000-4000-8000-000000000009');

do $$ declare result jsonb; start_epoch bigint:=extract(epoch from date_trunc('day',now()))::bigint; begin
 result:=tongs.acquire_openai_text_aggregate_admission('58000000-0000-4000-8000-000000000080','interactive','real');
 if coalesce((result->>'authorized')::boolean,false) is not true then raise exception 'aggregate admission failed: %',result; end if;
 result:=tongs.begin_paid_operation_aggregate_attempt('58000000-0000-4000-8000-000000000080','reconciliation-attempt-aggregate',1::smallint,'interactive');
 if coalesce((result->>'authorized')::boolean,false) is not true then raise exception 'aggregate attempt failed: %',result; end if;
 perform tongs.record_openai_text_supplier_attempt_expense('58000000-0000-4000-8000-000000000080','reconciliation-attempt',1::smallint,'req_reconciliation_fixture',50,'estimated','{"cached_input_units":0}');
 perform tongs.record_supplier_expense('58000000-0000-4000-8000-000000000081','58000000-0000-4000-8000-000000000080','reconciliation-attempt:supporting-expense','forge','openai.text.hearth.chat_completion.supporting',null,'USD',20,'estimated','closed','{}');
 perform tongs.record_openai_text_usage('58000000-0000-4000-8000-000000000082','58000000-0000-4000-8000-000000000080','reconciliation-attempt:usage','req_reconciliation_fixture',1::smallint,10,5,true,true,true,'{"cached_input_units":0}');
 perform tongs.record_paid_operation_aggregate_outcome('58000000-0000-4000-8000-000000000080','reconciliation-settled-unconfirmed','settled_unconfirmed',70,null,'{"authoritative":false}');

 result:=tongs.record_openai_organization_reconciliation(
  '58000000-0000-4000-8000-000000000090','openai-costs-reconciliation-v1',to_timestamp(start_epoch),to_timestamp(start_epoch+86400),
  'USD',80,'organization_costs_api','confirmed',
  jsonb_build_array(jsonb_build_object('bucket_key','cost-v1','project_id','proj_fixture','api_key_id','key_fixture','line_item','gpt-5.3-chat-latest, input','amount_micros',80,'evidence',jsonb_build_object('start_time',start_epoch,'end_time',start_epoch+86400))),
  jsonb_build_array(jsonb_build_object('bucket_key','usage-v1','project_id','proj_fixture','api_key_id','key_fixture','model','gpt-5.3-chat-latest','input_tokens',10,'cached_input_tokens',0,'output_tokens',5,'request_count',1,'evidence',jsonb_build_object('start_time',start_epoch,'end_time',start_epoch+86400))),
  '{"source":"isolated authoritative fixture","project_scope":["proj_fixture"]}');
 if result->>'allocation_status'<>'defensibly_allocated' then raise exception 'exact provider totals were not allocated: %',result; end if;
 if (select adjustment_micros from tongs.openai_supplier_expense_reconciliation_adjustments where reconciliation_batch_id='58000000-0000-4000-8000-000000000090')<>30 then raise exception 'estimate replacement delta was not 30'; end if;
 if (select committed_micros from tongs._restricted_beta_policy_commitment('58000000-0000-4000-8000-000000000071'))<>10080 then raise exception 'partial reconciliation did not retain supporting ceiling'; end if;

 -- A replay does not add an adjustment or release capacity again.
 result:=tongs.record_openai_organization_reconciliation(
  '58000000-0000-4000-8000-000000000090','openai-costs-reconciliation-v1',to_timestamp(start_epoch),to_timestamp(start_epoch+86400),
  'USD',80,'organization_costs_api','confirmed',
  jsonb_build_array(jsonb_build_object('bucket_key','cost-v1','project_id','proj_fixture','api_key_id','key_fixture','line_item','gpt-5.3-chat-latest, input','amount_micros',80,'evidence',jsonb_build_object('start_time',start_epoch,'end_time',start_epoch+86400))),
  jsonb_build_array(jsonb_build_object('bucket_key','usage-v1','project_id','proj_fixture','api_key_id','key_fixture','model','gpt-5.3-chat-latest','input_tokens',10,'cached_input_tokens',0,'output_tokens',5,'request_count',1,'evidence',jsonb_build_object('start_time',start_epoch,'end_time',start_epoch+86400))),
  '{"source":"isolated authoritative fixture","project_scope":["proj_fixture"]}');
 if coalesce((result->>'replay')::boolean,false) is not true then raise exception 'provider batch replay was not idempotent'; end if;

 -- A revised exact window supersedes v1 append-only. Reporting applies only
 -- confirmed-minus-original-estimate from the effective revision.
 result:=tongs.record_openai_organization_reconciliation(
  '58000000-0000-4000-8000-000000000091','openai-costs-reconciliation-v2',to_timestamp(start_epoch),to_timestamp(start_epoch+86400),
  'USD',100,'organization_costs_api','confirmed',
  jsonb_build_array(jsonb_build_object('bucket_key','cost-v2','project_id','proj_fixture','api_key_id','key_fixture','line_item','gpt-5.3-chat-latest, input','amount_micros',100,'evidence',jsonb_build_object('start_time',start_epoch,'end_time',start_epoch+86400))),
  jsonb_build_array(jsonb_build_object('bucket_key','usage-v2','project_id','proj_fixture','api_key_id','key_fixture','model','gpt-5.3-chat-latest','input_tokens',10,'cached_input_tokens',0,'output_tokens',5,'request_count',1,'evidence',jsonb_build_object('start_time',start_epoch,'end_time',start_epoch+86400))),
  '{"source":"isolated revised authoritative fixture","project_scope":["proj_fixture"]}');
 if tongs._openai_reconciliation_batch_state('58000000-0000-4000-8000-000000000090')<>'superseded' then raise exception 'revised batch did not supersede prior batch'; end if;
 if (select adjustment_micros from tongs.openai_supplier_expense_reconciliation_adjustments where reconciliation_batch_id='58000000-0000-4000-8000-000000000091')<>50 then raise exception 'revised replacement delta was not relative to original estimate'; end if;
 if (select committed_micros from tongs._restricted_beta_policy_commitment('58000000-0000-4000-8000-000000000071'))<>10100 then raise exception 'revised actual exposure was not retained'; end if;

 -- A partial overlap is quarantined and cannot double the authoritative total.
 result:=tongs.record_openai_organization_reconciliation(
  '58000000-0000-4000-8000-000000000092','openai-costs-overlap',to_timestamp(start_epoch+43200),to_timestamp(start_epoch+129600),
  'USD',900,'organization_costs_api','confirmed',
  jsonb_build_array(jsonb_build_object('bucket_key','cost-overlap','project_id','proj_fixture','api_key_id','key_fixture','line_item','gpt-5.3-chat-latest, input','amount_micros',900,'evidence',jsonb_build_object('start_time',start_epoch+43200,'end_time',start_epoch+129600))),
  '[]','{"source":"isolated overlap fixture","project_scope":["proj_fixture"]}');
 if result->>'batch_state'<>'overlap_quarantined' then raise exception 'partial overlap was not quarantined: %',result; end if;

 -- Non-overlapping but incomplete operation evidence remains authoritative and
 -- unmatched; it cannot create an operation adjustment or confirmed profit.
 result:=tongs.record_openai_organization_reconciliation(
  '58000000-0000-4000-8000-000000000093','openai-costs-unmatched',to_timestamp(start_epoch+172800),to_timestamp(start_epoch+259200),
  'USD',20,'organization_costs_api','confirmed',
  jsonb_build_array(jsonb_build_object('bucket_key','cost-unmatched','project_id','proj_fixture','api_key_id','key_fixture','line_item','gpt-5.3-chat-latest, input','amount_micros',20,'evidence',jsonb_build_object('start_time',start_epoch+172800,'end_time',start_epoch+259200))),
  jsonb_build_array(jsonb_build_object('bucket_key','usage-unmatched','project_id','proj_fixture','api_key_id','key_fixture','model','gpt-5.3-chat-latest','input_tokens',99,'cached_input_tokens',0,'output_tokens',9,'request_count',1,'evidence',jsonb_build_object('start_time',start_epoch+172800,'end_time',start_epoch+259200))),
  '{"source":"isolated unmatched fixture","project_scope":["proj_fixture"]}');
 if result->>'allocation_status'<>'unresolved' then raise exception 'partial operation evidence was falsely allocated'; end if;
end $$;

do $$ declare summary jsonb; admission jsonb; financial jsonb; begin
 summary:=tongs.read_openai_reconciliation_summary();
 if (summary->>'authoritative_provider_total_micros')::bigint<>120
    or (summary->>'defensibly_allocated_micros')::bigint<>100
    or (summary->>'unmatched_authoritative_micros')::bigint<>20
    or (summary->>'estimate_replacement_adjustment_micros')::bigint<>50
    or (summary->>'historical_unmatched_estimate_micros')::bigint<>490925
    or (summary->>'superseded_batch_count')::bigint<>1
    or (summary->>'quarantined_batch_count')::bigint<>1 then
  raise exception 'effective reconciliation summary is inconsistent: %',summary; end if;
 admission:=tongs.reserve_restricted_beta_exposure('58000000-0000-4000-8000-000000000099','58000000-0000-4000-8000-000000000071','openai.text.hearth_chat','reconciliation-capacity-blocked','58000000-0000-4000-8000-000000000001','58000000-0000-4000-8000-000000000010',repeat('f',64),'gpt-5.3-chat-latest','verified_customer_deposit','another-handle','real','interactive',20668,10668,10000,0,0,0,120,'reconciliation-capacity-blocked');
 if admission->>'reason'<>'aggregate_exposure_exhausted' then raise exception 'confirmed-above-estimate exposure did not halt new admission: %',admission; end if;
 select item into financial from jsonb_array_elements(tongs.read_failure_financials(50)) item
  where item->>'reservation_id'='58000000-0000-4000-8000-000000000080';
 if (financial->>'supplier_expense_micros')::bigint<>120 or financial->>'cost_coverage'<>'incomplete'
    or financial->'contribution_profit_micros'<>'null'::jsonb then
  raise exception 'owner financial report implied confirmed profit or ignored effective adjustment: %',financial; end if;

 admission:=tongs.reserve_restricted_beta_exposure('58000000-0000-4000-8000-000000000094','58000000-0000-4000-8000-000000000071','openai.text.hearth_chat','reconciliation-failed-operation','58000000-0000-4000-8000-000000000001','58000000-0000-4000-8000-000000000010',repeat('c',64),'gpt-5.3-chat-latest','verified_customer_deposit','failed-handle','real','interactive',800,500,0,0,0,0,120,'reconciliation-failed-reserved');
 if coalesce((admission->>'authorized')::boolean,false) is not true then raise exception 'failed-operation hold was not admitted'; end if;
 perform tongs.begin_restricted_beta_attempt('58000000-0000-4000-8000-000000000094','reconciliation-failed-attempt',1::smallint,'interactive');
 perform tongs.record_restricted_beta_exposure_outcome('58000000-0000-4000-8000-000000000094','reconciliation-failed-customer-relief','customer_relieved_supplier_obligation',600,null,-800,600,'{"authoritative":false,"customer_charge_micros":0}');
 if not exists(select 1 from tongs.restricted_beta_exposure_events where hold_id='58000000-0000-4000-8000-000000000094' and event_type='customer_relieved_supplier_obligation' and customer_funding_delta_micros=-800 and supplier_obligation_micros=600) then
  raise exception 'customer relief erased or misstated supplier exposure'; end if;
end $$;

-- An obligation older than the rolling window remains committed until it is
-- authoritatively reconciled; lease expiry is irrelevant.
insert into tongs.restricted_beta_exposure_holds(id,policy_revision_id,capability_term_id,operation_identity,user_id,workspace_id,request_fingerprint,model_or_sku,funding_class,funding_handle_hash,provider_mode,caller_class,customer_funding_ceiling_micros,supplier_exposure_ceiling_micros,supporting_exposure_ceiling_micros,tail_exposure_ceiling_micros,unreconciled_exposure_ceiling_micros,retry_exposure_ceiling_micros,lease_expires_at,created_at)
values('58000000-0000-4000-8000-000000000100','58000000-0000-4000-8000-000000000071','58000000-0000-4000-8000-000000000072','old-unresolved-reconciliation-fixture','58000000-0000-4000-8000-000000000001','58000000-0000-4000-8000-000000000010',repeat('e',64),'gpt-5.3-chat-latest','verified_customer_deposit',repeat('d',64),'real','recovery',0,500,0,0,0,0,now()-interval '2 hours',now()-interval '2 hours');
insert into tongs.restricted_beta_exposure_events(id,hold_id,sequence,event_key,event_type,customer_funding_delta_micros,evidence_json,created_at)
values('58000000-0000-4000-8000-000000000101','58000000-0000-4000-8000-000000000100',1,'old-unresolved-reserved','reserved',0,'{}',now()-interval '2 hours'),
 ('58000000-0000-4000-8000-000000000102','58000000-0000-4000-8000-000000000100',2,'old-unresolved-attempt','attempt_started',0,'{}',now()-interval '2 hours');
do $$ begin
 if (select committed_micros from tongs._restricted_beta_policy_commitment('58000000-0000-4000-8000-000000000071'))<>11100 then
  raise exception 'window rollover erased or misstated an outstanding obligation'; end if;
 perform tongs.record_restricted_beta_exposure_outcome('58000000-0000-4000-8000-000000000100','old-unresolved-confirmed','reconciled',400,null,0,0,'{"authoritative":true}');
 if (select committed_micros from tongs._restricted_beta_policy_commitment('58000000-0000-4000-8000-000000000071'))<>10600 then
  raise exception 'old reconciled supplier spend remained in the wrong rolling window'; end if;
end $$;

reset role;
set local request.jwt.claim.role='authenticated';
set local request.jwt.claim.sub='58000000-0000-4000-8000-000000000003';
set local role authenticated;
do $$ begin
 if has_table_privilege('authenticated','tongs.openai_reconciliation_batch_state_events','select')
    or has_table_privilege('authenticated','tongs.openai_historical_unmatched_cost_estimates','select')
    or has_table_privilege('authenticated','tongs.openai_supplier_expense_reconciliation_adjustments','select') then
  raise exception 'reconciliation internals exposed to customer'; end if;
 begin perform tongs.read_openai_reconciliation_summary(); raise exception 'customer accessed reconciliation summary'; exception when insufficient_privilege then null; end;
end $$;

rollback;
