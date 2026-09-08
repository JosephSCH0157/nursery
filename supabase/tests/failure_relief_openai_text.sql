begin;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
 ('af000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','customer@example.test','',now(),now(),now()),
 ('af000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','operator@example.test','',now(),now(),now()),
 ('af000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','viewer@example.test','',now(),now(),now());
insert into tongs.workspaces(id,name) values('af000000-0000-4000-8000-000000000010','Failure proof');
insert into tongs.platform_operators(user_id,reason,granted_by) values('af000000-0000-4000-8000-000000000002','isolated proof','af000000-0000-4000-8000-000000000002');

set local request.jwt.claim.role='authenticated'; set local request.jwt.claim.sub='af000000-0000-4000-8000-000000000002'; set local role authenticated;
do $$ declare v_preview jsonb; begin
 perform tongs.commit_private_markup_rule_revision('af000000-0000-4000-8000-000000000020',0,3300,'[]','approved 33 percent markup');
 perform tongs.commit_operator_pricing_revision('af000000-0000-4000-8000-000000000020','af000000-0000-4000-8000-000000000021',
  'runway:gen4.5:5s:1280:720','sku','runway','gen4.5:5s:1280:720',0,'af000000-0000-4000-8000-000000000022',100,'usd',
  '[{"component_code":"provider","component_kind":"direct_provider","credential_funding":"forge","provider_label":"Runway","success_ceiling_micros":600000,"failure_ceiling_micros":300000,"cost_policy_revision":"test","tail_policy":"none"},{"component_code":"support","component_kind":"supporting_provider","credential_funding":"forge","provider_label":"Forge support","success_ceiling_micros":150001,"failure_ceiling_micros":75000,"cost_policy_revision":"test","tail_policy":"none"}]',
  '["provider_billed_failure"]','[]','{"model":"gen4.5","duration_seconds":5,"ratio":"1280:720"}','{"kind":"included_until","duration_hours":24}','zero customer failure proof');
 v_preview:=tongs.preview_private_price('af000000-0000-4000-8000-000000000022');
 if (v_preview->>'markup_basis_points')::integer<>3300 then raise exception '33 percent markup not retained'; end if;
 perform tongs.publish_private_pricing_revision('af000000-0000-4000-8000-000000000023','af000000-0000-4000-8000-000000000022','isolated only');
end $$;

reset role; set local request.jwt.claim.role='service_role'; set local request.jwt.claim.sub=''; set local role service_role;
select tongs.record_customer_deposit('af000000-0000-4000-8000-000000000030','af000000-0000-4000-8000-000000000001','evt_failure','cs_failure','pi_failure',true,'pack',2000000,'usd',200,now(),'{}');
select tongs.record_customer_deposit_processor_fee('af000000-0000-4000-8000-000000000031','af000000-0000-4000-8000-000000000030','txn_failure',100000,now(),'{}');
select tongs.create_customer_runway_quote('af000000-0000-4000-8000-000000000040','af000000-0000-4000-8000-000000000001','failure-operation-0001','af000000-0000-4000-8000-000000000010',repeat('a',64),'gen4.5',5,'1280:720',now()+interval '1 hour');
do $$ begin
 if (select billable_failure_maximum_charge_micros<>0 or normal_maximum_charge_micros<>1000000 from tongs.customer_spending_quotes where id='af000000-0000-4000-8000-000000000040') then raise exception 'customer quote failure or rounding terms wrong'; end if;
end $$;

reset role; set local request.jwt.claim.role='authenticated'; set local request.jwt.claim.sub='af000000-0000-4000-8000-000000000001'; set local role authenticated;
select tongs.accept_quote('af000000-0000-4000-8000-000000000040','af000000-0000-4000-8000-000000000041','accept-failure-proof',(tongs.read_my_spending_quote('af000000-0000-4000-8000-000000000040')->>'quote_hash'));
reset role;
insert into tongs.paid_execution_control_revisions(revision,pricing_activation_enabled,reservation_shadow_enabled,customer_settlement_enabled,owner_budget_spending_enabled,provider_execution_enabled,reason)
values(2,true,true,true,false,true,'isolated proof only');
set local request.jwt.claim.role='service_role'; set local request.jwt.claim.sub=''; set local role service_role;
select tongs.reserve_customer_runway_quote('af000000-0000-4000-8000-000000000040','af000000-0000-4000-8000-000000000050','reserve-failure-proof',repeat('a',64),'gen4.5',5,'1280:720');
-- Simulate an initially successful charge that is later determined to be a provider failure.
select tongs.settle_operation('af000000-0000-4000-8000-000000000050','af000000-0000-4000-8000-000000000051','initial-success-charge','success',null,750001,'{"provider":"fake"}');
do $$ declare v_result jsonb; begin
 v_result:=tongs.settle_operation('af000000-0000-4000-8000-000000000050',gen_random_uuid(),'later-confirmed-failure','nonbillable_failure','provider_failure',230000,'{"provider":"fake","provider_reference":"fake_req_1","authoritative":true}');
 if (v_result->>'state')<>'relieved' or (v_result->>'customer_charge_micros')::bigint<>0 then raise exception 'customer relief failed: %',v_result; end if;
 perform tongs.settle_operation('af000000-0000-4000-8000-000000000050',gen_random_uuid(),'later-confirmed-failure','nonbillable_failure','provider_failure',230000,'{"provider":"fake","provider_reference":"fake_req_1","authoritative":true}');
 if (select count(*)<>1 from tongs.customer_operation_reliefs where reservation_id='af000000-0000-4000-8000-000000000050') then raise exception 'duplicate relief'; end if;
 if (select count(*)<>1 from tongs.supplier_expenses where reservation_id='af000000-0000-4000-8000-000000000050') then raise exception 'duplicate supplier expense'; end if;
 if (select sum(amount_micros)<>0 from tongs.accounting_journal_entries where event_id=(select journal_event_id from tongs.customer_operation_reliefs where reservation_id='af000000-0000-4000-8000-000000000050') and currency='USD') then raise exception 'relief journal unbalanced'; end if;
 if (select recognized_revenue_micros<>0 or supplier_expense_micros<>230000 or contribution_profit_micros<>-230000 from jsonb_to_recordset(tongs.read_failure_financials(10)) as x(recognized_revenue_micros bigint,supplier_expense_micros bigint,contribution_profit_micros bigint)) then raise exception 'failure profit report wrong'; end if;
end $$;

-- Unknown cost evidence must keep profit unavailable.
select tongs.record_supplier_expense(gen_random_uuid(),'af000000-0000-4000-8000-000000000050','unresolved-cost-evidence','openai','support',null,'USD',null,'unresolved','unresolved','{}');
-- Claims are tracked only and do not create customer revenue or external actions.
select tongs.record_supplier_recovery_claim('af000000-0000-4000-8000-000000000060',(select id from tongs.supplier_expenses where expense_key='later-confirmed-failure:supplier-expense'),'claim-track-only',230000,'USD','{}');
select tongs.record_supplier_recovery('af000000-0000-4000-8000-000000000061',(select id from tongs.supplier_expenses where expense_key='later-confirmed-failure:supplier-expense'),'duplicate-recovery-proof','credit_note_1',50000,'USD','confirmed','{}');
select tongs.record_supplier_recovery('af000000-0000-4000-8000-000000000062',(select id from tongs.supplier_expenses where expense_key='later-confirmed-failure:supplier-expense'),'duplicate-recovery-proof','credit_note_1',50000,'USD','confirmed','{}');
do $$ begin if (select external_action_taken from tongs.supplier_recovery_claims where id='af000000-0000-4000-8000-000000000060') then raise exception 'claim performed external action'; end if; end $$;
do $$ begin if (select count(*)<>1 from tongs.supplier_recoveries where recovery_key='duplicate-recovery-proof') then raise exception 'duplicate recovery counted twice'; end if; end $$;

reset role; set local request.jwt.claim.role='authenticated'; set local request.jwt.claim.sub='af000000-0000-4000-8000-000000000003'; set local role authenticated;
do $$ begin
 begin perform tongs.read_failure_financials(10); raise exception 'viewer read supplier financials'; exception when insufficient_privilege then null; end;
 if has_table_privilege('authenticated','tongs.supplier_expenses','select') or has_table_privilege('authenticated','tongs.customer_operation_reliefs','select') then raise exception 'private tables exposed'; end if;
end $$;
rollback;
