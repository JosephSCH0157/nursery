begin;

do $test$
declare
  v_user uuid;
  v_org uuid:=gen_random_uuid();
  v_workspace uuid:=gen_random_uuid();
  v_workpiece uuid:=gen_random_uuid();
  v_review_one uuid:=gen_random_uuid();
  v_review_two uuid:=gen_random_uuid();
  v_report_one uuid:=gen_random_uuid();
  v_report_two uuid:=gen_random_uuid();
  v_report_three uuid:=gen_random_uuid();
  v_script_hash text:=repeat('a',64);
  v_finding jsonb:=jsonb_build_object(
    'id','unsupported-name-stable',
    'code','unsupported_name',
    'severity','warning',
    'category','claims',
    'message','Review this name.',
    'excerpt','The same canonical claim.'
  );
  v_changed_finding jsonb:=jsonb_build_object(
    'id','unsupported-name-stable',
    'code','unsupported_name',
    'severity','warning',
    'category','claims',
    'message','Review this name.',
    'excerpt','A materially changed canonical claim.'
  );
  v_report_json jsonb;
  v_changed_report_json jsonb;
  v_result jsonb;
begin
  select id into v_user from auth.users order by created_at limit 1;
  if v_user is null then raise exception 'local auth fixture required'; end if;
  perform set_config('request.jwt.claim.sub',v_user::text,true);

  insert into tongs.orgs(id,name,created_by) values(v_org,'Optional review test',v_user);
  insert into tongs.org_members(org_id,user_id,org_role,created_by) values(v_org,v_user,'owner',v_user);
  insert into tongs.workspaces(id,created_by,name,org_id) values(v_workspace,v_user,'Optional review test',v_org);
  insert into tongs.episodes(id,workspace_id,label,created_by) values(v_workpiece,v_workspace,'Optional review test',v_user);
  insert into tongs.workpiece_files(
    workpiece_id,path,file_type,content_type,bytes,hash_value,storage_key,
    written_by_tool,written_by_tool_version,written_by_lane,revision
  ) values(
    v_workpiece,'script/script.md','artifact','text/markdown',100,v_script_hash,
    'test/script.md','hearth','test','forge-managed',2
  );

  insert into tongs.hearth_script_review_revisions(
    id,workspace_id,workpiece_id,source_file_path,source_file_revision,
    script_content_hash,script_text,snapshot_content_hash,created_by
  ) values
    (v_review_one,v_workspace,v_workpiece,'script/script.md',1,v_script_hash,'test',repeat('b',64),v_user),
    (v_review_two,v_workspace,v_workpiece,'script/script.md',2,v_script_hash,'test',repeat('c',64),v_user);

  v_report_json:=jsonb_build_object(
    'schema','forge.hearth.editorial-preflight.v1',
    'checkerContractVersion','forge.hearth.editorial-preflight.deterministic.v1',
    'usedPaidAi',false,
    'findings',jsonb_build_array(v_finding),
    'summary',jsonb_build_object('blockers',0,'warnings',1,'notes',0)
  );
  v_changed_report_json:=jsonb_set(v_report_json,'{findings}',jsonb_build_array(v_changed_finding));

  insert into tongs.hearth_editorial_preflight_reports(
    id,workspace_id,workpiece_id,revision,previous_revision_id,previous_revision,
    script_review_revision_id,source_file_path,source_file_revision,script_content_hash,
    checker_contract_version,report_json,report_content_hash,projection_content_hash,
    immutable_revision_hash,created_by
  ) values
    (v_report_one,v_workspace,v_workpiece,1,null,null,v_review_one,'script/script.md',1,v_script_hash,
      'forge.hearth.editorial-preflight.deterministic.v1',v_report_json,
      encode(extensions.digest(convert_to(v_report_json::text,'UTF8'),'sha256'),'hex'),
      encode(extensions.digest(convert_to((v_report_json->'findings')::text,'UTF8'),'sha256'),'hex'),
      repeat('d',64),v_user),
    (v_report_two,v_workspace,v_workpiece,2,v_report_one,1,v_review_two,'script/script.md',2,v_script_hash,
      'forge.hearth.editorial-preflight.deterministic.v1',v_report_json,
      encode(extensions.digest(convert_to(v_report_json::text,'UTF8'),'sha256'),'hex'),
      encode(extensions.digest(convert_to((v_report_json->'findings')::text,'UTF8'),'sha256'),'hex'),
      repeat('e',64),v_user);
  insert into tongs.hearth_editorial_preflight_findings(
    report_id,workspace_id,workpiece_id,report_revision,ordinal,finding_key,
    finding_code,severity,category,message,finding_json,content_hash
  ) values
    (v_report_one,v_workspace,v_workpiece,1,0,v_finding->>'id',v_finding->>'code',
      v_finding->>'severity',v_finding->>'category',v_finding->>'message',v_finding,
      encode(extensions.digest(convert_to(v_finding::text,'UTF8'),'sha256'),'hex')),
    (v_report_two,v_workspace,v_workpiece,2,0,v_finding->>'id',v_finding->>'code',
      v_finding->>'severity',v_finding->>'category',v_finding->>'message',v_finding,
      encode(extensions.digest(convert_to(v_finding::text,'UTF8'),'sha256'),'hex'));
  insert into tongs.workpiece_hearth_preflight_sequences(
    workspace_id,workpiece_id,current_report_id,current_revision
  ) values(v_workspace,v_workpiece,v_report_two,2);
  insert into tongs.hearth_preflight_finding_acknowledgements(
    workspace_id,workpiece_id,report_id,report_revision,finding_ordinal,
    action,operation_id,acted_by
  ) values(
    v_workspace,v_workpiece,v_report_one,1,0,'resolve',
    'forge:hearth-preflight-finding:test-prior-resolution',v_user
  );

  select tongs.read_current_hearth_preflight_v1(v_workspace,v_workpiece) into v_result;
  if v_result#>>'{findings,0,latest_action}' is distinct from 'resolve' then
    raise exception 'identical finding did not hydrate prior resolution: %',v_result;
  end if;

  select tongs.acknowledge_hearth_preflight_finding_v1(
    v_workspace,v_workpiece,v_report_two,v_finding->>'id','resolve',null,
    'forge:hearth-preflight-finding:test-duplicate-resolution'
  ) into v_result;
  if v_result->>'disposition' is distinct from 'duplicate' then
    raise exception 'duplicate resolution was not deduplicated: %',v_result;
  end if;
  if (select count(*) from tongs.hearth_preflight_finding_acknowledgements where workpiece_id=v_workpiece)<>1 then
    raise exception 'duplicate durable finding decision was inserted';
  end if;

  select tongs.review_hearth_editorial_preflight_v1(
    v_workspace,v_workpiece,v_report_two,'forge:hearth-preflight-review:test-carried-resolution'
  ) into v_result;
  if v_result->>'disposition' is distinct from 'reviewed' then
    raise exception 'carried resolution did not satisfy optional review receipt: %',v_result;
  end if;

  insert into tongs.hearth_editorial_preflight_reports(
    id,workspace_id,workpiece_id,revision,previous_revision_id,previous_revision,
    script_review_revision_id,source_file_path,source_file_revision,script_content_hash,
    checker_contract_version,report_json,report_content_hash,projection_content_hash,
    immutable_revision_hash,created_by
  ) values(
    v_report_three,v_workspace,v_workpiece,3,v_report_two,2,v_review_two,'script/script.md',2,v_script_hash,
    'forge.hearth.editorial-preflight.deterministic.v1',v_changed_report_json,
    encode(extensions.digest(convert_to(v_changed_report_json::text,'UTF8'),'sha256'),'hex'),
    encode(extensions.digest(convert_to((v_changed_report_json->'findings')::text,'UTF8'),'sha256'),'hex'),
    repeat('f',64),v_user
  );
  insert into tongs.hearth_editorial_preflight_findings(
    report_id,workspace_id,workpiece_id,report_revision,ordinal,finding_key,
    finding_code,severity,category,message,finding_json,content_hash
  ) values(
    v_report_three,v_workspace,v_workpiece,3,0,v_changed_finding->>'id',v_changed_finding->>'code',
    v_changed_finding->>'severity',v_changed_finding->>'category',v_changed_finding->>'message',v_changed_finding,
    encode(extensions.digest(convert_to(v_changed_finding::text,'UTF8'),'sha256'),'hex')
  );
  update tongs.workpiece_hearth_preflight_sequences
  set current_report_id=v_report_three,current_revision=3
  where workspace_id=v_workspace and workpiece_id=v_workpiece;

  select tongs.read_current_hearth_preflight_v1(v_workspace,v_workpiece) into v_result;
  if v_result#>'{findings,0,latest_action}' is distinct from 'null'::jsonb then
    raise exception 'materially changed claim inherited an old disposition: %',v_result;
  end if;
end;
$test$;

rollback;
