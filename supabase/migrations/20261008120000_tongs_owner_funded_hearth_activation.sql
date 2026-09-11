-- Owner-scoped Hearth activation, exact five-model compatibility controls,
-- non-overlapping retention funding, and conservative supplier exposure.
-- No reusable migration row names a production user, workspace, credential, or
-- existing Runway reservation. Those bindings are created only by protected
-- service-role bootstrap RPCs after this migration is applied.
begin;

create table tongs.owner_hearth_authorizations (
  id uuid primary key,
  authorization_kind text not null check (authorization_kind in ('compatibility_batch','creator_session')),
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  workspace_id uuid not null references tongs.workspaces(id) on delete restrict,
  budget_id uuid not null unique references tongs.owner_operating_budgets(id) on delete restrict,
  maximum_amount_micros bigint not null check (maximum_amount_micros > 0),
  maximum_operations integer not null check (maximum_operations > 0),
  maximum_concurrency integer not null check (maximum_concurrency > 0),
  maximum_attempts smallint not null check (maximum_attempts between 1 and 4),
  failure_loss_limit_micros bigint not null check (failure_loss_limit_micros >= 0),
  duration_seconds integer not null check (duration_seconds between 60 and 2592000),
  no_renewal boolean not null default true check (no_renewal),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (authorization_kind, owner_user_id, workspace_id, created_at)
);

create table tongs.owner_hearth_authorization_events (
  id uuid primary key,
  authorization_id uuid not null references tongs.owner_hearth_authorizations(id) on delete restrict,
  sequence integer not null check (sequence > 0),
  event_key text not null unique check (length(btrim(event_key)) between 8 and 300),
  state text not null check (state in ('dormant','active','halt_new','closed','expired')),
  started_at timestamptz,
  expires_at timestamptz,
  reason text not null check (length(btrim(reason)) between 3 and 500),
  evidence_json jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_json)='object'),
  created_at timestamptz not null default now(),
  unique (authorization_id,sequence),
  check ((state='dormant' and started_at is null and expires_at is null)
    or (state<>'dormant' and (state in ('closed','halt_new') or (started_at is not null and expires_at is not null))))
);

create table tongs.owner_hearth_model_terms (
  authorization_id uuid not null references tongs.owner_hearth_authorizations(id) on delete restrict,
  ordinal smallint not null check (ordinal between 1 and 5),
  provider_model_id text not null,
  display_name text not null,
  cost_policy_revision_id uuid not null references tongs.openai_text_cost_policy_revisions(id) on delete restrict,
  pricing_revision_id uuid not null references tongs.private_pricing_revisions(id) on delete restrict,
  aggregate_policy_revision_id uuid not null references tongs.restricted_beta_policy_revisions(id) on delete restrict,
  maximum_exposure_micros bigint not null check (maximum_exposure_micros > 0),
  primary key (authorization_id,provider_model_id),
  unique (authorization_id,ordinal)
);

create table tongs.owner_hearth_operation_authorizations (
  id uuid primary key,
  authorization_id uuid not null references tongs.owner_hearth_authorizations(id) on delete restrict,
  operation_id text not null unique check (length(btrim(operation_id)) between 8 and 300),
  quote_id uuid not null unique references tongs.customer_spending_quotes(id) on delete restrict,
  reservation_id uuid not null unique references tongs.funding_reservations(id) on delete restrict,
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  workspace_id uuid not null references tongs.workspaces(id) on delete restrict,
  workpiece_id text not null,
  provider_model_id text not null,
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  serialized_body_sha256 text not null check (serialized_body_sha256 ~ '^[0-9a-f]{64}$'),
  cost_policy_revision_id uuid not null references tongs.openai_text_cost_policy_revisions(id) on delete restrict,
  pricing_revision_id uuid not null references tongs.private_pricing_revisions(id) on delete restrict,
  aggregate_policy_revision_id uuid not null references tongs.restricted_beta_policy_revisions(id) on delete restrict,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create table tongs.owner_hearth_compatibility_results (
  id uuid primary key,
  operation_authorization_id uuid not null unique references tongs.owner_hearth_operation_authorizations(id) on delete restrict,
  result_key text not null unique,
  status text not null check (status in ('passed','definitive_rejection','billed_failure','ambiguous')),
  provider_request_id text,
  estimated_supplier_expense_micros bigint check (estimated_supplier_expense_micros is null or estimated_supplier_expense_micros >= 0),
  authoritative_supplier_expense_micros bigint check (authoritative_supplier_expense_micros is null or authoritative_supplier_expense_micros >= 0),
  evidence_json jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_json)='object'),
  created_at timestamptz not null default now()
);

create table tongs.owner_hearth_tail_authorizations (
  id uuid primary key,
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  workspace_id uuid not null references tongs.workspaces(id) on delete restrict,
  currency text not null check (currency='USD'),
  monthly_limit_micros bigint not null check (monthly_limit_micros > 0),
  aggregate_limit_micros bigint not null check (aggregate_limit_micros > 0),
  canonical_capacity_bytes bigint not null check (canonical_capacity_bytes > 0),
  evidence_capacity_bytes bigint not null check (evidence_capacity_bytes > 0),
  replacement_rate_micros_per_mib_month bigint not null check (replacement_rate_micros_per_mib_month > 0),
  coverage_months smallint not null check (coverage_months between 1 and 120),
  no_renewal boolean not null default true check (no_renewal),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table tongs.owner_hearth_tail_events (
  id uuid primary key,
  tail_authorization_id uuid not null references tongs.owner_hearth_tail_authorizations(id) on delete restrict,
  sequence integer not null check (sequence > 0),
  event_key text not null unique,
  event_type text not null check (event_type in ('authorized','artifact_covered','funding_expired','continuing_obligation','replacement_funded','closed')),
  amount_micros bigint check (amount_micros is null or amount_micros >= 0),
  retained_bytes bigint check (retained_bytes is null or retained_bytes >= 0),
  evidence_json jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_json)='object'),
  created_at timestamptz not null default now(),
  unique (tail_authorization_id,sequence)
);

create table tongs.owner_hearth_tail_periods (
  id uuid primary key,
  tail_authorization_id uuid not null references tongs.owner_hearth_tail_authorizations(id) on delete restrict,
  reservation_id uuid not null references tongs.funding_reservations(id) on delete restrict,
  artifact_class text not null check (artifact_class in ('canonical_content','provider_evidence')),
  coverage_start timestamptz not null,
  coverage_end timestamptz not null,
  monthly_limit_micros bigint not null check (monthly_limit_micros > 0),
  cost_status text not null check (cost_status in ('allocated_estimate','measured_estimate','authoritative')),
  evidence_json jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_json)='object'),
  created_at timestamptz not null default now(),
  unique (reservation_id,artifact_class,coverage_start),
  check (coverage_end=coverage_start+interval '12 months')
);

create table tongs.owner_hearth_tail_measurements (
  id uuid primary key,
  tail_authorization_id uuid not null references tongs.owner_hearth_tail_authorizations(id) on delete restrict,
  period_start date not null,
  revision integer not null check (revision > 0),
  canonical_retained_bytes bigint not null check (canonical_retained_bytes >= 0),
  evidence_retained_bytes bigint not null check (evidence_retained_bytes >= 0),
  estimated_cost_micros bigint not null check (estimated_cost_micros >= 0),
  cost_status text not null check (cost_status in ('measured_estimate','authoritative')),
  measurement_key text not null unique,
  evidence_json jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_json)='object'),
  created_at timestamptz not null default now(),
  unique (tail_authorization_id,period_start,revision)
);

create table tongs.legacy_supplier_opening_commitments (
  id uuid primary key,
  environment text not null check (environment in ('production','test')),
  provider text not null,
  reservation_id uuid references tongs.funding_reservations(id) on delete restrict,
  commitment_key text not null unique,
  amount_micros bigint not null check (amount_micros > 0),
  status text not null check (status in ('unresolved','reconciled','recovered')),
  evidence_json jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_json)='object'),
  created_at timestamptz not null default now()
);

do $$ declare n text; begin
  foreach n in array array[
    'owner_hearth_authorizations','owner_hearth_authorization_events','owner_hearth_model_terms',
    'owner_hearth_operation_authorizations','owner_hearth_compatibility_results',
    'owner_hearth_tail_authorizations','owner_hearth_tail_events','owner_hearth_tail_periods','owner_hearth_tail_measurements',
    'legacy_supplier_opening_commitments'
  ] loop
    execute format('alter table tongs.%I enable row level security',n);
    execute format('alter table tongs.%I force row level security',n);
    execute format('revoke all on tongs.%I from public,anon,authenticated,service_role',n);
    execute format('grant select,insert on tongs.%I to service_role',n);
    execute format('create trigger %I_immutable before update or delete on tongs.%I for each row execute function tongs._reject_accounting_mutation()',n,n);
  end loop;
end $$;

-- Exact compatibility and normal-session policies. The three-micro amount is
-- retained by aggregate admission as reconciliation/rounding risk and is not
-- duplicated in the operation's direct+supporting reservation.
insert into tongs.openai_text_cost_policy_revisions(
  id,route_code,revision,policy_code,attempt_plan,maximum_input_units,maximum_output_units,
  maximum_attempts,direct_provider_ceiling_micros,supporting_cost_ceiling_micros,
  full_cost_ceiling_micros,cost_coverage,lifecycle_state,notes
) values
 ('81000000-0000-4000-8000-000000000001','hearth.chat_completion',101,'owner-hearth-compat-astra-v1','[{"attempt":1,"rate_revision_id":"60000000-0000-4000-8000-000000000002","input_max":386,"output_max":512}]',386,512,1,29460,1456,30916,'complete','pilot_candidate','Compatibility only; exact serialized Ready request, no tools/supporting services beyond the approved first-30-day allocation.'),
 ('81000000-0000-4000-8000-000000000002','hearth.chat_completion',102,'owner-hearth-compat-sol-v1','[{"attempt":1,"rate_revision_id":"56000000-0000-4000-8000-000000000012","input_max":386,"output_max":512}]',386,512,1,11784,1456,13240,'complete','pilot_candidate','Compatibility only; exact serialized Ready request.'),
 ('81000000-0000-4000-8000-000000000003','hearth.chat_completion',103,'owner-hearth-compat-terra-v1','[{"attempt":1,"rate_revision_id":"56000000-0000-4000-8000-000000000022","input_max":388,"output_max":512}]',388,512,1,6920,1456,8376,'complete','pilot_candidate','Compatibility only; exact serialized Ready request.'),
 ('81000000-0000-4000-8000-000000000004','hearth.chat_completion',104,'owner-hearth-compat-mini-v1','[{"attempt":1,"rate_revision_id":"54000000-0000-4000-8000-000000000001","input_max":398,"output_max":512}]',398,512,1,2603,1456,4059,'complete','pilot_candidate','Compatibility only; pinned GPT-5.4 Mini model.'),
 ('81000000-0000-4000-8000-000000000005','hearth.chat_completion',105,'owner-hearth-compat-luna-v1','[{"attempt":1,"rate_revision_id":"56000000-0000-4000-8000-000000000032","input_max":387,"output_max":512}]',387,512,1,692,1456,2148,'complete','pilot_candidate','Compatibility only; exact serialized Ready request.'),
 ('81000000-0000-4000-8000-000000000011','hearth.chat_completion',111,'owner-hearth-session-astra-v1','[{"attempt":1,"rate_revision_id":"60000000-0000-4000-8000-000000000002","input_max":32000,"output_max":8000}]',32000,8000,1,720000,1456,721456,'complete','pilot_candidate','Owner creator session; attachments, research, search, transcription, tools, and other paid support remain excluded.'),
 ('81000000-0000-4000-8000-000000000012','hearth.chat_completion',112,'owner-hearth-session-sol-v1','[{"attempt":1,"rate_revision_id":"56000000-0000-4000-8000-000000000012","input_max":32000,"output_max":8000}]',32000,8000,1,288000,1456,289456,'complete','pilot_candidate','Owner creator session; excluded supporting services remain blocked.'),
 ('81000000-0000-4000-8000-000000000013','hearth.chat_completion',113,'owner-hearth-session-terra-v1','[{"attempt":1,"rate_revision_id":"56000000-0000-4000-8000-000000000022","input_max":32000,"output_max":8000}]',32000,8000,1,160000,1456,161456,'complete','pilot_candidate','Owner creator session; excluded supporting services remain blocked.'),
 ('81000000-0000-4000-8000-000000000014','hearth.chat_completion',114,'owner-hearth-session-mini-v1','[{"attempt":1,"rate_revision_id":"54000000-0000-4000-8000-000000000001","input_max":32000,"output_max":8000}]',32000,8000,1,60000,1456,61456,'complete','pilot_candidate','Owner creator session; pinned GPT-5.4 Mini model.'),
 ('81000000-0000-4000-8000-000000000015','hearth.chat_completion',115,'owner-hearth-session-luna-v1','[{"attempt":1,"rate_revision_id":"56000000-0000-4000-8000-000000000032","input_max":32000,"output_max":8000}]',32000,8000,1,16000,1456,17456,'complete','pilot_candidate','Owner creator session; excluded supporting services remain blocked.')
on conflict(route_code,revision) do nothing;

insert into tongs.restricted_beta_cost_evidence_revisions(
 id,capability_code,revision,evidence_state,coverage_state,source_reference,observed_at,valid_until,
 included_capacity_json,reserved_headroom_json,hard_cap_scope,notes
) select
 extensions.uuid_generate_v5('82000000-0000-4000-8000-000000000000'::uuid,model_id||':'||kind),
 'openai.text.hearth_chat',100+ordinal+(case when kind='session' then 10 else 0 end),
 'verified_rate','complete','Official OpenAI model pricing plus Forge first-30-day support allocation',
 '2026-09-10T00:00:00Z','2026-10-10T00:00:00Z',
 jsonb_build_object('model',model_id,'maximum_input_tokens',input_max,'maximum_output_tokens',output_max,'attempts',1),
 jsonb_build_object('direct_rounding_risk_micros',3,'post_day_30_tail_separately_funded',true),
 case when kind='compatibility' then 'one exact compatibility operation' else 'one bounded owner Hearth operation' end,
 'Provider rates are pricing evidence, not authoritative per-operation expense.'
from (values
 ('compatibility',1,'gpt-6-astra',386,512),('compatibility',2,'gpt-5.6-sol',386,512),
 ('compatibility',3,'gpt-5.6-terra',388,512),('compatibility',4,'gpt-5.4-mini-2026-03-17',398,512),
 ('compatibility',5,'gpt-5.6-luna',387,512),('session',1,'gpt-6-astra',32000,8000),
 ('session',2,'gpt-5.6-sol',32000,8000),('session',3,'gpt-5.6-terra',32000,8000),
 ('session',4,'gpt-5.4-mini-2026-03-17',32000,8000),('session',5,'gpt-5.6-luna',32000,8000)
) v(kind,ordinal,model_id,input_max,output_max)
on conflict(capability_code,revision) do nothing;

-- One active policy per exact model and authorization class. No global/user
-- assignment is inserted, so these policies cannot enroll ordinary traffic.
insert into tongs.restricted_beta_policy_revisions(
 id,environment,revision,lifecycle_state,aggregate_forge_exposure_limit_micros,
 reserved_headroom_micros,maximum_concurrency,rolling_window_seconds,evidence_max_age_seconds,
 reason
) select
 extensions.uuid_generate_v5('83000000-0000-4000-8000-000000000000'::uuid,kind||':'||model_id),
 'production',100+ordinal+(case when kind='session' then 10 else 0 end),'active',10840000,0,
 case when kind='compatibility' then 1 else 2 end,86400,2592000,
 'Owner-only Hearth '||kind||' aggregate policy; unreachable without an exact owner operation authorization.'
from (values
 ('compatibility',1,'gpt-6-astra'),('compatibility',2,'gpt-5.6-sol'),('compatibility',3,'gpt-5.6-terra'),
 ('compatibility',4,'gpt-5.4-mini-2026-03-17'),('compatibility',5,'gpt-5.6-luna'),
 ('session',1,'gpt-6-astra'),('session',2,'gpt-5.6-sol'),('session',3,'gpt-5.6-terra'),
 ('session',4,'gpt-5.4-mini-2026-03-17'),('session',5,'gpt-5.6-luna')
) v(kind,ordinal,model_id)
on conflict(environment,revision) do nothing;

insert into tongs.restricted_beta_policy_capabilities(
 id,policy_revision_id,capability_code,admission_mode,cost_evidence_revision_id,maximum_attempts,
 maximum_concurrency,per_operation_supplier_ceiling_micros,per_operation_supporting_ceiling_micros,
 per_operation_tail_ceiling_micros,permitted_callers_json,exact_model_or_sku,notes
) select
 extensions.uuid_generate_v5(policy.id,'openai.text.hearth_chat'),policy.id,'openai.text.hearth_chat','covered',evidence.id,1,
 case when spec.kind='compatibility' then 1 else 2 end,cost.direct_provider_ceiling_micros,1456,0,
 '["interactive","recovery"]'::jsonb,spec.model_id,
 'Owner-only exact-model term; post-day-30 retention is covered by a distinct tail authorization.'
from (values
 ('compatibility',1,'gpt-6-astra','81000000-0000-4000-8000-000000000001'::uuid),
 ('compatibility',2,'gpt-5.6-sol','81000000-0000-4000-8000-000000000002'::uuid),
 ('compatibility',3,'gpt-5.6-terra','81000000-0000-4000-8000-000000000003'::uuid),
 ('compatibility',4,'gpt-5.4-mini-2026-03-17','81000000-0000-4000-8000-000000000004'::uuid),
 ('compatibility',5,'gpt-5.6-luna','81000000-0000-4000-8000-000000000005'::uuid),
 ('session',1,'gpt-6-astra','81000000-0000-4000-8000-000000000011'::uuid),
 ('session',2,'gpt-5.6-sol','81000000-0000-4000-8000-000000000012'::uuid),
 ('session',3,'gpt-5.6-terra','81000000-0000-4000-8000-000000000013'::uuid),
 ('session',4,'gpt-5.4-mini-2026-03-17','81000000-0000-4000-8000-000000000014'::uuid),
 ('session',5,'gpt-5.6-luna','81000000-0000-4000-8000-000000000015'::uuid)
) spec(kind,ordinal,model_id,cost_id)
join tongs.openai_text_cost_policy_revisions cost on cost.id=spec.cost_id
join tongs.restricted_beta_policy_revisions policy on policy.id=extensions.uuid_generate_v5('83000000-0000-4000-8000-000000000000'::uuid,spec.kind||':'||spec.model_id)
join tongs.restricted_beta_cost_evidence_revisions evidence on evidence.id=extensions.uuid_generate_v5('82000000-0000-4000-8000-000000000000'::uuid,spec.model_id||':'||spec.kind)
on conflict(policy_revision_id,capability_code) do nothing;

-- Include explicit pre-aggregate commitments in every environment-wide
-- admission calculation. These rows are exposure only, never funding or a
-- duplicate supplier expense.
create or replace function tongs._restricted_beta_policy_commitment(p_policy_revision_id uuid)
returns table(committed_micros bigint,outstanding_count bigint)
language sql stable security definer set search_path=pg_catalog as $$
 with selected_policy as (
  select * from tongs.restricted_beta_policy_revisions where id=p_policy_revision_id
 ), facts as (
  select h.*,
   (select e.event_type from tongs.restricted_beta_exposure_events e where e.hold_id=h.id order by e.sequence desc limit 1) last_type,
   (select e.remaining_exposure_micros from tongs.restricted_beta_exposure_events e where e.hold_id=h.id and e.remaining_exposure_micros is not null order by e.sequence desc limit 1) remaining_exposure,
   (select e.supplier_obligation_micros from tongs.restricted_beta_exposure_events e where e.hold_id=h.id and e.event_type='reconciled' order by e.sequence desc limit 1) reconciled_supplier,
   (select e.supplier_obligation_micros from tongs.restricted_beta_exposure_events e where e.hold_id=h.id and e.event_type='reconciliation_partial' order by e.sequence desc limit 1) partial_supplier,
   (select e.created_at from tongs.restricted_beta_exposure_events e where e.hold_id=h.id and e.event_type='attempt_started' order by e.sequence limit 1) incurred_at,
   (select coalesce(sum(e.supplier_recovery_micros),0) from tongs.restricted_beta_exposure_events e where e.hold_id=h.id and e.event_type='supplier_recovery') recovered
  from tongs.restricted_beta_exposure_holds h
  join tongs.restricted_beta_policy_revisions old_policy on old_policy.id=h.policy_revision_id
  where old_policy.environment=(select environment from selected_policy)
 ), amounts as (
  select f.*,
   case
    when f.last_type='released' then 0
    when f.remaining_exposure is not null then greatest(f.remaining_exposure-f.recovered,0)
    when f.reconciled_supplier is not null then case
      when coalesce(f.incurred_at,f.created_at)>=now()-make_interval(secs=>(select rolling_window_seconds from selected_policy))
      then greatest(f.reconciled_supplier-f.recovered,0) else 0 end
    when f.partial_supplier is not null then greatest(f.partial_supplier-f.recovered,0)+
      f.supporting_exposure_ceiling_micros+f.tail_exposure_ceiling_micros+
      f.unreconciled_exposure_ceiling_micros+f.retry_exposure_ceiling_micros
    else f.supplier_exposure_ceiling_micros+f.supporting_exposure_ceiling_micros+
      f.tail_exposure_ceiling_micros+f.unreconciled_exposure_ceiling_micros+
      f.retry_exposure_ceiling_micros
   end amount
  from facts f
 ), opening as (
  select coalesce(sum(amount_micros),0)::bigint amount
  from tongs.legacy_supplier_opening_commitments
  where environment=(select environment from selected_policy) and status='unresolved'
 )
 select (coalesce(sum(amount),0)+(select amount from opening))::bigint,
   coalesce(count(*) filter(where amount>0 and last_type<>'reconciled'),0)::bigint
 from amounts;
$$;

-- Estimated realized direct cost remains committed together with supporting
-- and rounding risk until authoritative evidence adjusts it.
create or replace function tongs.record_paid_operation_aggregate_outcome(
 p_reservation_id uuid,p_event_key text,p_outcome text,p_supplier_obligation_micros bigint default null,
 p_supplier_recovery_micros bigint default null,p_evidence_json jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare b tongs.paid_operation_aggregate_bindings%rowtype; event_type text; loss bigint:=0;
 result jsonb; remaining bigint; rounding_risk bigint;
begin
 perform tongs._require_pricing_service_role();
 select * into b from tongs.paid_operation_aggregate_bindings where reservation_id=p_reservation_id;
 if not found then return jsonb_build_object('enforcement_enabled',false,'recorded',false,'reason','aggregate_assignment_inactive'); end if;
 event_type:=case p_outcome when 'preprovider_release' then 'released' when 'ambiguous' then 'ambiguous'
  when 'failure' then 'customer_relieved_supplier_obligation' when 'settled_unconfirmed' then 'settled_unconfirmed'
  when 'reconciled_partial' then 'reconciliation_partial' when 'reconciled' then 'reconciled'
  when 'supplier_recovery' then 'supplier_recovery' else null end;
 if event_type is null then raise exception 'invalid aggregate outcome' using errcode='22023'; end if;
 if p_outcome='failure' then loss:=coalesce(p_supplier_obligation_micros,0); end if;
 result:=tongs.record_restricted_beta_exposure_outcome(
  b.hold_id,p_event_key,event_type,p_supplier_obligation_micros,p_supplier_recovery_micros,
  case when p_outcome='failure' then -b.customer_funding_ceiling_micros else 0 end,loss,p_evidence_json);
 if p_outcome='settled_unconfirmed' and p_supplier_obligation_micros is not null
    and coalesce((p_evidence_json->>'provider_usage_reported')::boolean,false) is true then
  rounding_risk:=case when b.credential_funding='forge' then
    least(greatest(coalesce((p_evidence_json->>'direct_cost_rounding_risk_micros')::bigint,3),0),3)
    else 0 end;
  remaining:=p_supplier_obligation_micros+rounding_risk;
  result:=result||jsonb_build_object('conservative_finalization',tongs.record_restricted_beta_exposure_adjustment(
    b.hold_id,p_event_key||':reconciliation-risk','reconciliation_risk',remaining,
    remaining-(b.supplier_exposure_ceiling_micros+b.supporting_exposure_ceiling_micros),
    p_supplier_obligation_micros,jsonb_build_object('authoritative',false,'estimated_realized_supplier_expense_retained',true,
      'direct_rounding_risk_micros',rounding_risk,'supporting_and_tail_costs_remain_unconfirmed',true)));
 elsif p_outcome in ('reconciled','reconciled_partial') then
  result:=result||jsonb_build_object('admission_control',tongs._maybe_halt_restricted_beta_policy(
    b.policy_revision_id,p_event_key||':capacity-check',p_evidence_json));
 end if;
 return jsonb_build_object('enforcement_enabled',true,'recorded',true)||result;
end $$;

-- Repair prior settled-estimated holds whose direct realized estimate was
-- accidentally omitted from remaining exposure. History is appended, never rewritten.
with candidates as (
 select h.id hold_id,b.reservation_id,
   (select e.supplier_obligation_micros from tongs.restricted_beta_exposure_events e
     where e.hold_id=h.id and e.event_type='settled_unconfirmed' and e.supplier_obligation_micros is not null
     order by e.sequence desc limit 1) supplier,
   (select e.remaining_exposure_micros from tongs.restricted_beta_exposure_events e
     where e.hold_id=h.id and e.remaining_exposure_micros is not null order by e.sequence desc limit 1) remaining
 from tongs.restricted_beta_exposure_holds h
 join tongs.paid_operation_aggregate_bindings b on b.hold_id=h.id
), repair as (
 select * from candidates where supplier is not null and coalesce(remaining,0)<supplier
)
insert into tongs.restricted_beta_exposure_events(
 id,hold_id,sequence,event_key,event_type,supplier_obligation_micros,remaining_exposure_micros,
 exposure_adjustment_micros,evidence_json
)
select extensions.uuid_generate_v5(r.hold_id,'estimated-direct-retention-repair-v1'),r.hold_id,
 (select coalesce(max(sequence),0)+1 from tongs.restricted_beta_exposure_events e where e.hold_id=r.hold_id),
 'exposure-repair:'||r.hold_id::text||':estimated-direct-v1','reconciliation_risk',r.supplier,
 r.supplier+3,(r.supplier+3)-coalesce(r.remaining,0),
 jsonb_build_object('authoritative',false,'migration','20261008120000','estimated_realized_supplier_expense_retained',true)
from repair r on conflict(event_key) do nothing;

create or replace function tongs.activate_owner_hearth_compatibility_package(
 p_owner_user_id uuid,p_workspace_id uuid,p_operator_user_id uuid,p_authorization_id uuid,p_budget_id uuid,
 p_tail_authorization_id uuid,p_reason text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare actor uuid:=p_operator_user_id; event_id uuid; pref_revision integer; authrow tongs.owner_hearth_authorizations%rowtype;
  markup_rules tongs.private_markup_rule_revisions%rowtype; spec record; price_id uuid; policy_id uuid; auth_event uuid;
begin
 if coalesce(auth.role(),'')<>'service_role' or actor is null or not tongs.is_platform_operator(actor)
    or p_owner_user_id is null or p_workspace_id is null or p_authorization_id is null or p_budget_id is null
    or p_tail_authorization_id is null or length(btrim(coalesce(p_reason,'')))<3 then
  raise exception 'service-role platform operator activation required' using errcode='42501'; end if;
 if not exists(select 1 from tongs.owner_testing_principals where user_id=p_owner_user_id and status='enabled')
    or not exists(select 1 from tongs.workspace_members where user_id=p_owner_user_id and workspace_id=p_workspace_id) then
  raise exception 'explicit owner principal and workspace membership required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('owner-hearth-activation:'||p_owner_user_id::text,0));
 select * into authrow from tongs.owner_hearth_authorizations where id=p_authorization_id;
 if found then return jsonb_build_object('authorization_id',authrow.id,'replay',true); end if;
 select * into markup_rules from tongs.private_markup_rule_revisions order by revision desc limit 1;
 if markup_rules.id is null or markup_rules.default_markup_basis_points<>3300 then
  raise exception 'private 33 percent default markup revision required' using errcode='P0001'; end if;

 select coalesce(max(revision),0)+1 into pref_revision from tongs.ai_funding_preference_revisions where user_id=p_owner_user_id and workspace_id=p_workspace_id;
 insert into tongs.ai_funding_preference_revisions(id,user_id,workspace_id,revision,payer_kind,actor_id)
 values(gen_random_uuid(),p_owner_user_id,p_workspace_id,pref_revision,'owner_testing',actor);

 event_id:=gen_random_uuid();
 perform tongs._create_accounting_event(event_id,'owner-hearth-compat-budget:'||p_budget_id::text,
  'owner_operating_budget_created','owner_internal','owner_operating_budget',p_budget_id::text,'USD',
  p_owner_user_id,p_workspace_id,actor,jsonb_build_object('maximum_amount_micros',90000,'customer_revenue_micros',0,'reason',p_reason),now());
 insert into tongs.owner_operating_budgets(id,environment,workspace_id,provider,route,sku,currency,period_start,period_end,created_by,owner_testing_user_id)
 values(p_budget_id,'production',p_workspace_id,'openai','hearth.chat_completion',null,'USD',now(),now()+interval '24 hours',actor,p_owner_user_id);
 insert into tongs.owner_operating_budget_revisions(budget_id,revision,status,maximum_amount_micros,reason,actor_id,journal_event_id)
 values(p_budget_id,1,'active',90000,p_reason,actor,event_id);
 insert into tongs.owner_hearth_authorizations(id,authorization_kind,owner_user_id,workspace_id,budget_id,maximum_amount_micros,
  maximum_operations,maximum_concurrency,maximum_attempts,failure_loss_limit_micros,duration_seconds,created_by)
 values(p_authorization_id,'compatibility_batch',p_owner_user_id,p_workspace_id,p_budget_id,90000,5,1,1,90000,86400,actor);
 auth_event:=gen_random_uuid();
 insert into tongs.owner_hearth_authorization_events(id,authorization_id,sequence,event_key,state,started_at,expires_at,reason,evidence_json)
 values(auth_event,p_authorization_id,1,'owner-hearth-compat:'||p_authorization_id::text||':active','active',now(),now()+interval '24 hours',p_reason,
  jsonb_build_object('maximum_provider_calls',5,'aggregate_cap_micros',90000,'prompt','Reply with exactly: Ready.','concurrency',1));
 insert into tongs.owner_hearth_tail_authorizations(id,owner_user_id,workspace_id,currency,monthly_limit_micros,aggregate_limit_micros,
  canonical_capacity_bytes,evidence_capacity_bytes,replacement_rate_micros_per_mib_month,coverage_months,created_by)
 values(p_tail_authorization_id,p_owner_user_id,p_workspace_id,'USD',20000,240000,134217728,33554432,123,12,actor);
 insert into tongs.owner_hearth_tail_events(id,tail_authorization_id,sequence,event_key,event_type,amount_micros,evidence_json)
 values(gen_random_uuid(),p_tail_authorization_id,1,'owner-hearth-tail:'||p_tail_authorization_id::text||':authorized','authorized',240000,
  jsonb_build_object('first_30_days_excluded',true,'coverage_begins_at_each_artifact_day_30',true,'automatic_renewal',false));

 for spec in select * from (values
  (1,'gpt-6-astra','GPT-6 Astra','81000000-0000-4000-8000-000000000001'::uuid,30919::bigint,'compatibility'),
  (2,'gpt-5.6-sol','GPT-5.6 Sol','81000000-0000-4000-8000-000000000002'::uuid,13243::bigint,'compatibility'),
  (3,'gpt-5.6-terra','GPT-5.6 Terra','81000000-0000-4000-8000-000000000003'::uuid,8379::bigint,'compatibility'),
  (4,'gpt-5.4-mini-2026-03-17','GPT-5.4 Mini','81000000-0000-4000-8000-000000000004'::uuid,4062::bigint,'compatibility'),
  (5,'gpt-5.6-luna','GPT-5.6 Luna','81000000-0000-4000-8000-000000000005'::uuid,2151::bigint,'compatibility')
 ) v(ordinal,model_id,display_name,cost_id,max_exposure,kind)
 loop
  policy_id:=extensions.uuid_generate_v5(p_authorization_id,'pricing-policy:'||spec.model_id);
  price_id:=extensions.uuid_generate_v5(p_authorization_id,'pricing-revision:'||spec.model_id);
  insert into tongs.private_pricing_policies(id,policy_code,scope_kind,provider,sku,created_by)
  values(policy_id,'owner-hearth-compat-'||spec.ordinal,'sku','openai','owner-hearth-compat:'||spec.model_id,actor);
  insert into tongs.private_pricing_revisions(id,policy_id,revision,lifecycle_state,currency,markup_basis_points,
   full_cost_ceiling_micros,failure_cost_ceiling_micros,customer_price_ceiling_micros,billable_failure_ceiling_micros,
   customer_credit_units,billable_failure_classes,free_failure_classes,included_quantity,retention_policy,change_reason,content_hash,actor_id)
  select price_id,policy_id,1,'review_ready','USD',3300,c.full_cost_ceiling_micros,c.full_cost_ceiling_micros,
   ((c.full_cost_ceiling_micros*133+999999)/1000000)*10000,0,0,'[]'::jsonb,
   '["provider_failure","forge_failure","forge_validation_failure","persistence_failure","unknown_fault"]'::jsonb,
   jsonb_build_object('input_tokens',c.maximum_input_units,'output_tokens',c.maximum_output_units,'attempts',1),
   jsonb_build_object('first_30_days','included_in_supporting_allocation','post_day_30','separate_owner_tail_authorization'),
   'Private owner compatibility basis; no customer price publication.',
   encode(extensions.digest(convert_to(p_authorization_id::text||':'||spec.model_id||':3300:'||c.full_cost_ceiling_micros::text,'utf8'),'sha256'),'hex'),actor
  from tongs.openai_text_cost_policy_revisions c where c.id=spec.cost_id;
  insert into tongs.owner_hearth_model_terms(authorization_id,ordinal,provider_model_id,display_name,cost_policy_revision_id,
   pricing_revision_id,aggregate_policy_revision_id,maximum_exposure_micros)
  values(p_authorization_id,spec.ordinal,spec.model_id,spec.display_name,spec.cost_id,price_id,
   extensions.uuid_generate_v5('83000000-0000-4000-8000-000000000000'::uuid,'compatibility:'||spec.model_id),spec.max_exposure);
 end loop;
 return jsonb_build_object('authorization_id',p_authorization_id,'budget_id',p_budget_id,'tail_authorization_id',p_tail_authorization_id,
  'maximum_amount_micros',90000,'admitted_total_micros',58754,'replay',false);
end $$;

create or replace function tongs.refresh_owner_hearth_tail_expiry(
 p_owner_user_id uuid,p_workspace_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare tail tongs.owner_hearth_tail_authorizations%rowtype; period_row record; seq integer; appended integer:=0;
begin
 perform tongs._require_pricing_service_role();
 select * into tail from tongs.owner_hearth_tail_authorizations
 where owner_user_id=p_owner_user_id and workspace_id=p_workspace_id order by created_at desc limit 1;
 if not found then return jsonb_build_object('tail_authorization_found',false,'expired_periods',0); end if;
 for period_row in select p.* from tongs.owner_hearth_tail_periods p where p.tail_authorization_id=tail.id and p.coverage_end<=now()
 loop
  select coalesce(max(sequence),0)+1 into seq from tongs.owner_hearth_tail_events where tail_authorization_id=tail.id;
  insert into tongs.owner_hearth_tail_events(id,tail_authorization_id,sequence,event_key,event_type,evidence_json)
  values(gen_random_uuid(),tail.id,seq,'owner-hearth-tail:'||tail.id::text||':expired:'||period_row.id::text,'funding_expired',
   jsonb_build_object('tail_period_id',period_row.id,'coverage_end',period_row.coverage_end,'content_preserved',true,'costs_continue',true))
  on conflict(event_key) do nothing;
  if found then appended:=appended+1; end if;
  select coalesce(max(sequence),0)+1 into seq from tongs.owner_hearth_tail_events where tail_authorization_id=tail.id;
  insert into tongs.owner_hearth_tail_events(id,tail_authorization_id,sequence,event_key,event_type,evidence_json)
  values(gen_random_uuid(),tail.id,seq,'owner-hearth-tail:'||tail.id::text||':continuing:'||period_row.id::text,'continuing_obligation',
   jsonb_build_object('tail_period_id',period_row.id,'coverage_end',period_row.coverage_end,'replacement_funding_required',true,
    'canonical_content_preserved',true,'provider_evidence_preserved',true,'reported_cost_is_not_zero',true))
  on conflict(event_key) do nothing;
 end loop;
 return jsonb_build_object('tail_authorization_found',true,'expiry_events_appended',appended,
  'expired_periods',(select count(*) from tongs.owner_hearth_tail_periods p where p.tail_authorization_id=tail.id and p.coverage_end<=now()));
end $$;

create or replace function tongs.record_owner_hearth_tail_measurement(
 p_tail_authorization_id uuid,p_period_start date,p_canonical_retained_bytes bigint,p_evidence_retained_bytes bigint,
 p_cost_status text,p_measurement_key text,p_evidence_json jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare tail tongs.owner_hearth_tail_authorizations%rowtype; existing tongs.owner_hearth_tail_measurements%rowtype;
 revision_number integer; amount bigint; authorized_total bigint; seq integer; overrun boolean;
begin
 perform tongs._require_pricing_service_role();
 select * into existing from tongs.owner_hearth_tail_measurements where measurement_key=btrim(p_measurement_key);
 if found then return to_jsonb(existing)||jsonb_build_object('replay',true); end if;
 select * into tail from tongs.owner_hearth_tail_authorizations where id=p_tail_authorization_id for update;
 if not found or p_cost_status not in ('measured_estimate','authoritative') or p_canonical_retained_bytes<0 or p_evidence_retained_bytes<0
   or p_canonical_retained_bytes>tail.canonical_capacity_bytes or p_evidence_retained_bytes>tail.evidence_capacity_bytes then
  raise exception 'tail measurement exceeds authorized class capacity' using errcode='22023'; end if;
 amount:=ceil(((p_canonical_retained_bytes+p_evidence_retained_bytes)::numeric*tail.replacement_rate_micros_per_mib_month)/1048576)::bigint;
 select coalesce(max(revision),0)+1 into revision_number from tongs.owner_hearth_tail_measurements
 where tail_authorization_id=tail.id and period_start=p_period_start;
 select coalesce(sum(latest.estimated_cost_micros),0) into authorized_total from (
  select distinct on (m.period_start) m.period_start,m.estimated_cost_micros from tongs.owner_hearth_tail_measurements m
  where m.tail_authorization_id=tail.id order by m.period_start,m.revision desc
 ) latest;
 overrun:=amount>tail.monthly_limit_micros or authorized_total+amount>tail.aggregate_limit_micros;
 insert into tongs.owner_hearth_tail_measurements(id,tail_authorization_id,period_start,revision,canonical_retained_bytes,
  evidence_retained_bytes,estimated_cost_micros,cost_status,measurement_key,evidence_json)
 values(gen_random_uuid(),tail.id,p_period_start,revision_number,p_canonical_retained_bytes,p_evidence_retained_bytes,amount,p_cost_status,
  btrim(p_measurement_key),coalesce(p_evidence_json,'{}'::jsonb)||jsonb_build_object('replacement_cost_basis',true,'incremental_invoice_claimed',false))
 returning * into existing;
 if overrun then
  select coalesce(max(sequence),0)+1 into seq from tongs.owner_hearth_tail_events where tail_authorization_id=tail.id;
  insert into tongs.owner_hearth_tail_events(id,tail_authorization_id,sequence,event_key,event_type,amount_micros,retained_bytes,evidence_json)
  values(gen_random_uuid(),tail.id,seq,'owner-hearth-tail:'||tail.id::text||':overrun:'||btrim(p_measurement_key),'continuing_obligation',amount,
   p_canonical_retained_bytes+p_evidence_retained_bytes,jsonb_build_object('coverage_incomplete',true,'halt_new_required',true,
    'monthly_limit_micros',tail.monthly_limit_micros,'aggregate_limit_micros',tail.aggregate_limit_micros));
 end if;
 return to_jsonb(existing)||jsonb_build_object('replay',false,'coverage_incomplete',overrun);
end $$;

create or replace function tongs.read_owner_hearth_execution_requirement(
 p_owner_user_id uuid,p_workspace_id uuid,p_route_code text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare principal tongs.owner_testing_principals%rowtype; authz tongs.owner_hearth_authorizations%rowtype; ev tongs.owner_hearth_authorization_events%rowtype;
  tail tongs.owner_hearth_tail_authorizations%rowtype; expired_count bigint;
begin
 perform tongs._require_pricing_service_role();
 if p_route_code<>'hearth.chat_completion' or p_owner_user_id is null or p_workspace_id is null then
  return tongs.read_openai_text_route_execution_requirement(p_route_code); end if;
 select * into principal from tongs.owner_testing_principals where user_id=p_owner_user_id and status='enabled';
 if not found or not exists(select 1 from tongs.workspace_members where workspace_id=p_workspace_id and user_id=p_owner_user_id) then
  return tongs.read_openai_text_route_execution_requirement(p_route_code); end if;
 perform tongs.refresh_owner_hearth_tail_expiry(p_owner_user_id,p_workspace_id);
 select a.* into authz from tongs.owner_hearth_authorizations a
 join lateral(select * from tongs.owner_hearth_authorization_events e where e.authorization_id=a.id order by sequence desc limit 1) latest on true
 where a.owner_user_id=p_owner_user_id and a.workspace_id=p_workspace_id and latest.state in ('active','dormant')
   and (latest.expires_at is null or latest.expires_at>now())
 order by (a.authorization_kind='creator_session') desc,a.created_at desc limit 1;
 if not found then return tongs.read_openai_text_route_execution_requirement(p_route_code); end if;
 select * into ev from tongs.owner_hearth_authorization_events where authorization_id=authz.id order by sequence desc limit 1;
 select * into tail from tongs.owner_hearth_tail_authorizations where owner_user_id=p_owner_user_id and workspace_id=p_workspace_id order by created_at desc limit 1;
 select count(*) into expired_count from tongs.owner_hearth_tail_periods p where p.tail_authorization_id=tail.id and p.coverage_end<=now()
   and not exists(select 1 from tongs.owner_hearth_tail_events e where e.tail_authorization_id=tail.id and e.event_type='replacement_funded' and e.created_at>=p.coverage_end);
 if exists(select 1 from tongs.owner_hearth_tail_events e where e.tail_authorization_id=tail.id and e.event_type='continuing_obligation'
   and coalesce((e.evidence_json->>'halt_new_required')::boolean,false)) then expired_count:=expired_count+1; end if;
 if expired_count>0 then return jsonb_build_object('route_code',p_route_code,'mode','halt_new','funding_context_required',true,
   'owner_testing_effective',true,'reason','owner_tail_replacement_funding_required'); end if;
 return jsonb_build_object('route_code',p_route_code,'mode','enforce','funding_context_required',true,
  'owner_testing_effective',true,'authorization_id',authz.id,'authorization_kind',authz.authorization_kind,
  'authorization_state',ev.state,'dedicated_credential_required',true);
end $$;

create or replace function tongs.resolve_owner_hearth_model_for_operation(
 p_owner_user_id uuid,p_workspace_id uuid,p_requested_provider_model_id text default null
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare authz tongs.owner_hearth_authorizations%rowtype; ev tongs.owner_hearth_authorization_events%rowtype; term tongs.owner_hearth_model_terms%rowtype;
  pref tongs.openai_text_user_model_preference_revisions%rowtype;
begin
 perform tongs._require_pricing_service_role();
 select a.* into authz from tongs.owner_hearth_authorizations a
 join lateral(select * from tongs.owner_hearth_authorization_events e where e.authorization_id=a.id order by sequence desc limit 1) latest on true
 where a.owner_user_id=p_owner_user_id and a.workspace_id=p_workspace_id and latest.state in ('active','dormant')
   and (latest.expires_at is null or latest.expires_at>now())
 order by (a.authorization_kind='creator_session') desc,a.created_at desc limit 1;
 if not found then raise exception 'owner Hearth authorization is not active' using errcode='42501'; end if;
 select * into ev from tongs.owner_hearth_authorization_events where authorization_id=authz.id order by sequence desc limit 1;
 select * into pref from tongs.openai_text_user_model_preference_revisions where user_id=p_owner_user_id order by revision desc limit 1;
 select t.* into term from tongs.owner_hearth_model_terms t where t.authorization_id=authz.id
   and (case when nullif(btrim(coalesce(p_requested_provider_model_id,'')),'') is not null then t.provider_model_id=btrim(p_requested_provider_model_id)
      when coalesce(pref.preference_kind,'best_available')='specific' then t.provider_model_id=pref.provider_model_id else true end)
 order by t.ordinal limit 1;
 if not found then raise exception 'requested owner Hearth model is not eligible' using errcode='P0001'; end if;
 return jsonb_build_object('authorization_id',authz.id,'authorization_kind',authz.authorization_kind,'authorization_state',ev.state,
  'provider_model_id',term.provider_model_id,'runtime_model_id',term.provider_model_id,'display_name',term.display_name,
  'cost_policy_revision_id',term.cost_policy_revision_id,'pricing_revision_id',term.pricing_revision_id,
  'maximum_exposure_micros',term.maximum_exposure_micros);
end $$;

create or replace function tongs.prepare_owner_hearth_operation(
 p_operation_authorization_id uuid,p_quote_id uuid,p_acceptance_id uuid,p_reservation_id uuid,
 p_owner_user_id uuid,p_workspace_id uuid,p_workpiece_id text,p_operation_id text,p_provider_model_id text,
 p_request_fingerprint text,p_serialized_body_sha256 text,p_serialized_bytes bigint,p_tokenizer_input_tokens bigint,
 p_protocol_overhead_tokens bigint,p_bounded_input_tokens bigint,p_maximum_output_tokens bigint,p_maximum_attempts smallint,
 p_estimator_revision text,p_tokenizer_revision text,p_expires_at timestamptz
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare authz tongs.owner_hearth_authorizations%rowtype; latest tongs.owner_hearth_authorization_events%rowtype; term tongs.owner_hearth_model_terms%rowtype;
 cost tongs.openai_text_cost_policy_revisions%rowtype; price tongs.private_pricing_revisions%rowtype; existing tongs.owner_hearth_operation_authorizations%rowtype;
 count_ops bigint; active_ops bigint; consumed bigint; held bigint; quote_hash text; nextseq integer; session_expiry timestamptz;
 rollout tongs.openai_text_rollout_revisions%rowtype;
begin
 perform tongs._require_pricing_service_role();
 if p_request_fingerprint!~'^[0-9a-f]{64}$' or p_serialized_body_sha256!~'^[0-9a-f]{64}$'
    or p_serialized_bytes<=0 or p_bounded_input_tokens<>greatest(p_tokenizer_input_tokens+p_protocol_overhead_tokens,p_serialized_bytes)
    or p_maximum_attempts<>1 or p_expires_at<=now() or p_expires_at>now()+interval '24 hours' then
  raise exception 'invalid exact owner Hearth request evidence' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('owner-hearth-prepare:'||p_owner_user_id::text,0));
 select * into existing from tongs.owner_hearth_operation_authorizations where operation_id=btrim(p_operation_id);
 if found then
  if existing.owner_user_id<>p_owner_user_id or existing.workspace_id<>p_workspace_id or existing.workpiece_id<>btrim(p_workpiece_id)
    or existing.provider_model_id<>btrim(p_provider_model_id) or existing.request_fingerprint<>p_request_fingerprint
    or existing.serialized_body_sha256<>p_serialized_body_sha256 then raise exception 'owner Hearth operation replay conflict' using errcode='23505'; end if;
  return jsonb_build_object('operation_id',existing.operation_id,'reservation_id',existing.reservation_id,
   'request_fingerprint',existing.request_fingerprint,'model',existing.provider_model_id,'replay',true);
 end if;
 select a.* into authz from tongs.owner_hearth_authorizations a
 join lateral(select * from tongs.owner_hearth_authorization_events e where e.authorization_id=a.id order by sequence desc limit 1) ev on true
 where a.owner_user_id=p_owner_user_id and a.workspace_id=p_workspace_id and ev.state in ('active','dormant')
   and (ev.expires_at is null or ev.expires_at>now())
 order by (a.authorization_kind='creator_session') desc,a.created_at desc limit 1 for update of a;
 if not found then raise exception 'owner Hearth authorization is not active' using errcode='42501'; end if;
 select * into latest from tongs.owner_hearth_authorization_events where authorization_id=authz.id order by sequence desc limit 1;
 if authz.authorization_kind='creator_session' and latest.state='dormant' then
  session_expiry:=now()+make_interval(secs=>authz.duration_seconds);
  select coalesce(max(sequence),0)+1 into nextseq from tongs.owner_hearth_authorization_events where authorization_id=authz.id;
  insert into tongs.owner_hearth_authorization_events(id,authorization_id,sequence,event_key,state,started_at,expires_at,reason,evidence_json)
  values(gen_random_uuid(),authz.id,nextseq,'owner-hearth-session:'||authz.id::text||':activated','active',now(),session_expiry,
   'First accepted owner creator operation started the approved 24-hour session.','{"automatic_renewal":false}'::jsonb) returning * into latest;
 end if;
 if latest.state<>'active' or latest.expires_at<=now() then raise exception 'owner Hearth authorization is halted or expired' using errcode='42501'; end if;
 select * into term from tongs.owner_hearth_model_terms where authorization_id=authz.id and provider_model_id=btrim(p_provider_model_id);
 select * into cost from tongs.openai_text_cost_policy_revisions where id=term.cost_policy_revision_id;
 select * into price from tongs.private_pricing_revisions where id=term.pricing_revision_id;
 if term.authorization_id is null or cost.id is null or price.id is null or cost.maximum_input_units<p_bounded_input_tokens
    or cost.maximum_output_units<>p_maximum_output_tokens or cost.maximum_attempts<>p_maximum_attempts
    or price.markup_basis_points<>3300 or price.lifecycle_state<>'review_ready' then
  raise exception 'exact owner Hearth cost and pricing terms required' using errcode='P0001'; end if;
 select count(*) into count_ops from tongs.owner_hearth_operation_authorizations where authorization_id=authz.id;
 if count_ops>=authz.maximum_operations then raise exception 'owner Hearth operation limit reached' using errcode='P0001'; end if;
 if authz.authorization_kind='compatibility_batch' and exists(select 1 from tongs.owner_hearth_operation_authorizations where authorization_id=authz.id and provider_model_id=term.provider_model_id) then
  raise exception 'compatibility model already attempted' using errcode='P0001'; end if;
 select count(*) into active_ops from tongs.owner_hearth_operation_authorizations o where o.authorization_id=authz.id
  and tongs._funding_reservation_state(o.reservation_id) in ('reserved','provider_attempt_shadowed','submission_unknown');
 if active_ops>=authz.maximum_concurrency then raise exception 'owner Hearth concurrency limit reached' using errcode='P0001'; end if;
 select coalesce(sum(c.expense_amount_micros),0) into consumed from tongs.owner_operating_budget_consumptions c where c.budget_id=authz.budget_id;
 select coalesce(sum(r.reserved_wholesale_spend_micros),0) into held from tongs.funding_reservations r where r.funding_source_type='owner_budget' and r.funding_source_id=authz.budget_id
  and tongs._funding_reservation_state(r.id) not in ('settled','released');
 if consumed+held+cost.full_cost_ceiling_micros+3>authz.maximum_amount_micros then raise exception 'owner Hearth amount cap exhausted' using errcode='P0001'; end if;
 quote_hash:=encode(extensions.digest(convert_to(jsonb_build_object('quote_id',p_quote_id,'operation_id',btrim(p_operation_id),
  'owner_user_id',p_owner_user_id,'workspace_id',p_workspace_id,'workpiece_id',btrim(p_workpiece_id),'model',term.provider_model_id,
  'pricing_revision_id',price.id,'cost_policy_revision_id',cost.id,'request_fingerprint',p_request_fingerprint,
  'serialized_body_sha256',p_serialized_body_sha256,'full_cost_ceiling_micros',cost.full_cost_ceiling_micros,'customer_charge_micros',0,
  'expires_at',p_expires_at)::text,'utf8'),'sha256'),'hex');
 insert into tongs.customer_spending_quotes(id,user_id,operation_id,tool,workspace_id,pricing_revision_id,pricing_revision,currency,
  normal_maximum_charge_micros,billable_failure_maximum_charge_micros,customer_credit_units,full_cost_ceiling_micros,
  billable_failure_classes,free_failure_classes,included_quantity,retention_policy,provider_funding_summary,request_fingerprint,quote_hash,expires_at)
 values(p_quote_id,p_owner_user_id,btrim(p_operation_id),'hearth.chat_completion',p_workspace_id,price.id,price.revision,'USD',0,0,0,cost.full_cost_ceiling_micros,
  '[]'::jsonb,'["provider_failure","forge_failure","forge_validation_failure","persistence_failure","unknown_fault"]'::jsonb,
  jsonb_build_object('input_tokens',cost.maximum_input_units,'output_tokens',cost.maximum_output_units,'attempts',1),
  jsonb_build_object('first_30_days','included','post_day_30','separate_owner_tail_allocation'),
  '[{"component":"openai_text","provider_label":"OpenAI","credential_source":"forge_owner_isolated"}]'::jsonb,
  p_request_fingerprint,quote_hash,p_expires_at);
 insert into tongs.customer_spending_quote_acceptances(id,quote_id,user_id,acceptance_key,accepted_quote_hash)
 values(p_acceptance_id,p_quote_id,p_owner_user_id,'owner-hearth:'||p_quote_id::text,quote_hash);
 insert into tongs.funding_reservations(id,quote_id,user_id,operation_id,funding_source_type,funding_source_id,currency,
  reserved_customer_charge_micros,reserved_credit_units,reserved_wholesale_spend_micros,idempotency_key)
 values(p_reservation_id,p_quote_id,p_owner_user_id,btrim(p_operation_id),'owner_budget',authz.budget_id,'USD',0,0,cost.full_cost_ceiling_micros,
  'owner-hearth:'||p_reservation_id::text);
 insert into tongs.funding_reservation_events(id,reservation_id,sequence,event_type,event_key,evidence_json)
 values(gen_random_uuid(),p_reservation_id,1,'reserved','reservation:'||p_reservation_id::text||':reserved',
  jsonb_build_object('owner_hearth_authorization_id',authz.id,'customer_charge_micros',0,'provider_execution_authorized',false));
 select * into rollout from tongs._current_openai_text_rollout('hearth.chat_completion');
 insert into tongs.openai_text_funding_bindings(operation_id,route_code,reservation_id,credential_funding,model,pricing_revision_id,
  maximum_input_units,maximum_output_units,maximum_attempts,cost_policy_revision_id,rollout_revision)
 values(btrim(p_operation_id),'hearth.chat_completion',p_reservation_id,'forge',term.provider_model_id,price.id,cost.maximum_input_units,
  cost.maximum_output_units,1,cost.id,rollout.revision);
 insert into tongs.bounded_provider_quote_request_bindings(quote_id,route_code,operation_id,request_fingerprint,model,service_tier,
  pricing_revision_id,estimator_revision,tokenizer_revision,serialized_body_sha256,serialized_bytes,tokenizer_input_tokens,
  protocol_overhead_tokens,utf8_byte_token_upper_bound,bounded_input_tokens,maximum_output_tokens,maximum_attempts)
 values(p_quote_id,'hearth.chat_completion',btrim(p_operation_id),p_request_fingerprint,term.provider_model_id,'standard',price.id,
  btrim(p_estimator_revision),btrim(p_tokenizer_revision),p_serialized_body_sha256,p_serialized_bytes,p_tokenizer_input_tokens,
  p_protocol_overhead_tokens,p_serialized_bytes,p_bounded_input_tokens,p_maximum_output_tokens,p_maximum_attempts);
 insert into tongs.owner_hearth_operation_authorizations(id,authorization_id,operation_id,quote_id,reservation_id,owner_user_id,workspace_id,
  workpiece_id,provider_model_id,request_fingerprint,serialized_body_sha256,cost_policy_revision_id,pricing_revision_id,aggregate_policy_revision_id,expires_at)
 values(p_operation_authorization_id,authz.id,btrim(p_operation_id),p_quote_id,p_reservation_id,p_owner_user_id,p_workspace_id,btrim(p_workpiece_id),
  term.provider_model_id,p_request_fingerprint,p_serialized_body_sha256,cost.id,price.id,term.aggregate_policy_revision_id,p_expires_at);
 return jsonb_build_object('operation_id',btrim(p_operation_id),'reservation_id',p_reservation_id,'request_fingerprint',p_request_fingerprint,
  'model',term.provider_model_id,'authorization_kind',authz.authorization_kind,'customer_charge_micros',0,'replay',false);
end $$;

create or replace function tongs.resolve_owner_hearth_paid_execution_context(
 p_operation_id text,p_reservation_id uuid,p_user_id uuid,p_workspace_id uuid,p_workpiece_id text,p_request_fingerprint text
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare op tongs.owner_hearth_operation_authorizations%rowtype; authz tongs.owner_hearth_authorizations%rowtype; latest tongs.owner_hearth_authorization_events%rowtype;
 res tongs.funding_reservations%rowtype; cost tongs.openai_text_cost_policy_revisions%rowtype; rate tongs.openai_text_provider_rate_revisions%rowtype;
begin
 perform tongs._require_pricing_service_role();
 select * into op from tongs.owner_hearth_operation_authorizations where operation_id=btrim(p_operation_id) and reservation_id=p_reservation_id;
 select * into authz from tongs.owner_hearth_authorizations where id=op.authorization_id;
 select * into latest from tongs.owner_hearth_authorization_events where authorization_id=authz.id order by sequence desc limit 1;
 select * into res from tongs.funding_reservations where id=p_reservation_id;
 if op.id is null or authz.id is null or res.id is null or op.owner_user_id<>p_user_id or op.workspace_id<>p_workspace_id
   or op.workpiece_id<>btrim(p_workpiece_id) or op.request_fingerprint<>p_request_fingerprint or res.funding_source_id<>authz.budget_id
   or not exists(select 1 from tongs.customer_spending_quote_acceptances where quote_id=op.quote_id and user_id=p_user_id)
   then raise exception 'exact owner Hearth funding context required' using errcode='42501'; end if;
 if latest.state not in ('active','closed') or (latest.state='active' and latest.expires_at<=now()) then raise exception 'owner Hearth authorization halted' using errcode='42501'; end if;
 select * into cost from tongs.openai_text_cost_policy_revisions where id=op.cost_policy_revision_id;
 select r.* into rate from tongs.openai_text_provider_rate_revisions r where r.id=nullif(cost.attempt_plan->0->>'rate_revision_id','')::uuid;
 if cost.id is null or rate.id is null or rate.provider_model_id<>op.provider_model_id or res.reserved_wholesale_spend_micros<>cost.full_cost_ceiling_micros then
  raise exception 'exact owner Hearth model cost revision required' using errcode='P0001'; end if;
 return jsonb_build_object('operation_id',op.operation_id,'reservation_id',op.reservation_id,'quote_id',op.quote_id,'route_code','hearth.chat_completion',
  'user_id',op.owner_user_id,'workspace_id',op.workspace_id,'workpiece_id',op.workpiece_id,'request_fingerprint',op.request_fingerprint,
  'funding_source_type','owner_budget','funding_source_id',authz.budget_id,'credential_funding','forge','model',op.provider_model_id,
  'maximum_input_units',cost.maximum_input_units,'maximum_output_units',cost.maximum_output_units,'maximum_attempts',1,
  'maximum_failure_exposure_micros',cost.full_cost_ceiling_micros+3,'direct_provider_ceiling_micros',cost.direct_provider_ceiling_micros,
  'supporting_cost_ceiling_micros',cost.supporting_cost_ceiling_micros,'full_cost_ceiling_micros',cost.full_cost_ceiling_micros,
  'input_micros_per_million_tokens',rate.input_micros_per_million_tokens,'cached_input_micros_per_million_tokens',rate.cached_input_micros_per_million_tokens,
  'output_micros_per_million_tokens',rate.output_micros_per_million_tokens,'cost_policy_revision_id',cost.id,'pricing_revision_id',op.pricing_revision_id,
  'owner_hearth_authorization_id',authz.id,'reservation_state',tongs._funding_reservation_state(res.id));
end $$;

create or replace function tongs.acquire_owner_hearth_aggregate_admission(
 p_reservation_id uuid,p_caller_class text,p_provider_mode text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare op tongs.owner_hearth_operation_authorizations%rowtype; authz tongs.owner_hearth_authorizations%rowtype; res tongs.funding_reservations%rowtype;
 cost tongs.openai_text_cost_policy_revisions%rowtype; existing tongs.paid_operation_aggregate_bindings%rowtype; hold_id uuid; admitted jsonb;
begin
 perform tongs._require_pricing_service_role();
 if p_provider_mode<>'real' or p_caller_class not in ('interactive','recovery') then raise exception 'owner Hearth provider context denied' using errcode='42501'; end if;
 select * into existing from tongs.paid_operation_aggregate_bindings where reservation_id=p_reservation_id;
 if found then return jsonb_build_object('enforcement_enabled',true,'authorized',true,'replay',true,'hold_id',existing.hold_id,'reason','existing_authoritative_admission'); end if;
 select * into op from tongs.owner_hearth_operation_authorizations where reservation_id=p_reservation_id;
 select * into authz from tongs.owner_hearth_authorizations where id=op.authorization_id;
 select * into res from tongs.funding_reservations where id=p_reservation_id;
 select * into cost from tongs.openai_text_cost_policy_revisions where id=op.cost_policy_revision_id;
 if op.id is null or authz.id is null or res.id is null or cost.id is null or res.funding_source_id<>authz.budget_id then
  raise exception 'owner Hearth aggregate authority missing' using errcode='42501'; end if;
 hold_id:=extensions.uuid_generate_v5(p_reservation_id,'aggregate-exposure');
 admitted:=tongs.reserve_restricted_beta_exposure(hold_id,op.aggregate_policy_revision_id,'openai.text.hearth_chat',op.operation_id,
  op.owner_user_id,op.workspace_id,op.request_fingerprint,op.provider_model_id,'owner_operating_budget',p_reservation_id::text,
  'real',p_caller_class,0,cost.direct_provider_ceiling_micros,cost.supporting_cost_ceiling_micros,0,3,0,180,
  p_reservation_id::text||':aggregate-reserved');
 if coalesce((admitted->>'authorized')::boolean,false) then
  insert into tongs.paid_operation_aggregate_bindings(reservation_id,hold_id,policy_revision_id,capability_code,provider,operation_id,user_id,
   workspace_id,request_fingerprint,model_or_sku,funding_source_type,credential_funding,provider_mode,pricing_revision_id,cost_policy_revision_id,
   customer_funding_ceiling_micros,supplier_exposure_ceiling_micros,supporting_exposure_ceiling_micros)
  values(res.id,hold_id,op.aggregate_policy_revision_id,'openai.text.hearth_chat','openai',op.operation_id,op.owner_user_id,op.workspace_id,
   op.request_fingerprint,op.provider_model_id,'owner_budget','forge','real',op.pricing_revision_id,cost.id,0,cost.direct_provider_ceiling_micros,cost.supporting_cost_ceiling_micros);
 end if;
 return jsonb_build_object('enforcement_enabled',true)||admitted;
end $$;

create or replace function tongs.authorize_owner_hearth_provider_attempt_with_aggregate(
 p_reservation_id uuid,p_attempt_key text,p_attempt_number smallint,p_caller_class text,p_failure_exposure_micros bigint,
 p_lease_seconds integer,p_evidence_json jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare op tongs.owner_hearth_operation_authorizations%rowtype; authz tongs.owner_hearth_authorizations%rowtype; latest tongs.owner_hearth_authorization_events%rowtype;
 hold tongs.openai_text_failure_exposure_holds%rowtype; res tongs.funding_reservations%rowtype; aggregate_result jsonb;
 current_failure bigint; current_concurrency bigint; seq integer; lease timestamptz;
begin
 perform tongs._require_pricing_service_role();
 if p_attempt_number<>1 or p_caller_class not in ('interactive','recovery') or p_lease_seconds not between 5 and 900 then
  raise exception 'owner Hearth attempt outside authorization' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('owner-hearth-attempt:'||p_reservation_id::text,0));
 select * into op from tongs.owner_hearth_operation_authorizations where reservation_id=p_reservation_id;
 select * into authz from tongs.owner_hearth_authorizations where id=op.authorization_id;
 select * into latest from tongs.owner_hearth_authorization_events where authorization_id=authz.id order by sequence desc limit 1;
 select * into res from tongs.funding_reservations where id=p_reservation_id for update;
 if op.id is null or authz.id is null or latest.state<>'active' or latest.expires_at<=now() or res.id is null
   or p_failure_exposure_micros>authz.maximum_amount_micros then raise exception 'owner Hearth authorization unavailable' using errcode='42501'; end if;
 select * into hold from tongs.openai_text_failure_exposure_holds where attempt_key=btrim(p_attempt_key);
 if found then return jsonb_build_object('provider_execution_authorized',false,'replay',true,'reason','duplicate_attempt_blocked'); end if;
 select coalesce(sum(coalesce(e.actual_supplier_cost_micros,h.authorized_exposure_micros)),0) into current_failure
 from tongs.openai_text_failure_exposure_holds h join lateral(select * from tongs.openai_text_failure_exposure_events x where x.hold_id=h.id order by sequence desc limit 1)e on true
 join tongs.owner_hearth_operation_authorizations o on o.reservation_id=h.reservation_id
 where o.authorization_id=authz.id and e.event_type in ('failure_realized','unresolved');
 if current_failure+p_failure_exposure_micros>authz.failure_loss_limit_micros then raise exception 'owner Hearth failure-loss cap exhausted' using errcode='42501'; end if;
 select count(*) into current_concurrency from tongs.owner_hearth_operation_authorizations o where o.authorization_id=authz.id
   and o.reservation_id<>p_reservation_id and tongs._funding_reservation_state(o.reservation_id) in ('provider_attempt_shadowed','submission_unknown');
 if current_concurrency>=authz.maximum_concurrency then raise exception 'owner Hearth concurrency cap exhausted' using errcode='42501'; end if;
 aggregate_result:=tongs.begin_paid_operation_aggregate_attempt(p_reservation_id,p_attempt_key||':aggregate',1,p_caller_class);
 if coalesce((aggregate_result->>'enforcement_enabled')::boolean,false) and not coalesce((aggregate_result->>'authorized')::boolean,false) then
  return jsonb_build_object('provider_execution_authorized',false,'reason',aggregate_result->>'reason','aggregate_enforcement_enabled',true); end if;
 insert into tongs.openai_text_failure_exposure_holds(id,reservation_id,route_code,attempt_key,attempt_number,loss_policy_revision_id,
  authorized_exposure_micros,lease_expires_at)
 values(gen_random_uuid(),p_reservation_id,'hearth.chat_completion',btrim(p_attempt_key),1,null,p_failure_exposure_micros,now()+make_interval(secs=>p_lease_seconds)) returning * into hold;
 insert into tongs.openai_text_failure_exposure_events(id,hold_id,sequence,event_key,event_type,evidence_json)
 values(gen_random_uuid(),hold.id,1,btrim(p_attempt_key)||':loss-authorized','authorized',coalesce(p_evidence_json,'{}'::jsonb));
 if tongs._funding_reservation_state(res.id)<>'reserved' then raise exception 'owner Hearth reservation is not attemptable' using errcode='42501'; end if;
 select coalesce(max(sequence),0)+1 into seq from tongs.funding_reservation_events where reservation_id=res.id;
 lease:=now()+make_interval(secs=>p_lease_seconds);
 insert into tongs.funding_reservation_events(id,reservation_id,sequence,event_type,event_key,provider_attempt_key,lease_expires_at,evidence_json)
 values(gen_random_uuid(),res.id,seq,'provider_attempt_shadowed','reservation:'||res.id::text||':attempt:'||btrim(p_attempt_key),btrim(p_attempt_key),lease,
  coalesce(p_evidence_json,'{}'::jsonb)||jsonb_build_object('owner_hearth_authorization_id',authz.id,'isolated_credential_required',true));
 return jsonb_build_object('provider_execution_authorized',true,'reason','owner_hearth_authorized','replay',false,
  'failure_exposure_hold_id',hold.id,'aggregate_hold_id',aggregate_result->>'hold_id','lease_expires_at',lease);
end $$;

create or replace function tongs.settle_owner_hearth_operation(
 p_reservation_id uuid,p_settlement_id uuid,p_settlement_key text,p_outcome text,p_failure_class text,
 p_actual_fulfillment_cost_micros bigint,p_evidence_json jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare op tongs.owner_hearth_operation_authorizations%rowtype; res tongs.funding_reservations%rowtype;
 existing tongs.funding_reservation_events%rowtype; nextseq integer; consumption jsonb;
begin
 perform tongs._require_pricing_service_role();
 if p_settlement_id is null or length(btrim(coalesce(p_settlement_key,'')))<8
   or p_outcome not in ('success','billable_failure','nonbillable_failure') or p_actual_fulfillment_cost_micros<0
   or jsonb_typeof(coalesce(p_evidence_json,'null'::jsonb))<>'object' then
  raise exception 'invalid owner Hearth settlement' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('owner-hearth-settle:'||p_reservation_id::text,0));
 select * into op from tongs.owner_hearth_operation_authorizations where reservation_id=p_reservation_id;
 select * into res from tongs.funding_reservations where id=p_reservation_id for update;
 if op.id is null or res.id is null or res.funding_source_type<>'owner_budget'
   or res.funding_source_id<>(select a.budget_id from tongs.owner_hearth_authorizations a where a.id=op.authorization_id) then
  raise exception 'exact owner Hearth reservation required' using errcode='42501'; end if;
 select * into existing from tongs.funding_reservation_events where event_key=btrim(p_settlement_key);
 if found then return jsonb_build_object('reservation_id',p_reservation_id,'state','settled','replay',true,
  'owner_expense_micros',existing.wholesale_spend_micros,'customer_charge_micros',0,'customer_revenue_micros',0,'margin','not_applicable'); end if;
 if tongs._funding_reservation_state(p_reservation_id) in ('settled','released') then raise exception 'owner Hearth reservation is terminal' using errcode='P0001'; end if;
 if p_actual_fulfillment_cost_micros>res.reserved_wholesale_spend_micros then
  insert into tongs.pricing_discrepancies(id,reservation_id,discrepancy_key,discrepancy_type,quoted_ceiling_micros,observed_amount_micros,evidence_json)
  values(gen_random_uuid(),res.id,btrim(p_settlement_key)||':owner-cost-overrun','wholesale_ceiling_overrun',res.reserved_wholesale_spend_micros,
   p_actual_fulfillment_cost_micros,coalesce(p_evidence_json,'{}'::jsonb)) on conflict(discrepancy_key) do nothing;
 end if;
 if p_actual_fulfillment_cost_micros>0 then
  consumption:=tongs.consume_owner_operating_budget(p_settlement_id,res.funding_source_id,res.id,
   'owner-hearth-settlement:'||res.id::text,res.operation_id,p_actual_fulfillment_cost_micros,now(),
   coalesce(p_evidence_json,'{}'::jsonb)||jsonb_build_object('customer_revenue_micros',0,'operation_outcome',p_outcome));
 end if;
 select coalesce(max(sequence),0)+1 into nextseq from tongs.funding_reservation_events where reservation_id=res.id;
 insert into tongs.funding_reservation_events(id,reservation_id,sequence,event_type,event_key,customer_charge_micros,credit_units,
  wholesale_spend_micros,failure_class,evidence_json)
 values(gen_random_uuid(),res.id,nextseq,'settled',btrim(p_settlement_key),0,0,p_actual_fulfillment_cost_micros,
  nullif(btrim(coalesce(p_failure_class,'')),''),coalesce(p_evidence_json,'{}'::jsonb)||jsonb_build_object(
   'operation_outcome',p_outcome,'customer_revenue_micros',0,'supplier_cost_status',
   case when coalesce((p_evidence_json->>'authoritative')::boolean,false) then 'authoritative' else 'estimated' end));
 return jsonb_build_object('reservation_id',res.id,'state','settled','replay',false,'owner_expense_micros',p_actual_fulfillment_cost_micros,
  'customer_charge_micros',0,'customer_revenue_micros',0,'margin','not_applicable','cost_authoritative',
  coalesce((p_evidence_json->>'authoritative')::boolean,false));
end $$;

-- Allow the exact owner operation binding as an alternative to the ordinary
-- customer quote binding when proving the serialized request at submission.
create or replace function tongs.bind_bounded_provider_request(
  p_reservation_id uuid,p_route_code text,p_request_fingerprint text,p_model text,
  p_service_tier text,p_estimator_revision text,p_tokenizer_revision text,
  p_serialized_body_sha256 text,p_serialized_bytes bigint,p_tokenizer_input_tokens bigint,
  p_protocol_overhead_tokens bigint,p_utf8_byte_token_upper_bound bigint,
  p_bounded_input_tokens bigint,p_maximum_output_tokens bigint,p_maximum_attempts smallint
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare existing tongs.bounded_provider_request_bindings%rowtype; binding tongs.openai_text_funding_bindings%rowtype;
 reservation tongs.funding_reservations%rowtype; quote tongs.customer_spending_quotes%rowtype;
 authority tongs.spending_quote_authority_bindings%rowtype; quote_request tongs.bounded_provider_quote_request_bindings%rowtype;
 ownerop tongs.owner_hearth_operation_authorizations%rowtype; retention_hash text;
begin
 perform tongs._require_pricing_service_role();
 if p_serialized_body_sha256!~'^[0-9a-f]{64}$' or p_request_fingerprint!~'^[0-9a-f]{64}$' or p_serialized_bytes<=0
   or p_utf8_byte_token_upper_bound<>p_serialized_bytes
   or p_bounded_input_tokens<>greatest(p_tokenizer_input_tokens+p_protocol_overhead_tokens,p_utf8_byte_token_upper_bound)
   or p_maximum_attempts not between 1 and 4 then raise exception 'invalid bounded provider request evidence' using errcode='22023'; end if;
 select * into binding from tongs.openai_text_funding_bindings where reservation_id=p_reservation_id;
 select * into reservation from tongs.funding_reservations where id=p_reservation_id;
 select * into quote from tongs.customer_spending_quotes where id=reservation.quote_id;
 select * into authority from tongs.spending_quote_authority_bindings where quote_id=quote.id;
 select * into quote_request from tongs.bounded_provider_quote_request_bindings where quote_id=quote.id;
 select * into ownerop from tongs.owner_hearth_operation_authorizations where reservation_id=p_reservation_id;
 if binding.reservation_id is null or reservation.id is null or quote.id is null or authority.quote_id is null
   or binding.route_code<>p_route_code or binding.model<>p_model or quote.request_fingerprint<>p_request_fingerprint
   or quote_request.quote_id is null or quote_request.serialized_body_sha256<>p_serialized_body_sha256
   or quote_request.estimator_revision<>p_estimator_revision or quote_request.tokenizer_revision<>p_tokenizer_revision
   or quote_request.bounded_input_tokens<>p_bounded_input_tokens or quote_request.maximum_output_tokens<>p_maximum_output_tokens
   or quote_request.maximum_attempts<>p_maximum_attempts
   or (ownerop.id is not null and (ownerop.request_fingerprint<>p_request_fingerprint or ownerop.serialized_body_sha256<>p_serialized_body_sha256))
   then raise exception 'bounded request does not match accepted quote authority' using errcode='42501'; end if;
 retention_hash:=encode(extensions.digest(convert_to(quote.retention_policy::text,'utf8'),'sha256'),'hex');
 select * into existing from tongs.bounded_provider_request_bindings where reservation_id=p_reservation_id;
 if found then
  if existing.serialized_body_sha256<>p_serialized_body_sha256 or existing.accepted_authority_hash<>authority.accepted_authority_hash then
   raise exception 'bounded provider request replay conflict' using errcode='23505'; end if;
  return to_jsonb(existing)||jsonb_build_object('replay',true);
 end if;
 insert into tongs.bounded_provider_request_bindings(reservation_id,quote_id,operation_id,route_code,request_fingerprint,model,service_tier,
  pricing_revision_id,accepted_authority_hash,retention_policy_hash,estimator_revision,tokenizer_revision,serialized_body_sha256,
  serialized_bytes,tokenizer_input_tokens,protocol_overhead_tokens,utf8_byte_token_upper_bound,bounded_input_tokens,maximum_output_tokens,maximum_attempts)
 values(p_reservation_id,quote.id,reservation.operation_id,p_route_code,p_request_fingerprint,p_model,btrim(p_service_tier),quote.pricing_revision_id,
  authority.accepted_authority_hash,retention_hash,btrim(p_estimator_revision),btrim(p_tokenizer_revision),p_serialized_body_sha256,p_serialized_bytes,
  p_tokenizer_input_tokens,p_protocol_overhead_tokens,p_utf8_byte_token_upper_bound,p_bounded_input_tokens,p_maximum_output_tokens,p_maximum_attempts)
 returning * into existing;
 return to_jsonb(existing)||jsonb_build_object('replay',false);
end $$;

create or replace function tongs.record_owner_hearth_compatibility_result(
 p_reservation_id uuid,p_result_key text,p_status text,p_provider_request_id text,p_estimated_supplier_expense_micros bigint,
 p_authoritative_supplier_expense_micros bigint,p_evidence_json jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare op tongs.owner_hearth_operation_authorizations%rowtype; authz tongs.owner_hearth_authorizations%rowtype; existing tongs.owner_hearth_compatibility_results%rowtype;
begin
 perform tongs._require_pricing_service_role();
 select * into op from tongs.owner_hearth_operation_authorizations where reservation_id=p_reservation_id;
 select * into authz from tongs.owner_hearth_authorizations where id=op.authorization_id;
 if op.id is null or authz.authorization_kind<>'compatibility_batch' or p_status not in ('passed','definitive_rejection','billed_failure','ambiguous') then
  raise exception 'compatibility operation required' using errcode='42501'; end if;
 if p_status='passed' and (tongs._funding_reservation_state(p_reservation_id)<>'settled'
   or not exists(select 1 from tongs.openai_text_persisted_results where reservation_id=p_reservation_id and result_json->>'assistantText'='Ready.')) then
  raise exception 'validated persisted exact Ready result required' using errcode='P0001'; end if;
 select * into existing from tongs.owner_hearth_compatibility_results where operation_authorization_id=op.id;
 if found then return to_jsonb(existing)||jsonb_build_object('replay',true); end if;
 insert into tongs.owner_hearth_compatibility_results(id,operation_authorization_id,result_key,status,provider_request_id,
  estimated_supplier_expense_micros,authoritative_supplier_expense_micros,evidence_json)
 values(gen_random_uuid(),op.id,btrim(p_result_key),p_status,nullif(btrim(coalesce(p_provider_request_id,'')),''),
  p_estimated_supplier_expense_micros,p_authoritative_supplier_expense_micros,coalesce(p_evidence_json,'{}'::jsonb)) returning * into existing;
 if p_status='ambiguous' then
  insert into tongs.owner_hearth_authorization_events(id,authorization_id,sequence,event_key,state,started_at,expires_at,reason,evidence_json)
  select gen_random_uuid(),authz.id,coalesce(max(sequence),0)+1,'owner-hearth-compat:'||authz.id::text||':ambiguous-halt','halt_new',null,null,
   'Ambiguous provider submission halted compatibility activation.',jsonb_build_object('reservation_id',p_reservation_id)
  from tongs.owner_hearth_authorization_events where authorization_id=authz.id;
 end if;
 return to_jsonb(existing)||jsonb_build_object('replay',false);
end $$;

create or replace function tongs.finalize_owner_hearth_compatibility_batch(
 p_authorization_id uuid,p_operator_user_id uuid,p_session_authorization_id uuid,p_session_budget_id uuid,p_reason text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare authz tongs.owner_hearth_authorizations%rowtype; session_authz tongs.owner_hearth_authorizations%rowtype;
 latest tongs.owner_hearth_authorization_events%rowtype; passed bigint; event_id uuid;
 spec record; policy_id uuid; price_id uuid; catalog_id uuid:='89000000-0000-4000-8000-000000000003';
begin
 if coalesce(auth.role(),'')<>'service_role' or not tongs.is_platform_operator(p_operator_user_id) then raise exception 'service-role operator required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('owner-hearth-finalize:'||p_authorization_id::text,0));
 select * into session_authz from tongs.owner_hearth_authorizations where id=p_session_authorization_id;
 if found then
  if session_authz.authorization_kind<>'creator_session' or session_authz.budget_id<>p_session_budget_id then
   raise exception 'owner Hearth session finalization replay conflict' using errcode='23505';
  end if;
  return jsonb_build_object('compatibility_authorization_id',p_authorization_id,'compatibility_state','closed',
   'session_authorization_id',session_authz.id,'session_state','dormant','session_budget_id',session_authz.budget_id,
   'maximum_amount_micros',session_authz.maximum_amount_micros,'customer_price_published',false,'replay',true);
 end if;
 select * into authz from tongs.owner_hearth_authorizations where id=p_authorization_id;
 select * into latest from tongs.owner_hearth_authorization_events where authorization_id=authz.id order by sequence desc limit 1;
 select count(*) into passed from tongs.owner_hearth_compatibility_results r join tongs.owner_hearth_operation_authorizations o on o.id=r.operation_authorization_id
  where o.authorization_id=authz.id and r.status='passed';
 if authz.authorization_kind<>'compatibility_batch' or latest.state<>'active' or passed<>5
   or exists(select 1 from tongs.owner_hearth_compatibility_results r join tongs.owner_hearth_operation_authorizations o on o.id=r.operation_authorization_id
      where o.authorization_id=authz.id and r.status<>'passed') then raise exception 'all five compatibility operations must pass' using errcode='P0001'; end if;
 insert into tongs.owner_hearth_authorization_events(id,authorization_id,sequence,event_key,state,reason,evidence_json)
 select gen_random_uuid(),authz.id,coalesce(max(sequence),0)+1,'owner-hearth-compat:'||authz.id::text||':closed','closed',p_reason,
  jsonb_build_object('passed_models',5,'customer_charge_micros',0)
 from tongs.owner_hearth_authorization_events where authorization_id=authz.id;
 event_id:=gen_random_uuid();
 perform tongs._create_accounting_event(event_id,'owner-hearth-session-budget:'||p_session_budget_id::text,'owner_operating_budget_created',
  'owner_internal','owner_operating_budget',p_session_budget_id::text,'USD',authz.owner_user_id,authz.workspace_id,p_operator_user_id,
  jsonb_build_object('maximum_amount_micros',10000000,'state','dormant','customer_revenue_micros',0,'reason',p_reason),now());
 insert into tongs.owner_operating_budgets(id,environment,workspace_id,provider,route,sku,currency,period_start,period_end,created_by,owner_testing_user_id)
 values(p_session_budget_id,'production',authz.workspace_id,'openai','hearth.chat_completion',null,'USD',now(),now()+interval '366 days',p_operator_user_id,authz.owner_user_id);
 insert into tongs.owner_operating_budget_revisions(budget_id,revision,status,maximum_amount_micros,reason,actor_id,journal_event_id)
 values(p_session_budget_id,1,'active',10000000,p_reason,p_operator_user_id,event_id);
 insert into tongs.owner_hearth_authorizations(id,authorization_kind,owner_user_id,workspace_id,budget_id,maximum_amount_micros,maximum_operations,
  maximum_concurrency,maximum_attempts,failure_loss_limit_micros,duration_seconds,created_by)
 values(p_session_authorization_id,'creator_session',authz.owner_user_id,authz.workspace_id,p_session_budget_id,10000000,20,2,1,2000000,86400,p_operator_user_id);
 insert into tongs.owner_hearth_authorization_events(id,authorization_id,sequence,event_key,state,reason,evidence_json)
 values(gen_random_uuid(),p_session_authorization_id,1,'owner-hearth-session:'||p_session_authorization_id::text||':dormant','dormant',p_reason,
  jsonb_build_object('starts_on_first_accepted_operation',true,'maximum_operations',20,'maximum_concurrency',2,'failure_loss_limit_micros',2000000,'automatic_renewal',false));

 insert into tongs.openai_text_model_catalog_revisions(id,revision,lifecycle_state,quality_method,source_checked_at,content_hash)
 values(catalog_id,3,'active','Five exact models passed coordinated Hearth Chat Completions generation, validation, and canonical persistence.',now(),
  encode(extensions.digest(convert_to('owner-hearth-catalog-v3:'||p_authorization_id::text,'utf8'),'sha256'),'hex'));
 for spec in select * from (values
  (1,'gpt-6-astra','GPT-6 Astra','81000000-0000-4000-8000-000000000011'::uuid,'60000000-0000-4000-8000-000000000002'::uuid,100),
  (2,'gpt-5.6-sol','GPT-5.6 Sol','81000000-0000-4000-8000-000000000012'::uuid,'56000000-0000-4000-8000-000000000012'::uuid,90),
  (3,'gpt-5.6-terra','GPT-5.6 Terra','81000000-0000-4000-8000-000000000013'::uuid,'56000000-0000-4000-8000-000000000022'::uuid,80),
  (4,'gpt-5.4-mini-2026-03-17','GPT-5.4 Mini','81000000-0000-4000-8000-000000000014'::uuid,'54000000-0000-4000-8000-000000000001'::uuid,70),
  (5,'gpt-5.6-luna','GPT-5.6 Luna','81000000-0000-4000-8000-000000000015'::uuid,'56000000-0000-4000-8000-000000000032'::uuid,60)
 ) v(ordinal,model_id,display_name,cost_id,rate_id,quality_rank)
 loop
  policy_id:=extensions.uuid_generate_v5(p_session_authorization_id,'pricing-policy:'||spec.model_id);
  price_id:=extensions.uuid_generate_v5(p_session_authorization_id,'pricing-revision:'||spec.model_id);
  insert into tongs.private_pricing_policies(id,policy_code,scope_kind,provider,sku,created_by)
  values(policy_id,'owner-hearth-session-'||spec.ordinal,'sku','openai','owner-hearth-session:'||spec.model_id,p_operator_user_id);
  insert into tongs.private_pricing_revisions(id,policy_id,revision,lifecycle_state,currency,markup_basis_points,full_cost_ceiling_micros,
   failure_cost_ceiling_micros,customer_price_ceiling_micros,billable_failure_ceiling_micros,customer_credit_units,billable_failure_classes,
   free_failure_classes,included_quantity,retention_policy,change_reason,content_hash,actor_id)
  select price_id,policy_id,1,'review_ready','USD',3300,c.full_cost_ceiling_micros,c.full_cost_ceiling_micros,
   ((c.full_cost_ceiling_micros*133+999999)/1000000)*10000,0,0,'[]'::jsonb,
   '["provider_failure","forge_failure","forge_validation_failure","persistence_failure","unknown_fault"]'::jsonb,
   jsonb_build_object('input_tokens',32000,'output_tokens',8000,'attempts',1),
   jsonb_build_object('first_30_days','included_in_operation','post_day_30','separate_owner_tail_authorization'),
   'Private owner session basis; customer pricing remains unpublished.',
   encode(extensions.digest(convert_to(p_session_authorization_id::text||':'||spec.model_id||':3300:'||c.full_cost_ceiling_micros::text,'utf8'),'sha256'),'hex'),p_operator_user_id
  from tongs.openai_text_cost_policy_revisions c where c.id=spec.cost_id;
  insert into tongs.owner_hearth_model_terms values(p_session_authorization_id,spec.ordinal,spec.model_id,spec.display_name,spec.cost_id,price_id,
    extensions.uuid_generate_v5('83000000-0000-4000-8000-000000000000'::uuid,'session:'||spec.model_id),
    (select full_cost_ceiling_micros+3 from tongs.openai_text_cost_policy_revisions where id=spec.cost_id));
  insert into tongs.openai_text_model_catalog_entries(id,catalog_revision_id,runtime_model_id,provider_model_id,display_name,tradeoff_summary,
   quality_rank,quality_basis,supported_apis,availability_status,availability_evidence,lifecycle_state,rate_revision_id)
  values(extensions.uuid_generate_v5(catalog_id,spec.model_id),catalog_id,spec.model_id,spec.model_id,spec.display_name,
   case spec.ordinal when 1 then 'Highest quality and highest cost.' when 2 then 'Strong professional reasoning.' when 3 then 'Balanced capability and price.' when 4 then 'Lower-cost bounded work.' else 'Fastest and lowest-cost option.' end,
   spec.quality_rank,'Coordinated owner compatibility batch','["chat_completions"]','generation_compatible',
   jsonb_build_object('compatibility_authorization_id',p_authorization_id,'generation_verified',true,'authoritative_cost_reconciliation',false),'active',spec.rate_id);
  insert into tongs.openai_text_model_route_compatibility(id,catalog_entry_id,route_code,compatibility_status,maximum_input_tokens,maximum_output_tokens,
   maximum_attempts,supporting_cost_coverage,cost_policy_revision_id,evidence_json)
  values(extensions.uuid_generate_v5(catalog_id,spec.model_id||':hearth.chat_completion'),extensions.uuid_generate_v5(catalog_id,spec.model_id),
   'hearth.chat_completion','generation_verified',32000,8000,1,'complete',spec.cost_id,
   jsonb_build_object('compatibility_authorization_id',p_authorization_id,'customer_price_published',false));
 end loop;
 return jsonb_build_object('compatibility_authorization_id',authz.id,'compatibility_state','closed','session_authorization_id',p_session_authorization_id,
  'session_state','dormant','session_budget_id',p_session_budget_id,'maximum_amount_micros',10000000,'customer_price_published',false,'replay',false);
end $$;

create or replace function tongs.import_legacy_runway_opening_commitment(
 p_reservation_id uuid,p_operator_user_id uuid,p_amount_micros bigint,p_reason text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare r tongs.funding_reservations%rowtype; existing tongs.legacy_supplier_opening_commitments%rowtype;
begin
 if coalesce(auth.role(),'')<>'service_role' or not tongs.is_platform_operator(p_operator_user_id) or p_amount_micros<>750000
   or length(btrim(coalesce(p_reason,'')))<3 then raise exception 'protected exact Runway opening commitment required' using errcode='42501'; end if;
 select * into r from tongs.funding_reservations where id=p_reservation_id;
 if not found or r.funding_source_type<>'owner_budget' or exists(select 1 from tongs.paid_operation_aggregate_bindings where reservation_id=r.id) then
  raise exception 'unaggregated historical owner Runway reservation required' using errcode='P0001'; end if;
 select * into existing from tongs.legacy_supplier_opening_commitments where commitment_key='runway-owner-pilot:'||p_reservation_id::text;
 if found then return to_jsonb(existing)||jsonb_build_object('replay',true); end if;
 insert into tongs.legacy_supplier_opening_commitments(id,environment,provider,reservation_id,commitment_key,amount_micros,status,evidence_json)
 values(gen_random_uuid(),'production','runway',p_reservation_id,'runway-owner-pilot:'||p_reservation_id::text,750000,'unresolved',
  jsonb_build_object('reason',p_reason,'funding_entitlement',false,'duplicate_supplier_expense',false)) returning * into existing;
 return to_jsonb(existing)||jsonb_build_object('replay',false);
end $$;

create or replace function tongs._schedule_owner_hearth_tail()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare op tongs.owner_hearth_operation_authorizations%rowtype; tail tongs.owner_hearth_tail_authorizations%rowtype; class text; start_at timestamptz; seq integer;
begin
 if new.event_type<>'settled' then return new; end if;
 select * into op from tongs.owner_hearth_operation_authorizations where reservation_id=new.reservation_id;
 if not found then return new; end if;
 select * into tail from tongs.owner_hearth_tail_authorizations where owner_user_id=op.owner_user_id and workspace_id=op.workspace_id order by created_at desc limit 1;
 if not found then return new; end if;
 start_at:=new.created_at+interval '30 days';
 foreach class in array case when new.evidence_json->>'operation_outcome'='success'
   then array['canonical_content','provider_evidence'] else array['provider_evidence'] end loop
  insert into tongs.owner_hearth_tail_periods(id,tail_authorization_id,reservation_id,artifact_class,coverage_start,coverage_end,monthly_limit_micros,cost_status,evidence_json)
  values(extensions.uuid_generate_v5(new.reservation_id,'owner-tail:'||class),tail.id,new.reservation_id,class,start_at,start_at+interval '12 months',
   tail.monthly_limit_micros,'allocated_estimate',jsonb_build_object('first_period_ends_at',start_at,'no_overlap',true,'replacement_rate_micros_per_mib_month',123))
  on conflict(reservation_id,artifact_class,coverage_start) do nothing;
 end loop;
 select coalesce(max(sequence),0)+1 into seq from tongs.owner_hearth_tail_events where tail_authorization_id=tail.id;
 insert into tongs.owner_hearth_tail_events(id,tail_authorization_id,sequence,event_key,event_type,evidence_json)
 values(gen_random_uuid(),tail.id,seq,'owner-hearth-tail:'||tail.id::text||':artifact:'||new.reservation_id::text,'artifact_covered',
  jsonb_build_object('reservation_id',new.reservation_id,'coverage_start',start_at,'coverage_end',start_at+interval '12 months','first_30_days_excluded',true))
 on conflict(event_key) do nothing;
 return new;
end $$;
create trigger owner_hearth_tail_after_settlement after insert on tongs.funding_reservation_events
for each row execute function tongs._schedule_owner_hearth_tail();

create or replace function tongs.read_owner_hearth_activation_audit()
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
begin
 if coalesce(auth.role(),'')<>'service_role' and not tongs.is_platform_operator(auth.uid()) then raise exception 'platform operator required' using errcode='42501'; end if;
 return jsonb_build_object(
  'authorizations',(select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) from tongs.owner_hearth_authorizations x),
  'authorization_events',(select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) from tongs.owner_hearth_authorization_events x),
  'operations',(select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) from tongs.owner_hearth_operation_authorizations x),
  'compatibility_results',(select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) from tongs.owner_hearth_compatibility_results x),
  'tail_authorizations',(select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) from tongs.owner_hearth_tail_authorizations x),
  'tail_periods',(select coalesce(jsonb_agg(to_jsonb(x) order by x.coverage_start),'[]'::jsonb) from tongs.owner_hearth_tail_periods x),
  'tail_measurements',(select coalesce(jsonb_agg(to_jsonb(x) order by x.period_start,x.revision),'[]'::jsonb) from tongs.owner_hearth_tail_measurements x),
  'legacy_opening_commitments',(select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) from tongs.legacy_supplier_opening_commitments x),
  'customer_price_published',false);
end $$;

do $$ declare f text; begin
 foreach f in array array[
  'activate_owner_hearth_compatibility_package(uuid,uuid,uuid,uuid,uuid,uuid,text)',
  'refresh_owner_hearth_tail_expiry(uuid,uuid)',
  'record_owner_hearth_tail_measurement(uuid,date,bigint,bigint,text,text,jsonb)',
  'read_owner_hearth_execution_requirement(uuid,uuid,text)',
  'resolve_owner_hearth_model_for_operation(uuid,uuid,text)',
  'prepare_owner_hearth_operation(uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,bigint,bigint,bigint,bigint,bigint,smallint,text,text,timestamptz)',
  'resolve_owner_hearth_paid_execution_context(text,uuid,uuid,uuid,text,text)',
  'acquire_owner_hearth_aggregate_admission(uuid,text,text)',
  'authorize_owner_hearth_provider_attempt_with_aggregate(uuid,text,smallint,text,bigint,integer,jsonb)',
  'settle_owner_hearth_operation(uuid,uuid,text,text,text,bigint,jsonb)',
  'record_owner_hearth_compatibility_result(uuid,text,text,text,bigint,bigint,jsonb)',
  'finalize_owner_hearth_compatibility_batch(uuid,uuid,uuid,uuid,text)',
  'import_legacy_runway_opening_commitment(uuid,uuid,bigint,text)'
 ] loop
  execute format('revoke all on function tongs.%s from public,anon,authenticated',f);
  execute format('grant execute on function tongs.%s to service_role',f);
 end loop;
end $$;
revoke all on function tongs.read_owner_hearth_activation_audit() from public,anon,authenticated;
grant execute on function tongs.read_owner_hearth_activation_audit() to authenticated,service_role;

comment on table tongs.owner_hearth_authorizations is 'Explicit owner-only compatibility/session caps. Operator or administrator status alone never grants access.';
comment on table tongs.owner_hearth_tail_periods is 'Post-day-30 owner storage funding; periods begin exactly after the operation-included first 30 days and never overlap them.';
comment on table tongs.legacy_supplier_opening_commitments is 'Unresolved supplier exposure imported without creating funding entitlement or duplicate expense.';
comment on function tongs.record_paid_operation_aggregate_outcome(uuid,text,text,bigint,bigint,jsonb) is 'Settled-estimated expense remains committed until append-only authoritative reconciliation adjusts it.';

notify pgrst,'reload schema';
commit;
