-- Inactive replacement proposal for the bounded Hearth owner pilot.
-- This records a non-generating model-availability check and exact cost inputs.
-- It creates no budget, pricing publication, reservation, or execution authority.

begin;

create table if not exists tongs.openai_text_model_availability_checks (
  id uuid primary key,
  provider text not null check (provider = 'openai'),
  provider_model_id text not null check (length(btrim(provider_model_id)) between 2 and 160),
  credential_class text not null check (credential_class in ('forge_project_scoped','customer_byo')),
  check_kind text not null check (check_kind = 'model_metadata_read'),
  endpoint text not null check (endpoint like 'GET /v1/models/%'),
  accessible boolean not null,
  http_status integer not null check (http_status between 100 and 599),
  evidence_json jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_json) = 'object'),
  checked_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table tongs.openai_text_model_availability_checks enable row level security;
alter table tongs.openai_text_model_availability_checks force row level security;
revoke all on tongs.openai_text_model_availability_checks from public, anon, authenticated, service_role;
grant select on tongs.openai_text_model_availability_checks to service_role;

create trigger openai_text_model_availability_checks_immutable
before update or delete on tongs.openai_text_model_availability_checks
for each row execute function tongs._reject_accounting_mutation();

insert into tongs.openai_text_model_availability_checks(
  id,provider,provider_model_id,credential_class,check_kind,endpoint,
  accessible,http_status,evidence_json,checked_at
) values (
  '56560000-0000-4000-8000-000000000002','openai','gpt-5.6-luna',
  'forge_project_scoped','model_metadata_read','GET /v1/models/gpt-5.6-luna',
  true,200,
  '{"generating_request":false,"object":"model","owned_by":"system","credential_value_recorded":false}'::jsonb,
  '2026-09-08T13:48:17.2211144Z'
);

insert into tongs.openai_text_provider_rate_revisions(
  id,provider,runtime_model_alias,provider_model_id,revision,
  input_micros_per_million_tokens,cached_input_micros_per_million_tokens,
  output_micros_per_million_tokens,maximum_context_tokens,maximum_output_tokens,
  source_url,source_checked_at,content_hash
) values (
  '56560000-0000-4000-8000-000000000001','openai','gpt-5.6-luna','gpt-5.6-luna',1,
  200000,20000,1200000,1050000,128000,
  'https://developers.openai.com/api/docs/models/gpt-5.6-luna',
  '2026-09-08T13:48:17.2211144Z',
  encode(extensions.digest(convert_to(
    'openai:gpt-5.6-luna:1:200000:20000:1200000:1050000:128000',
    'utf8'
  ),'sha256'),'hex')
);

-- ceil((2,000 * $0.20/M + 512 * $1.20/M) * 1,000,000 micros/USD)
-- = ceil(1,014.4 micros) = 1,015 micros.
insert into tongs.openai_text_cost_policy_revisions(
  id,route_code,revision,policy_code,attempt_plan,maximum_input_units,maximum_output_units,
  maximum_attempts,direct_provider_ceiling_micros,supporting_cost_ceiling_micros,
  full_cost_ceiling_micros,cost_coverage,lifecycle_state,notes
) values (
  '10000000-0000-4000-8000-000000000010','hearth.chat_completion',3,
  'openai-text:hearth-chat:luna-bounded-pilot-v1',
  '[{"attempt":1,"rate_revision_id":"56560000-0000-4000-8000-000000000001","input_max":2000,"output_max":512}]'::jsonb,
  2000,512,1,1015,10000,11015,'complete','pilot_candidate',
  'Inactive replacement proposal. One neutral prompt, one attempt, no tools, search, media, or purchased assets.'
);

insert into tongs.openai_text_failure_loss_policy_revisions(
  id,route_code,environment,revision,per_operation_limit_micros,aggregate_limit_micros,
  rolling_window_seconds,maximum_concurrency,lifecycle_state,reason
) values (
  '20000000-0000-4000-8000-000000000003','hearth.chat_completion','production',3,
  11015,11015,86400,1,'draft',
  'Inactive gpt-5.6-luna replacement proposal; no owner spending authorization exists.'
);

insert into tongs.openai_text_activation_proposals(
  id,route_code,cost_policy_revision_id,failure_loss_policy_revision_id,model,prompt_class,
  maximum_input_units,maximum_output_units,maximum_attempts,direct_provider_ceiling_micros,
  supporting_cost_ceiling_micros,total_cost_ceiling_micros,markup_basis_points,
  rounded_customer_price_micros,proposed_owner_budget_micros,authorization_window_seconds,status
) values (
  '30000000-0000-4000-8000-000000000002','hearth.chat_completion',
  '10000000-0000-4000-8000-000000000010','20000000-0000-4000-8000-000000000003',
  'gpt-5.6-luna','neutral bounded text response; no tools, search, media, or purchased assets',
  2000,512,1,1015,10000,11015,3300,20000,11015,86400,'awaiting_owner_approval'
);

comment on table tongs.openai_text_model_availability_checks is
  'Owner-only evidence of non-generating model metadata checks. Credentials and secret material are never stored.';

notify pgrst,'reload schema';
commit;
