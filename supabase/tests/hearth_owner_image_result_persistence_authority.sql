begin;

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values
  ('ae000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner-image-user@example.test','',now(),now(),now()),
  ('ae000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner-image-operator@example.test','',now(),now(),now());
insert into tongs.platform_operators(user_id,reason,granted_by)
values('ae000000-0000-4000-8000-000000000002','owner image authority test','ae000000-0000-4000-8000-000000000002');
insert into tongs.orgs(id,name,created_by)
values('ae000000-0000-4000-8000-000000000010','Owner image org','ae000000-0000-4000-8000-000000000001');
insert into tongs.workspaces(id,name,created_by,org_id)
values
  ('ae000000-0000-4000-8000-000000000011','Owner image workspace','ae000000-0000-4000-8000-000000000001','ae000000-0000-4000-8000-000000000010'),
  ('ae000000-0000-4000-8000-000000000012','Wrong owner image workspace','ae000000-0000-4000-8000-000000000001','ae000000-0000-4000-8000-000000000010');
insert into tongs.episodes(id,workspace_id,label,created_by,creation_origin)
values
  ('ae000000-0000-4000-8000-000000000021','ae000000-0000-4000-8000-000000000011','Owner image workpiece','ae000000-0000-4000-8000-000000000001','owner_image_test'),
  ('ae000000-0000-4000-8000-000000000022','ae000000-0000-4000-8000-000000000012','Wrong workpiece','ae000000-0000-4000-8000-000000000001','owner_image_test');

do $$
declare v_script text:='[s1]Owner image authority test.[/s1]'; v_hash text;
begin
  v_hash:=encode(extensions.digest(convert_to(v_script,'utf8'),'sha256'),'hex');
  insert into tongs.script_approval_revisions(
    id,workspace_id,workpiece_id,approval_revision,source_file_path,source_file_revision,
    script_content_hash,semantic_state_hash,immutable_revision_hash,script_text,
    approval_contract_version,created_by
  ) values(
    'ae000000-0000-4000-8000-000000000030','ae000000-0000-4000-8000-000000000011',
    'ae000000-0000-4000-8000-000000000021',1,'script/script.md',1,v_hash,
    repeat('2',64),repeat('3',64),v_script,'owner-image-test.v1','ae000000-0000-4000-8000-000000000001'
  );
  insert into tongs.image_map_revisions(
    id,workspace_id,workpiece_id,revision,source_script_approval_id,
    source_script_approval_revision,source_script_content_hash,anchor_contract_version,
    provenance_state,document_json,document_content_hash,semantic_state_hash,
    immutable_revision_hash,created_by
  ) values(
    'ae000000-0000-4000-8000-000000000031','ae000000-0000-4000-8000-000000000011',
    'ae000000-0000-4000-8000-000000000021',1,'ae000000-0000-4000-8000-000000000030',
    1,v_hash,'owner-image-test.v1','current','{"entries":[{"id":"moment-1"}]}',repeat('5',64),repeat('6',64),
    repeat('7',64),'ae000000-0000-4000-8000-000000000001'
  );
  insert into tongs.image_map_prompt_revisions(
    id,workspace_id,workpiece_id,image_moment_id,image_map_revision_id,image_map_revision,
    script_approval_id,script_approval_revision,revision,source_context_json,creator_direction,
    interpretation_contract_version,validator_version,synthesis_contract_version,
    interpretation_model,interpretation_request_json,interpretation_response_json,
    visual_brief_json,ai_synthesized_prompt,final_prompt,prompt_source,content_hash,
    immutable_revision_hash,created_by
  ) values(
    'ae000000-0000-4000-8000-000000000032','ae000000-0000-4000-8000-000000000011',
    'ae000000-0000-4000-8000-000000000021','moment-1','ae000000-0000-4000-8000-000000000031',1,
    'ae000000-0000-4000-8000-000000000030',1,1,'{}','test direction','test.v1','test.v1','test.v1',
    'gpt-5.6-luna','{}','{}','{}','test synthesized prompt','test final prompt','ai_derived',repeat('8',64),
    repeat('9',64),'ae000000-0000-4000-8000-000000000001'
  );
end $$;

insert into tongs.owner_cost_operations(
  operation_id,operation_key,request_fingerprint,payload_hash,financial_environment,
  runtime_environment,payer,originating_tool,operation_type,workspace_id,workpiece_id,
  establishment_status,creation_evidence,created_at
) values
  ('ae000000-0000-4000-8000-000000000100','hearth:owner-thumbnail-base:test:0001',repeat('1',64),repeat('a',64),
   'test','production','forge','hearth','hearth.thumbnail_base_generation',
   'ae000000-0000-4000-8000-000000000011','ae000000-0000-4000-8000-000000000021','established','{}',now()),
  ('ae000000-0000-4000-8000-000000000101','hearth:owner-timeline-image:test:0001',repeat('2',64),repeat('a',64),
   'test','production','forge','hearth','hearth.timeline_image_generation',
   'ae000000-0000-4000-8000-000000000011','ae000000-0000-4000-8000-000000000021','established','{}',now()),
  ('ae000000-0000-4000-8000-000000000102','hearth:owner-thumbnail-base:test:wrong',repeat('3',64),repeat('a',64),
   'test','production','forge','hearth','hearth.thumbnail_base_generation',
   'ae000000-0000-4000-8000-000000000011','ae000000-0000-4000-8000-000000000021','established','{}',now());

insert into tongs.owner_cost_provider_attempts(
  attempt_id,operation_id,attempt_number,attempt_key,request_fingerprint,payload_hash,
  provider,service,model,sku,authorized_at
) values
  ('ae000000-0000-4000-8000-000000000200','ae000000-0000-4000-8000-000000000100',1,'owner-image-thumbnail-attempt',repeat('b',64),repeat('c',64),
   'openai','image_generation','gpt-image-2-2026-04-21','gpt-image-2-2026-04-21:1536x1024:high:n1',now()),
  ('ae000000-0000-4000-8000-000000000201','ae000000-0000-4000-8000-000000000101',1,'owner-image-timeline-attempt',repeat('d',64),repeat('c',64),
   'openai','image_generation','gpt-image-2-2026-04-21','gpt-image-2-2026-04-21:1536x1024:high:n2',now()),
  ('ae000000-0000-4000-8000-000000000202','ae000000-0000-4000-8000-000000000102',1,'owner-image-wrong-model',repeat('e',64),repeat('c',64),
   'openai','image_generation','wrong-model','wrong-sku',now()),
  ('ae000000-0000-4000-8000-000000000203','ae000000-0000-4000-8000-000000000102',2,'owner-image-wrong-provider',repeat('e',64),repeat('c',64),
   'other-provider','image_generation','gpt-image-2-2026-04-21','gpt-image-2-2026-04-21:1536x1024:high:n1',now()),
  ('ae000000-0000-4000-8000-000000000204','ae000000-0000-4000-8000-000000000102',3,'owner-image-unresolved',repeat('e',64),repeat('c',64),
   'openai','image_generation','gpt-image-2-2026-04-21','gpt-image-2-2026-04-21:1536x1024:high:n1',now()),
  ('ae000000-0000-4000-8000-000000000205','ae000000-0000-4000-8000-000000000102',4,'owner-image-other-operation',repeat('e',64),repeat('c',64),
   'openai','image_generation','gpt-image-2-2026-04-21','gpt-image-2-2026-04-21:1536x1024:high:n1',now());

insert into tongs.owner_cost_attempt_events(
  attempt_event_id,attempt_id,event_sequence,lifecycle_state,provider_reference_id,
  normalized_usage_evidence,private_provider_evidence,occurred_at
) values
  ('ae000000-0000-4000-8000-000000000300','ae000000-0000-4000-8000-000000000200',1,'authorized',null,'{}','{}',now()),
  ('ae000000-0000-4000-8000-000000000301','ae000000-0000-4000-8000-000000000200',2,'submitted','img-thumb-1','{}','{}',now()),
  ('ae000000-0000-4000-8000-000000000302','ae000000-0000-4000-8000-000000000200',3,'response_captured','img-thumb-1','{}','{}',now()),
  ('ae000000-0000-4000-8000-000000000303','ae000000-0000-4000-8000-000000000201',1,'authorized',null,'{}','{}',now()),
  ('ae000000-0000-4000-8000-000000000304','ae000000-0000-4000-8000-000000000201',2,'submitted','img-timeline-1','{}','{}',now()),
  ('ae000000-0000-4000-8000-000000000305','ae000000-0000-4000-8000-000000000201',3,'response_captured','img-timeline-1','{}','{}',now()),
  ('ae000000-0000-4000-8000-000000000306','ae000000-0000-4000-8000-000000000202',1,'authorized',null,'{}','{}',now()),
  ('ae000000-0000-4000-8000-000000000307','ae000000-0000-4000-8000-000000000202',2,'submitted','img-wrong-1','{}','{}',now()),
  ('ae000000-0000-4000-8000-000000000308','ae000000-0000-4000-8000-000000000202',3,'response_captured','img-wrong-1','{}','{}',now()),
  ('ae000000-0000-4000-8000-000000000309','ae000000-0000-4000-8000-000000000203',1,'authorized',null,'{}','{}',now()),
  ('ae000000-0000-4000-8000-000000000310','ae000000-0000-4000-8000-000000000203',2,'submitted','img-provider-1','{}','{}',now()),
  ('ae000000-0000-4000-8000-000000000311','ae000000-0000-4000-8000-000000000203',3,'response_captured','img-provider-1','{}','{}',now()),
  ('ae000000-0000-4000-8000-000000000312','ae000000-0000-4000-8000-000000000204',1,'authorized',null,'{}','{}',now()),
  ('ae000000-0000-4000-8000-000000000313','ae000000-0000-4000-8000-000000000204',2,'submitted','img-unresolved-1','{}','{}',now()),
  ('ae000000-0000-4000-8000-000000000314','ae000000-0000-4000-8000-000000000205',1,'authorized',null,'{}','{}',now()),
  ('ae000000-0000-4000-8000-000000000315','ae000000-0000-4000-8000-000000000205',2,'submitted','img-other-operation-1','{}','{}',now()),
  ('ae000000-0000-4000-8000-000000000316','ae000000-0000-4000-8000-000000000205',3,'response_captured','img-other-operation-1','{}','{}',now());

insert into tongs.assets(
  id,workspace_id,workpiece_id,path,mime_type,bytes,storage_key,provider,provider_request_id,
  request_id,prompt,created_by,asset_kind,status,content_hash,ready_at
) values
  ('ae000000-0000-4000-8000-000000000400','ae000000-0000-4000-8000-000000000011','ae000000-0000-4000-8000-000000000021',
   'assets/thumbnails/owner-base.png','image/png',1,'tests/owner-base.png','openai','img-thumb-1',
   'hearth:owner-thumbnail-base:test:0001',null,'ae000000-0000-4000-8000-000000000001','thumbnail_image','ready',repeat('4',64),now()),
  ('ae000000-0000-4000-8000-000000000401','ae000000-0000-4000-8000-000000000011','ae000000-0000-4000-8000-000000000021',
   'assets/image-map/candidates/owner-1.png','image/png',1,'tests/owner-1.png','openai','img-timeline-1',
   'hearth:owner-timeline-image:test:0001','prompt one','ae000000-0000-4000-8000-000000000001','image_map_candidate_image','ready',repeat('5',64),now()),
  ('ae000000-0000-4000-8000-000000000402','ae000000-0000-4000-8000-000000000011','ae000000-0000-4000-8000-000000000021',
   'assets/image-map/candidates/owner-2.png','image/png',1,'tests/owner-2.png','openai','img-timeline-1',
   'hearth:owner-timeline-image:test:0001','prompt two','ae000000-0000-4000-8000-000000000001','image_map_candidate_image','ready',repeat('6',64),now());

set local request.jwt.claim.role='service_role';
set local request.jwt.claim.sub='';
set local role service_role;

do $$
declare
  v jsonb;
  v_outputs jsonb:=jsonb_build_array(
    jsonb_build_object('child_ordinal',1,'bytes_base64','AQ==','mime_type','image/png','staged_asset_id','ae000000-0000-4000-8000-000000000401'),
    jsonb_build_object('child_ordinal',2,'bytes_base64','Ag==','mime_type','image/png','staged_asset_id','ae000000-0000-4000-8000-000000000402'));
  v_receipt jsonb:=jsonb_build_object(
    'asset_id','ae000000-0000-4000-8000-000000000400',
    'asset_path','assets/thumbnails/owner-base.png','asset_content_hash',repeat('4',64),
    'provider_body_sha256',repeat('7',64),'prompt_package_hash',repeat('8',64));
begin
  if (select request_fingerprint from tongs.owner_cost_operations where operation_id='ae000000-0000-4000-8000-000000000100')
     = (select request_fingerprint from tongs.owner_cost_provider_attempts where attempt_id='ae000000-0000-4000-8000-000000000200')
  then raise exception 'operation and provider attempt fingerprints unexpectedly match'; end if;

  v:=tongs.record_owner_hearth_thumbnail_base_generation_result(
    'ae000000-0000-4000-8000-000000000200','ae000000-0000-4000-8000-000000000001',
    'ae000000-0000-4000-8000-000000000011','ae000000-0000-4000-8000-000000000021',
    repeat('1',64),'test','production',repeat('7',64),repeat('8',64),
    'ae000000-0000-4000-8000-000000000500',1,'ae000000-0000-4000-8000-000000000501',
    'img-thumb-1','response-thumb-1','ae000000-0000-4000-8000-000000000400',v_receipt);
  if (v->>'replay')::boolean then raise exception 'first owner thumbnail result was a replay'; end if;
  v:=tongs.record_owner_hearth_thumbnail_base_generation_result(
    'ae000000-0000-4000-8000-000000000200','ae000000-0000-4000-8000-000000000001',
    'ae000000-0000-4000-8000-000000000011','ae000000-0000-4000-8000-000000000021',
    repeat('1',64),'test','production',repeat('7',64),repeat('8',64),
    'ae000000-0000-4000-8000-000000000500',1,'ae000000-0000-4000-8000-000000000501',
    'img-thumb-1','response-thumb-1','ae000000-0000-4000-8000-000000000400',v_receipt);
  if not (v->>'replay')::boolean then raise exception 'owner thumbnail replay was not idempotent'; end if;

  v:=tongs.stage_owner_timeline_image_generation_result(
    'ae000000-0000-4000-8000-000000000201','ae000000-0000-4000-8000-000000000001',
    'ae000000-0000-4000-8000-000000000011','ae000000-0000-4000-8000-000000000021',
    repeat('2',64),'test','production',repeat('7',64),'img-timeline-1','response-timeline-1',
    'ae000000-0000-4000-8000-000000000032',repeat('8',64),repeat('9',64),'moment-1',v_outputs);
  if (v->>'replay')::boolean then raise exception 'first owner timeline result was a replay'; end if;
  v:=tongs.stage_owner_timeline_image_generation_result(
    'ae000000-0000-4000-8000-000000000201','ae000000-0000-4000-8000-000000000001',
    'ae000000-0000-4000-8000-000000000011','ae000000-0000-4000-8000-000000000021',
    repeat('2',64),'test','production',repeat('7',64),'img-timeline-1','response-timeline-1',
    'ae000000-0000-4000-8000-000000000032',repeat('8',64),repeat('9',64),'moment-1',v_outputs);
  if not (v->>'replay')::boolean then raise exception 'owner timeline replay was not idempotent'; end if;
  begin
    perform tongs.stage_owner_timeline_image_generation_result(
      'ae000000-0000-4000-8000-000000000201','ae000000-0000-4000-8000-000000000001',
      'ae000000-0000-4000-8000-000000000011','ae000000-0000-4000-8000-000000000021',
      repeat('2',64),'test','production',repeat('7',64),'img-timeline-1','response-timeline-1',
      'ae000000-0000-4000-8000-000000000032',repeat('8',64),repeat('9',64),'moment-1',
      jsonb_set(v_outputs,'{0,bytes_base64}','"Aw=="'));
    raise exception 'conflicting timeline output replay succeeded';
  exception when unique_violation then null; end;

  v:=tongs.finalize_owner_timeline_image_generation_result(
    'ae000000-0000-4000-8000-000000000201',repeat('2',64),
    'ae000000-0000-4000-8000-000000000031',array[
      'ae000000-0000-4000-8000-000000000401'::uuid,'ae000000-0000-4000-8000-000000000402'::uuid]);
  if (v->>'replay')::boolean then raise exception 'first owner timeline finalization was a replay'; end if;
  v:=tongs.finalize_owner_timeline_image_generation_result(
    'ae000000-0000-4000-8000-000000000201',repeat('2',64),
    'ae000000-0000-4000-8000-000000000031',array[
      'ae000000-0000-4000-8000-000000000401'::uuid,'ae000000-0000-4000-8000-000000000402'::uuid]);
  if not (v->>'replay')::boolean then raise exception 'owner timeline finalization replay was not idempotent'; end if;

  begin
    perform tongs.record_owner_hearth_thumbnail_base_generation_result(
      'ae000000-0000-4000-8000-000000000202','ae000000-0000-4000-8000-000000000001',
      'ae000000-0000-4000-8000-000000000011','ae000000-0000-4000-8000-000000000021',
      repeat('3',64),'test','production',repeat('7',64),repeat('8',64),
      'ae000000-0000-4000-8000-000000000500',1,'ae000000-0000-4000-8000-000000000501',
      'img-wrong-1',null,'ae000000-0000-4000-8000-000000000400',v_receipt);
    raise exception 'wrong model/SKU attempt authorized persistence';
  exception when insufficient_privilege then null; end;
  begin
    perform tongs.record_owner_hearth_thumbnail_base_generation_result(
      'ae000000-0000-4000-8000-000000000200','ae000000-0000-4000-8000-000000000001',
      'ae000000-0000-4000-8000-000000000011','ae000000-0000-4000-8000-000000000022',
      repeat('1',64),'test','production',repeat('7',64),repeat('8',64),
      'ae000000-0000-4000-8000-000000000500',1,'ae000000-0000-4000-8000-000000000501',
      'img-thumb-1','response-thumb-1','ae000000-0000-4000-8000-000000000400',v_receipt);
    raise exception 'wrong workpiece authorized persistence';
  exception when insufficient_privilege then null; end;
  begin
    perform tongs.record_owner_hearth_thumbnail_base_generation_result(
      'ae000000-0000-4000-8000-000000000200','ae000000-0000-4000-8000-000000000001',
      'ae000000-0000-4000-8000-000000000011','ae000000-0000-4000-8000-000000000021',
      repeat('1',64),'live','production',repeat('7',64),repeat('8',64),
      'ae000000-0000-4000-8000-000000000500',1,'ae000000-0000-4000-8000-000000000501',
      'img-thumb-1','response-thumb-1','ae000000-0000-4000-8000-000000000400',v_receipt);
    raise exception 'wrong financial environment authorized persistence';
  exception when insufficient_privilege then null; end;
  begin
    perform tongs.stage_owner_timeline_image_generation_result(
      'ae000000-0000-4000-8000-000000000200','ae000000-0000-4000-8000-000000000001',
      'ae000000-0000-4000-8000-000000000011','ae000000-0000-4000-8000-000000000021',
      repeat('1',64),'test','production',repeat('7',64),'img-thumb-1',null,
      'ae000000-0000-4000-8000-000000000032',repeat('8',64),repeat('9',64),'moment-1',v_outputs);
    raise exception 'wrong route authorized persistence';
  exception when insufficient_privilege then null; end;
  begin
    perform tongs.record_owner_hearth_thumbnail_base_generation_result(
      'ae000000-0000-4000-8000-000000000203','ae000000-0000-4000-8000-000000000001',
      'ae000000-0000-4000-8000-000000000011','ae000000-0000-4000-8000-000000000021',
      repeat('3',64),'test','production',repeat('7',64),repeat('8',64),
      'ae000000-0000-4000-8000-000000000500',1,'ae000000-0000-4000-8000-000000000501',
      'img-provider-1',null,'ae000000-0000-4000-8000-000000000400',v_receipt);
    raise exception 'wrong provider authorized persistence';
  exception when insufficient_privilege then null; end;
  begin
    perform tongs.record_owner_hearth_thumbnail_base_generation_result(
      'ae000000-0000-4000-8000-000000000204','ae000000-0000-4000-8000-000000000001',
      'ae000000-0000-4000-8000-000000000011','ae000000-0000-4000-8000-000000000021',
      repeat('3',64),'test','production',repeat('7',64),repeat('8',64),
      'ae000000-0000-4000-8000-000000000500',1,'ae000000-0000-4000-8000-000000000501',
      'img-unresolved-1',null,'ae000000-0000-4000-8000-000000000400',v_receipt);
    raise exception 'unresolved lifecycle authorized persistence';
  exception when insufficient_privilege then null; end;
  begin
    perform tongs.record_owner_hearth_thumbnail_base_generation_result(
      'ae000000-0000-4000-8000-000000000205','ae000000-0000-4000-8000-000000000001',
      'ae000000-0000-4000-8000-000000000011','ae000000-0000-4000-8000-000000000021',
      repeat('1',64),'test','production',repeat('7',64),repeat('8',64),
      'ae000000-0000-4000-8000-000000000500',1,'ae000000-0000-4000-8000-000000000501',
      'img-other-operation-1',null,'ae000000-0000-4000-8000-000000000400',v_receipt);
    raise exception 'attempt from another operation authorized persistence';
  exception when insufficient_privilege then null; end;
  begin
    perform tongs.record_owner_hearth_thumbnail_base_generation_result(
      'ae000000-0000-4000-8000-000000000200','ae000000-0000-4000-8000-000000000001',
      'ae000000-0000-4000-8000-000000000012','ae000000-0000-4000-8000-000000000021',
      repeat('1',64),'test','production',repeat('7',64),repeat('8',64),
      'ae000000-0000-4000-8000-000000000500',1,'ae000000-0000-4000-8000-000000000501',
      'img-thumb-1','response-thumb-1','ae000000-0000-4000-8000-000000000400',v_receipt);
    raise exception 'wrong workspace authorized persistence';
  exception when insufficient_privilege then null; end;

  perform tongs.record_owner_cost_valuation(
    'ae000000-0000-4000-8000-000000000600','owner-image-thumbnail-valuation-0001',
    'ae000000-0000-4000-8000-000000000200','image_generation',null,
    'provider_reported',120000,'usd','journal_recognized',null,'{}','{"provider":"private"}',now());
  perform tongs.record_owner_cost_valuation(
    'ae000000-0000-4000-8000-000000000601','owner-image-timeline-valuation-0001',
    'ae000000-0000-4000-8000-000000000201','image_generation',null,
    'provider_reported',240000,'usd','journal_recognized',null,'{}','{"provider":"private"}',now());
end $$;

do $$
declare v_definition text; v_functions text; v_result jsonb; v_proc record;
begin
  foreach v_definition in array array[
    'tongs.hearth_thumbnail_base_generation_results'::regclass::text,
    'tongs.hearth_timeline_image_generation_results'::regclass::text
  ] loop
    if not exists(
      select 1 from pg_constraint c
      where c.conrelid=v_definition::regclass and c.contype='c'
        and pg_get_constraintdef(c.oid) like '%num_nonnulls(reservation_id, owner_cost_attempt_id) = 1%'
    ) then raise exception 'XOR authority missing from %',v_definition; end if;
  end loop;
  if (select supplier_cost_micros from tongs.hearth_timeline_image_generation_results
      where owner_cost_attempt_id='ae000000-0000-4000-8000-000000000201') is not null
  then raise exception 'owner timeline result carries competing supplier cost'; end if;
  if (select count(*) from tongs.accounting_journal_events where source_type='owner_cost_valuation'
      and source_id in('ae000000-0000-4000-8000-000000000600','ae000000-0000-4000-8000-000000000601'))<>2
  then raise exception 'recognized owner image costs are missing journal authority'; end if;
  if (select count(*)
      from tongs.accounting_journal_events journal
      join tongs.owner_cost_valuations valuation on valuation.valuation_id=journal.id
      join tongs.owner_cost_provider_attempts attempt on attempt.attempt_id=valuation.attempt_id
      join tongs.owner_cost_operations operation on operation.operation_id=attempt.operation_id
      left join tongs.hearth_thumbnail_base_generation_results thumbnail on thumbnail.owner_cost_attempt_id=attempt.attempt_id
      left join tongs.hearth_timeline_image_generation_results timeline on timeline.owner_cost_attempt_id=attempt.attempt_id
      where journal.id in('ae000000-0000-4000-8000-000000000600','ae000000-0000-4000-8000-000000000601')
        and (thumbnail.id is not null or timeline.id is not null))<>2
  then raise exception 'journal to image result reconstruction failed'; end if;
  v_result:=tongs.read_owner_hearth_image_result('ae000000-0000-4000-8000-000000000200','hearth.thumbnail_base_generation');
  if jsonb_array_length(v_result->'valuations')<>1 or v_result#>>'{valuations,0,journal_event_id}'<>'ae000000-0000-4000-8000-000000000600'
  then raise exception 'thumbnail result to journal reconstruction failed'; end if;
  v_result:=tongs.read_owner_hearth_image_result('ae000000-0000-4000-8000-000000000201','hearth.timeline_image_generation');
  if jsonb_array_length(v_result->'outputs')<>2 or v_result->'canonical_receipt' is null
     or v_result#>>'{valuations,0,journal_event_id}'<>'ae000000-0000-4000-8000-000000000601'
  then raise exception 'timeline result to journal reconstruction failed'; end if;
  select string_agg(pg_get_functiondef(p.oid),E'\n') into v_functions
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='tongs' and p.proname in(
    'record_owner_hearth_thumbnail_base_generation_result',
    'stage_owner_timeline_image_generation_result','finalize_owner_timeline_image_generation_result');
  if lower(v_functions)~'(customer_spending|quote_acceptance|settlement|stripe|ai_credit|allowance)'
  then raise exception 'owner image persistence depends on customer finance'; end if;
  if not exists(select 1 from pg_indexes where schemaname='tongs'
      and indexname='hearth_thumbnail_base_results_owner_attempt_uidx'
      and indexdef like '%(owner_cost_attempt_id)%WHERE (owner_cost_attempt_id IS NOT NULL)%')
     or not exists(select 1 from pg_indexes where schemaname='tongs'
      and indexname='hearth_timeline_image_results_owner_attempt_uidx'
      and indexdef like '%(owner_cost_attempt_id)%WHERE (owner_cost_attempt_id IS NOT NULL)%')
  then raise exception 'new owner attempt FKs lack focused recovery indexes'; end if;
  if not exists(select 1 from pg_indexes where schemaname='tongs'
      and indexname='hearth_thumbnail_base_results_customer_operation_idx'
      and indexdef like '%(customer_operation_id)%WHERE (customer_operation_id IS NOT NULL)%')
     or not exists(select 1 from pg_indexes where schemaname='tongs'
      and indexname='hearth_timeline_image_results_customer_operation_idx'
      and indexdef like '%(customer_operation_id)%WHERE (customer_operation_id IS NOT NULL)%')
  then raise exception 'generated customer authority FKs lack focused indexes'; end if;
  for v_proc in
    select p.proname,p.prosecdef,p.proconfig
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='tongs' and p.proname in(
      '_assert_owner_hearth_image_result_authority',
      'record_owner_hearth_thumbnail_base_generation_result',
      'stage_owner_timeline_image_generation_result',
      'finalize_owner_timeline_image_generation_result','read_owner_hearth_image_result')
  loop
    if v_proc.prosecdef is distinct from true
       or not ('search_path=pg_catalog'=any(v_proc.proconfig))
    then raise exception 'unsafe security-definer contract on %',v_proc.proname; end if;
  end loop;
  if exists(select 1 from tongs.verify_owner_cost_reconstruction())
  then raise exception 'owner-cost reconstruction discrepancy'; end if;
  if exists(select 1 from tongs.verify_accounting_reconstruction())
  then raise exception 'canonical accounting reconstruction discrepancy'; end if;
end $$;

reset role;
set local request.jwt.claim.role='authenticated';
set local request.jwt.claim.sub='ae000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ begin
  if has_table_privilege('authenticated','tongs.hearth_thumbnail_base_generation_results','select')
     or has_table_privilege('authenticated','tongs.hearth_timeline_image_generation_results','select')
  then raise exception 'authenticated gained direct image result table access'; end if;
  begin
    perform tongs.read_owner_hearth_image_result('ae000000-0000-4000-8000-000000000200','hearth.thumbnail_base_generation');
    raise exception 'ordinary authenticated user read owner image result';
  exception when insufficient_privilege then null; end;
  if has_function_privilege('authenticated',
    'tongs.record_owner_hearth_thumbnail_base_generation_result(uuid,uuid,uuid,uuid,text,text,text,text,text,uuid,integer,uuid,text,text,uuid,jsonb)','execute')
  then raise exception 'authenticated can execute owner image write RPC'; end if;
  if has_function_privilege('anon',
    'tongs.record_owner_hearth_thumbnail_base_generation_result(uuid,uuid,uuid,uuid,text,text,text,text,text,uuid,integer,uuid,text,text,uuid,jsonb)','execute')
  then raise exception 'anonymous can execute owner image write RPC'; end if;
end $$;

reset role;
set local request.jwt.claim.role='authenticated';
set local request.jwt.claim.sub='ae000000-0000-4000-8000-000000000002';
set local role authenticated;
do $$ declare v jsonb; begin
  v:=tongs.read_owner_hearth_image_result('ae000000-0000-4000-8000-000000000200','hearth.thumbnail_base_generation');
  if v->>'owner_cost_attempt_id'<>'ae000000-0000-4000-8000-000000000200'
  then raise exception 'operator reconstruction read failed'; end if;
end $$;

rollback;
