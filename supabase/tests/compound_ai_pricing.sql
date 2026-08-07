begin;

do $$
declare
  v_user constant uuid := '73000000-0000-4000-8000-000000000001';
  v_policy constant uuid := '72000000-0000-4000-8000-000000000001';
  v_quote_cached constant uuid := '73000000-0000-4000-8000-000000000011';
  v_quote_mixed constant uuid := '73000000-0000-4000-8000-000000000012';
  v_quote_reordered constant uuid := '73000000-0000-4000-8000-000000000013';
  v_usage_cached jsonb := '[{"component_kind":"cached_text_input","estimated_quantity":1,"maximum_quantity":1}]'::jsonb;
  v_usage_mixed jsonb := '[
    {"component_kind":"text_input","estimated_quantity":100,"maximum_quantity":100},
    {"component_kind":"cached_text_input","estimated_quantity":80,"maximum_quantity":80},
    {"component_kind":"image_input","estimated_quantity":40,"maximum_quantity":40},
    {"component_kind":"cached_image_input","estimated_quantity":20,"maximum_quantity":20},
    {"component_kind":"image_output","estimated_quantity":200,"maximum_quantity":200}
  ]'::jsonb;
  v_usage_reordered jsonb := '[
    {"component_kind":"image_output","estimated_quantity":200,"maximum_quantity":200},
    {"component_kind":"cached_image_input","estimated_quantity":20,"maximum_quantity":20},
    {"component_kind":"image_input","estimated_quantity":40,"maximum_quantity":40},
    {"component_kind":"cached_text_input","estimated_quantity":80,"maximum_quantity":80},
    {"component_kind":"text_input","estimated_quantity":100,"maximum_quantity":100}
  ]'::jsonb;
  v_request jsonb := '{"size":"1024x1024","quality":"high","output_count":1}'::jsonb;
  v_fingerprint text;
  v_result jsonb;
  v_replay jsonb;
  v_old_fingerprint text;
  v_v2 jsonb;
begin
  insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
  values (v_user,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
    'compound-pricing@example.test','',now(),now(),now());

  if (select count(*) from tongs.ai_pricing_rate_components where pricing_policy_revision_id=v_policy) <> 5 then
    raise exception 'GPT Image 2 policy does not have exactly five components';
  end if;
  if not exists (
    select 1 from tongs.ai_pricing_rate_components
    where pricing_policy_revision_id=v_policy and component_kind='cached_text_input'
      and rate_numerator=5 and rate_denominator=4 and unit_kind='token'
  ) then raise exception 'cached text rate is not exact 5/4'; end if;

  v_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'user_id',v_user,'operation_id','test:compound:cached','tool','hearth',
    'workspace_id',null,'workpiece_id',null,'provider','openai','model','gpt-image-2',
    'model_snapshot','gpt-image-2-2026-04-21','media_kind','image','generation_mode','generation',
    'endpoint','/v1/images/generations','request_parameters',v_request,'requested_output_count',1,
    'usage_estimates',(select jsonb_agg(value order by value->>'component_kind') from jsonb_array_elements(v_usage_cached)),
    'pricing_policy_revision_id',v_policy,'pricing_policy_revision',1
  )::text,'utf8'),'sha256'),'hex');
  v_result := tongs.create_compound_ai_credit_quote(v_quote_cached,v_user,'test:compound:cached','hearth',null,null,
    v_policy,v_request,1,v_usage_cached,1,v_fingerprint,now(),now()+interval '15 minutes');
  if (v_result#>>'{quote,estimated_provider_expense_numerator}')::bigint <> 5
     or (v_result#>>'{quote,estimated_provider_expense_denominator}')::bigint <> 4
     or (v_result#>>'{quote,estimated_customer_credit_charge}')::bigint <> 1 then
    raise exception 'fractional cached text quote rounded before the final credit boundary';
  end if;
  v_replay := tongs.create_compound_ai_credit_quote(v_quote_cached,v_user,'test:compound:cached','hearth',null,null,
    v_policy,v_request,1,v_usage_cached,1,v_fingerprint,now(),now()+interval '15 minutes');
  if (v_replay->>'replay')::boolean is not true
     or (select count(*) from tongs.ai_credit_quote_usage_components where quote_id=v_quote_cached) <> 1 then
    raise exception 'compound quote replay did not preserve exact identity';
  end if;

  v_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'user_id',v_user,'operation_id','test:compound:mixed','tool','hearth',
    'workspace_id',null,'workpiece_id',null,'provider','openai','model','gpt-image-2',
    'model_snapshot','gpt-image-2-2026-04-21','media_kind','image','generation_mode','generation',
    'endpoint','/v1/images/generations','request_parameters',v_request,'requested_output_count',1,
    'usage_estimates',(select jsonb_agg(value order by value->>'component_kind') from jsonb_array_elements(v_usage_mixed)),
    'pricing_policy_revision_id',v_policy,'pricing_policy_revision',1
  )::text,'utf8'),'sha256'),'hex');
  v_result := tongs.create_compound_ai_credit_quote(v_quote_mixed,v_user,'test:compound:mixed','hearth',null,null,
    v_policy,v_request,1,v_usage_mixed,1170,v_fingerprint,now(),now()+interval '15 minutes');
  if (v_result#>>'{quote,estimated_provider_expense_numerator}')::bigint <> 6960
     or (v_result#>>'{quote,estimated_provider_expense_denominator}')::bigint <> 1
     or (v_result#>>'{quote,estimated_customer_credit_charge}')::bigint <> 1170 then
    raise exception 'mixed compound quote arithmetic is incorrect';
  end if;

  v_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'user_id',v_user,'operation_id','test:compound:reordered','tool','hearth',
    'workspace_id',null,'workpiece_id',null,'provider','openai','model','gpt-image-2',
    'model_snapshot','gpt-image-2-2026-04-21','media_kind','image','generation_mode','generation',
    'endpoint','/v1/images/generations','request_parameters',v_request,'requested_output_count',1,
    'usage_estimates',(select jsonb_agg(value order by value->>'component_kind') from jsonb_array_elements(v_usage_reordered)),
    'pricing_policy_revision_id',v_policy,'pricing_policy_revision',1
  )::text,'utf8'),'sha256'),'hex');
  v_result := tongs.create_compound_ai_credit_quote(v_quote_reordered,v_user,'test:compound:reordered','hearth',null,null,
    v_policy,v_request,1,v_usage_reordered,1170,v_fingerprint,now(),now()+interval '15 minutes');
  if (v_result#>>'{quote,estimated_provider_expense_numerator}')::bigint <> 6960
     or (v_result#>>'{quote,estimated_customer_credit_charge}')::bigint <> 1170 then
    raise exception 'component order changed compound economics';
  end if;

  select request_fingerprint into v_old_fingerprint from tongs.ai_credit_quotes where id=v_quote_mixed;
  v_v2 := tongs.commit_compound_ai_pricing_policy_revision(
    'openai:gpt-image-2-2026-04-21:images-generations:standard',1,
    '73000000-0000-4000-8000-000000000021','openai','gpt-image-2','gpt-image-2-2026-04-21',
    'image','generation','/v1/images/generations',
    '{"sizes":["1024x1024"],"qualities":["high"],"output_count_semantics":"per_requested_image"}',
    '[
      {"id":"73000000-0000-4000-8000-000000000031","ordinal":1,"component_kind":"text_input","unit_kind":"token","rate_numerator":5,"rate_denominator":1,"currency":"USD","metadata":{}},
      {"id":"73000000-0000-4000-8000-000000000032","ordinal":2,"component_kind":"cached_text_input","unit_kind":"token","rate_numerator":5,"rate_denominator":4,"currency":"USD","metadata":{}},
      {"id":"73000000-0000-4000-8000-000000000033","ordinal":3,"component_kind":"image_input","unit_kind":"token","rate_numerator":8,"rate_denominator":1,"currency":"USD","metadata":{}},
      {"id":"73000000-0000-4000-8000-000000000034","ordinal":4,"component_kind":"cached_image_input","unit_kind":"token","rate_numerator":2,"rate_denominator":1,"currency":"USD","metadata":{}},
      {"id":"73000000-0000-4000-8000-000000000035","ordinal":5,"component_kind":"image_output","unit_kind":"token","rate_numerator":31,"rate_denominator":1,"currency":"USD","metadata":{}}
    ]',
    'USD',140000,1000000,6,5,0,'ceiling_whole_credit',now(),null,true,
    'operator_entered','test historical isolation','v2',v_user);
  if (select request_fingerprint from tongs.ai_credit_quotes where id=v_quote_mixed) <> v_old_fingerprint
     or (select estimated_customer_credit_charge from tongs.ai_credit_quotes where id=v_quote_mixed) <> 1170 then
    raise exception 'new pricing revision changed historical quote';
  end if;
  begin
    perform tongs.commit_compound_ai_pricing_policy_revision(
      'openai:gpt-image-2-2026-04-21:images-generations:standard',0,
      '73000000-0000-4000-8000-000000000022','openai','gpt-image-2','gpt-image-2-2026-04-21',
      'image','generation','/v1/images/generations','{}','[
        {"id":"73000000-0000-4000-8000-000000000041","ordinal":1,"component_kind":"text_input","unit_kind":"token","rate_numerator":5,"rate_denominator":1,"currency":"USD","metadata":{}}
      ]','USD',140000,1000000,6,5,0,
      'ceiling_whole_credit',now(),null,true,'operator_entered','stale','v3',v_user);
    raise exception 'stale policy concurrency succeeded';
  exception when sqlstate '40001' then null; end;
  begin
    update tongs.ai_pricing_rate_components set rate_numerator=99 where pricing_policy_revision_id=v_policy;
    raise exception 'rate component mutation succeeded';
  exception when sqlstate '55000' then null; end;
end $$;

do $$
begin
  if exists (
    select 1 from tongs.ai_credit_quotes q
    where q.request_parameters->>'render_engine' = 'deterministic_reference_visual'
       or q.tool = 'reference_visual_renderer'
  ) then raise exception 'deterministic Reference Visual created a paid quote'; end if;
  if exists (
    select 1 from tongs.ai_credit_reservations r
    where r.tool = 'reference_visual_renderer' or r.purpose like '%reference visual%'
  ) then raise exception 'deterministic Reference Visual created a reservation'; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','73000000-0000-4000-8000-000000000001',true);
do $$
begin
  if (select count(*) from tongs.ai_pricing_rate_components where pricing_policy_revision_id='72000000-0000-4000-8000-000000000001') <> 5 then
    raise exception 'authenticated pricing read failed';
  end if;
  begin
    perform tongs.create_compound_ai_credit_quote(
      gen_random_uuid(),auth.uid(),'unauthorized','hearth',null,null,
      '72000000-0000-4000-8000-000000000001','{}',1,
      '[{"component_kind":"image_output","estimated_quantity":1,"maximum_quantity":1}]',1,repeat('a',64),now(),null);
    raise exception 'authenticated user invoked server quote authority';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','73000000-0000-4000-8000-000000000099',true);
do $$
begin
  if tongs.read_my_ai_credit_quote_v2('73000000-0000-4000-8000-000000000012') is not null then
    raise exception 'cross-account quote read exposed another creator quote';
  end if;
  if exists (
    select 1 from tongs.ai_credit_quote_usage_components
    where quote_id='73000000-0000-4000-8000-000000000012'
  ) then
    raise exception 'cross-account RLS exposed quote usage components';
  end if;
end $$;
reset role;

rollback;
