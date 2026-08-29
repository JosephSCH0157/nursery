-- Source-use classification follows the current ordered Source collection.
-- The legacy opportunity-level source columns remain valid historical data but
-- are no longer the authority after a Source set has been committed.

create or replace function tongs.commit_reference_visual_source_use(p_workspace_id uuid,p_workpiece_id uuid,p_opportunity_id uuid,p_use_id uuid,p_expected_revision bigint,p_expected_opportunity_revision_id uuid,p_source_revision_id uuid,p_workpiece_source_link_revision_id uuid,p_use_classification text,p_creator_confirmed boolean,p_confirmation_note text,p_provenance_json jsonb,p_operation_id text,p_operation_fingerprint text,p_actor_id uuid)returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare op tongs.reference_visual_operation_receipts%rowtype;seq tongs.reference_visual_source_use_sequences%rowtype;prev tongs.reference_visual_source_use_revisions%rowtype;opp tongs.reference_visual_opportunity_revisions%rowtype;source_member tongs.reference_visual_source_set_members%rowtype;r tongs.reference_visual_source_use_revisions%rowtype;n bigint;h text;ih text;result jsonb;
begin
 if not tongs.has_workspace_role(p_workspace_id,'editor')or auth.uid() is distinct from p_actor_id then raise exception 'workspace editor authority required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_operation_id,0));select * into op from tongs.reference_visual_operation_receipts where operation_id=p_operation_id;
 if found then if op.operation_fingerprint<>p_operation_fingerprint then return jsonb_build_object('disposition','operation_identity_conflict');end if;return op.receipt_json;end if;
 select rv.* into opp from tongs.reference_visual_plan_sequences ps join tongs.reference_visual_plan_membership m on m.plan_revision_id=ps.current_plan_revision_id join tongs.reference_visual_opportunity_revisions rv on rv.id=m.opportunity_revision_id where ps.workspace_id=p_workspace_id and ps.workpiece_id=p_workpiece_id and m.opportunity_id=p_opportunity_id for update of rv;
 if not found or opp.id is distinct from p_expected_opportunity_revision_id then return jsonb_build_object('disposition','opportunity_revision_conflict');end if;
 select sm.* into source_member
 from tongs.reference_visual_plan_sequences ps
 join lateral(select ss.* from tongs.reference_visual_source_set_revisions ss where ss.workspace_id=ps.workspace_id and ss.workpiece_id=ps.workpiece_id and ss.plan_revision_id=ps.current_plan_revision_id and ss.opportunity_id=p_opportunity_id order by ss.revision desc limit 1)current_set on true
 join tongs.reference_visual_source_set_members sm on sm.source_set_revision_id=current_set.id
 where ps.workspace_id=p_workspace_id and ps.workpiece_id=p_workpiece_id and sm.source_revision_id=p_source_revision_id and sm.workpiece_source_link_revision_id=p_workpiece_source_link_revision_id;
 if not found then return jsonb_build_object('disposition','linked_source_revision_required');end if;
 if p_use_classification='facts_data_only' and opp.visual_subtype not in('chart','timeline','stat_card','comparison') then return jsonb_build_object('disposition','source_use_incompatible_with_treatment');end if;
 if opp.visual_subtype in('document_excerpt','quote_card') and p_use_classification not in('quoted_or_excerpted_text','mixed') then return jsonb_build_object('disposition','source_use_incompatible_with_treatment');end if;
 if opp.visual_subtype in('archival_still','archival_sequence') and p_use_classification not in('third_party_media','mixed') then return jsonb_build_object('disposition','source_use_incompatible_with_treatment');end if;
 select * into seq from tongs.reference_visual_source_use_sequences where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and opportunity_id=p_opportunity_id for update;
 if coalesce(seq.current_use_revision,0)<>p_expected_revision then return jsonb_build_object('disposition','source_use_revision_conflict','current_revision',coalesce(seq.current_use_revision,0));end if;
 if p_expected_revision>0 then select * into prev from tongs.reference_visual_source_use_revisions where id=seq.current_use_revision_id;end if;n:=p_expected_revision+1;
 h:=encode(extensions.digest(convert_to(jsonb_build_object('opportunity_revision_id',opp.id,'source_set_member_id',source_member.id,'source_revision_id',p_source_revision_id,'workpiece_source_link_revision_id',p_workpiece_source_link_revision_id,'use_classification',p_use_classification,'creator_confirmed',p_creator_confirmed,'confirmation_note',p_confirmation_note,'provenance',coalesce(p_provenance_json,'{}'))::text,'UTF8'),'sha256'),'hex');ih:=encode(extensions.digest(convert_to(jsonb_build_object('use_id',p_use_id,'revision',n,'previous_revision_id',prev.id,'content_hash',h)::text,'UTF8'),'sha256'),'hex');
 insert into tongs.reference_visual_source_use_revisions(use_id,workspace_id,workpiece_id,opportunity_id,revision,previous_revision_id,previous_revision,opportunity_revision_id,source_revision_id,workpiece_source_link_revision_id,use_classification,creator_confirmed,confirmation_note,provenance_json,content_hash,immutable_revision_hash,created_by)values(p_use_id,p_workspace_id,p_workpiece_id,p_opportunity_id,n,prev.id,prev.revision,opp.id,p_source_revision_id,p_workpiece_source_link_revision_id,p_use_classification,p_creator_confirmed,p_confirmation_note,coalesce(p_provenance_json,'{}')||jsonb_build_object('source_set_member_id',source_member.id),h,ih,p_actor_id)returning * into r;
 if r.source_set_member_id is distinct from source_member.id then raise exception 'source-use Source member binding failed' using errcode='23514';end if;
 insert into tongs.reference_visual_source_use_sequences values(p_workspace_id,p_workpiece_id,p_opportunity_id,p_use_id,r.id,r.revision,now())on conflict(workspace_id,workpiece_id,opportunity_id)do update set use_id=excluded.use_id,current_use_revision_id=excluded.current_use_revision_id,current_use_revision=excluded.current_use_revision,updated_at=now();
 result:=jsonb_build_object('disposition','committed','source_use_revision',to_jsonb(r));insert into tongs.reference_visual_operation_receipts values(p_operation_id,p_operation_fingerprint,'source_use_commit',p_workspace_id,p_workpiece_id,'committed',r.id,result,p_actor_id,now());return result;
end$$;

revoke all on function tongs.commit_reference_visual_source_use(uuid,uuid,uuid,uuid,bigint,uuid,uuid,uuid,text,boolean,text,jsonb,text,text,uuid) from public,anon;
grant execute on function tongs.commit_reference_visual_source_use(uuid,uuid,uuid,uuid,bigint,uuid,uuid,uuid,text,boolean,text,jsonb,text,text,uuid) to authenticated,service_role;

comment on function tongs.commit_reference_visual_source_use(uuid,uuid,uuid,uuid,bigint,uuid,uuid,uuid,text,boolean,text,jsonb,text,text,uuid) is
 'Commits creator-confirmed Source use against a member of the current canonical Reference Visual Source set.';
