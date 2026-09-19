-- LOCAL CERTIFICATION FIXTURE ONLY. Never place this file under
-- supabase/migrations and never execute it against a linked database.
--
-- The Sept. 16 backfilled migrations were historically applied after this
-- schema already existed and after one bounded Luna owner-pricing revision
-- had been created by a real platform operator. A blank local database needs
-- the minimal non-customer state below to reproduce that precondition.

begin;

do $$
begin
  if current_setting('forge.local_historical_replay', true)
       is distinct from 'mid-september-v1' then
    raise exception 'local historical replay guard is missing' using errcode='42501';
  end if;
  -- A connection through the local Docker container's Unix socket has no
  -- server address. TCP connections still must resolve to a private address;
  -- the harness separately pins this script to supabase_db_nursery.
  if inet_server_addr() is not null
     and not (
       inet_server_addr() << inet '127.0.0.0/8'
       or inet_server_addr() << inet '10.0.0.0/8'
       or inet_server_addr() << inet '172.16.0.0/12'
       or inet_server_addr() << inet '192.168.0.0/16'
     ) then
    raise exception 'historical fixture requires a private local database address' using errcode='42501';
  end if;
  if not exists (
    select 1 from supabase_migrations.schema_migrations
    where version='20261011150000'
  ) or exists (
    select 1 from supabase_migrations.schema_migrations
    where version='20260916110806'
  ) then
    raise exception 'historical fixture requires the pre-backfill local replay boundary' using errcode='P0001';
  end if;
  if to_regclass('tongs.private_markup_rule_revisions') is null
     or to_regclass('tongs.private_pricing_revision_markup_sources') is null
     or to_regprocedure('tongs.commit_private_markup_rule_revision(uuid,integer,integer,jsonb,text)') is null
     or to_regprocedure('tongs.commit_operator_pricing_revision(uuid,uuid,text,text,text,text,integer,uuid,bigint,text,jsonb,jsonb,jsonb,jsonb,jsonb,text)') is null then
    raise exception 'historical fixture schema prerequisites are missing' using errcode='P0001';
  end if;
  if exists (
    select 1 from tongs.private_pricing_policies
    where policy_code='owner-openai-hearth-chat-luna-bounded-pilot'
  ) then
    raise exception 'historical Luna pricing fixture already exists' using errcode='23505';
  end if;
end $$;

-- Required by 20260916110806: one valid platform operator. This deterministic
-- identity is local-only and has no workspace, balance, Stripe, or spending row.
insert into auth.users(
  id,instance_id,aud,role,email,encrypted_password,
  email_confirmed_at,created_at,updated_at
) values (
  'fe000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated',
  'mid-september-replay-fixture@example.test','',now(),now(),now()
);

insert into tongs.platform_operators(user_id,reason,granted_by)
values (
  'fe000000-0000-4000-8000-000000000001',
  'Local-only historical prerequisite for 20260916110806',
  'fe000000-0000-4000-8000-000000000001'
);

-- Required by 20260916113132: the active five-model catalog revision that the
-- historical migration copies before rebinding Luna to the customer contract.
-- Its rate and cost-policy revisions already come from the ordinary migration
-- chain; only this lived-in catalog snapshot was absent from a blank database.
insert into tongs.openai_text_model_catalog_revisions(
  id,revision,lifecycle_state,quality_method,source_checked_at,content_hash,actor_id,created_at
) values (
  '89000000-0000-4000-8000-000000000003',3,'active',
  'Five exact models passed coordinated Hearth Chat Completions generation, validation, and canonical persistence.',
  '2026-09-12T00:29:09.666774Z',
  '1aef5ea9e28235707be6c9862848e683621ed970b85932ba09eb25acc4078cda',
  null,'2026-09-12T00:29:09.666774Z'
);

insert into tongs.openai_text_model_catalog_entries(
  id,catalog_revision_id,runtime_model_id,provider_model_id,display_name,tradeoff_summary,
  quality_rank,quality_basis,supported_apis,availability_status,availability_evidence,
  lifecycle_state,rate_revision_id,created_at
) values
  ('363faff3-1fda-5e18-91c4-c58854d0e77b','89000000-0000-4000-8000-000000000003',
   'gpt-5.6-luna','gpt-5.6-luna','GPT-5.6 Luna','Fastest and lowest-cost option.',60,
   'Coordinated owner compatibility batch','["chat_completions"]','generation_compatible',
   '{"authoritative_cost_reconciliation":false,"compatibility_authorization_id":"3891fcec-c589-427f-9517-4ac46bd4e695","generation_verified":true}',
   'active','56000000-0000-4000-8000-000000000032','2026-09-12T00:29:09.666774Z'),
  ('c5fc75d3-ebe5-5c2b-85c8-06ed08271c24','89000000-0000-4000-8000-000000000003',
   'gpt-5.4-mini-2026-03-17','gpt-5.4-mini-2026-03-17','GPT-5.4 Mini','Lower-cost bounded work.',70,
   'Coordinated owner compatibility batch','["chat_completions"]','generation_compatible',
   '{"authoritative_cost_reconciliation":false,"compatibility_authorization_id":"3891fcec-c589-427f-9517-4ac46bd4e695","generation_verified":true}',
   'active','54000000-0000-4000-8000-000000000001','2026-09-12T00:29:09.666774Z'),
  ('ee1d3d34-a254-5751-b80a-b75d7c679b21','89000000-0000-4000-8000-000000000003',
   'gpt-5.6-terra','gpt-5.6-terra','GPT-5.6 Terra','Balanced capability and price.',80,
   'Coordinated owner compatibility batch','["chat_completions"]','generation_compatible',
   '{"authoritative_cost_reconciliation":false,"compatibility_authorization_id":"3891fcec-c589-427f-9517-4ac46bd4e695","generation_verified":true}',
   'active','56000000-0000-4000-8000-000000000022','2026-09-12T00:29:09.666774Z'),
  ('229e4a8a-1b07-5771-b733-e0223aab7faf','89000000-0000-4000-8000-000000000003',
   'gpt-5.6-sol','gpt-5.6-sol','GPT-5.6 Sol','Strong professional reasoning.',90,
   'Coordinated owner compatibility batch','["chat_completions"]','generation_compatible',
   '{"authoritative_cost_reconciliation":false,"compatibility_authorization_id":"3891fcec-c589-427f-9517-4ac46bd4e695","generation_verified":true}',
   'active','56000000-0000-4000-8000-000000000012','2026-09-12T00:29:09.666774Z'),
  ('ff51c0bc-d0bd-5b53-87d3-17ebb3f717bb','89000000-0000-4000-8000-000000000003',
   'gpt-6-astra','gpt-6-astra','GPT-6 Astra','Highest quality and highest cost.',100,
   'Coordinated owner compatibility batch','["chat_completions"]','generation_compatible',
   '{"authoritative_cost_reconciliation":false,"compatibility_authorization_id":"3891fcec-c589-427f-9517-4ac46bd4e695","generation_verified":true}',
   'active','60000000-0000-4000-8000-000000000002','2026-09-12T00:29:09.666774Z');

insert into tongs.openai_text_model_route_compatibility(
  id,catalog_entry_id,route_code,compatibility_status,maximum_input_tokens,
  maximum_output_tokens,maximum_attempts,supporting_cost_coverage,
  cost_policy_revision_id,evidence_json,created_at
) values
  ('39b448d9-f5ce-55ef-8ade-a8a6ade34cec','363faff3-1fda-5e18-91c4-c58854d0e77b',
   'hearth.chat_completion','generation_verified',32000,8000,1,'complete',
   '81000000-0000-4000-8000-000000000015',
   '{"compatibility_authorization_id":"3891fcec-c589-427f-9517-4ac46bd4e695","customer_price_published":false}',
   '2026-09-12T00:29:09.666774Z'),
  ('888af3c8-6eb5-5a09-8c43-c5404fd5bad3','c5fc75d3-ebe5-5c2b-85c8-06ed08271c24',
   'hearth.chat_completion','generation_verified',32000,8000,1,'complete',
   '81000000-0000-4000-8000-000000000014',
   '{"compatibility_authorization_id":"3891fcec-c589-427f-9517-4ac46bd4e695","customer_price_published":false}',
   '2026-09-12T00:29:09.666774Z'),
  ('b8dbc614-454c-52ea-adcf-dcec2495fc9a','ee1d3d34-a254-5751-b80a-b75d7c679b21',
   'hearth.chat_completion','generation_verified',32000,8000,1,'complete',
   '81000000-0000-4000-8000-000000000013',
   '{"compatibility_authorization_id":"3891fcec-c589-427f-9517-4ac46bd4e695","customer_price_published":false}',
   '2026-09-12T00:29:09.666774Z'),
  ('e191a480-921e-5b22-9f8d-63dfc932e25f','229e4a8a-1b07-5771-b733-e0223aab7faf',
   'hearth.chat_completion','generation_verified',32000,8000,1,'complete',
   '81000000-0000-4000-8000-000000000012',
   '{"compatibility_authorization_id":"3891fcec-c589-427f-9517-4ac46bd4e695","customer_price_published":false}',
   '2026-09-12T00:29:09.666774Z'),
  ('d1794bd4-5240-58e3-8f8c-29d9b7166e24','ff51c0bc-d0bd-5b53-87d3-17ebb3f717bb',
   'hearth.chat_completion','generation_verified',32000,8000,1,'complete',
   '81000000-0000-4000-8000-000000000011',
   '{"compatibility_authorization_id":"3891fcec-c589-427f-9517-4ac46bd4e695","customer_price_published":false}',
   '2026-09-12T00:29:09.666774Z');

select set_config('request.jwt.claim.role','authenticated',true);
select set_config(
  'request.jwt.claim.sub',
  'fe000000-0000-4000-8000-000000000001',
  true
);

-- Required by 20260916110806: revision 1 of the bounded Luna owner policy,
-- with the exact 11,015-micro full-cost basis that the historical migration
-- validates and then carries into revision 2.
select tongs.commit_private_markup_rule_revision(
  '648f0593-de89-461a-b208-46900dd23268',
  0,
  3300,
  '[]'::jsonb,
  'Local-only historical 33 percent markup prerequisite'
);

select tongs.commit_operator_pricing_revision(
  '648f0593-de89-461a-b208-46900dd23268',
  'e5e0914a-8466-42dd-bc14-b576f2aaf54f',
  'owner-openai-hearth-chat-luna-bounded-pilot',
  'sku','openai','gpt-5.6-luna',
  0,
  '66a74166-02b8-49ea-8d6c-a27984011a41',
  2,
  'USD',
  jsonb_build_array(
    jsonb_build_object(
      'component_code','openai_text',
      'component_kind','direct_provider',
      'credential_funding','forge',
      'provider_label','OpenAI',
      'success_ceiling_micros',1015,
      'failure_ceiling_micros',0,
      'cost_policy_revision','openai-text:hearth-chat:luna-bounded-pilot-v1',
      'tail_policy','none'
    ),
    jsonb_build_object(
      'component_code','bounded_support',
      'component_kind','compute',
      'credential_funding','forge',
      'provider_label','Forge validation and persistence',
      'success_ceiling_micros',10000,
      'failure_ceiling_micros',0,
      'cost_policy_revision','openai-text:hearth-chat:luna-bounded-pilot-v1',
      'tail_policy','none'
    )
  ),
  '[]'::jsonb,
  '["provider_failure","forge_failure","unknown_fault"]'::jsonb,
  '{"input_tokens":2000,"output_tokens":512,"attempts":1,"concurrency":1}'::jsonb,
  '{"kind":"none"}'::jsonb,
  'Local-only historical prerequisite for Forge Credit economy replay'
);

do $$
begin
  if not exists (
    select 1
    from tongs.private_pricing_policies policy
    join tongs.private_pricing_revisions revision
      on revision.policy_id=policy.id
    join tongs.private_pricing_revision_markup_sources source
      on source.pricing_revision_id=revision.id
    where policy.policy_code='owner-openai-hearth-chat-luna-bounded-pilot'
      and policy.id='e5e0914a-8466-42dd-bc14-b576f2aaf54f'
      and revision.id='66a74166-02b8-49ea-8d6c-a27984011a41'
      and revision.revision=1
      and revision.full_cost_ceiling_micros=11015
      and source.effective_markup_basis_points=3300
  ) then
    raise exception 'historical Luna pricing prerequisite was not established';
  end if;
  if (select count(*) from tongs.openai_text_model_catalog_entries
      where catalog_revision_id='89000000-0000-4000-8000-000000000003') <> 5
     or (select count(*) from tongs.openai_text_model_route_compatibility compatibility
         join tongs.openai_text_model_catalog_entries entry on entry.id=compatibility.catalog_entry_id
         where entry.catalog_revision_id='89000000-0000-4000-8000-000000000003') <> 5 then
    raise exception 'historical five-model catalog prerequisite was not established';
  end if;
  if exists (select 1 from tongs.customer_deposits)
     or exists (select 1 from tongs.customer_spending_quotes)
     or exists (select 1 from tongs.funding_reservations) then
    raise exception 'historical fixture created forbidden customer financial state';
  end if;
end $$;

commit;
