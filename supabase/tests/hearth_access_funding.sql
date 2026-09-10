begin;

insert into auth.users(id,email) values
 ('10000000-0000-4000-8000-000000000001','operator@example.test'),
 ('10000000-0000-4000-8000-000000000002','member@example.test'),
 ('10000000-0000-4000-8000-000000000003','payer@example.test'),
 ('10000000-0000-4000-8000-000000000004','other-operator@example.test');
insert into tongs.platform_operators(user_id,reason) values
 ('10000000-0000-4000-8000-000000000001','isolated test'),
 ('10000000-0000-4000-8000-000000000004','must not inherit owner testing');
insert into tongs.orgs(id,name,created_by) values
 ('20000000-0000-4000-8000-000000000001','Test organization','10000000-0000-4000-8000-000000000003');
insert into tongs.org_members(org_id,user_id,org_role) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','owner'),
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','member');
insert into tongs.workspaces(id,name,org_id) values
 ('30000000-0000-4000-8000-000000000001','Owner workspace',null),
 ('30000000-0000-4000-8000-000000000002','Shared workspace','20000000-0000-4000-8000-000000000001');
insert into tongs.workspace_members(workspace_id,user_id,role) values
 ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','owner'),
 ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','member');
insert into tongs.ai_credits(user_id,token_balance) values
 ('10000000-0000-4000-8000-000000000001',999999999),
 ('10000000-0000-4000-8000-000000000002',123456);

select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select tongs.configure_owner_testing_principal(
 '10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','enabled','verified personal owner test identity');

do $$ begin
 if exists(select 1 from tongs.owner_testing_principals where user_id='10000000-0000-4000-8000-000000000004') then
   raise exception 'platform operator inherited owner testing'; end if;
 if (select eligible_for_live_funding from tongs.legacy_credit_opening_balances where user_id='10000000-0000-4000-8000-000000000001') then
   raise exception 'legacy balance became eligible'; end if;
end $$;

select set_config('request.jwt.claim.role','authenticated',true);
select tongs.set_my_ai_funding_preference('30000000-0000-4000-8000-000000000001','owner_testing',null);
do $$ declare r jsonb; begin
 r:=tongs.read_my_ai_funding_options('30000000-0000-4000-8000-000000000001');
 if r->>'selected_payer'<>'owner_testing' or (r->'options'->2->>'available')::boolean is not true then
   raise exception 'explicit owner funding option missing'; end if;
 if exists(select 1 from tongs.owner_operating_budget_revisions where status='active') then
   raise exception 'owner budget was activated without an amount decision'; end if;
end $$;

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
select tongs.configure_organization_funding_account(
 '20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','USD','active','canonical payer account');
select tongs.configure_organization_shared_spend_permission(
 '20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','allowed',
 array['hearth.chat_completion'],'member may use shared Hearth credits');

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select tongs.set_my_ai_funding_preference(
 '30000000-0000-4000-8000-000000000002','organization_shared','20000000-0000-4000-8000-000000000001');
select dummy from (select set_config('request.jwt.claim.role','service_role',true) dummy) x;
do $$ declare r jsonb; begin
 r:=tongs._resolve_spending_authority('10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','hearth.chat_completion');
 if r->>'payer_user_id'<>'10000000-0000-4000-8000-000000000003' or r->>'payer_kind'<>'organization_shared' then
   raise exception 'organization actor/payer separation failed'; end if;
end $$;

-- Prove that the acting member can reserve the payer's one canonical deposit,
-- while replay is idempotent and a concurrent quote cannot overspend it.
select tongs.record_customer_deposit(
 '50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003',
 'evt_live_shared_1','cs_live_shared_1','pi_live_shared_1',true,'credits_shared',100000,'USD',10000,now(),'{}');
select tongs.record_customer_deposit_processor_fee(
 '50000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000001',
 'txn_live_shared_1',5000,now(),'{}');
insert into tongs.private_pricing_policies(id,policy_code,scope_kind,provider,sku,created_by)
values('51000000-0000-4000-8000-000000000001','isolated-org-shared','sku','openai','isolated-org-shared','10000000-0000-4000-8000-000000000001');
insert into tongs.private_pricing_revisions(
 id,policy_id,revision,lifecycle_state,currency,markup_basis_points,full_cost_ceiling_micros,
 failure_cost_ceiling_micros,customer_price_ceiling_micros,billable_failure_ceiling_micros,
 customer_credit_units,billable_failure_classes,free_failure_classes,included_quantity,
 retention_policy,change_reason,content_hash,actor_id
) values(
 '51000000-0000-4000-8000-000000000002','51000000-0000-4000-8000-000000000001',1,'review_ready','USD',3300,50000,
 50000,100000,0,10000,'[]','["provider_failure","forge_failure","validation_failure","persistence_failure"]',
 '{"input_tokens":1000,"output_tokens":256}','{"kind":"none"}','isolated shared reservation proof',repeat('a',64),
 '10000000-0000-4000-8000-000000000001');
select tongs.create_shadow_spending_quote(
 '52000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',
 'shared:hearth:operation:1','hearth.chat_completion','30000000-0000-4000-8000-000000000002',
 '51000000-0000-4000-8000-000000000002',repeat('b',64),'[{"component":"openai_text","provider_label":"OpenAI","credential_source":"forge"}]',now()+interval '10 minutes');
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
do $$ begin
 begin
   perform tongs.accept_quote('52000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000002',
     'shared-acceptance-1',repeat('c',64));
   raise exception 'client-supplied quote hash was accepted';
 exception when invalid_parameter_value then null; end;
end $$;
select tongs.accept_quote(
 '52000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000002','shared-acceptance-1',
 (select quote_hash from tongs.customer_spending_quotes where id='52000000-0000-4000-8000-000000000001'));
select set_config('request.jwt.claim.role','service_role',true);
select tongs.reserve_operation(
 '52000000-0000-4000-8000-000000000003','52000000-0000-4000-8000-000000000001',
 'customer_deposit','50000000-0000-4000-8000-000000000001','shared-reservation-1');
select tongs.reserve_operation(
 '52000000-0000-4000-8000-000000000003','52000000-0000-4000-8000-000000000001',
 'customer_deposit','50000000-0000-4000-8000-000000000001','shared-reservation-1');
do $$ begin
 if not exists(select 1 from tongs.funding_reservations r
   join tongs.spending_quote_authority_bindings a on a.quote_id=r.quote_id
   where r.id='52000000-0000-4000-8000-000000000003'
     and r.user_id='10000000-0000-4000-8000-000000000002'
     and a.payer_user_id='10000000-0000-4000-8000-000000000003'
     and r.funding_source_id='50000000-0000-4000-8000-000000000001') then
   raise exception 'shared reservation did not preserve actor and payer'; end if;
 if (select count(*) from tongs.funding_reservations where funding_source_id='50000000-0000-4000-8000-000000000001')<>1 then
   raise exception 'shared reservation replay duplicated hold'; end if;
end $$;
select tongs.create_shadow_spending_quote(
 '52000000-0000-4000-8000-000000000011','10000000-0000-4000-8000-000000000002',
 'shared:hearth:operation:2','hearth.chat_completion','30000000-0000-4000-8000-000000000002',
 '51000000-0000-4000-8000-000000000002',repeat('d',64),'[{"component":"openai_text","provider_label":"OpenAI","credential_source":"forge"}]',now()+interval '10 minutes');
do $$ declare f jsonb; begin
 f:=tongs._select_customer_funding_for_quote('52000000-0000-4000-8000-000000000011');
 if coalesce((f->>'eligible')::boolean,false) then raise exception 'concurrent shared reservation overspent payer'; end if;
end $$;

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
select tongs.configure_organization_shared_spend_permission(
 '20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','revoked',
 array['hearth.chat_completion'],'revoke future shared operations');
select set_config('request.jwt.claim.role','service_role',true);
do $$ begin
 begin
   perform tongs._resolve_spending_authority('10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','hearth.chat_completion');
   raise exception 'revoked authority was accepted';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select tongs.record_test_refill(
 '40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',1000,
 'private simulated UI testing','test-refill-owner-1',now()+interval '1 day');
select tongs.consume_test_refill(
 '41000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',
 'simulated:hearth:operation:1',100,'simulated','test-consume-owner-1');
select tongs.consume_test_refill(
 '41000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',
 'simulated:hearth:operation:1',100,'simulated','test-consume-owner-1');
do $$ begin
 begin
   perform tongs.consume_test_refill('41000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000001',
     'real:hearth:operation:2',100,'real','test-consume-owner-2');
   raise exception 'Test refill authorized real provider';
 exception when insufficient_privilege then null; end;
 if (select count(*) from tongs.test_refill_consumptions)<>1 then raise exception 'Test replay duplicated consumption'; end if;
 if exists(select 1 from tongs.customer_deposits where user_id='10000000-0000-4000-8000-000000000001') then
   raise exception 'Test refill created Live deposit'; end if;
 if exists(select 1 from tongs.openai_text_model_catalog_revisions where revision=2 and lifecycle_state<>'draft') then
   raise exception 'model catalog was activated'; end if;
 if (select count(*) from tongs.openai_text_model_catalog_entries where catalog_revision_id='29000000-0000-4000-8000-000000000002')<>5 then
   raise exception 'requested five-model catalog incomplete'; end if;
end $$;

rollback;
