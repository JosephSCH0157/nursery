begin;

insert into auth.users(id,email) values
  ('9d000000-0000-4000-8000-000000000001','owner-persistence-editor@example.test'),
  ('9d000000-0000-4000-8000-000000000002','owner-persistence-outsider@example.test');

insert into tongs.workspaces(id,created_by,name,org_id)
values(
  '9d000000-0000-4000-8000-000000000011','9d000000-0000-4000-8000-000000000001',
  'Owner persistence authority',
  (select id from tongs.orgs where personal_owner_user_id='9d000000-0000-4000-8000-000000000001')
);
insert into tongs.episodes(id,workspace_id,label)
values('9d000000-0000-4000-8000-000000000012','9d000000-0000-4000-8000-000000000011','Owner persistence workpiece');
insert into tongs.script_approval_revisions(
  id,workspace_id,workpiece_id,approval_revision,source_file_path,source_file_revision,
  script_content_hash,semantic_state_hash,immutable_revision_hash,script_text,
  approval_contract_version,created_by
) values (
  '9d000000-0000-4000-8000-000000000013','9d000000-0000-4000-8000-000000000011',
  '9d000000-0000-4000-8000-000000000012',1,'script/script.md',1,
  repeat('1',64),repeat('2',64),repeat('3',64),'A bounded visual plan authority proof.',
  'test.v1','9d000000-0000-4000-8000-000000000001'
);
insert into tongs.workpiece_script_approval_sequences(
  workspace_id,workpiece_id,current_approval_id,current_revision
) values (
  '9d000000-0000-4000-8000-000000000011','9d000000-0000-4000-8000-000000000012',
  '9d000000-0000-4000-8000-000000000013',1
);

select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"role":"service_role","sub":"9d000000-0000-4000-8000-000000000001"}',true);

select tongs.establish_owner_cost_operation(
  '9d000000-0000-4000-8000-000000000021'::uuid,'owner-unified-persistence-test',repeat('a',64),
  'test','development','hearth','visual.unified_plan',
  '9d000000-0000-4000-8000-000000000011'::uuid,'9d000000-0000-4000-8000-000000000012'::uuid,
  null::uuid,null::uuid,null::uuid,null::uuid,'{"proof":"owner-persistence-authority"}'::jsonb,clock_timestamp()
);
select tongs.authorize_owner_cost_provider_attempt(
  '9d000000-0000-4000-8000-000000000022'::uuid,'9d000000-0000-4000-8000-000000000021'::uuid,1,
  'owner-unified-persistence-attempt',repeat('b',64),'openai','responses','gpt-5.6-luna',
  'owner-unified-persistence-key',repeat('c',64),'{}'::jsonb,clock_timestamp()
);
select tongs.append_owner_cost_attempt_event(
  '9d000000-0000-4000-8000-000000000023'::uuid,'9d000000-0000-4000-8000-000000000022'::uuid,2,
  'submitted',null,'{}'::jsonb,'{}'::jsonb,clock_timestamp()
);
select tongs.append_owner_cost_attempt_event(
  '9d000000-0000-4000-8000-000000000024'::uuid,'9d000000-0000-4000-8000-000000000022'::uuid,3,
  'response_captured','owner-persistence-provider-request','{}'::jsonb,'{}'::jsonb,clock_timestamp()
);

-- Disable the later execution-authority trigger only while seeding these
-- rollback-only operation rows. The subject RPCs perform the authorization
-- under test independently.
do $$ begin
  if exists (
    select 1 from pg_trigger
    where tgrelid='tongs.unified_visual_plan_operations'::regclass
      and tgname='unified_visual_plan_execution_authority'
  ) then
    execute 'alter table tongs.unified_visual_plan_operations disable trigger unified_visual_plan_execution_authority';
  end if;
end $$;

insert into tongs.unified_visual_plan_operations(
  operation_id,operation_fingerprint,workspace_id,workpiece_id,script_approval_id,
  script_approval_revision,script_content_hash,state,normalized_inputs_json,
  provider_response_json,provider_response_hash,created_by,owner_cost_attempt_id
) values (
  'owner-unified-persistence-test',repeat('a',64),
  '9d000000-0000-4000-8000-000000000011','9d000000-0000-4000-8000-000000000012',
  '9d000000-0000-4000-8000-000000000013',1,repeat('1',64),'provider_completed','{}'::jsonb,
  '{"canonical_plan":{}}'::jsonb,encode(extensions.digest(convert_to('{"canonical_plan":{}}','UTF8'),'sha256'),'hex'),
  '9d000000-0000-4000-8000-000000000001','9d000000-0000-4000-8000-000000000022'
);

-- A customer operation fixture isolates the unchanged editor branch.
insert into tongs.unified_visual_plan_operations(
  operation_id,operation_fingerprint,workspace_id,workpiece_id,script_approval_id,
  script_approval_revision,script_content_hash,state,normalized_inputs_json,created_by
) values (
  'customer-unified-persistence-test',repeat('d',64),
  '9d000000-0000-4000-8000-000000000011','9d000000-0000-4000-8000-000000000012',
  '9d000000-0000-4000-8000-000000000013',1,repeat('1',64),'provider_completed','{}'::jsonb,
  '9d000000-0000-4000-8000-000000000001'
);
do $$ begin
  if exists (
    select 1 from pg_trigger
    where tgrelid='tongs.unified_visual_plan_operations'::regclass
      and tgname='unified_visual_plan_execution_authority'
  ) then
    execute 'alter table tongs.unified_visual_plan_operations enable trigger unified_visual_plan_execution_authority';
  end if;
end $$;

-- Exact canonical owner binding succeeds, while every independently varied
-- binding dimension fails closed.
select tongs._assert_owner_unified_visual_plan_persistence_authority(
  '9d000000-0000-4000-8000-000000000022','owner-unified-persistence-test',repeat('a',64),
  '9d000000-0000-4000-8000-000000000011','9d000000-0000-4000-8000-000000000012',
  '9d000000-0000-4000-8000-000000000001'
);
do $$ begin
  begin
    perform tongs._assert_owner_unified_visual_plan_persistence_authority(
      '9d000000-0000-4000-8000-000000000099','owner-unified-persistence-test',repeat('a',64),
      '9d000000-0000-4000-8000-000000000011','9d000000-0000-4000-8000-000000000012',
      '9d000000-0000-4000-8000-000000000001');
    raise exception 'wrong owner attempt was accepted';
  exception when sqlstate '42501' then null; end;
  begin
    perform tongs._assert_owner_unified_visual_plan_persistence_authority(
      '9d000000-0000-4000-8000-000000000022','wrong-operation',repeat('a',64),
      '9d000000-0000-4000-8000-000000000011','9d000000-0000-4000-8000-000000000012',
      '9d000000-0000-4000-8000-000000000001');
    raise exception 'wrong owner operation was accepted';
  exception when sqlstate '42501' then null; end;
  begin
    perform tongs._assert_owner_unified_visual_plan_persistence_authority(
      '9d000000-0000-4000-8000-000000000022','owner-unified-persistence-test',repeat('a',64),
      '9d000000-0000-4000-8000-000000000099','9d000000-0000-4000-8000-000000000012',
      '9d000000-0000-4000-8000-000000000001');
    raise exception 'wrong owner workspace was accepted';
  exception when sqlstate '42501' then null; end;
  begin
    perform tongs._assert_owner_unified_visual_plan_persistence_authority(
      '9d000000-0000-4000-8000-000000000022','owner-unified-persistence-test',repeat('a',64),
      '9d000000-0000-4000-8000-000000000011','9d000000-0000-4000-8000-000000000099',
      '9d000000-0000-4000-8000-000000000001');
    raise exception 'wrong owner workpiece was accepted';
  exception when sqlstate '42501' then null; end;
end $$;

-- All five owner paths pass the owner/service gate and continue to their
-- unchanged product-state checks. Missing synthetic child revisions are
-- expected to return product dispositions rather than an authority error.
set local role service_role;
do $$
declare v jsonb;
begin
  v:=tongs.record_unified_image_plan_membership(
    'owner-unified-persistence-test',repeat('a',64),'9d000000-0000-4000-8000-000000000031');
  if v->>'disposition'<>'provider_child_not_current' then raise exception 'owner image membership gate failed: %',v; end if;
  v:=tongs.retain_unified_visual_plan_selections(
    'owner-unified-persistence-test',repeat('a',64),'image','9d000000-0000-4000-8000-000000000031');
  if v->>'disposition'<>'provider_child_not_current' then raise exception 'owner selection retention gate failed: %',v; end if;
  v:=tongs.retain_unified_reference_clip_selections(
    'owner-unified-persistence-test',repeat('a',64),'9d000000-0000-4000-8000-000000000031');
  if v->>'disposition'<>'provider_child_not_current' then raise exception 'owner reference selection gate failed: %',v; end if;
  v:=tongs.adopt_creator_amended_reference_visual_plan('owner-unified-persistence-test',repeat('a',64));
  if v->>'disposition'<>'stage_conflict' then raise exception 'owner creator-plan adoption gate failed: %',v; end if;
  v:=tongs.adopt_repaired_image_map_for_unified_operation('owner-unified-persistence-test',repeat('a',64));
  if v->>'disposition'<>'stage_conflict' then raise exception 'owner repaired-map adoption gate failed: %',v; end if;
end $$;

-- Service authority alone does not elevate a customer operation.
do $$ begin
  begin
    perform tongs.record_unified_image_plan_membership(
      'customer-unified-persistence-test',repeat('d',64),'9d000000-0000-4000-8000-000000000031');
    raise exception 'service role elevated a customer operation';
  exception when sqlstate '42501' then null; end;
end $$;
reset role;

-- The existing customer editor branch still reaches the unchanged product
-- checks for all five RPCs.
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"role":"authenticated","sub":"9d000000-0000-4000-8000-000000000001"}',true);
set local role authenticated;
do $$
declare v jsonb;
begin
  v:=tongs.record_unified_image_plan_membership(
    'customer-unified-persistence-test',repeat('d',64),'9d000000-0000-4000-8000-000000000031');
  if v->>'disposition'<>'provider_child_not_current' then raise exception 'customer image membership changed: %',v; end if;
  v:=tongs.retain_unified_visual_plan_selections(
    'customer-unified-persistence-test',repeat('d',64),'image','9d000000-0000-4000-8000-000000000031');
  if v->>'disposition'<>'provider_child_not_current' then raise exception 'customer selection retention changed: %',v; end if;
  v:=tongs.retain_unified_reference_clip_selections(
    'customer-unified-persistence-test',repeat('d',64),'9d000000-0000-4000-8000-000000000031');
  if v->>'disposition'<>'provider_child_not_current' then raise exception 'customer reference selection changed: %',v; end if;
  v:=tongs.adopt_creator_amended_reference_visual_plan('customer-unified-persistence-test',repeat('d',64));
  if v->>'disposition'<>'stage_conflict' then raise exception 'customer creator-plan adoption changed: %',v; end if;
  v:=tongs.adopt_repaired_image_map_for_unified_operation('customer-unified-persistence-test',repeat('d',64));
  if v->>'disposition'<>'stage_conflict' then raise exception 'customer repaired-map adoption changed: %',v; end if;
end $$;

-- Even the workspace editor cannot use customer authority on an owner-bound
-- operation; owner continuation requires the accounting service role.
do $$ begin
  begin
    perform tongs.record_unified_image_plan_membership(
      'owner-unified-persistence-test',repeat('a',64),'9d000000-0000-4000-8000-000000000031');
    raise exception 'authenticated editor invoked the owner branch';
  exception when sqlstate '42501' then null; end;
end $$;
reset role;

-- An unrelated authenticated principal remains denied on every customer RPC.
select set_config('request.jwt.claims','{"role":"authenticated","sub":"9d000000-0000-4000-8000-000000000002"}',true);
set local role authenticated;
do $$ begin
  begin perform tongs.record_unified_image_plan_membership('customer-unified-persistence-test',repeat('d',64),'9d000000-0000-4000-8000-000000000031'); raise exception 'outsider image membership accepted'; exception when sqlstate '42501' then null; end;
  begin perform tongs.retain_unified_visual_plan_selections('customer-unified-persistence-test',repeat('d',64),'image','9d000000-0000-4000-8000-000000000031'); raise exception 'outsider retention accepted'; exception when sqlstate '42501' then null; end;
  begin perform tongs.retain_unified_reference_clip_selections('customer-unified-persistence-test',repeat('d',64),'9d000000-0000-4000-8000-000000000031'); raise exception 'outsider reference retention accepted'; exception when sqlstate '42501' then null; end;
  begin perform tongs.adopt_creator_amended_reference_visual_plan('customer-unified-persistence-test',repeat('d',64)); raise exception 'outsider creator-plan adoption accepted'; exception when sqlstate '42501' then null; end;
  begin perform tongs.adopt_repaired_image_map_for_unified_operation('customer-unified-persistence-test',repeat('d',64)); raise exception 'outsider repaired-map adoption accepted'; exception when sqlstate '42501' then null; end;
end $$;
reset role;

select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"role":"service_role","sub":"9d000000-0000-4000-8000-000000000001"}',true);
do $$
declare v_rpc regprocedure;
begin
  foreach v_rpc in array array[
    'tongs.record_unified_image_plan_membership(text,text,uuid)'::regprocedure,
    'tongs.retain_unified_visual_plan_selections(text,text,text,uuid)'::regprocedure,
    'tongs.retain_unified_reference_clip_selections(text,text,uuid)'::regprocedure,
    'tongs.adopt_creator_amended_reference_visual_plan(text,text)'::regprocedure,
    'tongs.adopt_repaired_image_map_for_unified_operation(text,text)'::regprocedure
  ] loop
    if not has_function_privilege('authenticated',v_rpc,'execute')
      or not has_function_privilege('service_role',v_rpc,'execute')
      or has_function_privilege('anon',v_rpc,'execute')
    then raise exception 'public persistence RPC grant mismatch: %',v_rpc; end if;
  end loop;
  if has_function_privilege('authenticated','tongs._assert_owner_unified_visual_plan_persistence_authority(uuid,text,text,uuid,uuid,uuid)','execute')
    or has_function_privilege('service_role','tongs._assert_owner_unified_visual_plan_persistence_authority(uuid,text,text,uuid,uuid,uuid)','execute')
  then raise exception 'private owner assertion is externally executable'; end if;
  if exists(select 1 from tongs.verify_owner_cost_reconstruction()) then
    raise exception 'owner-cost reconstruction changed'; end if;
  if exists(select 1 from tongs.verify_accounting_reconstruction()) then
    raise exception 'canonical accounting reconstruction changed'; end if;
end $$;

rollback;
