begin;

insert into auth.users(id,email) values
  ('9e000000-0000-4000-8000-000000000001','zero-beat-editor@example.test'),
  ('9e000000-0000-4000-8000-000000000002','zero-beat-viewer@example.test');
insert into tongs.workspaces(id,created_by,name,org_id)
values(
  '9e000000-0000-4000-8000-000000000011','9e000000-0000-4000-8000-000000000001',
  'Zero beat B-roll proof',
  (select id from tongs.orgs where personal_owner_user_id='9e000000-0000-4000-8000-000000000001')
);
insert into tongs.workspace_members(workspace_id,user_id,role,created_by)
values(
  '9e000000-0000-4000-8000-000000000011','9e000000-0000-4000-8000-000000000002',
  'viewer','9e000000-0000-4000-8000-000000000001'
);
insert into tongs.episodes(id,workspace_id,label)
values('9e000000-0000-4000-8000-000000000012','9e000000-0000-4000-8000-000000000011','Zero beat plan');
insert into tongs.script_approval_revisions(
  id,workspace_id,workpiece_id,approval_revision,source_file_path,source_file_revision,
  script_content_hash,semantic_state_hash,immutable_revision_hash,script_text,
  approval_contract_version,created_by
) values(
  '9e000000-0000-4000-8000-000000000013','9e000000-0000-4000-8000-000000000011',
  '9e000000-0000-4000-8000-000000000012',1,'script/script.md',1,
  repeat('1',64),repeat('2',64),repeat('3',64),'A script that needs no motion B-roll.',
  'test.v1','9e000000-0000-4000-8000-000000000001'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"role":"authenticated","sub":"9e000000-0000-4000-8000-000000000001"}',true);
set local role authenticated;

do $$
declare
  v jsonb;
  v_plan_id uuid;
  v_replay jsonb;
  v_readback jsonb;
begin
  v:=tongs.commit_broll_plan(
    '9e000000-0000-4000-8000-000000000011','9e000000-0000-4000-8000-000000000012',
    null,0,'9e000000-0000-4000-8000-000000000013','forge.unified-visual-plan.v3','[]'::jsonb,
    'forge:broll:zero-beat-proof',repeat('a',64),'9e000000-0000-4000-8000-000000000001'
  );
  if v->>'disposition'<>'committed' or v->>'empty'<>'true' or (v->>'beat_count')::integer<>0 then
    raise exception 'zero-beat plan was not committed explicitly: %',v;
  end if;
  v_plan_id:=(v#>>'{plan_revision,id}')::uuid;
  if v_plan_id is null then raise exception 'zero-beat plan identity missing'; end if;
  if exists(select 1 from tongs.broll_plan_beat_membership where plan_revision_id=v_plan_id) then
    raise exception 'zero-beat plan fabricated membership';
  end if;
  if not exists(
    select 1 from tongs.broll_operation_receipts
    where operation_id='forge:broll:zero-beat-proof' and state='committed'
      and result_plan_revision_id=v_plan_id
      and normalized_inputs_json->'beats'='[]'::jsonb
      and normalized_inputs_json->>'empty'='true'
      and normalized_inputs_json->>'beat_count'='0'
  ) then raise exception 'zero-beat receipt is not explicit'; end if;
  if not exists(
    select 1 from tongs.broll_plan_sequences
    where workspace_id='9e000000-0000-4000-8000-000000000011'
      and workpiece_id='9e000000-0000-4000-8000-000000000012'
      and current_plan_revision_id=v_plan_id and current_plan_revision=1
  ) then raise exception 'zero-beat plan is not canonical current state'; end if;

  v_replay:=tongs.commit_broll_plan(
    '9e000000-0000-4000-8000-000000000011','9e000000-0000-4000-8000-000000000012',
    null,0,'9e000000-0000-4000-8000-000000000013','forge.unified-visual-plan.v3','[]'::jsonb,
    'forge:broll:zero-beat-proof',repeat('a',64),'9e000000-0000-4000-8000-000000000001'
  );
  if (v_replay#>>'{plan_revision,id}')::uuid is distinct from v_plan_id then
    raise exception 'zero-beat replay changed plan identity';
  end if;
  v_readback:=tongs.read_current_broll_plan(
    '9e000000-0000-4000-8000-000000000011','9e000000-0000-4000-8000-000000000012'
  );
  if v_readback#>>'{plan_revision,id}' is distinct from v_plan_id::text
    or coalesce(jsonb_array_length(v_readback->'beats'),-1)<>0 then
    raise exception 'zero-beat canonical readback failed: %',v_readback;
  end if;

  v:=tongs.commit_broll_plan(
    '9e000000-0000-4000-8000-000000000011','9e000000-0000-4000-8000-000000000012',
    v_plan_id,1,'9e000000-0000-4000-8000-000000000013','forge.unified-visual-plan.v3','{}'::jsonb,
    'forge:broll:not-an-array',repeat('b',64),'9e000000-0000-4000-8000-000000000001'
  );
  if v->>'disposition'<>'beats_array_required' then
    raise exception 'non-array B-roll document was accepted: %',v;
  end if;

  begin
    perform tongs.commit_broll_plan(
      '9e000000-0000-4000-8000-000000000011','9e000000-0000-4000-8000-000000000012',
      v_plan_id,1,'9e000000-0000-4000-8000-000000000013','forge.unified-visual-plan.v3',
      '[{}]'::jsonb,'forge:broll:invalid-beat',repeat('d',64),
      '9e000000-0000-4000-8000-000000000001'
    );
    raise exception 'structurally invalid B-roll beat was accepted';
  exception
    when not_null_violation or check_violation or invalid_text_representation then null;
  end;
  if exists(select 1 from tongs.broll_operation_receipts where operation_id='forge:broll:invalid-beat')
    or (select current_plan_revision from tongs.broll_plan_sequences
        where workspace_id='9e000000-0000-4000-8000-000000000011'
          and workpiece_id='9e000000-0000-4000-8000-000000000012')<>1 then
    raise exception 'invalid beat changed canonical B-roll state';
  end if;
end
$$;

reset role;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"9e000000-0000-4000-8000-000000000002"}',true);
set local role authenticated;
do $$
begin
  begin
    perform tongs.commit_broll_plan(
      '9e000000-0000-4000-8000-000000000011','9e000000-0000-4000-8000-000000000012',
      null,0,'9e000000-0000-4000-8000-000000000013','forge.unified-visual-plan.v3','[]'::jsonb,
      'forge:broll:viewer-zero-beat',repeat('c',64),'9e000000-0000-4000-8000-000000000002'
    );
    raise exception 'viewer committed a zero-beat plan';
  exception when sqlstate '42501' then null; end;
end
$$;
reset role;

do $$
begin
  if has_function_privilege('anon','tongs.commit_broll_plan(uuid,uuid,uuid,bigint,uuid,text,jsonb,text,text,uuid)','execute')
    or not has_function_privilege('authenticated','tongs.commit_broll_plan(uuid,uuid,uuid,bigint,uuid,text,jsonb,text,text,uuid)','execute')
    or not has_function_privilege('service_role','tongs.commit_broll_plan(uuid,uuid,uuid,bigint,uuid,text,jsonb,text,text,uuid)','execute')
  then raise exception 'commit_broll_plan ACL changed'; end if;
end
$$;

rollback;
