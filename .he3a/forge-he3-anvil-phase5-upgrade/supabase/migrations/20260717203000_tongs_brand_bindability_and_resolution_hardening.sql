-- Harden canonical bindability and ensure-binding operation receipts.
begin;
create or replace function tongs.brand_rule_errors(p_rules jsonb) returns text[] language plpgsql immutable as $$
declare v_errors text[]:='{}'; v_value text;
begin
 if jsonb_typeof(p_rules)<>'object' then return array['Rules must be an object.']; end if;
 if length(btrim(coalesce(p_rules#>>'{public_identity,program_name}','')))=0 then v_errors:=array_append(v_errors,'Public program name is required.'); end if;
 foreach v_value in array array[coalesce(p_rules#>>'{palette,primary}',''),coalesce(p_rules#>>'{palette,secondary}',''),coalesce(p_rules#>>'{palette,accent}','')] loop if v_value!~*'^#[0-9a-f]{6}$' then v_errors:=array_append(v_errors,'Palette colors must be six-digit hex values.'); exit; end if; end loop;
 if length(btrim(coalesce(p_rules#>>'{typography,heading_family}','')))=0 or length(btrim(coalesce(p_rules#>>'{typography,body_family}','')))=0 then v_errors:=array_append(v_errors,'Basic typography is required.'); end if;
 if coalesce((p_rules#>>'{audio,music_volume}')::numeric,-1)<0 or coalesce((p_rules#>>'{audio,music_volume}')::numeric,2)>1 or coalesce((p_rules#>>'{audio,ducking}')::numeric,-1)<0 or coalesce((p_rules#>>'{audio,ducking}')::numeric,2)>1 then v_errors:=array_append(v_errors,'Audio values must be between zero and one.'); end if;
 return v_errors; exception when invalid_text_representation then return array['Brand rules contain invalid numeric values.']; end $$;

create or replace function tongs.brand_revision_is_bindable(p_workspace_id uuid,p_profile_id uuid,p_revision_id uuid) returns boolean
language sql stable security definer set search_path=tongs,public as $$
 select exists(select 1 from tongs.brand_profile_revisions r join tongs.brand_profiles p on p.id=r.profile_id and p.workspace_id=r.workspace_id
  where r.id=p_revision_id and r.workspace_id=p_workspace_id and r.profile_id=p_profile_id and p.archived_at is null
   and r.state='committed' and r.eligible_for_new_use and r.verified_at is not null and r.content_hash=tongs.brand_rules_hash(r.rules_json)
   and cardinality(tongs.brand_rule_errors(r.rules_json))=0 and coalesce((r.validation_json->>'valid')::boolean,false)
   and not exists(select 1 from jsonb_each_text(coalesce(r.rules_json->'asset_revision_ids','{}'::jsonb)) x
    left join tongs.brand_asset_revisions ar on ar.id=x.value::uuid where ar.id is null or ar.workspace_id<>p_workspace_id or ar.state<>'ready')) $$;

create or replace function tongs.create_brand_profile(p_workspace_id uuid,p_internal_label text,p_rules jsonb,p_operation_id text)
returns jsonb language plpgsql security definer set search_path=tongs,public as $$
declare v_user uuid:=auth.uid();v_profile uuid:=gen_random_uuid();v_revision uuid:=gen_random_uuid();v_hash text;v_validation jsonb;v_errors text[];v_assets uuid[];
begin if v_user is null then raise exception 'Not authenticated' using errcode='42501';end if;perform tongs.assert_workspace_role(p_workspace_id,'editor');
 if length(btrim(coalesce(p_internal_label,'')))=0 then raise exception 'internal label is required' using errcode='22023';end if;
 v_errors:=tongs.brand_rule_errors(p_rules);select coalesce(array_agg(value::uuid),'{}') into v_assets from jsonb_each_text(coalesce(p_rules->'asset_revision_ids','{}'::jsonb));
 if exists(select 1 from unnest(v_assets)x left join tongs.brand_asset_revisions ar on ar.id=x where ar.id is null or ar.workspace_id<>p_workspace_id or ar.state<>'ready') then v_errors:=array_append(v_errors,'All referenced asset revisions must be ready and workspace-owned.');end if;
 v_hash:=tongs.brand_rules_hash(p_rules);v_validation:=jsonb_build_object('valid',cardinality(v_errors)=0,'bindable',cardinality(v_errors)=0,'errors',to_jsonb(v_errors),'asset_revision_ids',to_jsonb(v_assets));
 insert into tongs.brand_profiles(id,workspace_id,internal_label,created_by,updated_by)values(v_profile,p_workspace_id,btrim(p_internal_label),v_user,v_user);
 insert into tongs.brand_profile_revisions(id,workspace_id,profile_id,revision,rules_json,content_hash,state,eligible_for_new_use,validation_json,verified_at,created_by)values(v_revision,p_workspace_id,v_profile,1,jsonb_strip_nulls(p_rules),v_hash,case when cardinality(v_errors)=0 then 'committed' else 'ineligible' end,cardinality(v_errors)=0,v_validation,now(),v_user);
 return jsonb_build_object('profile_id',v_profile,'profile_revision_id',v_revision,'revision',1,'content_hash',v_hash,'bindable',cardinality(v_errors)=0,'errors',to_jsonb(v_errors));end $$;

create or replace function tongs.append_brand_profile_revision(p_workspace_id uuid,p_profile_id uuid,p_rules jsonb,p_operation_id text)
returns jsonb language plpgsql security definer set search_path=tongs,public as $$
declare v_user uuid:=auth.uid();v_revision int;v_id uuid;v_hash text;v_asset_ids uuid[];v_errors text[];v_validation jsonb;
begin if v_user is null then raise exception 'Not authenticated' using errcode='42501';end if;perform tongs.assert_workspace_role(p_workspace_id,'editor');perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||p_profile_id::text,0));
 if not exists(select 1 from tongs.brand_profiles where id=p_profile_id and workspace_id=p_workspace_id and archived_at is null)then raise exception 'profile unavailable' using errcode='22023';end if;
 v_errors:=tongs.brand_rule_errors(p_rules);select coalesce(array_agg(value::uuid),'{}')into v_asset_ids from jsonb_each_text(coalesce(p_rules->'asset_revision_ids','{}'::jsonb));
 if exists(select 1 from unnest(v_asset_ids)x left join tongs.brand_asset_revisions ar on ar.id=x where ar.id is null or ar.workspace_id<>p_workspace_id or ar.state<>'ready')then v_errors:=array_append(v_errors,'All referenced asset revisions must be ready and workspace-owned.');end if;
 v_hash:=tongs.brand_rules_hash(p_rules);select id,revision into v_id,v_revision from tongs.brand_profile_revisions where profile_id=p_profile_id and content_hash=v_hash;if v_id is not null then return jsonb_build_object('disposition','existing_revision','profile_revision_id',v_id,'revision',v_revision);end if;
 select coalesce(max(revision),0)+1 into v_revision from tongs.brand_profile_revisions where profile_id=p_profile_id;v_id:=gen_random_uuid();v_validation:=jsonb_build_object('valid',cardinality(v_errors)=0,'bindable',cardinality(v_errors)=0,'errors',to_jsonb(v_errors),'asset_revision_ids',to_jsonb(v_asset_ids));
 insert into tongs.brand_profile_revisions(id,workspace_id,profile_id,revision,rules_json,content_hash,state,eligible_for_new_use,validation_json,verified_at,created_by)values(v_id,p_workspace_id,p_profile_id,v_revision,jsonb_strip_nulls(p_rules),v_hash,case when cardinality(v_errors)=0 then 'committed' else 'ineligible' end,cardinality(v_errors)=0,v_validation,now(),v_user);
 return jsonb_build_object('disposition','created_revision','profile_revision_id',v_id,'revision',v_revision,'bindable',cardinality(v_errors)=0,'errors',to_jsonb(v_errors));end $$;

create or replace function tongs.resolve_workpiece_brand_default(p_workspace_id uuid,p_workpiece_id uuid,p_operation_id text,p_operation_fingerprint text)
returns jsonb language plpgsql security definer set search_path=tongs,public as $$
declare v_user uuid:=auth.uid();v_op tongs.workpiece_brand_binding_operations%rowtype;v_current tongs.workpiece_brand_bindings%rowtype;v_default uuid;v_revision tongs.brand_profile_revisions%rowtype;v_id uuid;v_result jsonb;v_assets uuid[];
begin if v_user is null then raise exception 'Not authenticated' using errcode='42501';end if;perform tongs.assert_workspace_role(p_workspace_id,'editor');if not exists(select 1 from tongs.episodes where id=p_workpiece_id and workspace_id=p_workspace_id)then raise exception 'workpiece does not belong to workspace' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||p_workpiece_id::text||':brand',0));
 select * into v_op from tongs.workpiece_brand_binding_operations where workspace_id=p_workspace_id and operation_id=p_operation_id;if found then if v_op.operation_fingerprint<>p_operation_fingerprint then raise exception 'Operation identity was reused with a different payload.' using errcode='22023';end if;return v_op.result_json;end if;
 select * into v_current from tongs.workpiece_brand_bindings where workpiece_id=p_workpiece_id order by revision desc limit 1;
 if found then v_result:=jsonb_build_object('disposition','existing_binding','binding',tongs.brand_binding_json(v_current.id));insert into tongs.workpiece_brand_binding_operations(workspace_id,workpiece_id,operation_id,operation_fingerprint,intent,disposition,binding_id,result_json,created_by)values(p_workspace_id,p_workpiece_id,p_operation_id,p_operation_fingerprint,'resolve_default','existing_binding',v_current.id,v_result,v_user);return v_result;end if;
 select profile_id into v_default from tongs.workspace_default_brand_profiles where workspace_id=p_workspace_id;if v_default is not null then select * into v_revision from tongs.brand_profile_revisions r where r.profile_id=v_default and tongs.brand_revision_is_bindable(p_workspace_id,v_default,r.id) order by revision desc limit 1;end if;
 v_id:=gen_random_uuid();if v_revision.id is null then insert into tongs.workpiece_brand_bindings(id,workspace_id,workpiece_id,revision,state,mutation_reason,operation_id,operation_fingerprint,created_by)values(v_id,p_workspace_id,p_workpiece_id,1,'disabled','resolve_default',p_operation_id,p_operation_fingerprint,v_user);
 else select coalesce(array_agg(value::uuid),'{}')into v_assets from jsonb_each_text(coalesce(v_revision.rules_json->'asset_revision_ids','{}'::jsonb));insert into tongs.workpiece_brand_bindings(id,workspace_id,workpiece_id,revision,state,profile_id,profile_revision_id,profile_revision,profile_content_hash,asset_revision_ids,mutation_reason,operation_id,operation_fingerprint,created_by)values(v_id,p_workspace_id,p_workpiece_id,1,'profile',v_default,v_revision.id,v_revision.revision,v_revision.content_hash,v_assets,'resolve_default',p_operation_id,p_operation_fingerprint,v_user);end if;
 v_result:=jsonb_build_object('disposition','created_binding','binding',tongs.brand_binding_json(v_id));insert into tongs.workpiece_brand_binding_operations(workspace_id,workpiece_id,operation_id,operation_fingerprint,intent,disposition,binding_id,result_json,created_by)values(p_workspace_id,p_workpiece_id,p_operation_id,p_operation_fingerprint,'resolve_default','created_binding',v_id,v_result,v_user);return v_result;end $$;
commit;
