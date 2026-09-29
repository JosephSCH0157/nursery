begin;

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values
  ('ad000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner-result-user@example.test','',now(),now(),now()),
  ('ad000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner-result-operator@example.test','',now(),now(),now());
insert into tongs.platform_operators(user_id,reason,granted_by)
values('ad000000-0000-4000-8000-000000000002','owner result authority test','ad000000-0000-4000-8000-000000000002');
insert into tongs.orgs(id,name,created_by)
values('ad000000-0000-4000-8000-000000000010','Owner result org','ad000000-0000-4000-8000-000000000001');
insert into tongs.workspaces(id,name,created_by,org_id)
values
  ('ad000000-0000-4000-8000-000000000011','Owner result workspace','ad000000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-000000000010'),
  ('ad000000-0000-4000-8000-000000000012','Wrong workspace','ad000000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-000000000010');
insert into tongs.episodes(id,workspace_id,label,created_by,creation_origin)
values
  ('ad000000-0000-4000-8000-000000000021','ad000000-0000-4000-8000-000000000011','Owner result workpiece','ad000000-0000-4000-8000-000000000001','owner_result_test'),
  ('ad000000-0000-4000-8000-000000000022','ad000000-0000-4000-8000-000000000012','Wrong workpiece','ad000000-0000-4000-8000-000000000001','owner_result_test');
insert into tongs.openai_text_route_policies(
  route_code,product_area,provider_operation,maximum_input_units,maximum_output_units,
  maximum_attempts,requires_result_validation,requires_canonical_persistence,byo_supported,
  rollout_mode,notes
) values('hearth.chat_completion','hearth','responses',64000,16000,1,true,true,false,'inactive','owner result authority test fixture');

do $$
declare v_script text:='[s1]Owner result test script.[/s1]'; v_hash text;
begin
  v_hash:=encode(extensions.digest(convert_to(v_script,'utf8'),'sha256'),'hex');
  insert into tongs.script_approval_revisions(
    id,workspace_id,workpiece_id,approval_revision,source_file_path,source_file_revision,
    script_content_hash,semantic_state_hash,immutable_revision_hash,script_text,
    approval_contract_version,created_by
  ) values(
    'ad000000-0000-4000-8000-000000000030','ad000000-0000-4000-8000-000000000011',
    'ad000000-0000-4000-8000-000000000021',1,'script/script.md',1,v_hash,
    repeat('2',64),repeat('3',64),v_script,'owner-result-test.v1','ad000000-0000-4000-8000-000000000001'
  );
  insert into tongs.workpiece_script_approval_sequences(workspace_id,workpiece_id,current_approval_id,current_revision)
  values('ad000000-0000-4000-8000-000000000011','ad000000-0000-4000-8000-000000000021','ad000000-0000-4000-8000-000000000030',1);
  insert into tongs.image_map_revisions(
    id,workspace_id,workpiece_id,revision,source_script_approval_id,
    source_script_approval_revision,source_script_content_hash,anchor_contract_version,
    provenance_state,document_json,document_content_hash,semantic_state_hash,
    immutable_revision_hash,created_by
  ) values(
    'ad000000-0000-4000-8000-000000000031','ad000000-0000-4000-8000-000000000011',
    'ad000000-0000-4000-8000-000000000021',1,'ad000000-0000-4000-8000-000000000030',
    1,v_hash,'owner-result-test.v1','current','{"entries":[]}',repeat('5',64),repeat('6',64),
    repeat('7',64),'ad000000-0000-4000-8000-000000000001'
  );
end $$;

insert into tongs.workpiece_files(
  workpiece_id,path,file_type,content_type,bytes,hash_value,storage_key,
  written_by_tool,written_by_tool_version,written_by_lane,revision
) values(
  'ad000000-0000-4000-8000-000000000021','hearth/drafts.v1.json','artifact',
  'application/json',2,repeat('4',64),'test/hearth/drafts.v1.json',
  'hearth','test','forge-managed',1
);

do $$
declare
  v_route text;
  v_ordinal integer:=0;
  v_operation uuid;
  v_attempt uuid;
  v_fingerprint text;
begin
  foreach v_route in array array[
    'hearth.chat_completion','hearth.script_generation','hearth.research_synthesis',
    'hearth.title_generation','hearth.tag_generation','hearth.framing_pack_generation',
    'hearth.thumbnail_direction_generation','visual.narrative_interpretation'
  ] loop
    v_ordinal:=v_ordinal+1;
    v_operation:=('ad000000-0000-4000-8000-'||lpad((100+v_ordinal)::text,12,'0'))::uuid;
    v_attempt:=('ad000000-0000-4000-8000-'||lpad((200+v_ordinal)::text,12,'0'))::uuid;
    v_fingerprint:=repeat(to_hex(v_ordinal),64);
    insert into tongs.owner_cost_operations(
      operation_id,operation_key,request_fingerprint,payload_hash,financial_environment,
      runtime_environment,payer,originating_tool,operation_type,workspace_id,workpiece_id,
      establishment_status,creation_evidence,created_at
    ) values(
      v_operation,'hearth:owner-result:'||replace(v_route,'.','-')||':0001',v_fingerprint,
      repeat('a',64),'test','production','forge','hearth',v_route,
      'ad000000-0000-4000-8000-000000000011','ad000000-0000-4000-8000-000000000021',
      'established','{}',now()
    );
    insert into tongs.owner_cost_provider_attempts(
      attempt_id,operation_id,attempt_number,attempt_key,request_fingerprint,payload_hash,
      provider,service,model,sku,authorized_at
    ) values(v_attempt,v_operation,1,'owner-result-attempt-'||v_ordinal,v_fingerprint,repeat('b',64),
      'openai','responses','gpt-5.6-luna','gpt-5.6-luna',now());
    insert into tongs.owner_cost_attempt_events(
      attempt_event_id,attempt_id,event_sequence,lifecycle_state,provider_reference_id,
      normalized_usage_evidence,private_provider_evidence,occurred_at
    ) values
      (v_attempt,v_attempt,1,'authorized',null,'{}','{}',now()),
      (('ad000000-0000-4000-8000-'||lpad((300+v_ordinal)::text,12,'0'))::uuid,v_attempt,2,'submitted','req-'||v_ordinal,'{}','{}',now()),
      (('ad000000-0000-4000-8000-'||lpad((400+v_ordinal)::text,12,'0'))::uuid,v_attempt,3,'response_captured','req-'||v_ordinal,'{}','{}',now());
  end loop;
end $$;

set local request.jwt.claim.role='service_role';
set local request.jwt.claim.sub='';
set local role service_role;

do $$
declare
  v jsonb;
  v_script_hash text:=encode(extensions.digest(convert_to('[s1]Owner result test script.[/s1]','utf8'),'sha256'),'hex');
begin
  v:=tongs.persist_owner_hearth_text_result(
    'ad000000-0000-4000-8000-000000000201','hearth.chat_completion',
    'ad000000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-000000000011',
    'ad000000-0000-4000-8000-000000000021',repeat('1',64),'test','production','req-1',
    'gpt-5.6-luna',10,5,repeat('c',64),'{"assistant_text":"hello"}',null,null,null
  );
  if (v->>'replay')::boolean then raise exception 'first owner chat result was replay'; end if;
  v:=tongs.persist_owner_hearth_text_result(
    'ad000000-0000-4000-8000-000000000201','hearth.chat_completion',
    'ad000000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-000000000011',
    'ad000000-0000-4000-8000-000000000021',repeat('1',64),'test','production','req-1',
    'gpt-5.6-luna',10,5,repeat('c',64),'{"assistant_text":"hello"}',null,null,null
  );
  if not (v->>'replay')::boolean then raise exception 'owner chat replay was not idempotent'; end if;
  begin
    perform tongs.persist_owner_hearth_text_result(
      'ad000000-0000-4000-8000-000000000201','hearth.chat_completion',
      'ad000000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-000000000011',
      'ad000000-0000-4000-8000-000000000021',repeat('1',64),'test','production','req-1',
      'gpt-5.6-luna',10,5,repeat('d',64),'{"assistant_text":"conflict"}',null,null,null
    );
    raise exception 'conflicting owner result replay succeeded';
  exception when unique_violation then null; end;

  perform tongs.persist_owner_hearth_text_result(
    'ad000000-0000-4000-8000-000000000202','hearth.script_generation',
    'ad000000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-000000000011',
    'ad000000-0000-4000-8000-000000000021',repeat('2',64),'test','production','req-2',
    'gpt-5.6-luna',10,5,null,
    '{"assistant_text":"script","script_text":"[s1]script[/s1]","ops":[{"op":"set_body","value":"[s1]script[/s1]"}],"tag_audit":{},"research_artifact":null}',
    null,null,null
  );
  perform tongs.persist_owner_hearth_text_result(
    'ad000000-0000-4000-8000-000000000203','hearth.research_synthesis',
    'ad000000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-000000000011',
    'ad000000-0000-4000-8000-000000000021',repeat('3',64),'test','production','req-3',
    'gpt-5.6-luna',10,5,null,'{"assistant_text":"research","sources":[]}',null,null,null
  );
  perform tongs.persist_owner_hearth_text_result(
    'ad000000-0000-4000-8000-000000000204','hearth.title_generation',
    'ad000000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-000000000011',
    'ad000000-0000-4000-8000-000000000021',repeat('4',64),'test','production','req-4',
    'gpt-5.6-luna',10,5,null,
    jsonb_build_object('contract','forge.hearth.title-generation.v2','titles',jsonb_build_array('One','Two','Three','Four','Five'),'assistant_text','titles'),
    'ad000000-0000-4000-8000-000000000030',1,v_script_hash
  );

  v:=tongs.stage_owner_visual_narrative_interpretation_result(
    'ad000000-0000-4000-8000-000000000208','ad000000-0000-4000-8000-000000000001',
    'ad000000-0000-4000-8000-000000000011','ad000000-0000-4000-8000-000000000021',
    repeat('8',64),'test','production',repeat('9',64),'req-8','gpt-5.6-luna',10,5,
    jsonb_build_object(
      'narrative_purpose','Show the concrete editorial purpose',
      'central_message','The creator explains a measurable change over time',
      'primary_subjects',jsonb_build_array('Creator','historical evidence'),
      'relationship_or_action','The creator compares the earlier and current evidence',
      'emotional_tone','Grounded and reflective',
      'visual_mode','documentary','setting','A working studio with archival material',
      'composition','Creator foregrounded with evidence visible behind them',
      'essential_visual_evidence',jsonb_build_array('Creator','dated evidence'),
      'avoid',jsonb_build_array('Unverified logos'),
      'source_context',jsonb_build_object('focus','The evidence-backed change over time')
    ),
    jsonb_build_object('interpretation','forge.image-prompt-interpretation.v2','validator','forge.image-prompt-validator.v2','synthesis','forge.image-prompt-synthesis.v3'),
    'ad000000-0000-4000-8000-000000000031',1,'ad000000-0000-4000-8000-000000000030',1,
    'Compare the earlier and current evidence','documentary','A documentary studio comparison grounded in dated evidence'
  );
  if (v->>'replay')::boolean then raise exception 'first owner visual result was replay'; end if;
  v:=tongs.stage_owner_visual_narrative_interpretation_result(
    'ad000000-0000-4000-8000-000000000208','ad000000-0000-4000-8000-000000000001',
    'ad000000-0000-4000-8000-000000000011','ad000000-0000-4000-8000-000000000021',
    repeat('8',64),'test','production',repeat('9',64),'req-8','gpt-5.6-luna',10,5,
    jsonb_build_object(
      'narrative_purpose','Show the concrete editorial purpose',
      'central_message','The creator explains a measurable change over time',
      'primary_subjects',jsonb_build_array('Creator','historical evidence'),
      'relationship_or_action','The creator compares the earlier and current evidence',
      'emotional_tone','Grounded and reflective',
      'visual_mode','documentary','setting','A working studio with archival material',
      'composition','Creator foregrounded with evidence visible behind them',
      'essential_visual_evidence',jsonb_build_array('Creator','dated evidence'),
      'avoid',jsonb_build_array('Unverified logos'),
      'source_context',jsonb_build_object('focus','The evidence-backed change over time')
    ),
    jsonb_build_object('interpretation','forge.image-prompt-interpretation.v2','validator','forge.image-prompt-validator.v2','synthesis','forge.image-prompt-synthesis.v3'),
    'ad000000-0000-4000-8000-000000000031',1,'ad000000-0000-4000-8000-000000000030',1,
    'Compare the earlier and current evidence','documentary','A documentary studio comparison grounded in dated evidence'
  );
  if not (v->>'replay')::boolean then raise exception 'owner visual replay was not idempotent'; end if;
  if tongs.read_owner_visual_narrative_interpretation_result('ad000000-0000-4000-8000-000000000208')#>>'{owner_operation,operation_key}' is null
  then raise exception 'owner visual reconstruction read failed'; end if;
  perform tongs.persist_owner_hearth_text_result(
    'ad000000-0000-4000-8000-000000000205','hearth.tag_generation',
    'ad000000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-000000000011',
    'ad000000-0000-4000-8000-000000000021',repeat('5',64),'test','production','req-5',
    'gpt-5.6-luna',10,5,null,
    jsonb_build_object('contract','forge.hearth.tag-generation.v1','tags',jsonb_build_array('a','b','c','d','e','f'),'assistant_text','tags'),
    'ad000000-0000-4000-8000-000000000030',1,v_script_hash
  );
  perform tongs.persist_owner_hearth_text_result(
    'ad000000-0000-4000-8000-000000000206','hearth.framing_pack_generation',
    'ad000000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-000000000011',
    'ad000000-0000-4000-8000-000000000021',repeat('6',64),'test','production','req-6',
    'gpt-5.6-luna',10,5,null,'{"assistant_text":"framing"}',
    'ad000000-0000-4000-8000-000000000030',1,v_script_hash
  );
  perform tongs.persist_owner_hearth_text_result(
    'ad000000-0000-4000-8000-000000000207','hearth.thumbnail_direction_generation',
    'ad000000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-000000000011',
    'ad000000-0000-4000-8000-000000000021',repeat('7',64),'test','production','req-7',
    'gpt-5.6-luna',10,5,null,'{"assistant_text":"directions"}',
    'ad000000-0000-4000-8000-000000000030',1,v_script_hash
  );

  begin
    perform tongs.persist_owner_hearth_text_result(
      'ad000000-0000-4000-8000-000000000203','hearth.research_synthesis',
      'ad000000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-000000000012',
      'ad000000-0000-4000-8000-000000000021',repeat('3',64),'test','production','req-3',
      'gpt-5.6-luna',10,5,null,'{}',null,null,null
    );
    raise exception 'wrong workspace owner result succeeded';
  exception when insufficient_privilege then null; end;
  begin
    perform tongs.persist_owner_hearth_text_result(
      'ad000000-0000-4000-8000-000000000203','hearth.research_synthesis',
      'ad000000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-000000000011',
      'ad000000-0000-4000-8000-000000000021',repeat('3',64),'live','production','req-3',
      'gpt-5.6-luna',10,5,null,'{}',null,null,null
    );
    raise exception 'wrong environment owner result succeeded';
  exception when insufficient_privilege then null; end;
  begin
    perform tongs.persist_owner_hearth_text_result(
      'ad000000-0000-4000-8000-000000000203','hearth.research_synthesis',
      'ad000000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-000000000012',
      'ad000000-0000-4000-8000-000000000022',repeat('3',64),'test','production','req-3',
      'gpt-5.6-luna',10,5,null,'{}',null,null,null
    );
    raise exception 'wrong workpiece owner result succeeded';
  exception when insufficient_privilege then null; end;
  begin
    perform tongs.persist_owner_hearth_text_result(
      'ad000000-0000-4000-8000-000000000203','hearth.script_generation',
      'ad000000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-000000000011',
      'ad000000-0000-4000-8000-000000000021',repeat('3',64),'test','production','req-3',
      'gpt-5.6-luna',10,5,null,'{}',null,null,null
    );
    raise exception 'wrong route owner result succeeded';
  exception when insufficient_privilege then null; end;
  begin
    perform tongs.persist_owner_hearth_text_result(
      'ad000000-0000-4000-8000-000000009999','hearth.research_synthesis',
      'ad000000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-000000000011',
      'ad000000-0000-4000-8000-000000000021',repeat('3',64),'test','production',null,
      'gpt-5.6-luna',10,5,null,'{}',null,null,null
    );
    raise exception 'non-owner authority masqueraded as owner attempt';
  exception when foreign_key_violation then null; end;

  if (select count(*) from tongs.hearth_research_synthesis_results where owner_cost_attempt_id='ad000000-0000-4000-8000-000000000203')<>1
  then raise exception 'research synthesis did not bind to the synthesis attempt'; end if;
  if (select operation_id from tongs.owner_cost_provider_attempts where attempt_id='ad000000-0000-4000-8000-000000000203')
     is distinct from (select o.operation_id from tongs.hearth_research_synthesis_results r
       join tongs.owner_cost_provider_attempts a on a.attempt_id=r.owner_cost_attempt_id
       join tongs.owner_cost_operations o on o.operation_id=a.operation_id
       where r.owner_cost_attempt_id='ad000000-0000-4000-8000-000000000203')
  then raise exception 'research parent operation reconstruction failed'; end if;
  if tongs.read_owner_hearth_text_result('ad000000-0000-4000-8000-000000000201','hearth.chat_completion')#>>'{owner_operation,operation_key}' is null
  then raise exception 'owner result reconstruction read failed'; end if;
end $$;

reset role;
set local request.jwt.claim.role='authenticated';
set local request.jwt.claim.sub='ad000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ begin
  begin
    perform tongs.read_owner_hearth_text_result('ad000000-0000-4000-8000-000000000201','hearth.chat_completion');
    raise exception 'ordinary authenticated user read owner result';
  exception when insufficient_privilege then null; end;
  if has_function_privilege('authenticated','tongs.persist_owner_hearth_text_result(uuid,text,uuid,uuid,uuid,text,text,text,text,text,bigint,bigint,text,jsonb,uuid,integer,text)','execute')
  then raise exception 'authenticated can execute owner result write'; end if;
end $$;

reset role;
set local request.jwt.claim.role='authenticated';
set local request.jwt.claim.sub='ad000000-0000-4000-8000-000000000002';
set local role authenticated;
do $$ begin
  if tongs.read_owner_hearth_text_result('ad000000-0000-4000-8000-000000000201','hearth.chat_completion') is null
  then raise exception 'operator could not reconstruct owner result'; end if;
end $$;

reset role;
do $$
declare v_table text; v_definition text; v_function_definition text;
begin
  begin
    insert into tongs.hearth_research_synthesis_results(
      id,operation_id,reservation_id,owner_cost_attempt_id,user_id,workspace_id,workpiece_id,
      request_fingerprint,input_units,output_units,result_json
    ) values(
      'ad000000-0000-4000-8000-000000000901','authority-null-null',null,null,
      'ad000000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-000000000011',
      'ad000000-0000-4000-8000-000000000021',repeat('e',64),0,0,'{}'
    );
    raise exception 'result with no execution authority succeeded';
  exception when check_violation then null; end;
  begin
    insert into tongs.hearth_research_synthesis_results(
      id,operation_id,reservation_id,owner_cost_attempt_id,user_id,workspace_id,workpiece_id,
      request_fingerprint,input_units,output_units,result_json
    ) values(
      'ad000000-0000-4000-8000-000000000902','authority-both',
      'ad000000-0000-4000-8000-000000009998','ad000000-0000-4000-8000-000000000208',
      'ad000000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-000000000011',
      'ad000000-0000-4000-8000-000000000021',repeat('f',64),0,0,'{}'
    );
    raise exception 'result with both execution authorities succeeded';
  exception when check_violation then null; end;
  begin
    insert into tongs.hearth_research_synthesis_results(
      id,operation_id,reservation_id,owner_cost_attempt_id,user_id,workspace_id,workpiece_id,
      request_fingerprint,input_units,output_units,result_json
    ) values(
      'ad000000-0000-4000-8000-000000000903','authority-missing-attempt',null,
      'ad000000-0000-4000-8000-000000009997','ad000000-0000-4000-8000-000000000001',
      'ad000000-0000-4000-8000-000000000011','ad000000-0000-4000-8000-000000000021',
      repeat('d',64),0,0,'{}'
    );
    raise exception 'result with nonexistent owner attempt succeeded';
  exception when foreign_key_violation then null; end;
  foreach v_table in array array[
    'openai_text_persisted_results','hearth_script_generation_proposals',
    'hearth_research_synthesis_results','hearth_title_generation_results',
    'hearth_tag_generation_results','hearth_framing_pack_generation_results',
    'hearth_thumbnail_direction_generation_results','visual_narrative_interpretation_results'
  ] loop
    select pg_get_constraintdef(c.oid) into v_definition
    from pg_constraint c join pg_class r on r.oid=c.conrelid join pg_namespace n on n.oid=r.relnamespace
    where n.nspname='tongs' and r.relname=v_table and c.contype='c'
      and pg_get_constraintdef(c.oid) like '%num_nonnulls(reservation_id, owner_cost_attempt_id) = 1%';
    if v_definition is null then raise exception 'XOR authority missing from %',v_table; end if;
  end loop;
  if has_function_privilege('anon','tongs.read_owner_hearth_text_result(uuid,text)','execute')
  then raise exception 'anonymous can read owner results'; end if;
  if has_table_privilege('authenticated','tongs.openai_text_persisted_results','select')
  then raise exception 'authenticated gained direct owner result table access'; end if;
  select string_agg(pg_get_functiondef(p.oid),E'\n') into v_function_definition
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='tongs' and p.proname in(
    'persist_owner_hearth_text_result','stage_owner_visual_narrative_interpretation_result'
  );
  if lower(v_function_definition)~'(customer_spending|funding_reservation|quote_acceptance|settlement|stripe|ai_credit|allowance)'
  then raise exception 'owner result write RPC depends on customer finance'; end if;
  if exists(select 1 from tongs.verify_owner_cost_reconstruction())
  then raise exception 'owner-cost reconstruction discrepancy after owner result persistence'; end if;
  if exists(select 1 from tongs.verify_accounting_reconstruction())
  then raise exception 'canonical accounting reconstruction discrepancy after owner result persistence'; end if;
end $$;

rollback;
