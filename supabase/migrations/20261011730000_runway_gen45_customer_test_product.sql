-- One exact normal-customer Test activation for Runway Gen-4.5 text-to-video.
-- Live, Owner, BYO, reference-image generation, and all other Runway SKUs remain inactive.
begin;

do $$
begin
  if exists(select 1 from supabase_migrations.schema_migrations where version>'20261011720000') then
    raise exception '20261011730000 must remain the next migration after 20261011720000';
  end if;
  if (select lifecycle_state from tongs.financial_environment_configuration_revisions
      where environment='live' order by revision desc limit 1)<>'inactive_ready' then
    raise exception 'Live must remain inactive-ready';
  end if;
  if (select mode from tongs._current_runway_execution_rollout())<>'enforce' then
    raise exception 'existing Runway paid-execution boundary must be enforced';
  end if;
  if not exists(select 1 from tongs.private_pricing_policies
    where scope_kind='sku' and lower(provider)='runway'
      and lower(sku)='gen4.5:5s:1280:720') then
    raise exception 'historical Runway SKU policy is unavailable';
  end if;
end $$;

-- Current official evidence captured from the Runway API documentation on
-- 2026-09-25. The HTML hashes identify the exact evidence snapshots reviewed.
insert into tongs.restricted_beta_cost_evidence_revisions(
  id,capability_code,revision,evidence_state,coverage_state,source_reference,
  observed_at,valid_until,included_capacity_json,reserved_headroom_json,
  hard_cap_scope,notes
) values (
  '19730000-0000-4000-8000-000000000001','runway.video',2,
  'verified_rate','complete',
  'https://docs.dev.runwayml.com/guides/pricing/',
  '2026-09-25T01:59:07.800099Z','2026-10-25T01:59:07.800099Z',
  '{"model":"gen4.5","generation_mode":"text_to_video","duration_seconds":5,"ratio":"1280:720","outputs":1,"reference_images":0,"provider_attempts":1,"runway_credits_per_second":12,"runway_credit_usd":"0.01","runway_credits":60,"direct_provider_ceiling_micros":600000,"pricing_page_sha256":"275da36ecddfa209869409c42a83255ebfad560675a0d76f6f9d05076fe0db86"}',
  '{"supporting_cost_ceiling_micros":0,"application_compute":{"classification":"C","micros":0},"storage_retention":{"classification":"D","micros":0},"delivery_egress":{"classification":"D","micros":0},"database_observability":{"classification":"C","micros":0},"contingency":{"classification":"D","micros":0},"task_failures_url":"https://docs.dev.runwayml.com/errors/task-failures/","task_failures_page_sha256":"a17a915d583e4748baea30893316a8e62b4f0d5d148a840d5864dc067da75b91"}',
  'One exact Gen-4.5 5-second 1280x720 text-to-video attempt with no references',
  'Direct cost: 5 seconds x 12 Runway credits/second x $0.01 = $0.60. No attributable bounded supporting supplier cost is admitted. Because Runway documents a non-refunded safety-input failure and does not guarantee a refund for every submitted failure, the conservative post-submission failure ceiling is the full 600000 micros.'
);

do $$
declare
  actor uuid;
  v_policy_id uuid;
  old_revision tongs.private_pricing_revisions%rowtype;
  markup_source uuid;
begin
  select user_id into actor from tongs.platform_operators order by granted_at limit 1;
  if actor is null then raise exception 'platform operator required'; end if;
  select policy.id into v_policy_id from tongs.private_pricing_policies policy
  where scope_kind='sku' and lower(provider)='runway'
    and lower(sku)='gen4.5:5s:1280:720';
  select * into old_revision from tongs.private_pricing_revisions
  where private_pricing_revisions.policy_id=v_policy_id order by revision desc limit 1;
  if old_revision.id is null or old_revision.revision<>1
     or old_revision.lifecycle_state<>'draft'
     or old_revision.full_cost_ceiling_micros<>750000 then
    raise exception 'historical owner-pilot Runway revision changed; explicit review required';
  end if;
  select rules.id into markup_source
  from tongs.private_markup_rule_revisions rules
  where rules.default_markup_basis_points=3300
  order by rules.revision desc limit 1;
  if markup_source is null then raise exception 'canonical 33-percent markup source unavailable'; end if;

  insert into tongs.private_pricing_revisions(
    id,policy_id,revision,previous_revision_id,lifecycle_state,currency,
    markup_basis_points,full_cost_ceiling_micros,failure_cost_ceiling_micros,
    customer_price_ceiling_micros,billable_failure_ceiling_micros,
    customer_credit_units,billable_failure_classes,free_failure_classes,
    included_quantity,retention_policy,change_reason,content_hash,actor_id,
    unrounded_customer_price_micros,rounding_adjustment_micros,
    settled_customer_price_micros
  ) values (
    '19730000-0000-4000-8000-000000000002',v_policy_id,2,old_revision.id,
    'review_ready','USD',3300,600000,600000,800000,0,160,'[]',
    '["pre_provider_rejection","provider_rejection","provider_failure","forge_failure","validation_failure","persistence_failure","submission_unknown","download_failure"]',
    '{"model":"gen4.5","generation_mode":"text_to_video","duration_seconds":5,"ratio":"1280:720","outputs":1,"reference_images":0,"provider_attempts":1}',
    '{"canonical_video":"restricted_immutable","provider_task_receipt":"restricted_immutable","cost_reconciliation":"required_after_submission"}',
    'Current Runway direct-only basis. 600000 micros wholesale; 798000-micro 33-percent target; 160 Forge Credits settle to 800000 micros. Customer failure charge is zero.',
    encode(extensions.digest(convert_to('runway-gen45-customer-test-v2:600000:600000:798000:800000:160:zero-failure-charge','utf8'),'sha256'),'hex'),
    actor,798000,2000,800000
  );
  insert into tongs.private_pricing_cost_components(
    pricing_revision_id,ordinal,component_code,component_kind,
    credential_funding,provider_label,success_ceiling_micros,
    failure_ceiling_micros,cost_policy_revision,tail_policy,
    tail_policy_details
  ) values
    ('19730000-0000-4000-8000-000000000002',1,'runway_gen45_5s','direct_provider','forge','Runway',600000,600000,
      'Runway API pricing checked 2026-09-25; evidence 19730000-0000-4000-8000-000000000001','none',
      '{"calculation":"5 seconds x 12 credits/second x 0.01 USD/credit","pricing_page_sha256":"275da36ecddfa209869409c42a83255ebfad560675a0d76f6f9d05076fe0db86","failure_evidence_sha256":"a17a915d583e4748baea30893316a8e62b4f0d5d148a840d5864dc067da75b91"}'),
    ('19730000-0000-4000-8000-000000000002',2,'application_compute','compute','forge','Forge platform',0,0,
      'Gate 1B classification C: fixed platform overhead','plan_funded','{"classification":"C","admitted_to_wholesale":false}'),
    ('19730000-0000-4000-8000-000000000002',3,'storage_retention','storage','forge','Forge platform',0,0,
      'Gate 1B classification D: no bounded operation-specific rate evidence','plan_funded','{"classification":"D","admitted_to_wholesale":false}'),
    ('19730000-0000-4000-8000-000000000002',4,'delivery_egress','bandwidth_egress','forge','Forge platform',0,0,
      'Gate 1B classification D: no bounded operation-specific rate evidence','plan_funded','{"classification":"D","admitted_to_wholesale":false}'),
    ('19730000-0000-4000-8000-000000000002',5,'database_observability','compute','forge','Forge platform',0,0,
      'Gate 1B classification C: fixed platform overhead','plan_funded','{"classification":"C","admitted_to_wholesale":false}'),
    ('19730000-0000-4000-8000-000000000002',6,'supporting_contingency','contingency','forge','Forge platform',0,0,
      'Gate 1B classification D: contingency is not a supplier expense','none','{"classification":"D","admitted_to_wholesale":false}');
  insert into tongs.private_pricing_revision_markup_sources(
    pricing_revision_id,markup_rule_revision_id,effective_markup_basis_points
  ) values('19730000-0000-4000-8000-000000000002',markup_source,3300);
  insert into tongs.private_pricing_publications(
    id,policy_id,pricing_revision_id,publication_revision,action,reason,actor_id
  ) values(
    '19730000-0000-4000-8000-000000000003',v_policy_id,
    '19730000-0000-4000-8000-000000000002',1,'published',
    'Publish only the current complete normal-customer Test SKU; historical owner-pilot revision 1 remains unpublished.',actor
  );
end $$;

-- Exact, immutable one-operation normal-customer Test authority.
create table tongs.runway_customer_test_authorizations(
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete restrict,
  workspace_id uuid not null references tongs.workspaces(id) on delete restrict,
  financial_environment text not null check(financial_environment='test'),
  route_code text not null check(route_code='tongs_broll_v2'),
  provider text not null check(provider='runway'),
  model text not null check(model='gen4.5'),
  generation_mode text not null check(generation_mode='text_to_video'),
  duration_seconds integer not null check(duration_seconds=5),
  ratio text not null check(ratio='1280:720'),
  output_count integer not null check(output_count=1),
  reference_image_count integer not null check(reference_image_count=0),
  maximum_provider_attempts integer not null check(maximum_provider_attempts=1),
  pricing_revision_id uuid not null references tongs.private_pricing_revisions(id) on delete restrict,
  operation_id text not null unique,
  operation_fingerprint text not null unique check(operation_fingerprint~'^[0-9a-f]{64}$'),
  maximum_operation_count integer not null check(maximum_operation_count=1),
  maximum_customer_charge_micros bigint not null check(maximum_customer_charge_micros=800000),
  maximum_wholesale_exposure_micros bigint not null check(maximum_wholesale_exposure_micros=600000),
  maximum_concurrency integer not null check(maximum_concurrency=1),
  valid_from timestamptz not null,
  valid_until timestamptz not null check(valid_until>valid_from),
  status text not null check(status in('active','closed')),
  reason text not null check(nullif(btrim(reason),'') is not null),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create table tongs.runway_customer_test_quote_bindings(
  authorization_id uuid primary key references tongs.runway_customer_test_authorizations(id) on delete restrict,
  quote_id uuid not null unique references tongs.customer_spending_quotes(id) on delete restrict,
  created_at timestamptz not null default now()
);
alter table tongs.funding_reservations
  add column runway_test_authorization_id uuid
  references tongs.runway_customer_test_authorizations(id) on delete restrict;

do $$ declare n text; begin
  foreach n in array array['runway_customer_test_authorizations','runway_customer_test_quote_bindings'] loop
    execute format('alter table tongs.%I enable row level security',n);
    execute format('alter table tongs.%I force row level security',n);
    execute format('revoke all on tongs.%I from public,anon,authenticated,service_role',n);
    execute format('grant select on tongs.%I to service_role',n);
    execute format('create trigger %I_immutable before update or delete on tongs.%I for each row execute function tongs._reject_accounting_mutation()',n,n);
  end loop;
end $$;

create or replace function tongs.activate_runway_gen45_customer_test(
  p_authorization_id uuid,p_actor_id uuid,p_user_id uuid,p_workspace_id uuid,
  p_operation_id text,p_operation_fingerprint text,p_valid_until timestamptz,
  p_reason text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  op tongs.broll_operation_receipts%rowtype;
  existing tongs.runway_customer_test_authorizations%rowtype;
  assignment tongs.paid_execution_aggregate_assignments%rowtype;
begin
  perform tongs._require_pricing_service_role();
  if p_actor_id is null or not tongs.is_platform_operator(p_actor_id)
     or p_authorization_id is null or p_user_id is null or p_workspace_id is null
     or nullif(btrim(coalesce(p_operation_id,'')),'') is null
     or p_operation_fingerprint!~'^[0-9a-f]{64}$'
     or p_valid_until<=clock_timestamp()
     or p_valid_until>clock_timestamp()+interval '24 hours'
     or nullif(btrim(coalesce(p_reason,'')),'') is null then
    raise exception 'invalid bounded Runway customer Test activation' using errcode='22023';
  end if;
  select * into existing from tongs.runway_customer_test_authorizations where id=p_authorization_id;
  if found then
    if existing.user_id<>p_user_id or existing.workspace_id<>p_workspace_id
       or existing.operation_id<>btrim(p_operation_id)
       or existing.operation_fingerprint<>lower(p_operation_fingerprint)
       or existing.valid_until<>p_valid_until then
      raise exception 'Runway customer Test activation replay conflict' using errcode='23505';
    end if;
    return to_jsonb(existing)||jsonb_build_object('replay',true);
  end if;
  select * into op from tongs.broll_operation_receipts
  where operation_id=btrim(p_operation_id) for update;
  if op.operation_id is null
     or op.operation_fingerprint<>lower(p_operation_fingerprint)
     or op.workspace_id<>p_workspace_id or op.created_by<>p_user_id
     or op.operation_type<>'candidate_acquire' or op.state<>'pending'
     or op.provider_task_id is not null or op.submission_attempt_id is not null
     or op.normalized_inputs_json->>'source_kind'<>'generated'
     or op.normalized_inputs_json->>'runway_model'<>'gen4.5'
     or (op.normalized_inputs_json->>'duration_seconds')::integer<>5
     or op.normalized_inputs_json->>'ratio'<>'1280:720'
     or jsonb_typeof(op.normalized_inputs_json->'reference_images')<>'array'
     or jsonb_array_length(op.normalized_inputs_json->'reference_images')<>0
     or length(coalesce(op.normalized_inputs_json->>'final_prompt','')) not between 1 and 1000 then
    raise exception 'exact pending zero-reference Runway operation required' using errcode='42501';
  end if;
  if not exists(select 1 from tongs.workspace_members
    where workspace_id=p_workspace_id and user_id=p_user_id) and not exists(
    select 1 from tongs.workspaces where id=p_workspace_id and created_by=p_user_id
  ) then raise exception 'customer cannot access designated workspace' using errcode='42501'; end if;

  insert into tongs.runway_customer_test_authorizations(
    id,user_id,workspace_id,financial_environment,route_code,provider,model,
    generation_mode,duration_seconds,ratio,output_count,reference_image_count,
    maximum_provider_attempts,pricing_revision_id,operation_id,
    operation_fingerprint,maximum_operation_count,
    maximum_customer_charge_micros,maximum_wholesale_exposure_micros,
    maximum_concurrency,valid_from,valid_until,status,reason,created_by
  ) values(
    p_authorization_id,p_user_id,p_workspace_id,'test','tongs_broll_v2','runway','gen4.5',
    'text_to_video',5,'1280:720',1,0,1,
    '19730000-0000-4000-8000-000000000002',btrim(p_operation_id),
    lower(p_operation_fingerprint),1,800000,600000,1,clock_timestamp(),
    p_valid_until,'active',btrim(p_reason),p_actor_id
  ) returning * into existing;
  insert into tongs.paid_execution_aggregate_assignments(
    id,policy_revision_id,user_id,workspace_id,state,valid_from,valid_until,reason
  ) values(
    extensions.uuid_generate_v5(p_authorization_id,'aggregate-assignment'),
    '19730000-0000-4000-8000-000000000005',p_user_id,p_workspace_id,
    'active',existing.valid_from,existing.valid_until,
    'Exact one-operation normal-customer Test Runway Gen-4.5 exposure assignment.'
  ) returning * into assignment;
  return to_jsonb(existing)||jsonb_build_object('replay',false,'aggregate_assignment_id',assignment.id);
end $$;

-- One active Test aggregate policy. Nothing is assigned until the exact
-- activation function validates the durable pending operation.
insert into tongs.restricted_beta_policy_revisions(
  id,environment,revision,lifecycle_state,aggregate_forge_exposure_limit_micros,
  reserved_headroom_micros,maximum_concurrency,rolling_window_seconds,
  evidence_max_age_seconds,reason
) select '19730000-0000-4000-8000-000000000005','test',coalesce(max(revision),0)+1,
  'active',600000,0,1,86400,2592000,
  'One exact normal-customer Test Runway operation; full submitted-failure exposure remains reserved until authoritative reconciliation.'
from tongs.restricted_beta_policy_revisions where environment='test';
insert into tongs.restricted_beta_policy_capabilities(
  id,policy_revision_id,capability_code,admission_mode,cost_evidence_revision_id,
  maximum_attempts,maximum_concurrency,per_operation_supplier_ceiling_micros,
  per_operation_supporting_ceiling_micros,per_operation_tail_ceiling_micros,
  permitted_callers_json,exact_model_or_sku,notes
) values(
  '19730000-0000-4000-8000-000000000006','19730000-0000-4000-8000-000000000005',
  'runway.video','covered','19730000-0000-4000-8000-000000000001',1,1,
  600000,0,0,'["interactive","recovery"]','gen4.5:5s:1280:720',
  'Exact zero-reference text-to-video SKU. No fallback, retry, Seedance, Owner, BYO, or Live scope.'
);

-- Extend the final reservation trigger without weakening any OpenAI, beta-grant,
-- environment, operation-count, or concurrency rule.
create or replace function tongs._stamp_and_authorize_funding_reservation()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare
  q tongs.customer_spending_quotes%rowtype;
  source_environment text;
  openai_binding tongs.openai_text_customer_quote_bindings%rowtype;
  openai_authorization tongs.customer_paid_execution_scope_authorizations%rowtype;
  runway_binding tongs.runway_customer_test_quote_bindings%rowtype;
  runway_authorization tongs.runway_customer_test_authorizations%rowtype;
  prior_count bigint;
  active_count bigint;
begin
  select * into q from tongs.customer_spending_quotes where id=new.quote_id;
  if not found then raise exception 'spending quote not found' using errcode='P0002'; end if;
  if new.funding_source_type='customer_deposit' then
    select stripe_mode into source_environment from tongs.customer_deposits where id=new.funding_source_id;
  elsif new.funding_source_type='paid_allowance' then
    select financial_environment into source_environment from tongs.paid_allowance_grants where id=new.funding_source_id;
  elsif new.funding_source_type='beta_grant' then
    select financial_environment into source_environment from tongs.beta_credit_grants where id=new.funding_source_id;
  elsif new.funding_source_type='owner_budget' then source_environment:='owner_internal';
  else source_environment:=q.financial_environment;
  end if;
  if source_environment is null then raise exception 'funding source environment is unavailable' using errcode='P0002'; end if;
  if new.funding_source_type in('customer_deposit','paid_allowance','beta_grant')
     and source_environment<>q.financial_environment then
    raise exception 'cross-environment customer funding is forbidden' using errcode='42501';
  end if;
  new.funding_environment:=source_environment;
  if new.funding_source_type not in('customer_deposit','paid_allowance','beta_grant') then return new; end if;

  if q.tool='tongs_broll_v2' then
    select * into runway_binding from tongs.runway_customer_test_quote_bindings where quote_id=q.id;
    select * into runway_authorization from tongs.runway_customer_test_authorizations
      where id=runway_binding.authorization_id;
    if runway_binding.authorization_id is null or runway_authorization.id is null
       or runway_authorization.status<>'active'
       or runway_authorization.valid_from>now() or runway_authorization.valid_until<=now()
       or runway_authorization.user_id<>new.user_id
       or runway_authorization.workspace_id is distinct from q.workspace_id
       or runway_authorization.financial_environment<>source_environment
       or runway_authorization.pricing_revision_id<>q.pricing_revision_id
       or runway_authorization.operation_id<>q.operation_id
       or runway_authorization.operation_fingerprint<>q.request_fingerprint
       or new.reserved_customer_charge_micros>runway_authorization.maximum_customer_charge_micros
       or new.reserved_wholesale_spend_micros>runway_authorization.maximum_wholesale_exposure_micros then
      raise exception 'Runway customer paid execution is not authorized for this exact Test scope' using errcode='42501';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('runway-test-scope:'||runway_authorization.id::text,0));
    select count(*) into prior_count from tongs.funding_reservations
      where runway_test_authorization_id=runway_authorization.id;
    if prior_count>=runway_authorization.maximum_operation_count then
      raise exception 'Runway customer Test operation limit reached' using errcode='P0001';
    end if;
    select count(*) into active_count from tongs.funding_reservations reservation
      where reservation.runway_test_authorization_id=runway_authorization.id
        and tongs._funding_reservation_counts_paid_scope_concurrency(reservation.id);
    if active_count>=runway_authorization.maximum_concurrency then
      raise exception 'Runway customer Test concurrency limit reached' using errcode='P0001';
    end if;
    new.runway_test_authorization_id:=runway_authorization.id;
    return new;
  end if;

  select * into openai_binding from tongs.openai_text_customer_quote_bindings where quote_id=new.quote_id;
  if not found then raise exception 'generic paid execution authorization requires an immutable provider quote binding' using errcode='42501'; end if;
  select scope_auth.* into openai_authorization
  from tongs.customer_paid_execution_scope_authorizations scope_auth
  where scope_auth.user_id=new.user_id and scope_auth.workspace_id=openai_binding.workspace_id
    and scope_auth.financial_environment=source_environment and scope_auth.route_code=openai_binding.route_code
    and scope_auth.provider='openai' and scope_auth.model_or_sku=openai_binding.runtime_model
    and scope_auth.pricing_revision_id=openai_binding.pricing_revision_id
    and scope_auth.cost_policy_revision_id=openai_binding.cost_policy_revision_id
    and scope_auth.status='active' and scope_auth.valid_from<=now()
    and(scope_auth.valid_until is null or scope_auth.valid_until>now())
  order by(scope_auth.authorization_kind='normal_customer') desc,scope_auth.created_at desc limit 1;
  if not found or new.reserved_customer_charge_micros>openai_authorization.maximum_customer_charge_micros
     or new.reserved_wholesale_spend_micros>openai_authorization.maximum_wholesale_exposure_micros then
    raise exception 'customer paid execution is not authorized for this scope' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('paid-scope:'||openai_authorization.id::text,0));
  if openai_authorization.maximum_operation_count is not null then
    select count(*) into prior_count from tongs.funding_reservations where rollout_authorization_id=openai_authorization.id;
    if prior_count>=openai_authorization.maximum_operation_count then raise exception 'customer paid execution operation limit reached' using errcode='P0001'; end if;
  end if;
  select count(*) into active_count from tongs.funding_reservations reservation
    where reservation.rollout_authorization_id=openai_authorization.id
      and tongs._funding_reservation_counts_paid_scope_concurrency(reservation.id);
  if active_count>=openai_authorization.maximum_concurrency then raise exception 'customer paid execution concurrency limit reached' using errcode='P0001'; end if;
  new.rollout_authorization_id:=openai_authorization.id;
  return new;
end $$;

alter function tongs.create_customer_runway_quote(uuid,uuid,text,uuid,text,text,integer,text,timestamptz)
  rename to _create_customer_runway_quote_before_gen45_customer_test;
create or replace function tongs.create_customer_runway_quote(
  p_quote_id uuid,p_user_id uuid,p_operation_id text,p_workspace_id uuid,
  p_operation_fingerprint text,p_model text,p_duration_seconds integer,
  p_ratio text,p_expires_at timestamptz
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_authorization tongs.runway_customer_test_authorizations%rowtype;
  result jsonb;
  q tongs.customer_spending_quotes%rowtype;
  v_replay boolean;
begin
  perform tongs._require_pricing_service_role();
  select * into v_authorization from tongs.runway_customer_test_authorizations
  where user_id=p_user_id and workspace_id=p_workspace_id and status='active'
    and valid_from<=now() and valid_until>now()
    and operation_id=btrim(p_operation_id)
    and operation_fingerprint=lower(p_operation_fingerprint)
    and model=p_model and duration_seconds=p_duration_seconds and ratio=p_ratio
    and reference_image_count=0 and pricing_revision_id='19730000-0000-4000-8000-000000000002'
  order by created_at desc limit 1;
  if not found then raise exception 'Runway customer Test scope is not authorized for this exact operation' using errcode='42501'; end if;
  if p_expires_at>v_authorization.valid_until or p_expires_at>clock_timestamp()+interval '10 minutes' then
    raise exception 'Runway quote expiry exceeds bounded authorization' using errcode='22023';
  end if;
  select exists(select 1 from tongs.customer_spending_quotes where id=p_quote_id) into v_replay;
  result:=tongs._create_customer_runway_quote_before_gen45_customer_test(
    p_quote_id,p_user_id,p_operation_id,p_workspace_id,p_operation_fingerprint,
    p_model,p_duration_seconds,p_ratio,p_expires_at);
  select * into q from tongs.customer_spending_quotes where id=p_quote_id;
  if q.pricing_revision_id<>v_authorization.pricing_revision_id
     or q.normal_maximum_charge_micros<>v_authorization.maximum_customer_charge_micros
     or q.billable_failure_maximum_charge_micros<>0 or q.customer_credit_units<>160
     or q.full_cost_ceiling_micros<>v_authorization.maximum_wholesale_exposure_micros
     or q.financial_environment<>'test' then
    raise exception 'Runway quote escaped the exact Test product authority' using errcode='42501';
  end if;
  insert into tongs.runway_customer_test_quote_bindings(authorization_id,quote_id)
  values(v_authorization.id,q.id) on conflict(authorization_id) do nothing;
  if not exists(select 1 from tongs.runway_customer_test_quote_bindings
    where authorization_id=v_authorization.id and quote_id=q.id) then
    raise exception 'Runway customer Test operation limit reached' using errcode='P0001';
  end if;
  return jsonb_build_object(
    'quote_id',q.id,'operation_id',q.operation_id,'quote_hash',q.quote_hash,
    'request_fingerprint',q.request_fingerprint,'currency',q.currency,
    'normal_maximum_charge_micros',q.normal_maximum_charge_micros,
    'billable_failure_maximum_charge_micros',q.billable_failure_maximum_charge_micros,
    'customer_credit_units',q.customer_credit_units,
    'billable_failure_classes',q.billable_failure_classes,
    'free_failure_classes',q.free_failure_classes,
    'included_quantity',q.included_quantity,'retention_policy',q.retention_policy,
    'provider_funding_summary',q.provider_funding_summary,'expires_at',q.expires_at,
    'funding',coalesce(result->'funding','{}'::jsonb),
    'customer_spending_enabled',true,'requires_confirmation',true,
    'activation_scope','normal_customer_test_exact_operation',
    'replay',v_replay or coalesce((result->>'replay')::boolean,false)
  );
end $$;

alter function tongs.reserve_customer_runway_quote(uuid,uuid,text,text,text,integer,text)
  rename to _reserve_customer_runway_quote_before_gen45_customer_test;
create or replace function tongs.reserve_customer_runway_quote(
  p_quote_id uuid,p_reservation_id uuid,p_idempotency_key text,
  p_operation_fingerprint text,p_model text,p_duration_seconds integer,p_ratio text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_authorization tongs.runway_customer_test_authorizations%rowtype;
  q tongs.customer_spending_quotes%rowtype;
  result jsonb;
begin
  perform tongs._require_pricing_service_role();
  select a.* into v_authorization
  from tongs.runway_customer_test_quote_bindings b
  join tongs.runway_customer_test_authorizations a on a.id=b.authorization_id
  where b.quote_id=p_quote_id and a.status='active' and a.valid_from<=now() and a.valid_until>now();
  select * into q from tongs.customer_spending_quotes where id=p_quote_id;
  if v_authorization.id is null or q.id is null
     or not exists(select 1 from tongs.customer_spending_quote_acceptances where quote_id=q.id)
     or v_authorization.operation_fingerprint<>lower(p_operation_fingerprint)
     or v_authorization.model<>p_model or v_authorization.duration_seconds<>p_duration_seconds
     or v_authorization.ratio<>p_ratio or q.pricing_revision_id<>v_authorization.pricing_revision_id
     or q.normal_maximum_charge_micros<>800000 or q.customer_credit_units<>160
     or q.billable_failure_maximum_charge_micros<>0 or q.full_cost_ceiling_micros<>600000
     or q.financial_environment<>'test' then
    raise exception 'accepted Runway quote is outside the authorized exact Test scope' using errcode='42501';
  end if;
  result:=tongs._reserve_customer_runway_quote_before_gen45_customer_test(
    p_quote_id,p_reservation_id,p_idempotency_key,p_operation_fingerprint,
    p_model,p_duration_seconds,p_ratio);
  if not exists(select 1 from tongs.funding_reservations
    where id=p_reservation_id and runway_test_authorization_id=v_authorization.id
      and funding_environment='test') then
    raise exception 'Runway reservation did not retain exact Test authorization' using errcode='42501';
  end if;
  return result||jsonb_build_object('activation_scope','normal_customer_test_exact_operation');
end $$;

-- Select aggregate policy from the reservation's canonical environment, not
-- from the funding-source class. This is Test/Live parity, not a second path.
create or replace function tongs.acquire_runway_aggregate_admission(
  p_operation_id text,p_operation_fingerprint text,p_user_id uuid,
  p_workspace_id uuid,p_caller_class text,p_provider_mode text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  b tongs.runway_funding_bindings%rowtype;
  r tongs.funding_reservations%rowtype;
  a tongs.paid_execution_aggregate_assignments%rowtype;
  existing tongs.paid_operation_aggregate_bindings%rowtype;
  funding_class text; environment text; hold_id uuid; admitted jsonb;
begin
  perform tongs._require_pricing_service_role();
  select * into b from tongs.runway_funding_bindings where operation_id=btrim(p_operation_id);
  if not found or b.operation_fingerprint<>p_operation_fingerprint or b.user_id<>p_user_id or b.workspace_id<>p_workspace_id then
    raise exception 'exact Runway funding binding required' using errcode='42501';
  end if;
  select * into existing from tongs.paid_operation_aggregate_bindings where reservation_id=b.reservation_id;
  if found then return jsonb_build_object('enforcement_enabled',true,'authorized',true,'replay',true,'hold_id',existing.hold_id,'reason','existing_authoritative_admission'); end if;
  select * into r from tongs.funding_reservations where id=b.reservation_id;
  funding_class:=tongs._aggregate_funding_class(r);
  environment:=case r.funding_environment when 'test' then 'test' when 'live' then 'production' when 'owner_internal' then 'production' else null end;
  if environment is null then raise exception 'canonical Runway funding environment required' using errcode='42501'; end if;
  select * into a from tongs._active_paid_execution_aggregate_assignment(p_user_id,p_workspace_id,environment);
  if not found then return jsonb_build_object('enforcement_enabled',false,'authorized',true,'replay',false,'reason','aggregate_assignment_inactive'); end if;
  if p_provider_mode<>'real' then raise exception 'Runway Forge credential requires real provider mode' using errcode='42501'; end if;
  if r.funding_environment='test' and (r.runway_test_authorization_id is null or not exists(
    select 1 from tongs.runway_customer_test_authorizations test_auth
    where test_auth.id=r.runway_test_authorization_id and test_auth.status='active'
      and test_auth.valid_until>now() and test_auth.operation_id=b.operation_id
      and test_auth.operation_fingerprint=b.operation_fingerprint
      and test_auth.pricing_revision_id=b.pricing_revision_id
  )) then raise exception 'exact active Runway customer Test authorization required' using errcode='42501'; end if;
  hold_id:=extensions.uuid_generate_v5(b.reservation_id,'aggregate-exposure');
  perform set_config('forge.funding_reservation_id',r.id::text,true);
  admitted:=tongs.reserve_restricted_beta_exposure(
    hold_id,a.policy_revision_id,'runway.video',b.operation_id,b.user_id,b.workspace_id,
    b.operation_fingerprint,b.model||':'||b.duration_seconds::text||'s:'||b.ratio,
    funding_class,b.reservation_id::text,p_provider_mode,p_caller_class,
    r.reserved_customer_charge_micros,b.direct_provider_ceiling_micros,
    b.supporting_cost_ceiling_micros,0,0,0,300,b.reservation_id::text||':aggregate-reserved');
  if coalesce((admitted->>'authorized')::boolean,false) then
    insert into tongs.paid_operation_aggregate_bindings(
      reservation_id,hold_id,policy_revision_id,capability_code,provider,operation_id,
      user_id,workspace_id,request_fingerprint,model_or_sku,funding_source_type,
      credential_funding,provider_mode,pricing_revision_id,cost_policy_revision_id,
      customer_funding_ceiling_micros,supplier_exposure_ceiling_micros,
      supporting_exposure_ceiling_micros
    ) values(
      r.id,hold_id,a.policy_revision_id,'runway.video','runway',b.operation_id,b.user_id,
      b.workspace_id,b.operation_fingerprint,b.model||':'||b.duration_seconds::text||'s:'||b.ratio,
      r.funding_source_type,'forge',p_provider_mode,b.pricing_revision_id,null,
      r.reserved_customer_charge_micros,b.direct_provider_ceiling_micros,b.supporting_cost_ceiling_micros);
  end if;
  return jsonb_build_object('enforcement_enabled',true)||admitted;
end $$;

-- Activate only when the exact linked customer operation exists. Fresh replay
-- databases receive all product and security authority but no invented customer.
do $$
declare actor uuid;
begin
  if exists(select 1 from auth.users where id='71daf61b-57b3-4e5f-a8c8-64befecb5950')
     and exists(select 1 from tongs.workspaces where id='cc5478ff-37be-403e-824c-467fa7da061e')
     and exists(select 1 from tongs.broll_operation_receipts
       where operation_id='forge:broll:acquire:9b83645ed2fd1bb4d563f045d57c6a54c485aa300a57071856fdcb39db4bad32'
         and operation_fingerprint='9b83645ed2fd1bb4d563f045d57c6a54c485aa300a57071856fdcb39db4bad32') then
    select user_id into actor from tongs.platform_operators order by granted_at limit 1;
    perform set_config('request.jwt.claim.role','service_role',true);
    perform tongs.activate_runway_gen45_customer_test(
      '19730000-0000-4000-8000-000000000007',actor,
      '71daf61b-57b3-4e5f-a8c8-64befecb5950','cc5478ff-37be-403e-824c-467fa7da061e',
      'forge:broll:acquire:9b83645ed2fd1bb4d563f045d57c6a54c485aa300a57071856fdcb39db4bad32',
      '9b83645ed2fd1bb4d563f045d57c6a54c485aa300a57071856fdcb39db4bad32',
      clock_timestamp()+interval '24 hours',
      'One signed-in normal-customer Test canary. Explicit quote acceptance remains required; no reservation or provider call is created by activation.');
    perform set_config('request.jwt.claim.role','',true);
  end if;
end $$;

revoke all on function tongs._create_customer_runway_quote_before_gen45_customer_test(uuid,uuid,text,uuid,text,text,integer,text,timestamptz) from public,anon,authenticated,service_role;
revoke all on function tongs._create_customer_runway_quote_before_customer_test_scope(uuid,uuid,text,uuid,text,text,integer,text,timestamptz) from public,anon,authenticated,service_role;
revoke all on function tongs._reserve_customer_runway_quote_before_gen45_customer_test(uuid,uuid,text,text,text,integer,text) from public,anon,authenticated,service_role;
revoke all on function tongs.create_customer_runway_quote(uuid,uuid,text,uuid,text,text,integer,text,timestamptz) from public,anon,authenticated;
revoke all on function tongs.reserve_customer_runway_quote(uuid,uuid,text,text,text,integer,text) from public,anon,authenticated;
revoke all on function tongs.activate_runway_gen45_customer_test(uuid,uuid,uuid,uuid,text,text,timestamptz,text) from public,anon,authenticated;
revoke all on function tongs._stamp_and_authorize_funding_reservation() from public,anon,authenticated;
revoke all on function tongs.acquire_runway_aggregate_admission(text,text,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function tongs.create_customer_runway_quote(uuid,uuid,text,uuid,text,text,integer,text,timestamptz) to service_role;
grant execute on function tongs.reserve_customer_runway_quote(uuid,uuid,text,text,text,integer,text) to service_role;
grant execute on function tongs.activate_runway_gen45_customer_test(uuid,uuid,uuid,uuid,text,text,timestamptz,text) to service_role;
grant execute on function tongs._stamp_and_authorize_funding_reservation() to service_role;
grant execute on function tongs.acquire_runway_aggregate_admission(text,text,uuid,uuid,text,text) to service_role;

do $$
begin
  if not exists(select 1 from tongs.private_pricing_revisions
    where id='19730000-0000-4000-8000-000000000002' and revision=2
      and lifecycle_state='review_ready' and markup_basis_points=3300
      and full_cost_ceiling_micros=600000 and failure_cost_ceiling_micros=600000
      and unrounded_customer_price_micros=798000 and rounding_adjustment_micros=2000
      and settled_customer_price_micros=800000 and customer_credit_units=160
      and billable_failure_ceiling_micros=0) then
    raise exception 'Runway customer pricing mismatch';
  end if;
  if exists(select 1 from tongs.private_pricing_publications publication
    join tongs.private_pricing_revisions pricing on pricing.id=publication.pricing_revision_id
    where pricing.revision=1 and publication.action='published') then
    raise exception 'historical owner-pilot pricing must remain unpublished';
  end if;
  if exists(select 1 from tongs.runway_customer_test_authorizations
    where financial_environment<>'test' or route_code<>'tongs_broll_v2' or provider<>'runway'
      or model<>'gen4.5' or generation_mode<>'text_to_video' or duration_seconds<>5
      or ratio<>'1280:720' or output_count<>1 or reference_image_count<>0
      or maximum_provider_attempts<>1 or maximum_operation_count<>1
      or maximum_customer_charge_micros<>800000
      or maximum_wholesale_exposure_micros<>600000 or maximum_concurrency<>1) then
    raise exception 'Runway customer Test scope escaped approved bounds';
  end if;
  if (select lifecycle_state from tongs.financial_environment_configuration_revisions
      where environment='live' order by revision desc limit 1)<>'inactive_ready' then
    raise exception 'Live changed during Runway Test activation';
  end if;
  if has_function_privilege('public','tongs.create_customer_runway_quote(uuid,uuid,text,uuid,text,text,integer,text,timestamptz)','execute')
     or has_function_privilege('anon','tongs.create_customer_runway_quote(uuid,uuid,text,uuid,text,text,integer,text,timestamptz)','execute')
     or has_function_privilege('authenticated','tongs.create_customer_runway_quote(uuid,uuid,text,uuid,text,text,integer,text,timestamptz)','execute')
     or not has_function_privilege('service_role','tongs.create_customer_runway_quote(uuid,uuid,text,uuid,text,text,integer,text,timestamptz)','execute')
     or has_function_privilege('public','tongs.reserve_customer_runway_quote(uuid,uuid,text,text,text,integer,text)','execute')
     or has_function_privilege('anon','tongs.reserve_customer_runway_quote(uuid,uuid,text,text,text,integer,text)','execute')
     or has_function_privilege('authenticated','tongs.reserve_customer_runway_quote(uuid,uuid,text,text,text,integer,text)','execute')
     or not has_function_privilege('service_role','tongs.reserve_customer_runway_quote(uuid,uuid,text,text,text,integer,text)','execute') then
    raise exception 'Runway customer quote/reservation privilege mismatch';
  end if;
  if has_table_privilege('authenticated','tongs.runway_customer_test_authorizations','select,insert,update,delete')
     or has_table_privilege('anon','tongs.runway_customer_test_authorizations','select')
     or not has_table_privilege('service_role','tongs.runway_customer_test_authorizations','select') then
    raise exception 'Runway customer Test authority table privilege mismatch';
  end if;
end $$;

comment on table tongs.runway_customer_test_authorizations is
  'Immutable exact-operation normal-customer Test Runway authority. It grants no Owner, BYO, reference-image, Seedance, or Live scope.';
comment on function tongs.create_customer_runway_quote(uuid,uuid,text,uuid,text,text,integer,text,timestamptz) is
  'Service-only exact-operation normal-customer Test quote. Returns customer terms only and never supplier economics.';
notify pgrst,'reload schema';
commit;
