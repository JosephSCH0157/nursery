begin;

-- Slice 4D. Historical rows are canonical product evidence, not inferred
-- financial evidence. These two tables are the complete, migration-sealed
-- grandfather set; they are not an active execution lane.
create table tongs.unified_visual_plan_historical_authorities (
  operation_id text primary key
    references tongs.unified_visual_plan_operations(operation_id) on delete restrict,
  provider_response_hash text not null check (provider_response_hash ~ '^[0-9a-f]{64}$'),
  receipt_hash text not null check (receipt_hash ~ '^[0-9a-f]{64}$'),
  migration_version text not null
    check (migration_version = '20261011870000'),
  grandfathered_at timestamptz not null default transaction_timestamp()
);

create table tongs.broll_interpretation_historical_authorities (
  operation_id text primary key
    references tongs.broll_operation_receipts(operation_id) on delete restrict,
  prompt_revision_id uuid not null unique
    references tongs.broll_prompt_revisions(id) on delete restrict,
  provider_response_hash text not null check (provider_response_hash ~ '^[0-9a-f]{64}$'),
  receipt_hash text not null check (receipt_hash ~ '^[0-9a-f]{64}$'),
  migration_version text not null
    check (migration_version = '20261011870000'),
  grandfathered_at timestamptz not null default transaction_timestamp()
);

do $$
declare
  v_unified_expected text[] := array[
    'forge:hosted-smoke:unified-visual-plan-v2:9f000001',
    'forge:unified-visual-plan:0075e13d24203b78dd9bfd9de1d40dc8217d68390b8a7d976aa60c26120ba063',
    'forge:unified-visual-plan:01c5473a1069e44c8fd52c556ad657126121498a2daca9f523bf33b30b4fcd91',
    'forge:unified-visual-plan:09700b1919dd8f92b19d7728ca2f7739574d1549c3d8cfc48497be8ccb04d11d',
    'forge:unified-visual-plan:1eccdb396985beecf84ebf0098cfaddd454ba2f74b8da4c34d857670d8714a26',
    'forge:unified-visual-plan:1f41523cee4818f9929a2fc91b4026be23f4366143a5c53091894e38b7c02361',
    'forge:unified-visual-plan:38b19943c7875340656468dc6ae9a32769aa6246ac0ca09fcb102170d767887d',
    'forge:unified-visual-plan:38eaee12766bffc5c52f6f5dc4bc897c8b26a2006f7524d6440ef94285d4d8b3',
    'forge:unified-visual-plan:4ae02907c758829016026aa65be42594d2ae9b3379552972d8cb86e085c426be',
    'forge:unified-visual-plan:51570d0054d84b49f8ce5b7fd27ebd5f0482581d013c3332b1004d35b7d0730c',
    'forge:unified-visual-plan:5201ee6279c29fab2a67ee14000e4fee53328e00a35782e2a107c6f583a4b79c',
    'forge:unified-visual-plan:5c91960827324bad517a40bc8378ba4d90c78477a7f7463908b18d8859f51810',
    'forge:unified-visual-plan:65acac7f22291d99af710626d47f7f35e65de6db5e115381b70777cfef5689cd',
    'forge:unified-visual-plan:6a8724b2ade81b8cc79bf89fac2595c8767de249a754ebaa8ec874a0194ca6e1',
    'forge:unified-visual-plan:6b29713a211a60fc52ef78b9f3b7bcfa115998c498b39853e4afd78d11e2f447',
    'forge:unified-visual-plan:7c221aa40ac968a913feab2c7c44f21e3ff3a0292a60a54d284bf96632419270',
    'forge:unified-visual-plan:809cf8174f1da8c922f0288a2e8f4d7272dc5b51d5ec0e734371e70af52cc853',
    'forge:unified-visual-plan:a231a02a82f6e28dac40d3e496cd976d7b901808bf4b58a5c2ae636236144145',
    'forge:unified-visual-plan:b0ecf4f34f35be76f7c53a6088b0941226380ef76fb23ff34843654344242f6b',
    'forge:unified-visual-plan:bc6dcd8d05a30e8c58d74a0221f6cc052336c1073d15334742c32a60dd68c855',
    'forge:unified-visual-plan:c3fd7d5ab62b63331f1fb27e042e3fc292afa3026388c4d0635bebb49a768323',
    'forge:unified-visual-plan:cf67e0519061bc53f43dca911c6e667dd4e2a82ac27bcc0f572b103fcc014a12',
    'forge:unified-visual-plan:eaaa2609f58780b3b87815bc0233b9b66b38cff31d631764eba7fcc58cc2e0d2',
    'forge:unified-visual-plan:eece27067100bab282cb74bf31ae757a95db2751becba32e016c26099285cccf',
    'forge:unified-visual-plan:f26007828bad66b67ef378bf1a742d4374310a7e2470356b15bca9db9750d05d',
    'forge:unified-visual-plan:f9d938334fd9cddc8348870687cb20d70d521879c26b1ff1e5aa9098166706a0',
    'forge:unified-visual-plan:fe7fac8864a0c521ee1c1a54fbe35025f80960bce215083b59e44937442505b4',
    'forge:unified-visual-plan:fe8d6a0866bdf1fcd604dc2b9a022e4721faf4b1759d81841a1d7d2162cfc8d9',
    'forge:unified-visual-plan:hosted-smoke:68be7776-8907-4a61-be16-a7428163de4a',
    'forge:unified-visual-plan:hosted-smoke:d718cf51-328a-409a-b930-2dc99e591df0'
  ];
  v_motion_expected text[] := array[
    'forge:broll:hosted-motion-2174a786466c442696e9ba728637e5ca',
    'forge:broll:hosted-motion-b723bfb540c44cebb1856ffb0b1fd574',
    'forge:broll:prompt:1094c0c8a8bd5bd6152baf29960cac50d0fd8087d992514c32ba5c2a8fdd9916',
    'forge:broll:prompt:18c0012c7ffb8d4f43946404a504ce9f96a11726aca10cdeb0f1264b84a21c34',
    'forge:broll:prompt:1ee7466e529bc9308f27097f1a493eec2c92ed3109fb4744947ba9aefe3bd6ce',
    'forge:broll:prompt:20ddf7e25c9e69da5a689998735c234105f66136ee102d179c031e2e7ddb280e',
    'forge:broll:prompt:240df8c8c2c5ac510846a12b1dc05751a8531b63db2e863b58503410a8285680',
    'forge:broll:prompt:3956ce5ceb6324666287741ffa4360eb75fd8f264fb6bde4f61d13af6bbd13f2',
    'forge:broll:prompt:3afc5f028d8aee7f3d2298ff1aca8fcc6f762d9e588bfcb1720c91aa4b0dedf9',
    'forge:broll:prompt:41ffa35879e394b452893d17e3162ba3d9d3032cd70a03d4ae0fd148c464eaad',
    'forge:broll:prompt:4370d489a8e7dbbbd5ebf44f51af8c77f80e07d6c948a7619f4d191fae040108',
    'forge:broll:prompt:448bbe14bdeec2266b12dedd5fb6b38ef1633c1db988f837436d87d2cd256c0d',
    'forge:broll:prompt:585306ff56c8b699922c3aed000a3ef656c41e74d95ee77de4e04ad355cf5386',
    'forge:broll:prompt:5c589cbb0e96e29d5a12256848d1ed9e15b67d9f6472002b48cab1fa688d5d94',
    'forge:broll:prompt:60cf31dc2eb1e45a939482515683022b4749af3d089f396420b9d3ce25a4586f',
    'forge:broll:prompt:6769f6a588b17601ebffd464561989ad450d45be0954b750051459c200cbd28b',
    'forge:broll:prompt:7aa84e0351962e1e0379aa3e5653ff406e5df008403630f3b5f5022470ae2933',
    'forge:broll:prompt:8a02d291755ee826c5f2762578c6c97f9db0820c9997b4e1cd7cd80e9df9d1b5',
    'forge:broll:prompt:913ad2791440f53e31cc2ceaac2e7c2aad36ae4dc4a631c9a597fc6b2d0a678f',
    'forge:broll:prompt:a2ae9d7a32a92c47a4f953249de350727b3d3de6806d92f0170f7cd6f51bbdeb',
    'forge:broll:prompt:a510a295ac4617a33ee47c361e88f7d5132384515c4677509ab7013421286dc2',
    'forge:broll:prompt:c75724638e178249884d1cd9c62bb4d7ab179cecdfa4157d29b9eb4ad77e41b9',
    'forge:broll:prompt:c7ba87ba7981e446a732a095909c8fcebc675eb923768a40278f771c62409b60',
    'forge:broll:prompt:dbcc07bd0ea1b6783e84dacabae2737c0b1651a450953d62169c743aeeccb1ec',
    'forge:broll:prompt:dfc5fa2adbfb544b6dcbb8ec89511497c80e6a76b052cc7cbb0f9559fe93b1c8',
    'forge:broll:prompt:e1632507cad0de00e371135993ad993d56bbd503ae5cbd335f60f988eef346cd',
    'forge:broll:prompt:e4a28c6b464f515e3c2ea2d7f66c6a5a69f8aae895aefbc6e281e161e41b7a67',
    'forge:broll:prompt:f5c64347ee6db0291299e88ebd4d3b1e82925c9150bcb8ec4cec09a42c2c9c9c',
    'forge:broll:prompt:fe487f18e3ff6b9fdc09e6ebf58a3b0aceb5b1bb31e4524b9d1262f9304272d2'
  ];
  v_count integer;
begin
  if cardinality(v_unified_expected) <> 30 or cardinality(v_motion_expected) <> 29 then
    raise exception 'Slice 4D historical identity manifest is malformed';
  end if;

  select count(*) into v_count
  from tongs.unified_visual_plan_operations operation
  where operation.operation_id = any(v_unified_expected)
    and operation.state = 'verified'
    and operation.provider_response_json is not null
    and operation.provider_response_hash is not null
    and operation.receipt_json is not null
    and not exists (
      select 1 from tongs.openai_text_funding_bindings binding
      where binding.operation_id = operation.operation_id
        and binding.route_code = 'visual.unified_plan')
    and not exists (
      select 1 from tongs.owner_cost_operations owner_operation
      where owner_operation.operation_key = operation.operation_id);
  if v_count <> 30 then
    raise exception 'Slice 4D unified historical gate moved: expected 30, found %', v_count;
  end if;
  if exists (
    select operation.operation_id
    from tongs.unified_visual_plan_operations operation
    where not exists (
      select 1 from tongs.openai_text_funding_bindings binding
      where binding.operation_id=operation.operation_id and binding.route_code='visual.unified_plan')
      and not exists (
        select 1 from tongs.owner_cost_operations owner_operation
        where owner_operation.operation_key=operation.operation_id)
    except select unnest(v_unified_expected)
  ) then raise exception 'Slice 4D found an unexpected unified authority-free row'; end if;

  select count(*) into v_count
  from tongs.broll_operation_receipts receipt
  join tongs.broll_prompt_revisions prompt on prompt.id=receipt.result_prompt_revision_id
  where receipt.operation_id = any(v_motion_expected)
    and receipt.operation_type='prompt_interpretation'
    and receipt.state='committed'
    and receipt.provider_response_json is not null
    and receipt.provider_response_hash is not null
    and receipt.receipt_json is not null
    and not exists (
      select 1 from tongs.openai_text_funding_bindings binding
      where binding.operation_id=receipt.operation_id
        and binding.route_code='motion.broll_interpretation')
    and not exists (
      select 1 from tongs.owner_cost_operations owner_operation
      where owner_operation.operation_key=receipt.operation_id);
  if v_count <> 29 then
    raise exception 'Slice 4D motion historical gate moved: expected 29, found %', v_count;
  end if;
  if exists (
    select receipt.operation_id
    from tongs.broll_operation_receipts receipt
    where receipt.operation_type='prompt_interpretation'
      and not exists (
        select 1 from tongs.openai_text_funding_bindings binding
        where binding.operation_id=receipt.operation_id and binding.route_code='motion.broll_interpretation')
      and not exists (
        select 1 from tongs.owner_cost_operations owner_operation
        where owner_operation.operation_key=receipt.operation_id)
    except select unnest(v_motion_expected)
  ) then raise exception 'Slice 4D found an unexpected motion authority-free row'; end if;

  insert into tongs.unified_visual_plan_historical_authorities(
    operation_id,provider_response_hash,receipt_hash,migration_version
  )
  select operation.operation_id,operation.provider_response_hash,
    encode(extensions.digest(convert_to(operation.receipt_json::text,'UTF8'),'sha256'),'hex'),
    '20261011870000'
  from tongs.unified_visual_plan_operations operation
  where operation.operation_id=any(v_unified_expected);

  insert into tongs.broll_interpretation_historical_authorities(
    operation_id,prompt_revision_id,provider_response_hash,receipt_hash,migration_version
  )
  select receipt.operation_id,receipt.result_prompt_revision_id,receipt.provider_response_hash,
    encode(extensions.digest(convert_to(receipt.receipt_json::text,'UTF8'),'sha256'),'hex'),
    '20261011870000'
  from tongs.broll_operation_receipts receipt
  where receipt.operation_id=any(v_motion_expected);
end $$;

create function tongs._reject_hearth_historical_authority_mutation()
returns trigger language plpgsql set search_path=pg_catalog as $$
begin
  raise exception 'Hearth historical authority is migration-sealed' using errcode='42501';
end $$;

create trigger unified_visual_plan_historical_authorities_immutable
before insert or update or delete on tongs.unified_visual_plan_historical_authorities
for each row execute function tongs._reject_hearth_historical_authority_mutation();
create trigger broll_interpretation_historical_authorities_immutable
before insert or update or delete on tongs.broll_interpretation_historical_authorities
for each row execute function tongs._reject_hearth_historical_authority_mutation();

alter table tongs.unified_visual_plan_historical_authorities enable row level security;
alter table tongs.unified_visual_plan_historical_authorities force row level security;
alter table tongs.broll_interpretation_historical_authorities enable row level security;
alter table tongs.broll_interpretation_historical_authorities force row level security;
revoke all on tongs.unified_visual_plan_historical_authorities from public,anon,authenticated,service_role;
revoke all on tongs.broll_interpretation_historical_authorities from public,anon,authenticated,service_role;
grant select on tongs.unified_visual_plan_historical_authorities to service_role;
grant select on tongs.broll_interpretation_historical_authorities to service_role;

alter table tongs.unified_visual_plan_operations
  add column owner_cost_attempt_id uuid,
  add constraint unified_visual_plan_owner_attempt_fkey
    foreign key(owner_cost_attempt_id)
    references tongs.owner_cost_provider_attempts(attempt_id) on delete restrict;
create unique index unified_visual_plan_owner_attempt_uidx
  on tongs.unified_visual_plan_operations(owner_cost_attempt_id)
  where owner_cost_attempt_id is not null;

alter table tongs.broll_operation_receipts
  add column owner_cost_attempt_id uuid,
  add constraint broll_operation_receipts_owner_attempt_fkey
    foreign key(owner_cost_attempt_id)
    references tongs.owner_cost_provider_attempts(attempt_id) on delete restrict,
  add constraint broll_operation_receipts_owner_route_check
    check (owner_cost_attempt_id is null or operation_type='prompt_interpretation');
create unique index broll_operation_receipts_owner_attempt_uidx
  on tongs.broll_operation_receipts(owner_cost_attempt_id)
  where owner_cost_attempt_id is not null;

alter table tongs.broll_prompt_revisions
  add column owner_cost_attempt_id uuid,
  add constraint broll_prompt_revisions_owner_attempt_fkey
    foreign key(owner_cost_attempt_id)
    references tongs.owner_cost_provider_attempts(attempt_id) on delete restrict,
  add constraint broll_prompt_revisions_owner_source_check
    check (owner_cost_attempt_id is null or prompt_source='ai_derived');
create unique index broll_prompt_revisions_owner_attempt_uidx
  on tongs.broll_prompt_revisions(owner_cost_attempt_id)
  where owner_cost_attempt_id is not null;

create function tongs._assert_owner_hearth_operation_attempt(
  p_owner_cost_attempt_id uuid,p_route_code text,p_user_id uuid,
  p_workspace_id uuid,p_workpiece_id uuid,p_operation_fingerprint text,
  p_financial_environment text,p_runtime_environment text,
  p_provider text,p_model text,p_allowed_states text[]
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare
  v_attempt tongs.owner_cost_provider_attempts%rowtype;
  v_operation tongs.owner_cost_operations%rowtype;
  v_latest_state text;
begin
  perform tongs._require_accounting_service_role();
  select * into v_attempt from tongs.owner_cost_provider_attempts
    where attempt_id=p_owner_cost_attempt_id;
  if not found then raise exception 'owner-cost attempt not found' using errcode='23503'; end if;
  select * into v_operation from tongs.owner_cost_operations
    where operation_id=v_attempt.operation_id;
  if not found then raise exception 'owner-cost operation not found' using errcode='23503'; end if;
  select lifecycle_state into v_latest_state from tongs.owner_cost_attempt_events
    where attempt_id=p_owner_cost_attempt_id order by event_sequence desc limit 1;
  if v_operation.payer<>'forge'
    or v_operation.originating_tool<>'hearth'
    or v_operation.operation_type<>lower(btrim(p_route_code))
    or v_operation.workspace_id is distinct from p_workspace_id
    or v_operation.workpiece_id is distinct from p_workpiece_id
    or v_operation.request_fingerprint<>lower(btrim(p_operation_fingerprint))
    or v_operation.financial_environment<>lower(btrim(p_financial_environment))
    or v_operation.runtime_environment<>lower(btrim(p_runtime_environment))
    or v_attempt.provider<>lower(btrim(p_provider))
    or v_attempt.model is distinct from nullif(btrim(p_model),'')
    or v_latest_state is null or v_latest_state<>all(p_allowed_states)
  then raise exception 'owner Hearth operation authority mismatch' using errcode='42501'; end if;
  if not exists (
    select 1 from tongs.workspaces workspace
    where workspace.id=p_workspace_id and (
      workspace.created_by=p_user_id
      or exists(select 1 from tongs.workspace_members member
        where member.workspace_id=workspace.id and member.user_id=p_user_id)
      or tongs.is_platform_operator(p_user_id)))
  then raise exception 'owner Hearth operation user cannot access workspace' using errcode='42501'; end if;
  return jsonb_build_object(
    'operation_id',v_operation.operation_id,'operation_key',v_operation.operation_key,
    'attempt_id',v_attempt.attempt_id,'latest_state',v_latest_state,
    'financial_environment',v_operation.financial_environment,
    'runtime_environment',v_operation.runtime_environment);
end $$;

create function tongs._enforce_hearth_remaining_execution_authority()
returns trigger language plpgsql set search_path=pg_catalog as $$
declare
  v_route text;
  v_customer boolean;
  v_historical boolean;
  v_owner tongs.owner_cost_operations%rowtype;
  v_attempt tongs.owner_cost_provider_attempts%rowtype;
  v_latest_state text;
begin
  if tg_table_name='unified_visual_plan_operations' then
    v_route:='visual.unified_plan';
    select exists(select 1 from tongs.unified_visual_plan_historical_authorities historical
      where historical.operation_id=new.operation_id) into v_historical;
  elsif tg_table_name='broll_operation_receipts' and new.operation_type='prompt_interpretation' then
    v_route:='motion.broll_interpretation';
    select exists(select 1 from tongs.broll_interpretation_historical_authorities historical
      where historical.operation_id=new.operation_id) into v_historical;
  else
    if new.owner_cost_attempt_id is not null then
      raise exception 'owner authority is restricted to B-roll prompt interpretation' using errcode='23514';
    end if;
    return new;
  end if;

  select exists(select 1 from tongs.openai_text_funding_bindings binding
    where binding.operation_id=new.operation_id and binding.route_code=v_route) into v_customer;
  if ((v_customer::integer)+(v_historical::integer)+
      ((new.owner_cost_attempt_id is not null)::integer)) <> 1 then
    raise exception '% requires exactly one customer, owner, or sealed historical authority', v_route
      using errcode='23514';
  end if;
  if tg_op='UPDATE' and new.owner_cost_attempt_id is distinct from old.owner_cost_attempt_id then
    raise exception 'execution authority is immutable' using errcode='55000';
  end if;
  if v_historical then
    if tg_op='INSERT' or new.owner_cost_attempt_id is not null then
      raise exception 'historical authority is migration-only' using errcode='42501';
    end if;
    return new;
  end if;
  if new.owner_cost_attempt_id is null then return new; end if;

  select * into v_attempt from tongs.owner_cost_provider_attempts
    where attempt_id=new.owner_cost_attempt_id;
  select * into v_owner from tongs.owner_cost_operations
    where operation_id=v_attempt.operation_id;
  select lifecycle_state into v_latest_state from tongs.owner_cost_attempt_events
    where attempt_id=new.owner_cost_attempt_id order by event_sequence desc limit 1;
  if v_attempt.attempt_id is null or v_owner.operation_id is null
    or v_owner.payer<>'forge' or v_owner.originating_tool<>'hearth'
    or v_owner.operation_type<>v_route or v_owner.operation_key<>new.operation_id
    or v_owner.workspace_id is distinct from new.workspace_id
    or v_owner.workpiece_id is distinct from new.workpiece_id
    or v_owner.request_fingerprint<>new.operation_fingerprint
    or v_attempt.provider<>'openai'
    or v_latest_state not in ('authorized','submitted','response_captured','succeeded')
    or (new.provider_response_json is not null
      and v_latest_state not in ('response_captured','succeeded'))
  then raise exception 'owner execution authority does not match canonical operation'
    using errcode='42501'; end if;
  return new;
end $$;

create trigger unified_visual_plan_execution_authority
before insert or update on tongs.unified_visual_plan_operations
for each row execute function tongs._enforce_hearth_remaining_execution_authority();
create trigger broll_operation_receipts_execution_authority
before insert or update on tongs.broll_operation_receipts
for each row execute function tongs._enforce_hearth_remaining_execution_authority();

create function tongs._bind_broll_prompt_owner_authority()
returns trigger language plpgsql set search_path=pg_catalog as $$
declare v_receipt tongs.broll_operation_receipts%rowtype;
begin
  if new.prompt_source<>'ai_derived' then
    if new.owner_cost_attempt_id is not null then
      raise exception 'creator prompt edits cannot claim owner provider authority' using errcode='23514';
    end if;
    return new;
  end if;
  select * into v_receipt from tongs.broll_operation_receipts
    where operation_id=new.origin_operation_id and operation_type='prompt_interpretation';
  if not found then raise exception 'AI-derived B-roll prompt requires its canonical receipt' using errcode='23503'; end if;
  if new.owner_cost_attempt_id is not null
    and new.owner_cost_attempt_id is distinct from v_receipt.owner_cost_attempt_id
  then raise exception 'B-roll prompt owner authority conflicts with its receipt' using errcode='23514'; end if;
  new.owner_cost_attempt_id:=v_receipt.owner_cost_attempt_id;
  return new;
end $$;
create trigger broll_prompt_revision_owner_authority
before insert on tongs.broll_prompt_revisions
for each row execute function tongs._bind_broll_prompt_owner_authority();

create function tongs.begin_owner_unified_visual_plan(
  p_owner_cost_attempt_id uuid,p_user_id uuid,p_workspace_id uuid,p_workpiece_id uuid,
  p_operation_fingerprint text,p_financial_environment text,p_runtime_environment text,
  p_script_approval_id uuid,
  p_expected_image_revision_id uuid,p_expected_image_revision bigint,
  p_expected_broll_revision_id uuid,p_expected_broll_revision bigint,
  p_expected_reference_revision_id uuid,p_expected_reference_revision bigint,
  p_expected_reference_visual_revision_id uuid,p_expected_reference_visual_revision bigint,
  p_normalized_inputs_json jsonb,p_model text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_authority jsonb;
  v_operation_key text;
  v_existing tongs.unified_visual_plan_operations%rowtype;
  v_approval tongs.script_approval_revisions%rowtype;
  v_image tongs.workpiece_image_map_sequences%rowtype;
  v_broll tongs.broll_plan_sequences%rowtype;
  v_reference tongs.reference_clip_plan_sequences%rowtype;
  v_reference_visual tongs.reference_visual_plan_sequences%rowtype;
begin
  v_authority:=tongs._assert_owner_hearth_operation_attempt(
    p_owner_cost_attempt_id,'visual.unified_plan',p_user_id,p_workspace_id,p_workpiece_id,
    p_operation_fingerprint,p_financial_environment,p_runtime_environment,
    'openai',p_model,array['authorized','submitted','response_captured','succeeded']);
  if p_model<>'gpt-5.6-luna' or jsonb_typeof(coalesce(p_normalized_inputs_json,'null'::jsonb))<>'object'
  then raise exception 'invalid owner unified visual-plan contract' using errcode='22023'; end if;
  v_operation_key:=v_authority->>'operation_key';
  perform pg_advisory_xact_lock(hashtextextended('owner-unified-plan:'||p_owner_cost_attempt_id::text,0));
  select * into v_existing from tongs.unified_visual_plan_operations
    where operation_id=v_operation_key or owner_cost_attempt_id=p_owner_cost_attempt_id for update;
  if found then
    if v_existing.operation_id<>v_operation_key
      or v_existing.owner_cost_attempt_id is distinct from p_owner_cost_attempt_id
      or v_existing.operation_fingerprint<>lower(p_operation_fingerprint)
      or v_existing.workspace_id<>p_workspace_id or v_existing.workpiece_id<>p_workpiece_id
    then raise exception 'owner unified visual-plan replay conflict' using errcode='23505'; end if;
    return jsonb_build_object('disposition','replay','operation',to_jsonb(v_existing));
  end if;
  select * into v_approval from tongs.script_approval_revisions
    where id=p_script_approval_id and workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;
  if not found or not exists(select 1 from tongs.workpiece_script_approval_sequences sequence
    where sequence.workspace_id=p_workspace_id and sequence.workpiece_id=p_workpiece_id
      and sequence.current_approval_id=v_approval.id)
  then return jsonb_build_object('disposition','script_revision_conflict'); end if;
  select * into v_image from tongs.workpiece_image_map_sequences where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;
  select * into v_broll from tongs.broll_plan_sequences where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;
  select * into v_reference from tongs.reference_clip_plan_sequences where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;
  select * into v_reference_visual from tongs.reference_visual_plan_sequences where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;
  if coalesce(v_image.current_revision,0)<>p_expected_image_revision
    or v_image.current_revision_id is distinct from p_expected_image_revision_id
    or coalesce(v_broll.current_plan_revision,0)<>p_expected_broll_revision
    or v_broll.current_plan_revision_id is distinct from p_expected_broll_revision_id
    or coalesce(v_reference.current_plan_revision,0)<>p_expected_reference_revision
    or v_reference.current_plan_revision_id is distinct from p_expected_reference_revision_id
    or coalesce(v_reference_visual.current_plan_revision,0)<>p_expected_reference_visual_revision
    or v_reference_visual.current_plan_revision_id is distinct from p_expected_reference_visual_revision_id
  then return jsonb_build_object('disposition','child_revision_conflict'); end if;
  insert into tongs.unified_visual_plan_operations(
    operation_id,operation_fingerprint,workspace_id,workpiece_id,
    script_approval_id,script_approval_revision,script_content_hash,
    contract_version,expected_reference_visual_revision_id,
    expected_reference_visual_revision,normalized_inputs_json,created_by,owner_cost_attempt_id
  ) values(
    v_operation_key,lower(p_operation_fingerprint),p_workspace_id,p_workpiece_id,
    v_approval.id,v_approval.approval_revision,v_approval.script_content_hash,
    'forge.unified-visual-plan.v2',p_expected_reference_visual_revision_id,
    p_expected_reference_visual_revision,p_normalized_inputs_json,p_user_id,p_owner_cost_attempt_id
  ) returning * into v_existing;
  return jsonb_build_object('disposition','reserved','operation',to_jsonb(v_existing));
end $$;

create function tongs.begin_owner_broll_prompt_interpretation(
  p_owner_cost_attempt_id uuid,p_user_id uuid,p_workspace_id uuid,p_workpiece_id uuid,
  p_beat_id uuid,p_operation_fingerprint text,p_financial_environment text,
  p_runtime_environment text,p_expected_prompt_revision_id uuid,
  p_expected_prompt_revision bigint,p_creator_direction text,p_creative_input_hash text,
  p_interpretation_contract_version text,p_validator_version text,
  p_synthesis_contract_version text,p_interpretation_provider text,
  p_interpretation_model text,p_interpretation_request jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_authority jsonb;
  v_operation_key text;
  v_sequence tongs.broll_prompt_sequences%rowtype;
  v_current jsonb;
  v_inputs jsonb;
  v_existing tongs.broll_operation_receipts%rowtype;
begin
  v_authority:=tongs._assert_owner_hearth_operation_attempt(
    p_owner_cost_attempt_id,'motion.broll_interpretation',p_user_id,p_workspace_id,p_workpiece_id,
    p_operation_fingerprint,p_financial_environment,p_runtime_environment,
    p_interpretation_provider,p_interpretation_model,
    array['authorized','submitted','response_captured','succeeded']);
  if p_interpretation_provider<>'openai' or p_interpretation_model<>'gpt-5.6-luna'
    or p_beat_id is null or lower(p_creative_input_hash) !~ '^[0-9a-f]{64}$'
    or nullif(btrim(p_validator_version),'') is null
  then raise exception 'invalid owner B-roll interpretation contract' using errcode='22023'; end if;
  v_operation_key:=v_authority->>'operation_key';
  perform pg_advisory_xact_lock(hashtextextended('owner-broll-prompt:'||p_owner_cost_attempt_id::text,0));
  select * into v_existing from tongs.broll_operation_receipts
    where operation_id=v_operation_key or owner_cost_attempt_id=p_owner_cost_attempt_id for update;
  if found then
    if v_existing.operation_id<>v_operation_key
      or v_existing.owner_cost_attempt_id is distinct from p_owner_cost_attempt_id
      or v_existing.operation_fingerprint<>lower(p_operation_fingerprint)
      or v_existing.workspace_id<>p_workspace_id or v_existing.workpiece_id<>p_workpiece_id
      or v_existing.beat_id is distinct from p_beat_id
    then raise exception 'owner B-roll interpretation replay conflict' using errcode='23505'; end if;
    return jsonb_build_object('disposition','replay','operation',to_jsonb(v_existing));
  end if;
  insert into tongs.broll_prompt_sequences(workspace_id,workpiece_id,beat_id)
    values(p_workspace_id,p_workpiece_id,p_beat_id) on conflict do nothing;
  select * into v_sequence from tongs.broll_prompt_sequences
    where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and beat_id=p_beat_id for update;
  if v_sequence.current_prompt_revision<>p_expected_prompt_revision
    or v_sequence.current_prompt_revision_id is distinct from p_expected_prompt_revision_id
  then return jsonb_build_object('disposition','prompt_revision_conflict',
    'current_revision_id',v_sequence.current_prompt_revision_id,
    'current_revision',v_sequence.current_prompt_revision); end if;
  v_current:=tongs.broll_current_creative_input(
    p_workspace_id,p_workpiece_id,p_beat_id,p_creator_direction,
    p_interpretation_contract_version,p_synthesis_contract_version);
  if v_current->>'disposition'<>'current' then
    return jsonb_build_object('disposition',v_current->>'disposition'); end if;
  if v_current->>'creative_input_hash' is distinct from lower(p_creative_input_hash) then
    return jsonb_build_object('disposition','creative_input_conflict',
      'current_creative_input_hash',v_current->>'creative_input_hash'); end if;
  v_inputs:=jsonb_build_object(
    'expected_prompt_revision_id',p_expected_prompt_revision_id,
    'expected_prompt_revision',p_expected_prompt_revision,
    'creator_direction',coalesce(p_creator_direction,''),
    'creative_input_hash',lower(p_creative_input_hash),
    'interpretation_contract_version',p_interpretation_contract_version,
    'validator_version',p_validator_version,
    'synthesis_contract_version',p_synthesis_contract_version,
    'interpretation_provider',p_interpretation_provider,
    'interpretation_model',p_interpretation_model,
    'interpretation_request',coalesce(p_interpretation_request,'{}'::jsonb));
  insert into tongs.broll_operation_receipts(
    operation_id,operation_fingerprint,operation_type,state,workspace_id,workpiece_id,
    beat_id,normalized_inputs_json,created_by,owner_cost_attempt_id
  ) values(
    v_operation_key,lower(p_operation_fingerprint),'prompt_interpretation','pending',
    p_workspace_id,p_workpiece_id,p_beat_id,v_inputs,p_user_id,p_owner_cost_attempt_id
  ) returning * into v_existing;
  return jsonb_build_object('disposition','reserved','operation',to_jsonb(v_existing));
end $$;

create function tongs.finalize_owner_hearth_thumbnail_direction_generation_result(
  p_owner_cost_attempt_id uuid,p_result_id uuid,p_canonical_set_id uuid,
  p_canonical_source_response_hash text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_result tongs.hearth_thumbnail_direction_generation_results%rowtype;
  v_attempt tongs.owner_cost_provider_attempts%rowtype;
  v_operation tongs.owner_cost_operations%rowtype;
  v_receipt tongs.hearth_thumbnail_direction_canonical_receipts%rowtype;
begin
  perform tongs._require_accounting_service_role();
  perform pg_advisory_xact_lock(hashtextextended('owner-thumbnail-direction-finalize:'||p_owner_cost_attempt_id::text,0));
  select * into v_result from tongs.hearth_thumbnail_direction_generation_results
    where id=p_result_id and owner_cost_attempt_id=p_owner_cost_attempt_id;
  select * into v_attempt from tongs.owner_cost_provider_attempts where attempt_id=p_owner_cost_attempt_id;
  select * into v_operation from tongs.owner_cost_operations where operation_id=v_attempt.operation_id;
  if v_result.id is null or v_operation.operation_key<>v_result.operation_id
    or v_operation.operation_type<>'hearth.thumbnail_direction_generation'
    or p_canonical_set_id is null
    or lower(coalesce(p_canonical_source_response_hash,'')) !~ '^[0-9a-f]{64}$'
  then raise exception 'invalid owner canonical Thumbnail Directions receipt' using errcode='22023'; end if;
  perform tongs._assert_owner_hearth_result_authority(
    p_owner_cost_attempt_id,'hearth.thumbnail_direction_generation',v_result.user_id,
    v_result.workspace_id,v_result.workpiece_id,v_result.request_fingerprint,
    v_operation.financial_environment,v_operation.runtime_environment,
    v_result.provider_request_id,v_attempt.model);
  select * into v_receipt from tongs.hearth_thumbnail_direction_canonical_receipts
    where result_id=p_result_id;
  if found then
    if v_receipt.canonical_set_id<>p_canonical_set_id
      or v_receipt.canonical_source_response_hash<>lower(p_canonical_source_response_hash)
    then raise exception 'owner canonical Thumbnail Directions receipt replay conflict' using errcode='23505'; end if;
  else
    insert into tongs.hearth_thumbnail_direction_canonical_receipts(
      result_id,canonical_set_id,canonical_source_response_hash
    ) values(p_result_id,p_canonical_set_id,lower(p_canonical_source_response_hash))
    returning * into v_receipt;
  end if;
  return v_result.result_json||jsonb_build_object(
    'thumbnail_direction_result_id',v_result.id,'created_at',v_result.created_at,
    'provider_request_id',v_result.provider_request_id,'input_units',v_result.input_units,
    'output_units',v_result.output_units,'replay',true,'canonical_persisted',true,
    'canonical_set_id',v_receipt.canonical_set_id,
    'canonical_source_response_hash',v_receipt.canonical_source_response_hash,
    'canonical_committed_at',v_receipt.committed_at,'authority','owner_cost_provider_attempt');
end $$;

-- Existing canonical continuation RPCs stay customer-compatible, but owner-bound
-- rows can only be advanced by the service role. Patch only their authorization
-- predicate and assert the exact current definition before replacement.
do $$
declare
  v_signature regprocedure;
  v_definition text;
  v_changed text;
  v_old text;
  v_new text;
begin
  foreach v_signature in array array[
    'tongs.record_unified_visual_plan_provider_response(text,text,jsonb)'::regprocedure,
    'tongs.record_unified_visual_plan_child(text,text,text,uuid,bigint)'::regprocedure,
    'tongs.verify_unified_visual_plan(text,text)'::regprocedure,
    'tongs.fail_unified_visual_plan(text,text,text,text,text)'::regprocedure
  ] loop
    select pg_get_functiondef(v_signature::oid) into v_definition;
    v_old:='if not tongs.has_workspace_role(op.workspace_id, ''editor''::text) then';
    if position(v_old in v_definition)=0 then
      v_old:='if not tongs.has_workspace_role(op.workspace_id,''editor'') then';
    end if;
    v_new:='if op.owner_cost_attempt_id is not null then perform tongs._require_accounting_service_role(); elsif not tongs.has_workspace_role(op.workspace_id,''editor'') then';
    v_changed:=replace(v_definition,v_old,v_new);
    if v_changed=v_definition then raise exception 'could not harden owner authorization for %',v_signature; end if;
    execute v_changed;
  end loop;

  foreach v_signature in array array[
    'tongs.record_broll_provider_or_upload_result(text,text,jsonb)'::regprocedure,
    'tongs.commit_broll_prompt_interpretation(text,text,uuid,jsonb,text,text,text,text,uuid)'::regprocedure
  ] loop
    select pg_get_functiondef(v_signature::oid) into v_definition;
    v_old:='if not tongs.has_workspace_role(v_op.workspace_id, ''editor''::text) then';
    if position(v_old in v_definition)=0 then
      v_old:='if not tongs.has_workspace_role(v_op.workspace_id,''editor'') then';
    end if;
    v_new:='if v_op.owner_cost_attempt_id is not null then perform tongs._require_accounting_service_role(); elsif not tongs.has_workspace_role(v_op.workspace_id,''editor'') then';
    v_changed:=replace(v_definition,v_old,v_new);
    if v_changed=v_definition then raise exception 'could not harden owner authorization for %',v_signature; end if;
    execute v_changed;
  end loop;
end $$;

create function tongs.read_hearth_execution_authority(p_domain text,p_operation_id text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare
  v_workspace_id uuid;
  v_workpiece_id uuid;
  v_owner_attempt_id uuid;
  v_customer boolean;
  v_historical boolean;
  v_route text;
begin
  if p_domain='unified_visual_plan' then
    select workspace_id,workpiece_id,owner_cost_attempt_id into v_workspace_id,v_workpiece_id,v_owner_attempt_id
      from tongs.unified_visual_plan_operations where operation_id=p_operation_id;
    v_route:='visual.unified_plan';
    select exists(select 1 from tongs.unified_visual_plan_historical_authorities where operation_id=p_operation_id) into v_historical;
  elsif p_domain='motion_broll_interpretation' then
    select workspace_id,workpiece_id,owner_cost_attempt_id into v_workspace_id,v_workpiece_id,v_owner_attempt_id
      from tongs.broll_operation_receipts where operation_id=p_operation_id and operation_type='prompt_interpretation';
    v_route:='motion.broll_interpretation';
    select exists(select 1 from tongs.broll_interpretation_historical_authorities where operation_id=p_operation_id) into v_historical;
  else raise exception 'unsupported Hearth authority domain' using errcode='22023'; end if;
  if v_workspace_id is null then return null; end if;
  if current_user not in ('service_role','postgres','supabase_admin')
    and not tongs.has_workspace_role(v_workspace_id,'editor')
  then raise exception 'workspace editor authority required' using errcode='42501'; end if;
  select exists(select 1 from tongs.openai_text_funding_bindings
    where operation_id=p_operation_id and route_code=v_route) into v_customer;
  return jsonb_build_object(
    'domain',p_domain,'operation_id',p_operation_id,'workspace_id',v_workspace_id,
    'workpiece_id',v_workpiece_id,'authority',case
      when v_historical then 'historical_pre_authority'
      when v_customer then 'customer_funding'
      when v_owner_attempt_id is not null then 'owner_cost_provider_attempt'
      else 'invalid_unclassified' end);
end $$;

create function tongs.read_owner_unified_visual_plan_operation(p_owner_cost_attempt_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_result jsonb;
begin
  perform tongs._require_owner_cost_reader();
  select to_jsonb(operation)||jsonb_build_object(
      'owner_operation',jsonb_build_object(
        'operation_id',owner_operation.operation_id,'operation_key',owner_operation.operation_key,
        'financial_environment',owner_operation.financial_environment,
        'runtime_environment',owner_operation.runtime_environment),
      'valuations',coalesce((select jsonb_agg(to_jsonb(valuation) order by valuation.revision)
        from tongs.owner_cost_valuations valuation where valuation.attempt_id=attempt.attempt_id),'[]'::jsonb))
    into v_result
    from tongs.unified_visual_plan_operations operation
    join tongs.owner_cost_provider_attempts attempt on attempt.attempt_id=operation.owner_cost_attempt_id
    join tongs.owner_cost_operations owner_operation on owner_operation.operation_id=attempt.operation_id
    where operation.owner_cost_attempt_id=p_owner_cost_attempt_id;
  return v_result;
end
$$;

create function tongs.read_owner_broll_prompt_interpretation(p_owner_cost_attempt_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_result jsonb;
begin
  perform tongs._require_owner_cost_reader();
  select to_jsonb(receipt)||jsonb_build_object(
      'prompt_revision',case when prompt.id is null then null else to_jsonb(prompt) end,
      'owner_operation',jsonb_build_object(
        'operation_id',owner_operation.operation_id,'operation_key',owner_operation.operation_key,
        'financial_environment',owner_operation.financial_environment,
        'runtime_environment',owner_operation.runtime_environment),
      'valuations',coalesce((select jsonb_agg(to_jsonb(valuation) order by valuation.revision)
        from tongs.owner_cost_valuations valuation where valuation.attempt_id=attempt.attempt_id),'[]'::jsonb))
    into v_result
    from tongs.broll_operation_receipts receipt
    join tongs.owner_cost_provider_attempts attempt on attempt.attempt_id=receipt.owner_cost_attempt_id
    join tongs.owner_cost_operations owner_operation on owner_operation.operation_id=attempt.operation_id
    left join tongs.broll_prompt_revisions prompt on prompt.id=receipt.result_prompt_revision_id
    where receipt.owner_cost_attempt_id=p_owner_cost_attempt_id;
  return v_result;
end
$$;

revoke all on function tongs._reject_hearth_historical_authority_mutation() from public,anon,authenticated,service_role;
revoke all on function tongs._assert_owner_hearth_operation_attempt(uuid,text,uuid,uuid,uuid,text,text,text,text,text,text[]) from public,anon,authenticated,service_role;
revoke all on function tongs._enforce_hearth_remaining_execution_authority() from public,anon,authenticated,service_role;
revoke all on function tongs._bind_broll_prompt_owner_authority() from public,anon,authenticated,service_role;
revoke all on function tongs.begin_owner_unified_visual_plan(uuid,uuid,uuid,uuid,text,text,text,uuid,uuid,bigint,uuid,bigint,uuid,bigint,uuid,bigint,jsonb,text) from public,anon,authenticated;
revoke all on function tongs.begin_owner_broll_prompt_interpretation(uuid,uuid,uuid,uuid,uuid,text,text,text,uuid,bigint,text,text,text,text,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function tongs.finalize_owner_hearth_thumbnail_direction_generation_result(uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function tongs.read_hearth_execution_authority(text,text) from public,anon;
revoke all on function tongs.read_owner_unified_visual_plan_operation(uuid) from public,anon;
revoke all on function tongs.read_owner_broll_prompt_interpretation(uuid) from public,anon;

grant execute on function tongs.begin_owner_unified_visual_plan(uuid,uuid,uuid,uuid,text,text,text,uuid,uuid,bigint,uuid,bigint,uuid,bigint,uuid,bigint,jsonb,text) to service_role;
grant execute on function tongs.begin_owner_broll_prompt_interpretation(uuid,uuid,uuid,uuid,uuid,text,text,text,uuid,bigint,text,text,text,text,text,text,text,jsonb) to service_role;
grant execute on function tongs.finalize_owner_hearth_thumbnail_direction_generation_result(uuid,uuid,uuid,text) to service_role;
grant execute on function tongs.read_hearth_execution_authority(text,text) to authenticated,service_role;
grant execute on function tongs.read_owner_unified_visual_plan_operation(uuid) to authenticated,service_role;
grant execute on function tongs.read_owner_broll_prompt_interpretation(uuid) to authenticated,service_role;

comment on table tongs.unified_visual_plan_historical_authorities is
  'Migration-sealed pre-authority product provenance. It is not a funding lane and creates no financial evidence.';
comment on table tongs.broll_interpretation_historical_authorities is
  'Migration-sealed pre-authority product provenance. It is not a funding lane and creates no financial evidence.';
comment on column tongs.unified_visual_plan_operations.owner_cost_attempt_id is
  'Mutually exclusive Forge owner execution authority; never a customer reservation or balance.';
comment on column tongs.broll_operation_receipts.owner_cost_attempt_id is
  'Forge owner execution authority for prompt interpretation only; Runway generation is out of scope.';
comment on column tongs.broll_prompt_revisions.owner_cost_attempt_id is
  'Derived from the canonical owner-funded interpretation receipt; never caller-selected.';

notify pgrst,'reload schema';
commit;
