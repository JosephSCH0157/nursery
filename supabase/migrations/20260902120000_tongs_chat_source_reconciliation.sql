-- Recover canonical episode Sources and visual provenance from a verified Hearth chat snapshot.
begin;

create table tongs.chat_source_reconciliation_receipts(
 operation_id text primary key,
 operation_fingerprint text not null check(operation_fingerprint~'^[0-9a-f]{64}$'),
 workspace_id uuid not null,
 workpiece_id uuid not null,
 chat_revision bigint not null check(chat_revision>0),
 chat_hash text not null check(chat_hash~'^[0-9a-f]{64}$'),
 result_json jsonb not null check(jsonb_typeof(result_json)='object'),
 created_by uuid not null,
 created_at timestamptz not null default now(),
 foreign key(workpiece_id,workspace_id) references tongs.episodes(id,workspace_id) on delete cascade
);
alter table tongs.chat_source_reconciliation_receipts enable row level security;
create policy chat_source_reconciliation_receipts_viewer on tongs.chat_source_reconciliation_receipts
 for select to authenticated using(tongs.has_workspace_role(workspace_id,'viewer'));
revoke all on tongs.chat_source_reconciliation_receipts from public,anon,authenticated;
grant select on tongs.chat_source_reconciliation_receipts to authenticated;
create trigger chat_source_reconciliation_receipts_immutable before update or delete on tongs.chat_source_reconciliation_receipts
 for each row execute function tongs.reject_source_immutable_mutation();

create or replace function tongs.commit_chat_source_reconciliation(
 p_workspace_id uuid,p_workpiece_id uuid,p_chat_revision bigint,p_chat_hash text,
 p_recovered_sources jsonb,p_matches jsonb,p_operation_id text,p_operation_fingerprint text,p_actor_id uuid
)returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
#variable_conflict use_column
declare existing tongs.chat_source_reconciliation_receipts%rowtype;chat_file tongs.workpiece_files%rowtype;
 item jsonb;match jsonb;src tongs.sources%rowtype;src_seq tongs.source_sequences%rowtype;src_rev tongs.source_revisions%rowtype;
 link_seq tongs.workpiece_source_link_sequences%rowtype;link_rev tongs.workpiece_source_link_revisions%rowtype;
 source_receipt jsonb;link_receipt jsonb;attr_receipt jsonb;resolved jsonb;opp_before jsonb;opp_after jsonb;
 plan_id uuid;approval_id uuid;family text;v_opportunity_id uuid;opportunity_revision_id uuid;opportunity_revision bigint;
 v_stable_key text;child_hash text;created_count integer:=0;reused_count integer:=0;matched_count integer:=0;
 source_results jsonb:='[]'::jsonb;match_results jsonb:='[]'::jsonb;result jsonb;
begin
 if not tongs.has_workspace_role(p_workspace_id,'editor')or auth.uid()is distinct from p_actor_id then raise exception 'workspace editor authority required' using errcode='42501';end if;
 if jsonb_typeof(p_recovered_sources)<>'array'or jsonb_typeof(p_matches)<>'array'then return jsonb_build_object('disposition','invalid_reconciliation_contract');end if;
 perform pg_advisory_xact_lock(hashtextextended(p_operation_id,0));
 select * into existing from tongs.chat_source_reconciliation_receipts where operation_id=p_operation_id;
 if found then if existing.operation_fingerprint<>p_operation_fingerprint then return jsonb_build_object('disposition','operation_identity_conflict');end if;return existing.result_json;end if;
 select * into chat_file from tongs.workpiece_files where workpiece_id=p_workpiece_id and path='hearth/chat.v1.json';
 if not found or chat_file.revision<>p_chat_revision or lower(chat_file.hash_value)<>lower(p_chat_hash)then return jsonb_build_object('disposition','chat_snapshot_conflict');end if;

 for item in select value from jsonb_array_elements(p_recovered_sources)loop
  v_stable_key:='url:'||lower(item->>'normalized_url');
  select * into src from tongs.sources where workspace_id=p_workspace_id and stable_key=v_stable_key;
  if found then
   select * into src_seq from tongs.source_sequences where workspace_id=p_workspace_id and source_id=src.id;
   select * into src_rev from tongs.source_revisions where id=src_seq.current_source_revision_id;
   reused_count:=reused_count+1;
  else
   child_hash:=encode(extensions.digest(convert_to(jsonb_build_object('parent',p_operation_id,'kind','source','url',item->>'normalized_url')::text,'UTF8'),'sha256'),'hex');
   source_receipt:=tongs.commit_source_revision(p_workspace_id,null,v_stable_key,0,coalesce(nullif(item->>'source_type',''),'webpage'),coalesce(nullif(item->>'title',''),item->>'host'),null,null,null,item->>'normalized_url',null,null,null,
    jsonb_build_object('recovered_from_chat',true),jsonb_build_object('authority','hearth_chat_reconciliation','chat_revision',p_chat_revision,'chat_hash',lower(p_chat_hash),'message_evidence',coalesce(item->'message_evidence','[]'::jsonb)),
    'forge.source.metadata.v1','forge.source.provenance.v1','forge:source:chat-recovery:'||substr(child_hash,1,48),child_hash,p_actor_id);
   if coalesce(source_receipt->>'disposition','')<>'committed'then raise exception 'chat Source recovery failed' using detail=source_receipt::text;end if;
   src_rev:=jsonb_populate_record(null::tongs.source_revisions,source_receipt->'source_revision');src:=jsonb_populate_record(null::tongs.sources,source_receipt->'source');created_count:=created_count+1;
  end if;
  select ls.* into link_seq from tongs.workpiece_source_link_sequences ls join tongs.workpiece_source_link_revisions lr on lr.id=ls.current_link_revision_id where ls.workspace_id=p_workspace_id and ls.workpiece_id=p_workpiece_id and lr.source_id=src.id limit 1;
  if found then select * into link_rev from tongs.workpiece_source_link_revisions where id=link_seq.current_link_revision_id;
  else
   child_hash:=encode(extensions.digest(convert_to(jsonb_build_object('parent',p_operation_id,'kind','link','source',src.id)::text,'UTF8'),'sha256'),'hex');
   link_receipt:=tongs.commit_workpiece_source_link_revision(p_workspace_id,p_workpiece_id,null,0,src_rev.id,src_rev.revision,'script_research',null,null,
    jsonb_build_object('chat_message_evidence',coalesce(item->'message_evidence','[]'::jsonb)),'{}','{}',null,'Recovered from the canonical Hearth chat snapshot',
    jsonb_build_object('authority','hearth_chat_reconciliation','chat_revision',p_chat_revision,'chat_hash',lower(p_chat_hash)),'forge:source:chat-recovery-link:'||substr(child_hash,1,48),child_hash,p_actor_id);
   if coalesce(link_receipt->>'disposition','')<>'committed'then raise exception 'chat Source link recovery failed' using detail=link_receipt::text;end if;
   link_rev:=jsonb_populate_record(null::tongs.workpiece_source_link_revisions,link_receipt->'link_revision');
  end if;
  source_results:=source_results||jsonb_build_array(jsonb_build_object('normalized_url',item->>'normalized_url','source_revision_id',src_rev.id,'workpiece_source_link_revision_id',link_rev.id,'status',case when source_receipt is null then'reused'else'created'end));source_receipt:=null;
 end loop;

 for match in select value from jsonb_array_elements(p_matches)loop
  if match->>'status'<>'exact'then match_results:=match_results||jsonb_build_array(match);continue;end if;
  family:=match->>'family';v_opportunity_id:=(match->>'opportunity_id')::uuid;v_stable_key:='url:'||lower(match->>'normalized_url');
  select s.* into src from tongs.sources s where s.workspace_id=p_workspace_id and s.stable_key=v_stable_key;
  select r.* into src_rev from tongs.source_sequences q join tongs.source_revisions r on r.id=q.current_source_revision_id where q.workspace_id=p_workspace_id and q.source_id=src.id;
  select r.* into link_rev from tongs.workpiece_source_link_sequences q join tongs.workpiece_source_link_revisions r on r.id=q.current_link_revision_id where q.workspace_id=p_workspace_id and q.workpiece_id=p_workpiece_id and r.source_id=src.id limit 1;
  if src_rev.id is null or link_rev.id is null then raise exception 'matched Source authority missing';end if;
  if family='reference_clip'then
   select q.current_plan_revision_id,o.id,o.revision,to_jsonb(o) into plan_id,opportunity_revision_id,opportunity_revision,opp_before from tongs.reference_clip_plan_sequences q join tongs.reference_clip_plan_membership m on m.plan_revision_id=q.current_plan_revision_id and m.opportunity_id=v_opportunity_id join tongs.reference_clip_opportunity_revisions o on o.id=m.opportunity_revision_id where q.workspace_id=p_workspace_id and q.workpiece_id=p_workpiece_id;
  elsif family='reference_visual'then
   select q.current_plan_revision_id,o.id,o.revision,to_jsonb(o) into plan_id,opportunity_revision_id,opportunity_revision,opp_before from tongs.reference_visual_plan_sequences q join tongs.reference_visual_plan_membership m on m.plan_revision_id=q.current_plan_revision_id and m.opportunity_id=v_opportunity_id join tongs.reference_visual_opportunity_revisions o on o.id=m.opportunity_revision_id where q.workspace_id=p_workspace_id and q.workpiece_id=p_workpiece_id;
  else raise exception 'unsupported reconciliation family';end if;
  if opportunity_revision_id is null then raise exception 'reconciliation opportunity missing';end if;
  select id into approval_id from tongs.script_approval_revisions where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id order by approval_revision desc limit 1;
  child_hash:=encode(extensions.digest(convert_to(jsonb_build_object('parent',p_operation_id,'kind','seed-attribution','family',family,'opportunity',v_opportunity_id)::text,'UTF8'),'sha256'),'hex');
  attr_receipt:=tongs.commit_visual_source_attribution(p_workspace_id,p_workpiece_id,family,v_opportunity_id,approval_id,p_operation_id,plan_id,'selection_required','supporting','Recovered chat evidence selected a unique Source',jsonb_build_object('recovery',true),jsonb_build_array(jsonb_build_object('role','candidate','source_revision_id',src_rev.id,'workpiece_source_link_revision_id',link_rev.id)),0,'forge:visual-source-attribution:recovery-seed:'||substr(child_hash,1,40),child_hash,p_actor_id);
  if coalesce(attr_receipt->>'disposition','')<>'committed'then raise exception 'recovery attribution seed failed' using detail=attr_receipt::text;end if;
  child_hash:=encode(extensions.digest(convert_to(jsonb_build_object('parent',p_operation_id,'kind','resolve','family',family,'opportunity',v_opportunity_id)::text,'UTF8'),'sha256'),'hex');
  resolved:=tongs.resolve_visual_source_attribution(p_workspace_id,p_workpiece_id,family,v_opportunity_id,1,opportunity_revision_id,opportunity_revision,src_rev.id,link_rev.id,'forge:visual-source-attribution:recovery-resolve:'||substr(child_hash,1,36),child_hash,p_actor_id);
  if coalesce(resolved->>'disposition','')<>'committed'then raise exception 'visual Source recovery failed' using detail=resolved::text;end if;
  opp_after:=resolved->'opportunity_revision';
  if (opp_before-ARRAY['id','revision','previous_revision_id','previous_revision','source_status','source_revision_id','source_revision','workpiece_source_link_revision_id','workpiece_source_link_revision','content_hash','immutable_revision_hash','created_at','created_by'])
     is distinct from(opp_after-ARRAY['id','revision','previous_revision_id','previous_revision','source_status','source_revision_id','source_revision','workpiece_source_link_revision_id','workpiece_source_link_revision','content_hash','immutable_revision_hash','created_at','created_by'])then raise exception 'visual reconciliation changed editorial content';end if;
  matched_count:=matched_count+1;match_results:=match_results||jsonb_build_array(match||jsonb_build_object('committed',true,'source_revision_id',src_rev.id,'workpiece_source_link_revision_id',link_rev.id));
 end loop;
 result:=jsonb_build_object('disposition','committed','recovered_from_chat',p_recovered_sources,'canonical_episode_sources',source_results,'visual_opportunity_matches',match_results,'created_source_count',created_count,'reused_source_count',reused_count,'matched_count',matched_count,'chat_revision',p_chat_revision,'chat_hash',lower(p_chat_hash));
 insert into tongs.chat_source_reconciliation_receipts(operation_id,operation_fingerprint,workspace_id,workpiece_id,chat_revision,chat_hash,result_json,created_by)values(p_operation_id,p_operation_fingerprint,p_workspace_id,p_workpiece_id,p_chat_revision,lower(p_chat_hash),result,p_actor_id);
 return result;
end$$;
revoke all on function tongs.commit_chat_source_reconciliation(uuid,uuid,bigint,text,jsonb,jsonb,text,text,uuid)from public,anon;
grant execute on function tongs.commit_chat_source_reconciliation(uuid,uuid,bigint,text,jsonb,jsonb,text,text,uuid)to authenticated,service_role;
comment on function tongs.commit_chat_source_reconciliation is 'Atomically promotes verified Hearth chat URLs and attaches only provenance/source authority to existing visual opportunities.';
commit;
