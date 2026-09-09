-- Ordinary-caller quote/accept/reserve bindings and evidence-backed OpenAI rate
-- preparation for the seven certified text routes. This migration activates no
-- route, publishes no customer price, and authorizes no provider execution.
begin;

insert into tongs.openai_text_provider_rate_revisions(
  id,provider,runtime_model_alias,provider_model_id,revision,
  input_micros_per_million_tokens,cached_input_micros_per_million_tokens,
  output_micros_per_million_tokens,maximum_context_tokens,maximum_output_tokens,
  source_url,source_checked_at,content_hash
) values
  ('53530000-0000-4000-8000-000000000002','openai','gpt-5.3','gpt-5.3-chat-latest',2,
   1750000,175000,14000000,128000,16384,
   'https://developers.openai.com/api/docs/models/gpt-5.3-chat-latest','2026-09-09T00:00:00Z',
   encode(extensions.digest(convert_to('openai:gpt-5.3-chat-latest:2:1750000:175000:14000000:128000:16384:2026-09-09','utf8'),'sha256'),'hex')),
  ('53500000-0000-4000-8000-000000000002','openai','gpt-5-mini','gpt-5-mini-2025-08-07',1,
   250000,25000,2000000,400000,128000,
   'https://developers.openai.com/api/docs/models/gpt-5-mini','2026-09-09T00:00:00Z',
   encode(extensions.digest(convert_to('openai:gpt-5-mini-2025-08-07:1:250000:25000:2000000:400000:128000:2026-09-09','utf8'),'sha256'),'hex')),
  ('40000000-0000-4000-8000-000000000002','openai','gpt-4o-mini','gpt-4o-mini-2024-07-18',2,
   150000,75000,600000,128000,16384,
   'https://developers.openai.com/api/docs/models/gpt-4o-mini','2026-09-09T00:00:00Z',
   encode(extensions.digest(convert_to('openai:gpt-4o-mini-2024-07-18:2:150000:75000:600000:128000:16384:2026-09-09','utf8'),'sha256'),'hex'));

-- These draft revisions correct the model/rate pairing and bound one provider
-- attempt. Variable hosting/persistence allocations remain deliberately
-- unpriced, so none can be activated or quoted yet.
insert into tongs.openai_text_cost_policy_revisions(
  id,route_code,revision,policy_code,attempt_plan,maximum_input_units,maximum_output_units,
  maximum_attempts,direct_provider_ceiling_micros,supporting_cost_ceiling_micros,
  full_cost_ceiling_micros,cost_coverage,lifecycle_state,notes
) values
  ('11000000-0000-4000-8000-000000000002','hearth.research_synthesis',2,'openai-text:hearth-research:ordinary-v2',
   '[{"attempt":1,"rate_revision_id":"53530000-0000-4000-8000-000000000002","runtime_model":"gpt-5.3","provider_model_id":"gpt-5.3-chat-latest","input_max":128000,"output_max":16384}]',128000,16384,1,453376,null,null,'supporting_unpriced','draft','Official GPT-5.3 Chat standard rates verified 2026-09-09. Runtime alias availability and supplied-source extraction/hosting allocation must be resolved before activation.'),
  ('11000000-0000-4000-8000-000000000003','visual.unified_plan',2,'openai-text:visual-unified-plan:ordinary-v2',
   '[{"attempt":1,"rate_revision_id":"53500000-0000-4000-8000-000000000002","runtime_model":"gpt-5-mini","provider_model_id":"gpt-5-mini-2025-08-07","input_max":64000,"output_max":16384}]',64000,16384,1,48768,null,null,'supporting_unpriced','draft','Official GPT-5 Mini standard rates verified 2026-09-09. Canonical child commits and hosting allocation remain unpriced.'),
  ('11000000-0000-4000-8000-000000000004','visual.narrative_interpretation',2,'openai-text:visual-narrative:ordinary-v2',
   '[{"attempt":1,"rate_revision_id":"53500000-0000-4000-8000-000000000002","runtime_model":"gpt-5-mini","provider_model_id":"gpt-5-mini-2025-08-07","input_max":32000,"output_max":8000}]',32000,8000,1,24000,null,null,'supporting_unpriced','draft','Official GPT-5 Mini standard rates verified 2026-09-09. Prompt synthesis/persistence and hosting allocation remain unpriced.'),
  ('11000000-0000-4000-8000-000000000005','motion.broll_interpretation',2,'openai-text:motion-broll:ordinary-v2',
   '[{"attempt":1,"rate_revision_id":"53500000-0000-4000-8000-000000000002","runtime_model":"gpt-5-mini","provider_model_id":"gpt-5-mini-2025-08-07","input_max":32000,"output_max":8000}]',32000,8000,1,24000,null,null,'supporting_unpriced','draft','Official GPT-5 Mini standard rates verified 2026-09-09. Motion synthesis/persistence and hosting allocation remain unpriced.'),
  ('11000000-0000-4000-8000-000000000006','hammer.transcript_cleanup',2,'openai-text:hammer-cleanup:ordinary-v2',
   '[{"attempt":1,"rate_revision_id":"53530000-0000-4000-8000-000000000002","runtime_model":"gpt-5.3","provider_model_id":"gpt-5.3-chat-latest","input_max":128000,"output_max":16384}]',128000,16384,1,453376,null,null,'supporting_unpriced','draft','Official GPT-5.3 Chat standard rates verified 2026-09-09. Runtime alias availability and persistence/hosting allocation must be resolved before activation; fallback is excluded.'),
  ('11000000-0000-4000-8000-000000000007','shorts.discovery',2,'openai-text:shorts-discovery:ordinary-v2',
   '[{"attempt":1,"rate_revision_id":"53530000-0000-4000-8000-000000000002","runtime_model":"gpt-5.3","provider_model_id":"gpt-5.3-chat-latest","input_max":64000,"output_max":16384}]',64000,16384,1,341376,null,null,'supporting_unpriced','draft','Official GPT-5.3 Chat standard rates verified 2026-09-09. Runtime alias availability and deterministic resolution/persistence allocation must be resolved before activation.'),
  ('11000000-0000-4000-8000-000000000008','quench.metadata',2,'openai-text:quench-metadata:ordinary-v2',
   '[{"attempt":1,"rate_revision_id":"53530000-0000-4000-8000-000000000002","runtime_model":"gpt-5.3","provider_model_id":"gpt-5.3-chat-latest","input_max":32000,"output_max":8000}]',32000,8000,1,168000,null,null,'supporting_unpriced','draft','Official GPT-5.3 Chat standard rates verified 2026-09-09. Runtime alias availability and persistence/hosting allocation must be resolved before activation.');

create table tongs.openai_text_supporting_cost_inventory (
  id uuid primary key,
  route_code text not null references tongs.openai_text_route_policies(route_code) on delete restrict,
  cost_policy_revision_id uuid not null references tongs.openai_text_cost_policy_revisions(id) on delete restrict,
  component_code text not null,
  disposition text not null check (disposition in ('included_unmetered','separately_blocked','allocation_required')),
  evidence_status text not null check (evidence_status in ('verified','estimated','unpriced')),
  notes text not null,
  created_at timestamptz not null default now(),
  unique(cost_policy_revision_id,component_code)
);

insert into tongs.openai_text_supporting_cost_inventory(id,route_code,cost_policy_revision_id,component_code,disposition,evidence_status,notes) values
 ('21000000-0000-4000-8000-000000000002','hearth.research_synthesis','11000000-0000-4000-8000-000000000002','external_search_extraction','separately_blocked','unpriced','Text authorization never authorizes Brave search, paid extraction, or enrichment. Supplied-source extraction needs its own allocation.'),
 ('21000000-0000-4000-8000-000000000012','hearth.research_synthesis','11000000-0000-4000-8000-000000000002','validation_persistence_hosting','allocation_required','unpriced','Hearth validation, Tongs persistence, Netlify execution, and Supabase usage require an approved ceiling.'),
 ('21000000-0000-4000-8000-000000000003','visual.unified_plan','11000000-0000-4000-8000-000000000003','validation_child_commits_hosting','allocation_required','unpriced','No external search or media generation is included; variable execution and persistence remain unpriced.'),
 ('21000000-0000-4000-8000-000000000004','visual.narrative_interpretation','11000000-0000-4000-8000-000000000004','validation_prompt_persistence_hosting','allocation_required','unpriced','No image generation is included; variable execution and persistence remain unpriced.'),
 ('21000000-0000-4000-8000-000000000005','motion.broll_interpretation','11000000-0000-4000-8000-000000000005','validation_prompt_persistence_hosting','allocation_required','unpriced','No Runway generation or media processing is included; variable execution and persistence remain unpriced.'),
 ('21000000-0000-4000-8000-000000000006','hammer.transcript_cleanup','11000000-0000-4000-8000-000000000006','validation_persistence_hosting','allocation_required','unpriced','No transcription is included; variable execution and persistence remain unpriced.'),
 ('21000000-0000-4000-8000-000000000007','shorts.discovery','11000000-0000-4000-8000-000000000007','resolution_persistence_hosting','allocation_required','unpriced','No transcription, render, or enrichment is included; variable execution and persistence remain unpriced.'),
 ('21000000-0000-4000-8000-000000000008','quench.metadata','11000000-0000-4000-8000-000000000008','validation_persistence_hosting','allocation_required','unpriced','No publishing, thumbnail, search, or notification call is included; variable execution and persistence remain unpriced.');

create table tongs.openai_text_customer_quote_bindings (
  quote_id uuid primary key references tongs.customer_spending_quotes(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  canonical_operation_id text not null check(length(btrim(canonical_operation_id)) between 8 and 300),
  route_code text not null references tongs.openai_text_route_policies(route_code) on delete restrict,
  workspace_id uuid not null references tongs.workspaces(id) on delete restrict,
  workpiece_id text not null check(length(btrim(workpiece_id)) between 1 and 300),
  request_fingerprint text not null check(request_fingerprint ~ '^[0-9a-f]{64}$'),
  runtime_model text not null,
  credential_funding text not null check(credential_funding in ('forge','byo_customer')),
  cost_policy_revision_id uuid not null references tongs.openai_text_cost_policy_revisions(id) on delete restrict,
  pricing_revision_id uuid not null references tongs.private_pricing_revisions(id) on delete restrict,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique(user_id,canonical_operation_id,quote_id)
);

alter table tongs.openai_text_supporting_cost_inventory enable row level security;
alter table tongs.openai_text_supporting_cost_inventory force row level security;
alter table tongs.openai_text_customer_quote_bindings enable row level security;
alter table tongs.openai_text_customer_quote_bindings force row level security;
revoke all on tongs.openai_text_supporting_cost_inventory,tongs.openai_text_customer_quote_bindings from public,anon,authenticated,service_role;
grant select on tongs.openai_text_supporting_cost_inventory,tongs.openai_text_customer_quote_bindings to service_role;
create trigger openai_text_supporting_cost_inventory_immutable before update or delete on tongs.openai_text_supporting_cost_inventory for each row execute function tongs._reject_accounting_mutation();
create trigger openai_text_customer_quote_bindings_immutable before update or delete on tongs.openai_text_customer_quote_bindings for each row execute function tongs._reject_accounting_mutation();

create or replace function tongs.create_customer_openai_text_quote(
 p_quote_id uuid,p_user_id uuid,p_operation_id text,p_route_code text,p_workspace_id uuid,p_workpiece_id text,
 p_request_fingerprint text,p_model text,p_credential_funding text,p_expires_at timestamptz
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_rollout tongs.openai_text_rollout_revisions%rowtype; v_cost tongs.openai_text_cost_policy_revisions%rowtype;
 v_rate tongs.openai_text_provider_rate_revisions%rowtype; v_pricing tongs.private_pricing_revisions%rowtype;
 v_quote tongs.customer_spending_quotes%rowtype; v_binding tongs.openai_text_customer_quote_bindings%rowtype;
 v_funding jsonb; v_sku text; v_internal_operation text; v_create jsonb;
begin
 perform tongs._require_pricing_service_role();
 if p_route_code not in ('hearth.research_synthesis','visual.unified_plan','visual.narrative_interpretation','motion.broll_interpretation','hammer.transcript_cleanup','shorts.discovery','quench.metadata')
   or p_quote_id is null or p_user_id is null or p_workspace_id is null or length(btrim(coalesce(p_operation_id,'')))<8
   or length(btrim(coalesce(p_workpiece_id,'')))<1 or p_request_fingerprint!~'^[0-9a-f]{64}$'
   or length(btrim(coalesce(p_model,'')))<2 or p_credential_funding not in ('forge','byo_customer')
   or p_expires_at is null or p_expires_at<=now() then raise exception 'invalid OpenAI customer quote request' using errcode='22023'; end if;
 select * into v_rollout from tongs._current_openai_text_rollout(p_route_code);
 if not found or v_rollout.mode<>'enforce' or v_rollout.cost_policy_revision_id is null then raise exception 'OpenAI text customer spending is not active' using errcode='42501'; end if;
 select * into v_cost from tongs.openai_text_cost_policy_revisions where id=v_rollout.cost_policy_revision_id;
 if not found or v_cost.route_code<>p_route_code or v_cost.cost_coverage<>'complete' or v_cost.lifecycle_state not in ('pilot_candidate','active') then raise exception 'pricing_not_configured: complete cost policy required' using errcode='P0001'; end if;
 select rate.* into v_rate from tongs.openai_text_provider_rate_revisions rate where rate.id=nullif(v_cost.attempt_plan->0->>'rate_revision_id','')::uuid;
 if not found or btrim(p_model) not in (v_rate.runtime_model_alias,v_rate.provider_model_id) then raise exception 'pricing_not_configured: exact accepted model rate required' using errcode='P0001'; end if;
 if p_credential_funding='byo_customer' and v_cost.direct_provider_ceiling_micros<>0 then raise exception 'pricing_not_configured: BYO support-only cost revision required' using errcode='P0001'; end if;
 v_sku:=lower('openai-text:'||p_route_code||':'||btrim(p_model)||':'||v_cost.id::text);
 select * into v_pricing from tongs._published_pricing_revision('openai',v_sku);
 if not found or v_pricing.full_cost_ceiling_micros<>v_cost.full_cost_ceiling_micros then raise exception 'pricing_not_configured: published exact route price required' using errcode='P0001'; end if;
 select * into v_binding from tongs.openai_text_customer_quote_bindings where quote_id=p_quote_id;
 if found then
   if v_binding.user_id<>p_user_id or v_binding.canonical_operation_id<>btrim(p_operation_id) or v_binding.route_code<>p_route_code
     or v_binding.workspace_id<>p_workspace_id or v_binding.workpiece_id<>btrim(p_workpiece_id) or v_binding.request_fingerprint<>p_request_fingerprint
     or v_binding.runtime_model<>btrim(p_model) or v_binding.credential_funding<>p_credential_funding
     or v_binding.cost_policy_revision_id<>v_cost.id or v_binding.pricing_revision_id<>v_pricing.id then raise exception 'OpenAI quote replay conflict' using errcode='23505'; end if;
 else
   v_internal_operation:=left(btrim(p_operation_id),250)||':q:'||p_quote_id::text;
   v_create:=tongs.create_shadow_spending_quote(p_quote_id,p_user_id,v_internal_operation,p_route_code,p_workspace_id,v_pricing.id,p_request_fingerprint,
     jsonb_build_array(jsonb_build_object('component','openai_text','provider_label','OpenAI','credential_source',case when p_credential_funding='forge' then 'forge' else 'byo_customer' end)),p_expires_at);
   insert into tongs.openai_text_customer_quote_bindings(quote_id,user_id,canonical_operation_id,route_code,workspace_id,workpiece_id,request_fingerprint,runtime_model,credential_funding,cost_policy_revision_id,pricing_revision_id,expires_at)
   values(p_quote_id,p_user_id,btrim(p_operation_id),p_route_code,p_workspace_id,btrim(p_workpiece_id),p_request_fingerprint,btrim(p_model),p_credential_funding,v_cost.id,v_pricing.id,p_expires_at);
 end if;
 select * into v_quote from tongs.customer_spending_quotes where id=p_quote_id;
 v_funding:=tongs._select_customer_funding_for_quote(p_quote_id);
 return jsonb_build_object('quote_id',v_quote.id,'operation_id',btrim(p_operation_id),'quote_hash',v_quote.quote_hash,
  'request_fingerprint',v_quote.request_fingerprint,'currency',v_quote.currency,'maximum_customer_charge_micros',v_quote.normal_maximum_charge_micros,
  'failure_customer_charge_micros',0,'failure_terms','Forge-caused and provider-caused failures cost you $0. Uncertain submissions are not retried automatically.',
  'funding_eligible',coalesce((v_funding->>'eligible')::boolean,false),'funding_source',coalesce(v_funding->>'funding_source','none'),
  'funding_label',coalesce(v_funding->>'customer_label','No verified eligible funds'),'expires_at',v_quote.expires_at,
  'accepted',exists(select 1 from tongs.customer_spending_quote_acceptances a where a.quote_id=v_quote.id));
end $$;

create or replace function tongs.read_existing_openai_text_funding_handle(p_user_id uuid,p_operation_id text,p_route_code text,p_request_fingerprint text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_binding tongs.openai_text_funding_bindings%rowtype; v_res tongs.funding_reservations%rowtype; v_quote_binding tongs.openai_text_customer_quote_bindings%rowtype;
begin
 perform tongs._require_pricing_service_role();
 select * into v_binding from tongs.openai_text_funding_bindings where operation_id=btrim(p_operation_id) and route_code=p_route_code;
 if not found then return null; end if;
 select * into v_res from tongs.funding_reservations where id=v_binding.reservation_id;
 select * into v_quote_binding from tongs.openai_text_customer_quote_bindings where quote_id=v_res.quote_id;
 if not found or v_quote_binding.user_id<>p_user_id or v_quote_binding.request_fingerprint<>p_request_fingerprint then raise exception 'existing funding context mismatch' using errcode='42501'; end if;
 return jsonb_build_object('operation_id',v_binding.operation_id,'reservation_id',v_binding.reservation_id,'request_fingerprint',v_quote_binding.request_fingerprint,'reservation_state',tongs._funding_reservation_state(v_binding.reservation_id));
end $$;

create or replace function tongs.reserve_customer_openai_text_quote(
 p_quote_id uuid,p_reservation_id uuid,p_user_id uuid,p_operation_id text,p_route_code text,p_workspace_id uuid,p_workpiece_id text,
 p_request_fingerprint text,p_model text,p_credential_funding text,p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_qb tongs.openai_text_customer_quote_bindings%rowtype; v_quote tongs.customer_spending_quotes%rowtype; v_funding jsonb;
 v_reserved jsonb; v_cost tongs.openai_text_cost_policy_revisions%rowtype; v_rollout tongs.openai_text_rollout_revisions%rowtype; v_existing tongs.openai_text_funding_bindings%rowtype;
begin
 perform tongs._require_pricing_service_role();
 perform pg_advisory_xact_lock(hashtextextended('openai-text-ordinary:'||p_user_id::text||':'||btrim(p_operation_id),0));
 select * into v_qb from tongs.openai_text_customer_quote_bindings where quote_id=p_quote_id;
 select * into v_quote from tongs.customer_spending_quotes where id=p_quote_id;
 if v_qb.quote_id is null or v_quote.id is null or v_qb.user_id<>p_user_id or v_qb.canonical_operation_id<>btrim(p_operation_id)
  or v_qb.route_code<>p_route_code or v_qb.workspace_id<>p_workspace_id or v_qb.workpiece_id<>btrim(p_workpiece_id)
  or v_qb.request_fingerprint<>p_request_fingerprint or v_qb.runtime_model<>btrim(p_model) or v_qb.credential_funding<>p_credential_funding
  or not exists(select 1 from tongs.customer_spending_quote_acceptances a where a.quote_id=p_quote_id and a.user_id=p_user_id and a.accepted_quote_hash=v_quote.quote_hash)
  then raise exception 'accepted exact OpenAI quote required' using errcode='42501'; end if;
 if v_quote.expires_at<=now() and not exists(select 1 from tongs.funding_reservations r where r.quote_id=p_quote_id) then raise exception 'spending quote expired' using errcode='P0001'; end if;
 select * into v_cost from tongs.openai_text_cost_policy_revisions where id=v_qb.cost_policy_revision_id;
 select * into v_rollout from tongs._current_openai_text_rollout(p_route_code);
 if v_rollout.mode<>'enforce' or v_rollout.cost_policy_revision_id<>v_cost.id or v_cost.cost_coverage<>'complete' or v_cost.lifecycle_state not in ('pilot_candidate','active') then raise exception 'OpenAI text route is not active for this accepted cost revision' using errcode='42501'; end if;
 v_funding:=tongs._select_customer_funding_for_quote(p_quote_id);
 if coalesce((v_funding->>'eligible')::boolean,false) is not true then raise exception 'insufficient verified funding' using errcode='P0001'; end if;
 v_reserved:=tongs.reserve_operation(p_reservation_id,p_quote_id,v_funding->>'funding_source',(v_funding->>'funding_source_id')::uuid,p_idempotency_key);
 select * into v_existing from tongs.openai_text_funding_bindings where operation_id=btrim(p_operation_id);
 if found then
  if v_existing.reservation_id<>p_reservation_id or v_existing.route_code<>p_route_code or v_existing.model<>btrim(p_model) or v_existing.cost_policy_revision_id<>v_cost.id then raise exception 'OpenAI binding replay conflict' using errcode='23505'; end if;
 else
  insert into tongs.openai_text_funding_bindings(operation_id,route_code,reservation_id,credential_funding,model,pricing_revision_id,maximum_input_units,maximum_output_units,maximum_attempts,cost_policy_revision_id,rollout_revision)
  values(btrim(p_operation_id),p_route_code,p_reservation_id,p_credential_funding,btrim(p_model),v_qb.pricing_revision_id,v_cost.maximum_input_units,v_cost.maximum_output_units,v_cost.maximum_attempts,v_cost.id,v_rollout.revision);
 end if;
 return jsonb_build_object('paid_execution',jsonb_build_object('operation_id',btrim(p_operation_id),'reservation_id',p_reservation_id,'request_fingerprint',p_request_fingerprint),
  'reservation_state',tongs._funding_reservation_state(p_reservation_id),'funding_source',v_funding->>'funding_source','replay',coalesce((v_reserved->>'replay')::boolean,false));
end $$;

-- Replace the resolver for the seven routes so the canonical operation,
-- workpiece, exact quote, pricing revision, model, and immutable request hash
-- are all checked server-side. Cached-input pricing is returned separately.
create or replace function tongs.resolve_openai_text_paid_execution_context(
 p_route_code text,p_operation_id text,p_reservation_id uuid,p_user_id uuid,p_workspace_id uuid,p_workpiece_id text,p_request_fingerprint text
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_binding tongs.openai_text_funding_bindings%rowtype; v_res tongs.funding_reservations%rowtype; v_quote tongs.customer_spending_quotes%rowtype;
 v_qb tongs.openai_text_customer_quote_bindings%rowtype; v_cost tongs.openai_text_cost_policy_revisions%rowtype; v_rollout tongs.openai_text_rollout_revisions%rowtype;
 v_rate tongs.openai_text_provider_rate_revisions%rowtype; v_failure bigint;
begin
 perform tongs._require_pricing_service_role();
 select * into v_binding from tongs.openai_text_funding_bindings where operation_id=btrim(p_operation_id) and reservation_id=p_reservation_id and route_code=p_route_code;
 if not found then raise exception 'exact funded OpenAI text route binding required' using errcode='P0002'; end if;
 select * into v_res from tongs.funding_reservations where id=p_reservation_id;
 select * into v_quote from tongs.customer_spending_quotes where id=v_res.quote_id;
 select * into v_qb from tongs.openai_text_customer_quote_bindings where quote_id=v_quote.id;
 if not found or v_res.user_id<>p_user_id or v_quote.user_id<>p_user_id or v_qb.user_id<>p_user_id
  or v_qb.canonical_operation_id<>btrim(p_operation_id) or v_qb.route_code<>p_route_code or v_qb.workspace_id<>p_workspace_id
  or v_qb.workpiece_id<>btrim(p_workpiece_id) or v_qb.request_fingerprint<>p_request_fingerprint or v_quote.request_fingerprint<>p_request_fingerprint
  or v_qb.runtime_model<>v_binding.model or v_qb.pricing_revision_id<>v_binding.pricing_revision_id
  or not exists(select 1 from tongs.customer_spending_quote_acceptances a where a.quote_id=v_quote.id and a.user_id=p_user_id)
  then raise exception 'accepted reserved OpenAI text funding context does not match request' using errcode='42501'; end if;
 select * into v_cost from tongs.openai_text_cost_policy_revisions where id=v_binding.cost_policy_revision_id;
 select * into v_rollout from tongs._current_openai_text_rollout(p_route_code);
 if v_cost.id is null or v_rollout.mode<>'enforce' or v_rollout.cost_policy_revision_id<>v_cost.id or v_cost.lifecycle_state not in ('pilot_candidate','active')
  or v_cost.cost_coverage<>'complete' or v_res.reserved_wholesale_spend_micros<>v_cost.full_cost_ceiling_micros then raise exception 'OpenAI text route is not activated for the accepted complete cost revision' using errcode='42501'; end if;
 select rate.* into v_rate from tongs.openai_text_provider_rate_revisions rate where rate.id=nullif(v_cost.attempt_plan->0->>'rate_revision_id','')::uuid;
 if not found or v_binding.model not in (v_rate.runtime_model_alias,v_rate.provider_model_id) then raise exception 'pricing_not_configured: exact OpenAI model rate missing' using errcode='P0001'; end if;
 v_failure:=case when v_binding.credential_funding='forge' then v_cost.full_cost_ceiling_micros else 0 end;
 return jsonb_build_object('operation_id',v_binding.operation_id,'reservation_id',v_binding.reservation_id,'quote_id',v_quote.id,'route_code',v_binding.route_code,
  'user_id',p_user_id,'workspace_id',p_workspace_id,'workpiece_id',btrim(p_workpiece_id),'request_fingerprint',p_request_fingerprint,
  'funding_source_type',v_res.funding_source_type,'funding_source_id',v_res.funding_source_id,'credential_funding',v_binding.credential_funding,'model',v_binding.model,
  'maximum_input_units',v_binding.maximum_input_units,'maximum_output_units',v_binding.maximum_output_units,'maximum_attempts',v_binding.maximum_attempts,
  'maximum_failure_exposure_micros',v_failure,'direct_provider_ceiling_micros',v_cost.direct_provider_ceiling_micros,'supporting_cost_ceiling_micros',v_cost.supporting_cost_ceiling_micros,
  'full_cost_ceiling_micros',v_cost.full_cost_ceiling_micros,'input_micros_per_million_tokens',v_rate.input_micros_per_million_tokens,
  'cached_input_micros_per_million_tokens',v_rate.cached_input_micros_per_million_tokens,'output_micros_per_million_tokens',v_rate.output_micros_per_million_tokens,
  'cost_policy_revision_id',v_cost.id,'pricing_revision_id',v_quote.pricing_revision_id,'rollout_revision',v_rollout.revision,'reservation_state',tongs._funding_reservation_state(p_reservation_id));
end $$;

revoke all on function tongs.create_customer_openai_text_quote(uuid,uuid,text,text,uuid,text,text,text,text,timestamptz) from public,anon,authenticated;
revoke all on function tongs.read_existing_openai_text_funding_handle(uuid,text,text,text) from public,anon,authenticated;
revoke all on function tongs.reserve_customer_openai_text_quote(uuid,uuid,uuid,text,text,uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function tongs.create_customer_openai_text_quote(uuid,uuid,text,text,uuid,text,text,text,text,timestamptz) to service_role;
grant execute on function tongs.read_existing_openai_text_funding_handle(uuid,text,text,text) to service_role;
grant execute on function tongs.reserve_customer_openai_text_quote(uuid,uuid,uuid,text,text,uuid,text,text,text,text,text) to service_role;

comment on function tongs.create_customer_openai_text_quote(uuid,uuid,text,text,uuid,text,text,text,text,timestamptz) is 'Creates an immutable customer-safe quote only for an enforced, complete, exactly priced OpenAI text route.';
comment on table tongs.openai_text_supporting_cost_inventory is 'Private supporting-cost coverage evidence. Unpriced entries block activation rather than implying zero cost.';

commit;
