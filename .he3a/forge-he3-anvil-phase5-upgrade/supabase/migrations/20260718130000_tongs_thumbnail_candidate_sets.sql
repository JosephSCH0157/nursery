begin;

create table tongs.thumbnail_candidate_revisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  workpiece_id uuid not null references tongs.episodes(id) on delete cascade,
  recipe_id uuid not null, recipe_revision int not null check(recipe_revision>0), recipe_hash text not null check(recipe_hash~'^[a-f0-9]{64}$'),
  title_revision_id uuid not null, title_revision int not null check(title_revision>0), concept_revision_id uuid not null,
  base_artwork_asset_id uuid not null references tongs.assets(id), base_artwork_content_hash text not null check(base_artwork_content_hash~'^[a-f0-9]{64}$'),
  structural_composition_fingerprint text not null check(structural_composition_fingerprint~'^[a-f0-9]{64}$'),
  structural_fingerprint_version text not null check(structural_fingerprint_version='forge.thumbnail-structural-composition.v1'),
  composite_asset_id uuid not null unique references tongs.assets(id), composite_content_hash text not null check(composite_content_hash~'^[a-f0-9]{64}$'),
  candidate_binding_id uuid not null references tongs.workpiece_brand_bindings(id), candidate_binding_revision int not null check(candidate_binding_revision>0),
  candidate_binding_content_hash text null check(candidate_binding_content_hash is null or candidate_binding_content_hash~'^[a-f0-9]{64}$'),
  readability_contract_version text not null check(readability_contract_version='forge.thumbnail-readability.v1'),
  readability_evaluator_version text not null, readability_evidence_hash text not null check(readability_evidence_hash~'^[a-f0-9]{64}$'),
  compositor_version text not null check(length(btrim(compositor_version))>0),
  canonical_content_hash text not null check(canonical_content_hash~'^[a-f0-9]{64}$'),
  committed_at timestamptz not null default now(), committed_by uuid null references auth.users(id) on delete set null,
  unique(id,workspace_id,workpiece_id), unique(workspace_id,workpiece_id,recipe_id,recipe_revision), unique(workspace_id,workpiece_id,canonical_content_hash)
);

create table tongs.thumbnail_candidate_sets (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  workpiece_id uuid not null references tongs.episodes(id) on delete cascade, revision int not null check(revision>0),
  previous_candidate_set_id uuid null references tongs.thumbnail_candidate_sets(id), candidate_count int not null check(candidate_count>=3),
  content_hash text not null check(content_hash~'^[a-f0-9]{64}$'),
  distinction_contract_version text not null check(distinction_contract_version='forge.thumbnail-candidate-distinction.v1'),
  operation_id text not null, operation_fingerprint text not null check(operation_fingerprint~'^[a-f0-9]{64}$'),
  committed_at timestamptz not null default now(), committed_by uuid null references auth.users(id) on delete set null,
  unique(workpiece_id,revision), unique(workspace_id,operation_id), unique(id,workspace_id,workpiece_id)
);

create table tongs.thumbnail_candidate_set_members (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null, workpiece_id uuid not null,
  candidate_set_id uuid not null, candidate_revision_id uuid not null, candidate_ordinal int not null check(candidate_ordinal>0),
  created_at timestamptz not null default now(), created_by uuid null references auth.users(id) on delete set null,
  foreign key(candidate_set_id,workspace_id,workpiece_id) references tongs.thumbnail_candidate_sets(id,workspace_id,workpiece_id),
  foreign key(candidate_revision_id,workspace_id,workpiece_id) references tongs.thumbnail_candidate_revisions(id,workspace_id,workpiece_id),
  unique(candidate_set_id,candidate_revision_id), unique(candidate_set_id,candidate_ordinal)
);

create table tongs.thumbnail_candidate_set_operations (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  workpiece_id uuid not null references tongs.episodes(id) on delete cascade, operation_id text not null,
  operation_fingerprint text not null check(operation_fingerprint~'^[a-f0-9]{64}$'), disposition text not null,
  candidate_set_id uuid null references tongs.thumbnail_candidate_sets(id), result_json jsonb not null check(jsonb_typeof(result_json)='object'),
  created_at timestamptz not null default now(), created_by uuid null references auth.users(id) on delete set null,
  unique(workspace_id,operation_id)
);

create table tongs.thumbnail_candidate_brand_decisions (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null, workpiece_id uuid not null,
  candidate_revision_id uuid not null, candidate_set_id uuid null references tongs.thumbnail_candidate_sets(id),
  recipe_id uuid not null, recipe_revision int not null, recipe_hash text not null check(recipe_hash~'^[a-f0-9]{64}$'),
  composite_asset_id uuid not null references tongs.assets(id), composite_content_hash text not null check(composite_content_hash~'^[a-f0-9]{64}$'),
  candidate_binding_id uuid not null references tongs.workpiece_brand_bindings(id), candidate_binding_revision int not null,
  active_binding_id uuid not null references tongs.workpiece_brand_bindings(id), active_binding_revision int not null,
  decision_revision int not null check(decision_revision>0), decision text not null check(decision in('approved','revoked')),
  reason text not null check(length(btrim(reason))>0), previous_decision_id uuid null references tongs.thumbnail_candidate_brand_decisions(id),
  operation_id text not null, operation_fingerprint text not null check(operation_fingerprint~'^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(), created_by uuid null references auth.users(id) on delete set null,
  foreign key(candidate_revision_id,workspace_id,workpiece_id) references tongs.thumbnail_candidate_revisions(id,workspace_id,workpiece_id),
  unique(candidate_revision_id,active_binding_id,decision_revision), unique(workspace_id,operation_id), unique(id,candidate_revision_id,active_binding_id)
);

create table tongs.thumbnail_candidate_brand_decision_operations (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  workpiece_id uuid not null references tongs.episodes(id) on delete cascade, operation_id text not null,
  operation_fingerprint text not null check(operation_fingerprint~'^[a-f0-9]{64}$'), disposition text not null,
  decision_id uuid null references tongs.thumbnail_candidate_brand_decisions(id), result_json jsonb not null check(jsonb_typeof(result_json)='object'),
  created_at timestamptz not null default now(), created_by uuid null references auth.users(id) on delete set null,
  unique(workspace_id,operation_id)
);

create or replace function tongs.thumbnail_structural_fingerprint(p_value jsonb) returns text
language sql immutable set search_path=pg_catalog,tongs as $$
 select encode(extensions.digest(convert_to(jsonb_strip_nulls(jsonb_build_object(
  'layout_family',p_value->'layout_family','title_block_zone',p_value->'title_block_zone','title_alignment',p_value->'title_alignment',
  'subject_zone',p_value->'subject_zone','subject_scale_class',p_value->'subject_scale_class','crop_mode',p_value->'crop_mode',
  'foreground_layering',p_value->'foreground_layering','background_treatment',p_value->'background_treatment'))::text,'UTF8'),'sha256'),'hex') $$;

create or replace function tongs.thumbnail_candidate_eligibility(p_candidate_id uuid,p_active_binding_id uuid) returns text
language plpgsql stable security definer set search_path=pg_catalog,tongs as $$
declare c tongs.thumbnail_candidate_revisions%rowtype; d text; v_latest_set uuid; v_asset tongs.assets%rowtype;
begin select * into c from tongs.thumbnail_candidate_revisions where id=p_candidate_id;
 if c.id is null then return 'blocked'; end if;
 select * into v_asset from tongs.assets where id=c.composite_asset_id; if v_asset.id is null or v_asset.status<>'ready' or v_asset.content_hash<>c.composite_content_hash then return 'blocked'; end if;
 select id into v_latest_set from tongs.thumbnail_candidate_sets where workpiece_id=c.workpiece_id order by revision desc limit 1;
 if v_latest_set is null or not exists(select 1 from tongs.thumbnail_candidate_set_members where candidate_set_id=v_latest_set and candidate_revision_id=c.id) then return 'historical_brand'; end if;
 if c.candidate_binding_id=p_active_binding_id then return 'current'; end if;
 select decision into d from tongs.thumbnail_candidate_brand_decisions where candidate_revision_id=c.id and active_binding_id=p_active_binding_id order by decision_revision desc limit 1;
 if d='approved' then return 'approved_historical_brand'; end if;
 if d='revoked' then return 'requires_reapproval'; end if;
 return 'requires_reapproval'; end $$;

create or replace function tongs.commit_thumbnail_candidate_set(p_workspace_id uuid,p_workpiece_id uuid,p_expected_current_revision int,p_candidates jsonb,p_operation_id text,p_operation_fingerprint text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare v_user uuid:=auth.uid(); v_op tongs.thumbnail_candidate_set_operations%rowtype; v_current tongs.thumbnail_candidate_sets%rowtype;
 v_binding tongs.workpiece_brand_bindings%rowtype; v_set_id uuid; v_set_revision int; v_set_hash text; v_result jsonb; v_entry jsonb;
 v_candidate tongs.thumbnail_candidate_revisions%rowtype; v_asset tongs.assets%rowtype; v_base tongs.assets%rowtype; v_binding_source tongs.workpiece_brand_bindings%rowtype;
 v_id uuid; v_struct text; v_candidate_hash text; v_ordinal int:=0; v_count int; v_members jsonb:='[]'::jsonb;
begin
 if v_user is null then raise exception 'Not authenticated' using errcode='42501'; end if;
 perform tongs.assert_workspace_role(p_workspace_id,'editor');
 if not exists(select 1 from tongs.episodes where id=p_workpiece_id and workspace_id=p_workspace_id) then raise exception 'workpiece does not belong to workspace' using errcode='22023'; end if;
 if p_operation_id is null or length(btrim(p_operation_id))=0 or p_operation_fingerprint!~'^[a-f0-9]{64}$' then raise exception 'valid operation identity is required' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||p_workpiece_id::text||':brand',0));
 select * into v_binding from tongs.workpiece_brand_bindings where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id order by revision desc limit 1;
 perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||p_workpiece_id::text||':thumbnail-candidate-set',0));
 perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||p_operation_id||':thumbnail-authority-operation',0));
 select * into v_op from tongs.thumbnail_candidate_set_operations where workspace_id=p_workspace_id and operation_id=p_operation_id;
 if found then
  if v_op.operation_fingerprint<>p_operation_fingerprint then return jsonb_build_object('disposition','operation_identity_conflict','code','thumbnail_candidate_set_operation_reused'); end if;
  return v_op.result_json||jsonb_build_object('replayed',true,'current_active_binding_id',v_binding.id);
 end if;
 select * into v_current from tongs.thumbnail_candidate_sets where workpiece_id=p_workpiece_id order by revision desc limit 1;
 if coalesce(v_current.revision,0)<>p_expected_current_revision then
  v_result:=jsonb_build_object('disposition','revision_conflict','code','stale_thumbnail_candidate_set_revision','expected_revision',p_expected_current_revision,'current_revision',coalesce(v_current.revision,0),'current_candidate_set_id',v_current.id);
  insert into tongs.thumbnail_candidate_set_operations(workspace_id,workpiece_id,operation_id,operation_fingerprint,disposition,result_json,created_by) values(p_workspace_id,p_workpiece_id,p_operation_id,p_operation_fingerprint,'revision_conflict',v_result,v_user);
  return v_result;
 end if;
 if jsonb_typeof(p_candidates)<>'array' or jsonb_array_length(p_candidates)<3 then raise exception 'candidate set requires at least three candidates' using errcode='22023'; end if;
 create temporary table if not exists pg_temp.forge_candidate_commit(candidate_id uuid primary key,ordinal int unique,title_id uuid,concept_id uuid,base_hash text,structural_hash text,canonical_hash text) on commit drop;
 truncate pg_temp.forge_candidate_commit;
 for v_entry in select value from jsonb_array_elements(p_candidates) loop
  v_ordinal:=v_ordinal+1; v_id:=nullif(v_entry->>'candidate_revision_id','')::uuid;
  if v_id is not null then
   select * into v_candidate from tongs.thumbnail_candidate_revisions where id=v_id and workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;
   if not found then raise exception 'candidate revision is unavailable' using errcode='22023'; end if;
  else
   v_struct:=tongs.thumbnail_structural_fingerprint(coalesce(v_entry->'structural_composition','{}'::jsonb));
   if coalesce(v_entry->>'structural_fingerprint_version','')<>'forge.thumbnail-structural-composition.v1' or v_entry->>'structural_composition_fingerprint'<>v_struct then raise exception 'structural composition fingerprint mismatch' using errcode='22023'; end if;
   select * into v_asset from tongs.assets where id=(v_entry->>'composite_asset_id')::uuid and workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and asset_kind='thumbnail_composite' and status='ready';
   if not found or v_asset.content_hash<>v_entry->>'composite_content_hash' then raise exception 'verified composite asset mismatch' using errcode='22023'; end if;
   select * into v_base from tongs.assets where id=(v_entry->>'base_artwork_asset_id')::uuid and workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and status='ready';
   if not found or v_base.content_hash<>v_entry->>'base_artwork_content_hash' then raise exception 'verified base artwork mismatch' using errcode='22023'; end if;
   select * into v_binding_source from tongs.workpiece_brand_bindings where id=(v_entry->>'candidate_binding_id')::uuid and workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;
   if not found or v_binding_source.revision<>(v_entry->>'candidate_binding_revision')::int then raise exception 'candidate binding provenance mismatch' using errcode='22023'; end if;
   if v_asset.metadata_json->>'recipe_snapshot_hash'<>v_entry->>'recipe_hash' or v_asset.metadata_json->>'base_asset_hash'<>v_entry->>'base_artwork_content_hash'
    or v_asset.metadata_json#>>'{brand_application_provenance,binding_id}'<>v_entry->>'candidate_binding_id'
    or (v_asset.metadata_json#>>'{brand_application_provenance,binding_revision}')::int<>(v_entry->>'candidate_binding_revision')::int
    or v_asset.metadata_json#>>'{readability_evidence,contract_version}'<>v_entry->>'readability_contract_version'
    or v_asset.metadata_json#>>'{readability_evidence,evaluator_version}'<>v_entry->>'readability_evaluator_version'
    or v_asset.metadata_json#>>'{readability_evidence,evaluation_hash}'<>v_entry->>'readability_evidence_hash'
    or coalesce((v_asset.metadata_json#>>'{readability_evidence,passed}')::boolean,false) is not true
    or v_asset.metadata_json->>'composition_engine_version'<>v_entry->>'compositor_version' then raise exception 'candidate immutable provenance verification failed' using errcode='22023'; end if;
   v_candidate_hash:=encode(extensions.digest(convert_to(jsonb_strip_nulls(jsonb_build_object('recipe_id',v_entry->'recipe_id','recipe_revision',v_entry->'recipe_revision','recipe_hash',v_entry->'recipe_hash','title_revision_id',v_entry->'title_revision_id','title_revision',v_entry->'title_revision','concept_revision_id',v_entry->'concept_revision_id','base_artwork_asset_id',v_entry->'base_artwork_asset_id','base_artwork_content_hash',v_entry->'base_artwork_content_hash','structural_composition_fingerprint',v_struct,'composite_asset_id',v_entry->'composite_asset_id','composite_content_hash',v_entry->'composite_content_hash','candidate_binding_id',v_entry->'candidate_binding_id','candidate_binding_revision',v_entry->'candidate_binding_revision','candidate_binding_content_hash',v_entry->'candidate_binding_content_hash','readability_contract_version',v_entry->'readability_contract_version','readability_evaluator_version',v_entry->'readability_evaluator_version','readability_evidence_hash',v_entry->'readability_evidence_hash','compositor_version',v_entry->'compositor_version'))::text,'UTF8'),'sha256'),'hex');
   v_id:=coalesce(nullif(v_entry->>'new_candidate_revision_id','')::uuid,gen_random_uuid());
   insert into tongs.thumbnail_candidate_revisions(id,workspace_id,workpiece_id,recipe_id,recipe_revision,recipe_hash,title_revision_id,title_revision,concept_revision_id,base_artwork_asset_id,base_artwork_content_hash,structural_composition_fingerprint,structural_fingerprint_version,composite_asset_id,composite_content_hash,candidate_binding_id,candidate_binding_revision,candidate_binding_content_hash,readability_contract_version,readability_evaluator_version,readability_evidence_hash,compositor_version,canonical_content_hash,committed_by)
   values(v_id,p_workspace_id,p_workpiece_id,(v_entry->>'recipe_id')::uuid,(v_entry->>'recipe_revision')::int,v_entry->>'recipe_hash',(v_entry->>'title_revision_id')::uuid,(v_entry->>'title_revision')::int,(v_entry->>'concept_revision_id')::uuid,(v_entry->>'base_artwork_asset_id')::uuid,v_entry->>'base_artwork_content_hash',v_struct,'forge.thumbnail-structural-composition.v1',(v_entry->>'composite_asset_id')::uuid,v_entry->>'composite_content_hash',(v_entry->>'candidate_binding_id')::uuid,(v_entry->>'candidate_binding_revision')::int,nullif(v_entry->>'candidate_binding_content_hash',''),'forge.thumbnail-readability.v1',v_entry->>'readability_evaluator_version',v_entry->>'readability_evidence_hash',v_entry->>'compositor_version',v_candidate_hash,v_user) returning * into v_candidate;
  end if;
  insert into pg_temp.forge_candidate_commit values(v_candidate.id,v_ordinal,v_candidate.title_revision_id,v_candidate.concept_revision_id,v_candidate.base_artwork_content_hash,v_candidate.structural_composition_fingerprint,v_candidate.canonical_content_hash);
 end loop;
 select count(*) into v_count from pg_temp.forge_candidate_commit;
 if exists(select 1 from pg_temp.forge_candidate_commit a join pg_temp.forge_candidate_commit b on a.ordinal<b.ordinal where a.title_id=b.title_id and a.concept_id=b.concept_id and a.base_hash=b.base_hash and a.structural_hash=b.structural_hash) then raise exception 'candidate set contains presentation-only duplicates' using errcode='22023'; end if;
 select jsonb_agg(jsonb_build_object('candidate_revision_id',candidate_id,'candidate_ordinal',ordinal,'candidate_content_hash',canonical_hash) order by ordinal) into v_members from pg_temp.forge_candidate_commit;
 v_set_revision:=coalesce(v_current.revision,0)+1; v_set_id:=gen_random_uuid();
 v_set_hash:=encode(extensions.digest(convert_to(jsonb_build_object('schema','forge.thumbnail-candidate-set.v1','workpiece_id',p_workpiece_id,'revision',v_set_revision,'previous_candidate_set_id',v_current.id,'distinction_contract_version','forge.thumbnail-candidate-distinction.v1','members',v_members)::text,'UTF8'),'sha256'),'hex');
 insert into tongs.thumbnail_candidate_sets(id,workspace_id,workpiece_id,revision,previous_candidate_set_id,candidate_count,content_hash,distinction_contract_version,operation_id,operation_fingerprint,committed_by) values(v_set_id,p_workspace_id,p_workpiece_id,v_set_revision,v_current.id,v_count,v_set_hash,'forge.thumbnail-candidate-distinction.v1',p_operation_id,p_operation_fingerprint,v_user);
 insert into tongs.thumbnail_candidate_set_members(workspace_id,workpiece_id,candidate_set_id,candidate_revision_id,candidate_ordinal,created_by) select p_workspace_id,p_workpiece_id,v_set_id,candidate_id,ordinal,v_user from pg_temp.forge_candidate_commit;
 v_result:=jsonb_build_object('disposition','committed','candidate_set_id',v_set_id,'revision',v_set_revision,'previous_candidate_set_id',v_current.id,'candidate_count',v_count,'content_hash',v_set_hash,'active_binding_id',v_binding.id,'members',v_members);
 insert into tongs.thumbnail_candidate_set_operations(workspace_id,workpiece_id,operation_id,operation_fingerprint,disposition,candidate_set_id,result_json,created_by) values(p_workspace_id,p_workpiece_id,p_operation_id,p_operation_fingerprint,'committed',v_set_id,v_result,v_user);
 return v_result;
end $$;

create or replace function tongs.decide_thumbnail_candidate_historical_brand(p_workspace_id uuid,p_workpiece_id uuid,p_candidate_revision_id uuid,p_candidate_set_id uuid,p_active_binding_id uuid,p_decision text,p_reason text,p_expected_current_decision_id uuid,p_expected_current_decision_revision int,p_operation_id text,p_operation_fingerprint text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare v_user uuid:=auth.uid(); v_binding tongs.workpiece_brand_bindings%rowtype; v_candidate tongs.thumbnail_candidate_revisions%rowtype;
 v_current tongs.thumbnail_candidate_brand_decisions%rowtype; v_op tongs.thumbnail_candidate_brand_decision_operations%rowtype; v_id uuid; v_result jsonb; v_state text;
begin
 if v_user is null then raise exception 'Not authenticated' using errcode='42501'; end if; perform tongs.assert_workspace_role(p_workspace_id,'editor');
 if not exists(select 1 from tongs.episodes where id=p_workpiece_id and workspace_id=p_workspace_id) then raise exception 'workpiece does not belong to workspace' using errcode='22023'; end if;
 if p_decision not in('approved','revoked') or length(btrim(coalesce(p_reason,'')))=0 then raise exception 'valid decision and reason are required' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||p_workpiece_id::text||':brand',0));
 select * into v_binding from tongs.workpiece_brand_bindings where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id order by revision desc limit 1;
 perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||p_workpiece_id::text||':'||p_candidate_revision_id::text||':'||p_active_binding_id::text||':thumbnail-candidate-brand-decision',0));
 perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||p_operation_id||':thumbnail-authority-operation',0));
 select * into v_op from tongs.thumbnail_candidate_brand_decision_operations where workspace_id=p_workspace_id and operation_id=p_operation_id;
 if found then
  if v_op.operation_fingerprint<>p_operation_fingerprint then return jsonb_build_object('disposition','operation_identity_conflict','code','thumbnail_candidate_brand_operation_reused'); end if;
  select tongs.thumbnail_candidate_eligibility(p_candidate_revision_id,v_binding.id) into v_state;
  return v_op.result_json||jsonb_build_object('replayed',true,'current_eligibility',v_state,'current_active_binding_id',v_binding.id);
 end if;
 if v_binding.id is null or v_binding.id<>p_active_binding_id then
  v_result:=jsonb_build_object('disposition','binding_conflict','code','stale_active_brand_binding','current_active_binding_id',v_binding.id,'current_active_binding_revision',v_binding.revision);
  insert into tongs.thumbnail_candidate_brand_decision_operations(workspace_id,workpiece_id,operation_id,operation_fingerprint,disposition,result_json,created_by) values(p_workspace_id,p_workpiece_id,p_operation_id,p_operation_fingerprint,'binding_conflict',v_result,v_user); return v_result;
 end if;
 select * into v_candidate from tongs.thumbnail_candidate_revisions where id=p_candidate_revision_id and workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;
 if not found then raise exception 'candidate revision is unavailable' using errcode='22023'; end if;
 if v_candidate.candidate_binding_id=v_binding.id then raise exception 'current-brand candidate does not require historical authorization' using errcode='22023'; end if;
 if p_candidate_set_id is not null and not exists(select 1 from tongs.thumbnail_candidate_set_members where candidate_set_id=p_candidate_set_id and candidate_revision_id=p_candidate_revision_id and workspace_id=p_workspace_id and workpiece_id=p_workpiece_id) then raise exception 'candidate set audit context mismatch' using errcode='22023'; end if;
 select * into v_current from tongs.thumbnail_candidate_brand_decisions where candidate_revision_id=p_candidate_revision_id and active_binding_id=p_active_binding_id order by decision_revision desc limit 1;
 if (v_current.id is null and (p_expected_current_decision_id is not null or coalesce(p_expected_current_decision_revision,0)<>0)) or (v_current.id is not null and (p_expected_current_decision_id is distinct from v_current.id or p_expected_current_decision_revision is distinct from v_current.decision_revision)) then
  v_result:=jsonb_build_object('disposition','decision_conflict','code','stale_candidate_brand_decision','current_decision_id',v_current.id,'current_decision_revision',coalesce(v_current.decision_revision,0),'eligibility_state',tongs.thumbnail_candidate_eligibility(p_candidate_revision_id,p_active_binding_id));
  insert into tongs.thumbnail_candidate_brand_decision_operations(workspace_id,workpiece_id,operation_id,operation_fingerprint,disposition,result_json,created_by) values(p_workspace_id,p_workpiece_id,p_operation_id,p_operation_fingerprint,'decision_conflict',v_result,v_user); return v_result;
 end if;
 if v_current.id is not null and v_current.decision=p_decision then
  v_result:=jsonb_build_object('disposition','no_change','decision_id',v_current.id,'decision_revision',v_current.decision_revision,'eligibility_state',tongs.thumbnail_candidate_eligibility(p_candidate_revision_id,p_active_binding_id));
  insert into tongs.thumbnail_candidate_brand_decision_operations(workspace_id,workpiece_id,operation_id,operation_fingerprint,disposition,decision_id,result_json,created_by) values(p_workspace_id,p_workpiece_id,p_operation_id,p_operation_fingerprint,'no_change',v_current.id,v_result,v_user); return v_result;
 end if;
 v_id:=gen_random_uuid();
 insert into tongs.thumbnail_candidate_brand_decisions(id,workspace_id,workpiece_id,candidate_revision_id,candidate_set_id,recipe_id,recipe_revision,recipe_hash,composite_asset_id,composite_content_hash,candidate_binding_id,candidate_binding_revision,active_binding_id,active_binding_revision,decision_revision,decision,reason,previous_decision_id,operation_id,operation_fingerprint,created_by)
 values(v_id,p_workspace_id,p_workpiece_id,v_candidate.id,p_candidate_set_id,v_candidate.recipe_id,v_candidate.recipe_revision,v_candidate.recipe_hash,v_candidate.composite_asset_id,v_candidate.composite_content_hash,v_candidate.candidate_binding_id,v_candidate.candidate_binding_revision,v_binding.id,v_binding.revision,coalesce(v_current.decision_revision,0)+1,p_decision,btrim(p_reason),v_current.id,p_operation_id,p_operation_fingerprint,v_user);
 v_state:=case when p_decision='approved' then 'approved_historical_brand' else 'requires_reapproval' end;
 v_result:=jsonb_build_object('disposition',p_decision,'decision_id',v_id,'decision_revision',coalesce(v_current.decision_revision,0)+1,'candidate_revision_id',v_candidate.id,'authorized_active_binding_id',v_binding.id,'eligibility_state',v_state);
 insert into tongs.thumbnail_candidate_brand_decision_operations(workspace_id,workpiece_id,operation_id,operation_fingerprint,disposition,decision_id,result_json,created_by) values(p_workspace_id,p_workpiece_id,p_operation_id,p_operation_fingerprint,p_decision,v_id,v_result,v_user); return v_result;
end $$;

create or replace function tongs.get_thumbnail_candidate_set_projection(p_workspace_id uuid,p_workpiece_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare v_binding tongs.workpiece_brand_bindings%rowtype; v_set tongs.thumbnail_candidate_sets%rowtype; v_members jsonb;
begin perform tongs.assert_workspace_role(p_workspace_id,'viewer');
 perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||p_workpiece_id::text||':brand',0));
 select * into v_binding from tongs.workpiece_brand_bindings where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id order by revision desc limit 1;
 perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||p_workpiece_id::text||':thumbnail-candidate-set',0));
 select * into v_set from tongs.thumbnail_candidate_sets where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id order by revision desc limit 1;
 if v_set.id is null then return jsonb_build_object('candidate_set',null,'active_binding_id',v_binding.id,'candidates','[]'::jsonb); end if;
 select jsonb_agg(to_jsonb(c)||jsonb_build_object('candidate_ordinal',m.candidate_ordinal,'eligibility_state',tongs.thumbnail_candidate_eligibility(c.id,v_binding.id)) order by m.candidate_ordinal) into v_members from tongs.thumbnail_candidate_set_members m join tongs.thumbnail_candidate_revisions c on c.id=m.candidate_revision_id where m.candidate_set_id=v_set.id;
 return jsonb_build_object('candidate_set',to_jsonb(v_set),'active_binding_id',v_binding.id,'active_binding_revision',v_binding.revision,'candidates',coalesce(v_members,'[]'::jsonb)); end $$;

create or replace function tongs.reject_thumbnail_candidate_mutation() returns trigger language plpgsql set search_path=pg_catalog,tongs as $$
begin raise exception 'Thumbnail candidate authority records are immutable.' using errcode='55000'; end $$;

do $$ declare n text; begin foreach n in array array['thumbnail_candidate_revisions','thumbnail_candidate_sets','thumbnail_candidate_set_members','thumbnail_candidate_set_operations','thumbnail_candidate_brand_decisions','thumbnail_candidate_brand_decision_operations'] loop
 execute format('create trigger trg_%I_immutable before update or delete on tongs.%I for each row execute function tongs.reject_thumbnail_candidate_mutation()',n,n);
 execute format('alter table tongs.%I enable row level security',n);
 execute format('create policy %I on tongs.%I for select to authenticated using(tongs.has_workspace_role(workspace_id,''viewer''))',n||'_select',n);
 execute format('grant select on tongs.%I to authenticated',n); execute format('grant all on tongs.%I to service_role',n);
 execute format('revoke insert,update,delete on tongs.%I from authenticated,anon',n);
 end loop; end $$;

revoke all on function tongs.thumbnail_structural_fingerprint(jsonb),tongs.thumbnail_candidate_eligibility(uuid,uuid),tongs.commit_thumbnail_candidate_set(uuid,uuid,int,jsonb,text,text),tongs.decide_thumbnail_candidate_historical_brand(uuid,uuid,uuid,uuid,uuid,text,text,uuid,int,text,text),tongs.get_thumbnail_candidate_set_projection(uuid,uuid) from public,anon;
grant execute on function tongs.commit_thumbnail_candidate_set(uuid,uuid,int,jsonb,text,text),tongs.decide_thumbnail_candidate_historical_brand(uuid,uuid,uuid,uuid,uuid,text,text,uuid,int,text,text),tongs.get_thumbnail_candidate_set_projection(uuid,uuid) to authenticated,service_role;
grant execute on function tongs.thumbnail_structural_fingerprint(jsonb),tongs.thumbnail_candidate_eligibility(uuid,uuid) to service_role;

commit;
