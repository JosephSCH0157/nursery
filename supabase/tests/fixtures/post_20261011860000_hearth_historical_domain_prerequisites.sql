-- LOCAL CERTIFICATION FIXTURE ONLY. Never place this file under
-- supabase/migrations and never execute it against a linked database.
--
-- This is synthetic replay simulation. Its payloads and hashes are
-- deterministic, non-sensitive test values. They do not reproduce or claim to
-- reproduce the historical production payloads sealed by 20261011870000.
--
-- The fixture creates only the minimum Hearth domain graph required to exercise
-- the unchanged historical-authority migration against its exact 30 Unified
-- Visual Plan and 29 motion/B-roll operation manifests. It creates no funding,
-- accounting, budget, rollout, scope, reservation, or provider-task authority.

begin;

do $$
declare
  v_fixture_user constant uuid := 'fe000000-0000-4000-8000-000000000001';
  v_fixture_workspace constant uuid := 'fe000000-0000-4000-8000-000000000201';
begin
  if current_setting('forge.local_historical_replay', true)
       is distinct from 'hearth-historical-domain-v1' then
    raise exception 'local Hearth historical replay guard is missing'
      using errcode='42501';
  end if;

  if current_database() <> 'postgres' then
    raise exception 'local Hearth historical replay requires the disposable postgres database'
      using errcode='42501';
  end if;

  if not exists (
    select 1 from supabase_migrations.schema_migrations
    where version='20261011860000'
  ) or exists (
    select 1 from supabase_migrations.schema_migrations
    where version>'20261011860000'
  ) then
    raise exception 'local Hearth historical replay requires the exact 20261011860000 boundary'
      using errcode='P0001';
  end if;

  if to_regclass('tongs.unified_visual_plan_historical_authorities') is not null
     or to_regclass('tongs.broll_interpretation_historical_authorities') is not null then
    raise exception 'historical Hearth authority already exists'
      using errcode='42P07';
  end if;

  if not exists (
    select 1 from auth.users where id=v_fixture_user
  ) or not exists (
    select 1 from tongs.workspaces
    where id=v_fixture_workspace and created_by=v_fixture_user
  ) or not exists (
    select 1 from tongs.workspace_members
    where workspace_id=v_fixture_workspace and user_id=v_fixture_user and role='owner'
  ) or not exists (
    select 1 from tongs.platform_operators
    where user_id=v_fixture_user
      and reason='Local-only historical prerequisite for 20260916110806'
  ) then
    raise exception 'local Hearth historical replay requires the established disposable fixture identity'
      using errcode='42501';
  end if;

  if exists (select 1 from tongs.unified_visual_plan_operations)
     or exists (
       select 1 from tongs.broll_operation_receipts
       where operation_type='prompt_interpretation'
     )
     or exists (select 1 from tongs.broll_prompt_revisions) then
    raise exception 'local Hearth historical target domain is not empty'
      using errcode='23505';
  end if;
end $$;

create temporary table hearth_historical_replay_forbidden_counts (
  relation_name regclass primary key,
  row_count bigint not null
) on commit drop;

do $$
declare
  v_relation regclass;
  v_count bigint;
begin
  foreach v_relation in array array[
    'tongs.openai_text_funding_bindings'::regclass,
    'tongs.owner_cost_operations'::regclass,
    'tongs.owner_cost_provider_attempts'::regclass,
    'tongs.owner_operating_budgets'::regclass,
    'tongs.owner_operating_budget_revisions'::regclass,
    'tongs.customer_paid_execution_scope_authorizations'::regclass,
    'tongs.paid_execution_aggregate_assignments'::regclass,
    'tongs.customer_spending_quotes'::regclass,
    'tongs.funding_reservations'::regclass,
    'tongs.account_balances'::regclass,
    'tongs.customer_deposits'::regclass,
    'tongs.accounting_journal_events'::regclass,
    'tongs.accounting_journal_entries'::regclass,
    'tongs.openai_text_rollout_revisions'::regclass,
    'tongs.runway_execution_rollout_revisions'::regclass
  ] loop
    execute format('select count(*) from %s',v_relation) into v_count;
    insert into hearth_historical_replay_forbidden_counts(relation_name,row_count)
    values(v_relation,v_count);
  end loop;
end $$;

insert into tongs.episodes(
  id,workspace_id,label,created_by,creation_origin
) values (
  'fe110000-0000-4000-8000-000000000001',
  'fe000000-0000-4000-8000-000000000201',
  'Synthetic historical Hearth replay workpiece',
  'fe000000-0000-4000-8000-000000000001',
  'synthetic_historical_replay'
);

insert into tongs.script_approval_revisions(
  id,workspace_id,workpiece_id,approval_revision,source_file_path,
  source_file_revision,script_content_hash,semantic_state_hash,
  immutable_revision_hash,script_text,approval_contract_version,
  creator_version_label,created_by
) values (
  'fe110000-0000-4000-8000-000000000002',
  'fe000000-0000-4000-8000-000000000201',
  'fe110000-0000-4000-8000-000000000001',
  1,'script/script.md',1,
  encode(extensions.digest(convert_to('synthetic-hearth-replay-script','UTF8'),'sha256'),'hex'),
  encode(extensions.digest(convert_to('synthetic-hearth-replay-semantic-state','UTF8'),'sha256'),'hex'),
  encode(extensions.digest(convert_to('synthetic-hearth-replay-script-revision','UTF8'),'sha256'),'hex'),
  'Synthetic non-production script used only for disposable migration replay.',
  'forge.script-approval.synthetic-replay.v1','synthetic-replay',
  'fe000000-0000-4000-8000-000000000001'
);

insert into tongs.broll_plan_revisions(
  id,workspace_id,workpiece_id,revision,script_approval_id,
  script_approval_revision,script_content_hash,source_context_contract_version,
  content_hash,immutable_revision_hash,created_by
) values (
  'fe110000-0000-4000-8000-000000000003',
  'fe000000-0000-4000-8000-000000000201',
  'fe110000-0000-4000-8000-000000000001',1,
  'fe110000-0000-4000-8000-000000000002',1,
  encode(extensions.digest(convert_to('synthetic-hearth-replay-script','UTF8'),'sha256'),'hex'),
  'forge.synthetic-historical-replay.v1',
  encode(extensions.digest(convert_to('synthetic-hearth-replay-broll-plan','UTF8'),'sha256'),'hex'),
  encode(extensions.digest(convert_to('synthetic-hearth-replay-broll-plan-revision','UTF8'),'sha256'),'hex'),
  'fe000000-0000-4000-8000-000000000001'
);

insert into tongs.broll_beat_revisions(
  id,workspace_id,workpiece_id,beat_id,revision,source_plan_revision_id,
  source_plan_revision,script_approval_id,script_approval_revision,
  context_before,context_focus,context_after,canonical_anchor_assessment,
  narrative_purpose,placement_hint,duration_target_ms,shot_type,motion_intent,
  mood_pacing,asset_category,trim_guidance_json,content_hash,
  immutable_revision_hash,created_by
) values (
  'fe110000-0000-4000-8000-000000000004',
  'fe000000-0000-4000-8000-000000000201',
  'fe110000-0000-4000-8000-000000000001',
  'fe110000-0000-4000-8000-000000000005',1,
  'fe110000-0000-4000-8000-000000000003',1,
  'fe110000-0000-4000-8000-000000000002',1,
  '','Synthetic replay focus','',
  '{"fixture":"synthetic-historical-replay"}'::jsonb,
  'Exercise historical motion receipt sealing','Synthetic replay boundary',1000,
  'static','none','neutral','synthetic','{}'::jsonb,
  encode(extensions.digest(convert_to('synthetic-hearth-replay-beat','UTF8'),'sha256'),'hex'),
  encode(extensions.digest(convert_to('synthetic-hearth-replay-beat-revision','UTF8'),'sha256'),'hex'),
  'fe000000-0000-4000-8000-000000000001'
);

with manifest(operation_id,ordinal) as (
  values
    ('forge:hosted-smoke:unified-visual-plan-v2:9f000001',1),
    ('forge:unified-visual-plan:0075e13d24203b78dd9bfd9de1d40dc8217d68390b8a7d976aa60c26120ba063',2),
    ('forge:unified-visual-plan:01c5473a1069e44c8fd52c556ad657126121498a2daca9f523bf33b30b4fcd91',3),
    ('forge:unified-visual-plan:09700b1919dd8f92b19d7728ca2f7739574d1549c3d8cfc48497be8ccb04d11d',4),
    ('forge:unified-visual-plan:1eccdb396985beecf84ebf0098cfaddd454ba2f74b8da4c34d857670d8714a26',5),
    ('forge:unified-visual-plan:1f41523cee4818f9929a2fc91b4026be23f4366143a5c53091894e38b7c02361',6),
    ('forge:unified-visual-plan:38b19943c7875340656468dc6ae9a32769aa6246ac0ca09fcb102170d767887d',7),
    ('forge:unified-visual-plan:38eaee12766bffc5c52f6f5dc4bc897c8b26a2006f7524d6440ef94285d4d8b3',8),
    ('forge:unified-visual-plan:4ae02907c758829016026aa65be42594d2ae9b3379552972d8cb86e085c426be',9),
    ('forge:unified-visual-plan:51570d0054d84b49f8ce5b7fd27ebd5f0482581d013c3332b1004d35b7d0730c',10),
    ('forge:unified-visual-plan:5201ee6279c29fab2a67ee14000e4fee53328e00a35782e2a107c6f583a4b79c',11),
    ('forge:unified-visual-plan:5c91960827324bad517a40bc8378ba4d90c78477a7f7463908b18d8859f51810',12),
    ('forge:unified-visual-plan:65acac7f22291d99af710626d47f7f35e65de6db5e115381b70777cfef5689cd',13),
    ('forge:unified-visual-plan:6a8724b2ade81b8cc79bf89fac2595c8767de249a754ebaa8ec874a0194ca6e1',14),
    ('forge:unified-visual-plan:6b29713a211a60fc52ef78b9f3b7bcfa115998c498b39853e4afd78d11e2f447',15),
    ('forge:unified-visual-plan:7c221aa40ac968a913feab2c7c44f21e3ff3a0292a60a54d284bf96632419270',16),
    ('forge:unified-visual-plan:809cf8174f1da8c922f0288a2e8f4d7272dc5b51d5ec0e734371e70af52cc853',17),
    ('forge:unified-visual-plan:a231a02a82f6e28dac40d3e496cd976d7b901808bf4b58a5c2ae636236144145',18),
    ('forge:unified-visual-plan:b0ecf4f34f35be76f7c53a6088b0941226380ef76fb23ff34843654344242f6b',19),
    ('forge:unified-visual-plan:bc6dcd8d05a30e8c58d74a0221f6cc052336c1073d15334742c32a60dd68c855',20),
    ('forge:unified-visual-plan:c3fd7d5ab62b63331f1fb27e042e3fc292afa3026388c4d0635bebb49a768323',21),
    ('forge:unified-visual-plan:cf67e0519061bc53f43dca911c6e667dd4e2a82ac27bcc0f572b103fcc014a12',22),
    ('forge:unified-visual-plan:eaaa2609f58780b3b87815bc0233b9b66b38cff31d631764eba7fcc58cc2e0d2',23),
    ('forge:unified-visual-plan:eece27067100bab282cb74bf31ae757a95db2751becba32e016c26099285cccf',24),
    ('forge:unified-visual-plan:f26007828bad66b67ef378bf1a742d4374310a7e2470356b15bca9db9750d05d',25),
    ('forge:unified-visual-plan:f9d938334fd9cddc8348870687cb20d70d521879c26b1ff1e5aa9098166706a0',26),
    ('forge:unified-visual-plan:fe7fac8864a0c521ee1c1a54fbe35025f80960bce215083b59e44937442505b4',27),
    ('forge:unified-visual-plan:fe8d6a0866bdf1fcd604dc2b9a022e4721faf4b1759d81841a1d7d2162cfc8d9',28),
    ('forge:unified-visual-plan:hosted-smoke:68be7776-8907-4a61-be16-a7428163de4a',29),
    ('forge:unified-visual-plan:hosted-smoke:d718cf51-328a-409a-b930-2dc99e591df0',30)
), evidence as (
  select operation_id,ordinal,
    jsonb_build_object(
      'fixture','synthetic-historical-replay',
      'domain','unified_visual_plan','ordinal',ordinal
    ) as provider_json,
    jsonb_build_object(
      'fixture','synthetic-historical-replay',
      'not_production_evidence',true,
      'operation_id',operation_id
    ) as receipt_json
  from manifest
)
insert into tongs.unified_visual_plan_operations(
  operation_id,operation_fingerprint,workspace_id,workpiece_id,
  script_approval_id,script_approval_revision,script_content_hash,state,
  normalized_inputs_json,provider_response_json,provider_response_hash,
  receipt_json,created_by,contract_version,child_membership_evidence_json
)
select operation_id,
  encode(extensions.digest(convert_to('synthetic-unified:'||operation_id,'UTF8'),'sha256'),'hex'),
  'fe000000-0000-4000-8000-000000000201',
  'fe110000-0000-4000-8000-000000000001',
  'fe110000-0000-4000-8000-000000000002',1,
  encode(extensions.digest(convert_to('synthetic-hearth-replay-script','UTF8'),'sha256'),'hex'),
  'verified',
  jsonb_build_object('fixture','synthetic-historical-replay','ordinal',ordinal),
  provider_json,
  encode(extensions.digest(convert_to(provider_json::text,'UTF8'),'sha256'),'hex'),
  receipt_json,
  'fe000000-0000-4000-8000-000000000001',
  'forge.unified-visual-plan.v1',
  jsonb_build_object('fixture','synthetic-historical-replay','children','intentionally-empty')
from evidence;

with manifest(operation_id,ordinal) as (
  values
    ('forge:broll:hosted-motion-2174a786466c442696e9ba728637e5ca',1),
    ('forge:broll:hosted-motion-b723bfb540c44cebb1856ffb0b1fd574',2),
    ('forge:broll:prompt:1094c0c8a8bd5bd6152baf29960cac50d0fd8087d992514c32ba5c2a8fdd9916',3),
    ('forge:broll:prompt:18c0012c7ffb8d4f43946404a504ce9f96a11726aca10cdeb0f1264b84a21c34',4),
    ('forge:broll:prompt:1ee7466e529bc9308f27097f1a493eec2c92ed3109fb4744947ba9aefe3bd6ce',5),
    ('forge:broll:prompt:20ddf7e25c9e69da5a689998735c234105f66136ee102d179c031e2e7ddb280e',6),
    ('forge:broll:prompt:240df8c8c2c5ac510846a12b1dc05751a8531b63db2e863b58503410a8285680',7),
    ('forge:broll:prompt:3956ce5ceb6324666287741ffa4360eb75fd8f264fb6bde4f61d13af6bbd13f2',8),
    ('forge:broll:prompt:3afc5f028d8aee7f3d2298ff1aca8fcc6f762d9e588bfcb1720c91aa4b0dedf9',9),
    ('forge:broll:prompt:41ffa35879e394b452893d17e3162ba3d9d3032cd70a03d4ae0fd148c464eaad',10),
    ('forge:broll:prompt:4370d489a8e7dbbbd5ebf44f51af8c77f80e07d6c948a7619f4d191fae040108',11),
    ('forge:broll:prompt:448bbe14bdeec2266b12dedd5fb6b38ef1633c1db988f837436d87d2cd256c0d',12),
    ('forge:broll:prompt:585306ff56c8b699922c3aed000a3ef656c41e74d95ee77de4e04ad355cf5386',13),
    ('forge:broll:prompt:5c589cbb0e96e29d5a12256848d1ed9e15b67d9f6472002b48cab1fa688d5d94',14),
    ('forge:broll:prompt:60cf31dc2eb1e45a939482515683022b4749af3d089f396420b9d3ce25a4586f',15),
    ('forge:broll:prompt:6769f6a588b17601ebffd464561989ad450d45be0954b750051459c200cbd28b',16),
    ('forge:broll:prompt:7aa84e0351962e1e0379aa3e5653ff406e5df008403630f3b5f5022470ae2933',17),
    ('forge:broll:prompt:8a02d291755ee826c5f2762578c6c97f9db0820c9997b4e1cd7cd80e9df9d1b5',18),
    ('forge:broll:prompt:913ad2791440f53e31cc2ceaac2e7c2aad36ae4dc4a631c9a597fc6b2d0a678f',19),
    ('forge:broll:prompt:a2ae9d7a32a92c47a4f953249de350727b3d3de6806d92f0170f7cd6f51bbdeb',20),
    ('forge:broll:prompt:a510a295ac4617a33ee47c361e88f7d5132384515c4677509ab7013421286dc2',21),
    ('forge:broll:prompt:c75724638e178249884d1cd9c62bb4d7ab179cecdfa4157d29b9eb4ad77e41b9',22),
    ('forge:broll:prompt:c7ba87ba7981e446a732a095909c8fcebc675eb923768a40278f771c62409b60',23),
    ('forge:broll:prompt:dbcc07bd0ea1b6783e84dacabae2737c0b1651a450953d62169c743aeeccb1ec',24),
    ('forge:broll:prompt:dfc5fa2adbfb544b6dcbb8ec89511497c80e6a76b052cc7cbb0f9559fe93b1c8',25),
    ('forge:broll:prompt:e1632507cad0de00e371135993ad993d56bbd503ae5cbd335f60f988eef346cd',26),
    ('forge:broll:prompt:e4a28c6b464f515e3c2ea2d7f66c6a5a69f8aae895aefbc6e281e161e41b7a67',27),
    ('forge:broll:prompt:f5c64347ee6db0291299e88ebd4d3b1e82925c9150bcb8ec4cec09a42c2c9c9c',28),
    ('forge:broll:prompt:fe487f18e3ff6b9fdc09e6ebf58a3b0aceb5b1bb31e4524b9d1262f9304272d2',29)
), prompt_rows as (
  select operation_id,ordinal,
    ('fe120000-0000-4000-8000-'||lpad(ordinal::text,12,'0'))::uuid as prompt_revision_id,
    case when ordinal=1 then null else
      ('fe120000-0000-4000-8000-'||lpad((ordinal-1)::text,12,'0'))::uuid
    end as previous_prompt_revision_id
  from manifest
)
insert into tongs.broll_prompt_revisions(
  id,workspace_id,workpiece_id,beat_id,revision,previous_revision_id,
  previous_revision,source_beat_revision_id,source_beat_revision,
  motion_brief_json,final_prompt,prompt_source,
  interpretation_contract_version,validator_version,synthesis_contract_version,
  provider_response_json,content_hash,immutable_revision_hash,created_by,
  authority_status
)
select prompt_revision_id,
  'fe000000-0000-4000-8000-000000000201',
  'fe110000-0000-4000-8000-000000000001',
  'fe110000-0000-4000-8000-000000000005',ordinal,
  previous_prompt_revision_id,case when ordinal=1 then null else ordinal-1 end,
  'fe110000-0000-4000-8000-000000000004',1,
  jsonb_build_object('fixture','synthetic-historical-replay','ordinal',ordinal),
  'Synthetic non-production motion prompt '||ordinal,
  'ai_derived','forge.synthetic-historical-replay.v1',
  'forge.synthetic-historical-replay-validator.v1',
  'forge.synthetic-historical-replay-synthesis.v1',
  jsonb_build_object('fixture','synthetic-historical-replay','not_production_evidence',true),
  encode(extensions.digest(convert_to('synthetic-prompt-content:'||operation_id,'UTF8'),'sha256'),'hex'),
  encode(extensions.digest(convert_to('synthetic-prompt-revision:'||operation_id,'UTF8'),'sha256'),'hex'),
  'fe000000-0000-4000-8000-000000000001','legacy_unverified'
from prompt_rows;

with manifest(operation_id,ordinal) as (
  values
    ('forge:broll:hosted-motion-2174a786466c442696e9ba728637e5ca',1),
    ('forge:broll:hosted-motion-b723bfb540c44cebb1856ffb0b1fd574',2),
    ('forge:broll:prompt:1094c0c8a8bd5bd6152baf29960cac50d0fd8087d992514c32ba5c2a8fdd9916',3),
    ('forge:broll:prompt:18c0012c7ffb8d4f43946404a504ce9f96a11726aca10cdeb0f1264b84a21c34',4),
    ('forge:broll:prompt:1ee7466e529bc9308f27097f1a493eec2c92ed3109fb4744947ba9aefe3bd6ce',5),
    ('forge:broll:prompt:20ddf7e25c9e69da5a689998735c234105f66136ee102d179c031e2e7ddb280e',6),
    ('forge:broll:prompt:240df8c8c2c5ac510846a12b1dc05751a8531b63db2e863b58503410a8285680',7),
    ('forge:broll:prompt:3956ce5ceb6324666287741ffa4360eb75fd8f264fb6bde4f61d13af6bbd13f2',8),
    ('forge:broll:prompt:3afc5f028d8aee7f3d2298ff1aca8fcc6f762d9e588bfcb1720c91aa4b0dedf9',9),
    ('forge:broll:prompt:41ffa35879e394b452893d17e3162ba3d9d3032cd70a03d4ae0fd148c464eaad',10),
    ('forge:broll:prompt:4370d489a8e7dbbbd5ebf44f51af8c77f80e07d6c948a7619f4d191fae040108',11),
    ('forge:broll:prompt:448bbe14bdeec2266b12dedd5fb6b38ef1633c1db988f837436d87d2cd256c0d',12),
    ('forge:broll:prompt:585306ff56c8b699922c3aed000a3ef656c41e74d95ee77de4e04ad355cf5386',13),
    ('forge:broll:prompt:5c589cbb0e96e29d5a12256848d1ed9e15b67d9f6472002b48cab1fa688d5d94',14),
    ('forge:broll:prompt:60cf31dc2eb1e45a939482515683022b4749af3d089f396420b9d3ce25a4586f',15),
    ('forge:broll:prompt:6769f6a588b17601ebffd464561989ad450d45be0954b750051459c200cbd28b',16),
    ('forge:broll:prompt:7aa84e0351962e1e0379aa3e5653ff406e5df008403630f3b5f5022470ae2933',17),
    ('forge:broll:prompt:8a02d291755ee826c5f2762578c6c97f9db0820c9997b4e1cd7cd80e9df9d1b5',18),
    ('forge:broll:prompt:913ad2791440f53e31cc2ceaac2e7c2aad36ae4dc4a631c9a597fc6b2d0a678f',19),
    ('forge:broll:prompt:a2ae9d7a32a92c47a4f953249de350727b3d3de6806d92f0170f7cd6f51bbdeb',20),
    ('forge:broll:prompt:a510a295ac4617a33ee47c361e88f7d5132384515c4677509ab7013421286dc2',21),
    ('forge:broll:prompt:c75724638e178249884d1cd9c62bb4d7ab179cecdfa4157d29b9eb4ad77e41b9',22),
    ('forge:broll:prompt:c7ba87ba7981e446a732a095909c8fcebc675eb923768a40278f771c62409b60',23),
    ('forge:broll:prompt:dbcc07bd0ea1b6783e84dacabae2737c0b1651a450953d62169c743aeeccb1ec',24),
    ('forge:broll:prompt:dfc5fa2adbfb544b6dcbb8ec89511497c80e6a76b052cc7cbb0f9559fe93b1c8',25),
    ('forge:broll:prompt:e1632507cad0de00e371135993ad993d56bbd503ae5cbd335f60f988eef346cd',26),
    ('forge:broll:prompt:e4a28c6b464f515e3c2ea2d7f66c6a5a69f8aae895aefbc6e281e161e41b7a67',27),
    ('forge:broll:prompt:f5c64347ee6db0291299e88ebd4d3b1e82925c9150bcb8ec4cec09a42c2c9c9c',28),
    ('forge:broll:prompt:fe487f18e3ff6b9fdc09e6ebf58a3b0aceb5b1bb31e4524b9d1262f9304272d2',29)
), evidence as (
  select operation_id,ordinal,
    ('fe120000-0000-4000-8000-'||lpad(ordinal::text,12,'0'))::uuid as prompt_revision_id,
    jsonb_build_object(
      'fixture','synthetic-historical-replay',
      'domain','motion_broll','ordinal',ordinal
    ) as provider_json,
    jsonb_build_object(
      'fixture','synthetic-historical-replay',
      'not_production_evidence',true,
      'operation_id',operation_id
    ) as receipt_json
  from manifest
)
insert into tongs.broll_operation_receipts(
  operation_id,operation_fingerprint,operation_type,state,workspace_id,
  workpiece_id,beat_id,normalized_inputs_json,provider_response_json,
  provider_response_hash,result_prompt_revision_id,receipt_json,created_by
)
select operation_id,
  encode(extensions.digest(convert_to('synthetic-motion:'||operation_id,'UTF8'),'sha256'),'hex'),
  'prompt_interpretation','committed',
  'fe000000-0000-4000-8000-000000000201',
  'fe110000-0000-4000-8000-000000000001',
  'fe110000-0000-4000-8000-000000000005',
  jsonb_build_object('fixture','synthetic-historical-replay','ordinal',ordinal),
  provider_json,
  encode(extensions.digest(convert_to(provider_json::text,'UTF8'),'sha256'),'hex'),
  prompt_revision_id,receipt_json,
  'fe000000-0000-4000-8000-000000000001'
from evidence;

do $$
declare
  v_relation regclass;
  v_before bigint;
  v_after bigint;
begin
  if (select count(*) from tongs.unified_visual_plan_operations) <> 30
     or (select count(*) from tongs.broll_operation_receipts
         where operation_type='prompt_interpretation') <> 29
     or (select count(*) from tongs.broll_prompt_revisions) <> 29 then
    raise exception 'synthetic historical Hearth manifest was not reproduced exactly';
  end if;

  if exists (
    select 1 from tongs.unified_visual_plan_operations
    where state<>'verified' or provider_response_json is null
      or provider_response_hash is null or receipt_json is null
  ) or exists (
    select 1 from tongs.broll_operation_receipts
    where operation_type='prompt_interpretation'
      and (state<>'committed' or provider_response_json is null
        or provider_response_hash is null or receipt_json is null
        or result_prompt_revision_id is null or provider_task_id is not null
        or provider_submission_json is not null or provider_completed_json is not null)
  ) then
    raise exception 'synthetic historical Hearth evidence is incomplete or implies a provider task';
  end if;

  for v_relation,v_before in
    select relation_name,row_count
    from hearth_historical_replay_forbidden_counts
  loop
    execute format('select count(*) from %s',v_relation) into v_after;
    if v_after<>v_before then
      raise exception 'synthetic historical Hearth fixture changed forbidden relation %: before %, after %',
        v_relation,v_before,v_after;
    end if;
  end loop;
end $$;

commit;
