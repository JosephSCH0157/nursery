begin;

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
('55000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','beta-one@example.test','',now(),now(),now()),
('55000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','beta-two@example.test','',now(),now(),now()),
('55000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','beta-operator@example.test','',now(),now(),now());
insert into tongs.orgs(id,name,created_by) values('55000000-0000-4000-8000-000000000009','Restricted beta proof org','55000000-0000-4000-8000-000000000001');
insert into tongs.workspaces(id,name,org_id,created_by) values('55000000-0000-4000-8000-000000000010','Restricted beta proof','55000000-0000-4000-8000-000000000009','55000000-0000-4000-8000-000000000001');
insert into tongs.platform_operators(user_id,reason,granted_by) values('55000000-0000-4000-8000-000000000003','isolated proof','55000000-0000-4000-8000-000000000003');

set local request.jwt.claim.role='service_role'; set local request.jwt.claim.sub=''; set local role service_role;
insert into tongs.restricted_beta_cost_evidence_revisions(id,capability_code,revision,evidence_state,coverage_state,source_reference,observed_at,valid_until,hard_cap_scope,notes) values
('55000000-0000-4000-8000-000000000020','openai.text.hearth_research',2,'synthetic_test','complete','isolated fake provider',now()-interval '1 minute',now()+interval '1 day','one attempt; no support calls','fake-only'),
('55000000-0000-4000-8000-000000000021','fly.transcode',2,'synthetic_test','complete','isolated fake compute',now()-interval '1 minute',now()+interval '1 day','bounded fixture','fake-only'),
('55000000-0000-4000-8000-000000000022','brave.search',2,'verified_rate','complete','stale fixture',now()-interval '3 days',now()-interval '2 days','one query','deliberately stale');
insert into tongs.restricted_beta_policy_revisions(id,environment,revision,lifecycle_state,aggregate_forge_exposure_limit_micros,reserved_headroom_micros,maximum_concurrency,rolling_window_seconds,evidence_max_age_seconds,allocation_policy_revision_id,tail_policy_revision_id,reason)
values('55000000-0000-4000-8000-000000000030','test',2,'active',1000,100,2,86400,3600,'52000000-0000-4000-8000-000000000002','53000000-0000-4000-8000-000000000001','transaction-only fake proof');
insert into tongs.restricted_beta_policy_capabilities(id,policy_revision_id,capability_code,admission_mode,cost_evidence_revision_id,maximum_attempts,maximum_concurrency,per_operation_supplier_ceiling_micros,per_operation_supporting_ceiling_micros,per_operation_tail_ceiling_micros,permitted_callers_json,exact_model_or_sku,notes) values
('55000000-0000-4000-8000-000000000031','55000000-0000-4000-8000-000000000030','openai.text.hearth_research','covered','55000000-0000-4000-8000-000000000020',1,1,600,100,50,'["interactive","background","retry","recovery"]','fake-luna','fake'),
('55000000-0000-4000-8000-000000000032','55000000-0000-4000-8000-000000000030','fly.transcode','covered','55000000-0000-4000-8000-000000000021',1,1,200,50,25,'["background","recovery"]','fake-ffmpeg','fake'),
('55000000-0000-4000-8000-000000000033','55000000-0000-4000-8000-000000000030','brave.search','covered','55000000-0000-4000-8000-000000000022',1,1,10,0,0,'["interactive"]','fake-search','stale'),
('55000000-0000-4000-8000-000000000034','55000000-0000-4000-8000-000000000030','openai.image','block',null,null,null,null,null,null,'["interactive"]',null,'uncovered');

do $$ declare r jsonb; begin
 r:=tongs.reserve_restricted_beta_exposure('55000000-0000-4000-8000-000000000040','55000000-0000-4000-8000-000000000030','openai.image','blocked-operation','55000000-0000-4000-8000-000000000001','55000000-0000-4000-8000-000000000010',repeat('a',64),'image','verified_customer_deposit','opaque-blocked','real','interactive',100,50,0,0,0,0,60,'blocked-event');
 if r->>'reason'<>'capability_not_covered' then raise exception 'uncovered action was not blocked: %',r; end if;
 r:=tongs.reserve_restricted_beta_exposure('55000000-0000-4000-8000-000000000041','55000000-0000-4000-8000-000000000030','brave.search','stale-operation','55000000-0000-4000-8000-000000000001','55000000-0000-4000-8000-000000000010',repeat('b',64),'fake-search','verified_customer_deposit','opaque-stale','real','interactive',10,10,0,0,0,0,60,'stale-event');
 if r->>'reason'<>'cost_evidence_stale_or_incomplete' then raise exception 'stale evidence was not blocked: %',r; end if;
 r:=tongs.reserve_restricted_beta_exposure('55000000-0000-4000-8000-000000000042','55000000-0000-4000-8000-000000000030','openai.text.hearth_research','test-real-operation','55000000-0000-4000-8000-000000000001','55000000-0000-4000-8000-000000000010',repeat('c',64),'fake-luna','test_customer','opaque-test','real','interactive',750,600,100,50,0,0,60,'test-real-event');
 if r->>'reason'<>'test_funding_real_provider_forbidden' then raise exception 'Test funds could reach real provider: %',r; end if;
 r:=tongs.reserve_restricted_beta_exposure('55000000-0000-4000-8000-000000000043','55000000-0000-4000-8000-000000000030','openai.text.hearth_research','user-one-operation','55000000-0000-4000-8000-000000000001','55000000-0000-4000-8000-000000000010',repeat('d',64),'fake-luna','test_customer','opaque-one','simulated','interactive',750,600,100,50,0,0,60,'reserve-one');
 if coalesce((r->>'authorized')::boolean,false) is not true then raise exception 'first aggregate reservation failed: %',r; end if;
 r:=tongs.reserve_restricted_beta_exposure('55000000-0000-4000-8000-000000000044','55000000-0000-4000-8000-000000000030','fly.transcode','user-two-operation','55000000-0000-4000-8000-000000000002','55000000-0000-4000-8000-000000000010',repeat('e',64),'fake-ffmpeg','owner_operating_budget','opaque-two','simulated','background',275,200,0,0,0,0,60,'reserve-two');
 if r->>'reason'<>'aggregate_exposure_exhausted' then raise exception 'cross-user/route aggregate cap failed: %',r; end if;
 r:=tongs.reserve_restricted_beta_exposure('55000000-0000-4000-8000-000000000043','55000000-0000-4000-8000-000000000030','openai.text.hearth_research','user-one-operation','55000000-0000-4000-8000-000000000001','55000000-0000-4000-8000-000000000010',repeat('d',64),'fake-luna','test_customer','opaque-one','simulated','interactive',750,600,100,50,0,0,60,'reserve-one-replay');
 if coalesce((r->>'replay')::boolean,false) is not true then raise exception 'reservation replay duplicated'; end if;
 begin
  perform tongs.reserve_restricted_beta_exposure('55000000-0000-4000-8000-000000000045','55000000-0000-4000-8000-000000000030','openai.text.hearth_research','user-one-operation','55000000-0000-4000-8000-000000000001','55000000-0000-4000-8000-000000000010',repeat('f',64),'fake-luna','test_customer','opaque-one','simulated','interactive',750,600,100,50,0,0,60,'changed-input');
  raise exception 'changed input reused accepted operation';
 exception when invalid_parameter_value then null; end;
end $$;

do $$ declare r jsonb; begin
 r:=tongs.begin_restricted_beta_attempt('55000000-0000-4000-8000-000000000043','attempt-one',1::smallint,'background');
 if coalesce((r->>'authorized')::boolean,false) is not true then raise exception 'background attempt blocked: %',r; end if;
 r:=tongs.begin_restricted_beta_attempt('55000000-0000-4000-8000-000000000043','attempt-one',1::smallint,'background');
 if r->>'reason'<>'duplicate_attempt' then raise exception 'duplicate provider attempt was not blocked'; end if;
 r:=tongs.record_restricted_beta_exposure_outcome('55000000-0000-4000-8000-000000000043','ambiguous-one','ambiguous',300,null,0,300,'{"provider_reference":"unknown"}');
 r:=tongs.begin_restricted_beta_attempt('55000000-0000-4000-8000-000000000043','attempt-after-ambiguous',1::smallint,'recovery');
 if r->>'reason'<>'reconciliation_only' then raise exception 'ambiguous request could resubmit'; end if;
 r:=tongs.record_restricted_beta_exposure_outcome('55000000-0000-4000-8000-000000000043','relief-one','customer_relieved_supplier_obligation',null,null,-750,0,'{"customer_charge":0}');
 r:=tongs.record_restricted_beta_exposure_outcome('55000000-0000-4000-8000-000000000043','relief-one','customer_relieved_supplier_obligation',null,null,-750,0,'{}');
 if coalesce((r->>'replay')::boolean,false) is not true then raise exception 'duplicate relief event was not idempotent'; end if;
end $$;

reset role; set local request.jwt.claim.role='authenticated'; set local request.jwt.claim.sub='55000000-0000-4000-8000-000000000001'; set local role authenticated;
do $$ begin
 if has_table_privilege('authenticated','tongs.restricted_beta_exposure_holds','select') or has_table_privilege('authenticated','tongs.restricted_beta_cost_evidence_revisions','select') then raise exception 'private financial controls exposed'; end if;
 begin perform tongs.read_restricted_beta_financial_controls_admin(); raise exception 'customer read operator exposure'; exception when insufficient_privilege then null; end;
end $$;

reset role; set local request.jwt.claim.role='authenticated'; set local request.jwt.claim.sub='55000000-0000-4000-8000-000000000003'; set local role authenticated;
do $$ declare r jsonb; begin
 r:=tongs.read_restricted_beta_financial_controls_admin();
 if (r#>>'{exposure,supplier_obligations_micros}')::bigint<>300 or (r#>>'{exposure,forge_loss_micros}')::bigint<>300 or (r#>>'{exposure,customer_funding_micros}')::bigint<>0 then raise exception 'funding/supplier/loss separation failed: %',r; end if;
end $$;

rollback;
