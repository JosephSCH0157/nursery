-- Appended to the existing isolated owner fixture, never production.
reset role;
do $$ declare a bigint; b bigint; owner_id uuid:='91000000-0000-4000-8000-000000000001';
 workspace uuid:='91000000-0000-4000-8000-000000000010';
begin
 select committed_micros into a from tongs._restricted_beta_policy_commitment(
  (select aggregate_policy_revision_id from tongs.owner_hearth_model_terms where authorization_id='91000000-0000-4000-8000-000000000090' and provider_model_id='gpt-6-astra'));
 select committed_micros into b from tongs._restricted_beta_policy_commitment(
  (select aggregate_policy_revision_id from tongs.owner_hearth_model_terms where authorization_id='91000000-0000-4000-8000-000000000090' and provider_model_id='gpt-5.6-luna'));
 if a is distinct from b or a is null then raise exception 'model policies multiplied aggregate capacity'; end if;
 perform tongs.assert_openai_result_delivery_access(owner_id,workspace,'fixture');
 delete from tongs.workspace_members where user_id=owner_id and workspace_id=workspace;
 begin
  perform tongs.assert_openai_result_delivery_access(owner_id,workspace,'fixture');
  raise exception 'revoked user received result';
 exception when insufficient_privilege then null; end;
 insert into tongs.workspace_members(workspace_id,user_id,role) values(workspace,owner_id,'owner');
end $$;

insert into tongs.openai_text_rollout_revisions(route_code,revision,mode,funding_scope,reason)
select route_code, max(revision)+1,'halt_new','forge','isolated cutover' from tongs.openai_text_rollout_revisions
where route_code<>'hearth.chat_completion' group by route_code;

do $$ begin
 begin
  insert into tongs.workpiece_jobs values(gen_random_uuid(),'hammer_transcript_prep','queued');
  raise exception 'halt allowed a queued provider job';
 exception when insufficient_privilege then null; end;
 -- Recovery bookkeeping for an existing attempted job is not a new admission.
 alter table tongs.workpiece_jobs disable trigger openai_job_cutover;
 insert into tongs.workpiece_jobs values('91000000-0000-4000-8000-000000000199','hammer_transcript_regeneration','running');
 alter table tongs.workpiece_jobs enable trigger openai_job_cutover;
 update tongs.workpiece_jobs set status='completed' where id='91000000-0000-4000-8000-000000000199';
end $$;

do $$ declare route text; result jsonb;
begin
 for route in select route_code from tongs.openai_text_route_policies where route_code<>'hearth.chat_completion' loop
  result:=tongs.read_openai_execution_requirement(route,'forge');
  if result->>'mode'<>'halt_new' then raise exception 'Forge cutover missing: %',route; end if;
  result:=tongs.read_openai_execution_requirement(route,'byo_customer');
  if result->>'mode'='halt_new' then raise exception 'Forge-only halt selected for BYO: %',route; end if;
 end loop;
 if has_function_privilege('authenticated','tongs.resolve_openai_text_recovery_context(text,text,uuid,uuid,uuid,text,text)','execute') then
  raise exception 'service recovery exposed to customer'; end if;
end $$;
