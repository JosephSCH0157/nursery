-- INACTIVE, CHECKSUM-BOUND RELEASE-CANDIDATE INPUT.
-- This file is outside supabase/migrations and always rolls back. It must not
-- be executed against production or promoted without separate owner approval
-- for the migration, credentials, $21.526788 budget, paid canary, and activation.
\set ON_ERROR_STOP on

-- Required psql variables at a future, separately approved promotion:
-- owner_user_id, operator_user_id, workspace_id, budget_id,
-- canary_authorization_id, session_authorization_id, storage_allowance_id,
-- verified_model_terms (JSON array), storage_evidence (JSON object), reason.

begin;

do $$
declare proposal tongs.owner_hearth_research_activation_proposals%rowtype;
begin
  select * into proposal from tongs.owner_hearth_research_activation_proposals
   where id='91000000-0000-4000-8000-000000000001';
  if proposal.lifecycle_state<>'proposed'
    or proposal.maximum_owner_authorization_micros<>21526788
    or proposal.proposed_shared_aggregate_ceiling_micros<>32366821
    or proposal.canary_execution_micros<>136456
    or proposal.creator_session_execution_micros<>21306560
    or proposal.storage_and_recovery_micros<>83772 then
    raise exception 'owner research proposal identity or arithmetic mismatch';
  end if;
  raise exception 'INACTIVE RELEASE CANDIDATE: transaction one requires separate owner activation approval';
end $$;

-- Transaction one, reachable only after a separately approved promotion
-- removes the guard above in a new reviewed commit.
insert into tongs.owner_hearth_research_proposal_events(
 id,proposal_id,sequence,event_key,event_type,actor_id,evidence_json
) values(
 gen_random_uuid(),'91000000-0000-4000-8000-000000000001',1,
 'owner-hearth-research-v1:approved','approved',:'operator_user_id'::uuid,
 jsonb_build_object('owner_authorization_micros',21526788,'shared_aggregate_ceiling_micros',32366821,
  'storage_evidence',:'storage_evidence'::jsonb,'reason',:'reason')
);

do $$ begin
 if not exists(select 1 from tongs.owner_testing_principals where user_id=:'owner_user_id'::uuid and status='enabled')
  or not exists(select 1 from tongs.workspace_members where workspace_id=:'workspace_id'::uuid and user_id=:'owner_user_id'::uuid)
  then raise exception 'explicit owner principal and workspace membership required'; end if;
 if coalesce(:'storage_evidence'::jsonb->>'status','')<>'verified'
  or (:'storage_evidence'::jsonb->>'maximum_amount_micros')::bigint<>83772
  or (:'storage_evidence'::jsonb->>'maximum_packages')::int<>11
  or (:'storage_evidence'::jsonb->>'maximum_recovery_reads_per_package')::int<>20
  then raise exception 'verified storage, execution, database-write, delivery, and recovery evidence required'; end if;
 if jsonb_typeof(:'verified_model_terms'::jsonb)<>'array' or jsonb_array_length(:'verified_model_terms'::jsonb)<>5
  or (select count(*) from jsonb_array_elements(:'verified_model_terms'::jsonb) x
      join (values
       ('gpt-6-astra',10000000::bigint,50000000::bigint,2099200::bigint),
       ('gpt-5.6-sol',4000000,20000000,839680),
       ('gpt-5.6-terra',2000000,12000000,452608),
       ('gpt-5.4-mini-2026-03-17',750000,4500000,169728),
       ('gpt-5.6-luna',200000,1200000,45261)
      ) expected(model_id,input_rate,output_rate,direct_ceiling)
      on expected.model_id=x->>'provider_model_id'
       and expected.input_rate=(x->>'input_micros_per_million_tokens')::bigint
       and expected.output_rate=(x->>'output_micros_per_million_tokens')::bigint
       and expected.direct_ceiling=(x->>'session_direct_ceiling_micros')::bigint)<>5
  then raise exception 'five exact verified model, pricing, and aggregate terms required'; end if;
end $$;

-- Each exact model receives its own immutable policy revision and capability
-- term, but _restricted_beta_policy_commitment accounts across all production
-- revisions. Every revision therefore enforces the same one shared ceiling.
insert into tongs.restricted_beta_policy_revisions(
 id,environment,revision,lifecycle_state,aggregate_forge_exposure_limit_micros,reserved_headroom_micros,
 maximum_concurrency,rolling_window_seconds,evidence_max_age_seconds,allocation_policy_revision_id,tail_policy_revision_id,reason
) select
 (x->>'aggregate_policy_revision_id')::uuid,'production',(x->>'aggregate_policy_revision')::int,'active',32366821,
 0,1,86400,86400,(x->>'allocation_policy_revision_id')::uuid,(x->>'tail_policy_revision_id')::uuid,:'reason'
from jsonb_array_elements(:'verified_model_terms'::jsonb) x;

insert into tongs.restricted_beta_policy_capabilities(
 id,policy_revision_id,capability_code,admission_mode,cost_evidence_revision_id,maximum_attempts,maximum_concurrency,
 per_operation_supplier_ceiling_micros,per_operation_supporting_ceiling_micros,per_operation_tail_ceiling_micros,
 permitted_callers_json,exact_model_or_sku,notes
) select
 extensions.uuid_generate_v5((x->>'aggregate_policy_revision_id')::uuid,'openai.text.hearth_research'),
 (x->>'aggregate_policy_revision_id')::uuid,'openai.text.hearth_research','covered',(x->>'aggregate_cost_evidence_revision_id')::uuid,
 1,1,(x->>'session_direct_ceiling_micros')::bigint,37072,0,'["interactive","recovery"]'::jsonb,x->>'provider_model_id',:'reason'
from jsonb_array_elements(:'verified_model_terms'::jsonb) x;

insert into tongs.paid_execution_aggregate_assignments(
 id,policy_revision_id,user_id,workspace_id,state,valid_from,valid_until,reason
) select
 (x->>'aggregate_assignment_id')::uuid,(x->>'aggregate_policy_revision_id')::uuid,:'owner_user_id'::uuid,:'workspace_id'::uuid,
 'active',now(),now()+interval '366 days',:'reason'
from jsonb_array_elements(:'verified_model_terms'::jsonb) x;

do $$ declare journal_id uuid:=gen_random_uuid(); begin
 perform tongs._create_accounting_event(journal_id,'owner-hearth-research-budget:'||:'budget_id',
  'owner_operating_budget_created','owner_internal','owner_operating_budget',:'budget_id','USD',
  :'owner_user_id'::uuid,:'workspace_id'::uuid,:'operator_user_id'::uuid,
  jsonb_build_object('maximum_amount_micros',21526788,'customer_revenue_micros',0,'reason',:'reason'),now());
 insert into tongs.owner_operating_budgets(
  id,environment,workspace_id,provider,route,sku,currency,period_start,period_end,created_by,owner_testing_user_id
 ) values(
  :'budget_id'::uuid,'production',:'workspace_id'::uuid,'openai','hearth.research_synthesis',null,'USD',now(),
  now()+interval '366 days',:'operator_user_id'::uuid,:'owner_user_id'::uuid
 );
 insert into tongs.owner_operating_budget_revisions(budget_id,revision,status,maximum_amount_micros,reason,actor_id,journal_event_id)
 values(:'budget_id'::uuid,1,'active',21526788,:'reason',:'operator_user_id'::uuid,journal_id);
end $$;

insert into tongs.owner_hearth_research_storage_allowances(
 id,proposal_id,owner_user_id,workspace_id,budget_id,maximum_amount_micros,maximum_packages,
 maximum_recovery_reads_per_package,rate_evidence_status,evidence_json,created_by
) values(
 :'storage_allowance_id'::uuid,'91000000-0000-4000-8000-000000000001',:'owner_user_id'::uuid,:'workspace_id'::uuid,
 :'budget_id'::uuid,83772,11,20,'verified',:'storage_evidence'::jsonb,:'operator_user_id'::uuid
);

insert into tongs.owner_hearth_research_authorizations(
 id,proposal_id,authorization_kind,limit_profile,owner_user_id,workspace_id,budget_id,maximum_amount_micros,
 maximum_operations,maximum_concurrency,maximum_attempts,maximum_searches,maximum_sources,maximum_http_attempts,
 maximum_input_tokens,maximum_output_tokens,failure_loss_limit_micros,duration_seconds,created_by
) values(
 :'canary_authorization_id'::uuid,'91000000-0000-4000-8000-000000000001','canary','canary',
 :'owner_user_id'::uuid,:'workspace_id'::uuid,:'budget_id'::uuid,144072,1,1,1,1,2,24,8000,1000,144072,86400,:'operator_user_id'::uuid
);
insert into tongs.owner_hearth_research_authorization_events(
 id,authorization_id,sequence,event_key,state,started_at,expires_at,reason,evidence_json
) values(
 gen_random_uuid(),:'canary_authorization_id'::uuid,1,'owner-hearth-research-canary:'||:'canary_authorization_id'||':active',
 'active',now(),now()+interval '24 hours',:'reason',
 '{"model":"gpt-6-astra","input_tokens":8000,"output_tokens":1000,"searches":1,"sources":2,"http_attempts":24,"provider_attempts":1,"customer_charge_micros":0}'::jsonb
);

insert into tongs.owner_hearth_research_model_terms(
 authorization_id,ordinal,provider_model_id,display_name,cost_policy_revision_id,pricing_revision_id,aggregate_policy_revision_id,
 direct_provider_ceiling_micros,input_micros_per_million_tokens,output_micros_per_million_tokens,evidence_status,evidence_json
)
select :'canary_authorization_id'::uuid,1,'gpt-6-astra','GPT-6 Astra',
 (x->>'cost_policy_revision_id')::uuid,(x->>'pricing_revision_id')::uuid,(x->>'aggregate_policy_revision_id')::uuid,
 130000,10000000,50000000,'verified',x
from jsonb_array_elements(:'verified_model_terms'::jsonb) x
where x->>'provider_model_id'='gpt-6-astra'
  and (x->>'input_micros_per_million_tokens')::bigint=10000000
  and (x->>'output_micros_per_million_tokens')::bigint=50000000;

do $$ begin
 if (select count(*) from tongs.owner_hearth_research_model_terms where authorization_id=:'canary_authorization_id'::uuid)<>1
  then raise exception 'verified Astra canary term required'; end if;
end $$;

rollback;

-- TRANSACTION TWO: separate later approval after the paid canary. This block
-- is also unconditionally inert and rolls back.
begin;

do $$ declare reconciliation jsonb; begin
 reconciliation:=tongs.read_owner_hearth_research_canary_reconciliation(:'canary_authorization_id'::uuid);
 if coalesce((reconciliation->>'reconciled')::boolean,false) is not true
  then raise exception 'reconciled canary required: %',reconciliation; end if;
 raise exception 'INACTIVE RELEASE CANDIDATE: transaction two requires separate owner session approval';
end $$;

insert into tongs.owner_hearth_research_authorization_events(
 id,authorization_id,sequence,event_key,state,reason,evidence_json
)
select gen_random_uuid(),:'canary_authorization_id'::uuid,coalesce(max(sequence),0)+1,
 'owner-hearth-research-canary:'||:'canary_authorization_id'||':closed','closed',:'reason',
 jsonb_build_object('reconciliation',tongs.read_owner_hearth_research_canary_reconciliation(:'canary_authorization_id'::uuid))
from tongs.owner_hearth_research_authorization_events where authorization_id=:'canary_authorization_id'::uuid;

insert into tongs.owner_hearth_research_authorizations(
 id,proposal_id,authorization_kind,limit_profile,owner_user_id,workspace_id,budget_id,maximum_amount_micros,
 maximum_operations,maximum_concurrency,maximum_attempts,maximum_searches,maximum_sources,maximum_http_attempts,
 maximum_input_tokens,maximum_output_tokens,failure_loss_limit_micros,duration_seconds,created_by
) values(
 :'session_authorization_id'::uuid,'91000000-0000-4000-8000-000000000001','creator_session','creator_session',
 :'owner_user_id'::uuid,:'workspace_id'::uuid,:'budget_id'::uuid,21382716,10,1,1,6,6,24,128000,16384,4276544,86400,:'operator_user_id'::uuid
);
insert into tongs.owner_hearth_research_authorization_events(
 id,authorization_id,sequence,event_key,state,reason,evidence_json
) values(
 gen_random_uuid(),:'session_authorization_id'::uuid,1,'owner-hearth-research-session:'||:'session_authorization_id'||':dormant',
 'dormant',:'reason',
 '{"starts_on_first_accepted_operation":true,"maximum_operations":10,"maximum_concurrency":1,"maximum_attempts":1,"failure_loss_limit_micros":4276544,"automatic_renewal":false}'::jsonb
);

insert into tongs.owner_hearth_research_model_terms(
 authorization_id,ordinal,provider_model_id,display_name,cost_policy_revision_id,pricing_revision_id,aggregate_policy_revision_id,
 direct_provider_ceiling_micros,input_micros_per_million_tokens,output_micros_per_million_tokens,evidence_status,evidence_json
)
select :'session_authorization_id'::uuid,
 case x->>'provider_model_id' when 'gpt-6-astra' then 1 when 'gpt-5.6-sol' then 2 when 'gpt-5.6-terra' then 3
  when 'gpt-5.4-mini-2026-03-17' then 4 when 'gpt-5.6-luna' then 5 end,
 x->>'provider_model_id',x->>'display_name',(x->>'cost_policy_revision_id')::uuid,(x->>'pricing_revision_id')::uuid,
 (x->>'aggregate_policy_revision_id')::uuid,(x->>'session_direct_ceiling_micros')::bigint,
 (x->>'input_micros_per_million_tokens')::bigint,(x->>'output_micros_per_million_tokens')::bigint,'verified',x
from jsonb_array_elements(:'verified_model_terms'::jsonb) x;

do $$ begin
 if (select count(*) from tongs.owner_hearth_research_model_terms where authorization_id=:'session_authorization_id'::uuid)<>5
  then raise exception 'all five exact session model terms required'; end if;
 if exists(select 1 from tongs.owner_hearth_authorization_events where authorization_id in(
   select id from tongs.owner_hearth_authorizations where owner_user_id=:'owner_user_id'::uuid and workspace_id=:'workspace_id'::uuid
  ) and created_at>=transaction_timestamp())
  then raise exception 'owner chat authorization must remain unchanged'; end if;
end $$;

rollback;
