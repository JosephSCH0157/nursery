-- Create a fresh, separately capped owner Hearth compatibility authorization
-- after a prior batch has closed. The already-approved post-day-30 storage
-- authorization is reused and is never duplicated by this retry path.
begin;

create or replace function tongs.activate_owner_hearth_compatibility_retry(
 p_owner_user_id uuid,p_workspace_id uuid,p_operator_user_id uuid,
 p_prior_authorization_id uuid,p_authorization_id uuid,p_budget_id uuid,
 p_tail_authorization_id uuid,p_reason text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare actor uuid:=p_operator_user_id; prior_auth tongs.owner_hearth_authorizations%rowtype;
 prior_event tongs.owner_hearth_authorization_events%rowtype; authrow tongs.owner_hearth_authorizations%rowtype;
 tail tongs.owner_hearth_tail_authorizations%rowtype; event_id uuid; auth_event uuid;
 markup_rules tongs.private_markup_rule_revisions%rowtype; spec record; price_id uuid; policy_id uuid;
begin
 if coalesce(auth.role(),'')<>'service_role' or actor is null or not tongs.is_platform_operator(actor)
    or p_owner_user_id is null or p_workspace_id is null or p_prior_authorization_id is null
    or p_authorization_id is null or p_budget_id is null or p_tail_authorization_id is null
    or length(btrim(coalesce(p_reason,'')))<3 then
  raise exception 'service-role platform operator retry activation required' using errcode='42501'; end if;
 if not exists(select 1 from tongs.owner_testing_principals where user_id=p_owner_user_id and status='enabled')
    or not exists(select 1 from tongs.workspace_members where user_id=p_owner_user_id and workspace_id=p_workspace_id) then
  raise exception 'explicit owner principal and workspace membership required' using errcode='42501'; end if;

 perform pg_advisory_xact_lock(hashtextextended('owner-hearth-activation:'||p_owner_user_id::text,0));
 select * into authrow from tongs.owner_hearth_authorizations where id=p_authorization_id;
 if found then
  if authrow.authorization_kind<>'compatibility_batch' or authrow.owner_user_id<>p_owner_user_id
     or authrow.workspace_id<>p_workspace_id or authrow.budget_id<>p_budget_id then
   raise exception 'owner Hearth retry replay conflict' using errcode='23505'; end if;
  return jsonb_build_object('authorization_id',authrow.id,'budget_id',authrow.budget_id,
   'tail_authorization_id',p_tail_authorization_id,'tail_allocation_reused',true,'replay',true);
 end if;

 select * into prior_auth from tongs.owner_hearth_authorizations where id=p_prior_authorization_id;
 select * into prior_event from tongs.owner_hearth_authorization_events
  where authorization_id=p_prior_authorization_id order by sequence desc limit 1;
 if prior_auth.authorization_kind<>'compatibility_batch' or prior_auth.owner_user_id<>p_owner_user_id
    or prior_auth.workspace_id<>p_workspace_id or prior_event.state<>'closed' then
  raise exception 'closed prior compatibility authorization required' using errcode='P0001'; end if;
 if exists(
  select 1 from tongs.owner_hearth_authorizations a
  join lateral(select e.state,e.expires_at from tongs.owner_hearth_authorization_events e
    where e.authorization_id=a.id order by e.sequence desc limit 1) latest on true
  where a.owner_user_id=p_owner_user_id and a.workspace_id=p_workspace_id
    and latest.state in ('active','dormant') and (latest.expires_at is null or latest.expires_at>now())
 ) then raise exception 'another owner Hearth authorization is already eligible' using errcode='P0001'; end if;

 select * into tail from tongs.owner_hearth_tail_authorizations where id=p_tail_authorization_id;
 if tail.id is null or tail.owner_user_id<>p_owner_user_id or tail.workspace_id<>p_workspace_id
    or tail.monthly_limit_micros<>20000 or tail.aggregate_limit_micros<>240000
    or tail.canonical_capacity_bytes<>134217728 or tail.evidence_capacity_bytes<>33554432
    or tail.replacement_rate_micros_per_mib_month<>123 or tail.coverage_months<>12 or not tail.no_renewal then
  raise exception 'exact existing owner Hearth tail authorization required' using errcode='P0001'; end if;
 if not exists(select 1 from tongs.owner_hearth_tail_events e where e.tail_authorization_id=tail.id
   and e.event_type='authorized' and e.amount_micros=240000
   and coalesce((e.evidence_json->>'first_30_days_excluded')::boolean,false)) then
  raise exception 'non-overlapping existing tail allocation evidence required' using errcode='P0001'; end if;

 select * into markup_rules from tongs.private_markup_rule_revisions order by revision desc limit 1;
 if markup_rules.id is null or markup_rules.default_markup_basis_points<>3300 then
  raise exception 'private 33 percent default markup revision required' using errcode='P0001'; end if;

 event_id:=gen_random_uuid();
 perform tongs._create_accounting_event(event_id,'owner-hearth-compat-retry-budget:'||p_budget_id::text,
  'owner_operating_budget_created','owner_internal','owner_operating_budget',p_budget_id::text,'USD',
  p_owner_user_id,p_workspace_id,actor,jsonb_build_object('maximum_amount_micros',90000,'customer_revenue_micros',0,
   'prior_authorization_id',p_prior_authorization_id,'tail_authorization_id',tail.id,'tail_allocation_reused',true,'reason',p_reason),now());
 insert into tongs.owner_operating_budgets(id,environment,workspace_id,provider,route,sku,currency,period_start,period_end,created_by,owner_testing_user_id)
 values(p_budget_id,'production',p_workspace_id,'openai','hearth.chat_completion',null,'USD',now(),now()+interval '24 hours',actor,p_owner_user_id);
 insert into tongs.owner_operating_budget_revisions(budget_id,revision,status,maximum_amount_micros,reason,actor_id,journal_event_id)
 values(p_budget_id,1,'active',90000,p_reason,actor,event_id);
 insert into tongs.owner_hearth_authorizations(id,authorization_kind,owner_user_id,workspace_id,budget_id,maximum_amount_micros,
  maximum_operations,maximum_concurrency,maximum_attempts,failure_loss_limit_micros,duration_seconds,created_by,created_at)
 values(p_authorization_id,'compatibility_batch',p_owner_user_id,p_workspace_id,p_budget_id,90000,5,1,1,90000,86400,actor,clock_timestamp());
 auth_event:=gen_random_uuid();
 insert into tongs.owner_hearth_authorization_events(id,authorization_id,sequence,event_key,state,started_at,expires_at,reason,evidence_json)
 values(auth_event,p_authorization_id,1,'owner-hearth-compat-retry:'||p_authorization_id::text||':active','active',now(),now()+interval '24 hours',p_reason,
  jsonb_build_object('maximum_provider_calls',5,'aggregate_cap_micros',90000,'prompt','Reply with exactly: Ready.',
   'concurrency',1,'prior_authorization_id',p_prior_authorization_id,'tail_authorization_id',tail.id,'tail_allocation_reused',true));

 for spec in select * from (values
  (1,'gpt-6-astra','GPT-6 Astra','81000000-0000-4000-8000-000000000001'::uuid,30919::bigint),
  (2,'gpt-5.6-sol','GPT-5.6 Sol','81000000-0000-4000-8000-000000000002'::uuid,13243::bigint),
  (3,'gpt-5.6-terra','GPT-5.6 Terra','81000000-0000-4000-8000-000000000003'::uuid,8379::bigint),
  (4,'gpt-5.4-mini-2026-03-17','GPT-5.4 Mini','81000000-0000-4000-8000-000000000004'::uuid,4062::bigint),
  (5,'gpt-5.6-luna','GPT-5.6 Luna','81000000-0000-4000-8000-000000000005'::uuid,2151::bigint)
 ) v(ordinal,model_id,display_name,cost_id,max_exposure)
 loop
  policy_id:=extensions.uuid_generate_v5(p_authorization_id,'pricing-policy:'||spec.model_id);
  price_id:=extensions.uuid_generate_v5(p_authorization_id,'pricing-revision:'||spec.model_id);
  insert into tongs.private_pricing_policies(id,policy_code,scope_kind,provider,sku,created_by)
  values(policy_id,'owner-hearth-compat-retry-'||left(replace(p_authorization_id::text,'-',''),12)||'-'||spec.ordinal,
   'sku','openai','owner-hearth-compat-retry:'||p_authorization_id::text||':'||spec.model_id,actor);
  insert into tongs.private_pricing_revisions(id,policy_id,revision,lifecycle_state,currency,markup_basis_points,
   full_cost_ceiling_micros,failure_cost_ceiling_micros,customer_price_ceiling_micros,billable_failure_ceiling_micros,
   customer_credit_units,billable_failure_classes,free_failure_classes,included_quantity,retention_policy,change_reason,content_hash,actor_id)
  select price_id,policy_id,1,'review_ready','USD',3300,c.full_cost_ceiling_micros,c.full_cost_ceiling_micros,
   ((c.full_cost_ceiling_micros*133+999999)/1000000)*10000,0,0,'[]'::jsonb,
   '["provider_failure","forge_failure","forge_validation_failure","persistence_failure","unknown_fault"]'::jsonb,
   jsonb_build_object('input_tokens',c.maximum_input_units,'output_tokens',c.maximum_output_units,'attempts',1),
   jsonb_build_object('first_30_days','included_in_supporting_allocation','post_day_30','existing_owner_tail_authorization',
    'tail_authorization_id',tail.id),
   'Private owner compatibility retry basis; no customer price publication and no duplicate tail allocation.',
   encode(extensions.digest(convert_to(p_authorization_id::text||':'||spec.model_id||':3300:'||c.full_cost_ceiling_micros::text,'utf8'),'sha256'),'hex'),actor
  from tongs.openai_text_cost_policy_revisions c where c.id=spec.cost_id;
  insert into tongs.owner_hearth_model_terms(authorization_id,ordinal,provider_model_id,display_name,cost_policy_revision_id,
   pricing_revision_id,aggregate_policy_revision_id,maximum_exposure_micros)
  values(p_authorization_id,spec.ordinal,spec.model_id,spec.display_name,spec.cost_id,price_id,
   extensions.uuid_generate_v5('83000000-0000-4000-8000-000000000000'::uuid,'compatibility:'||spec.model_id),spec.max_exposure);
 end loop;
 return jsonb_build_object('authorization_id',p_authorization_id,'prior_authorization_id',p_prior_authorization_id,
  'budget_id',p_budget_id,'tail_authorization_id',tail.id,'tail_allocation_reused',true,
  'maximum_amount_micros',90000,'admitted_total_micros',58754,'replay',false);
end $$;

revoke all on function tongs.activate_owner_hearth_compatibility_retry(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text)
 from public,anon,authenticated;
grant execute on function tongs.activate_owner_hearth_compatibility_retry(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text)
 to service_role;

comment on function tongs.activate_owner_hearth_compatibility_retry(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text) is
 'Creates a fresh five-call/$0.09 owner compatibility authorization after a closed batch while reusing the exact existing $0.24 non-overlapping tail authorization.';

notify pgrst,'reload schema';
commit;
