begin;

-- Slice 6: canonical Quench release intent. Publishing execution remains deferred.

alter table tongs.thumbnail_candidate_set_members
  add constraint thumbnail_candidate_set_members_scope_uidx
  unique(candidate_set_id,candidate_revision_id,workspace_id,workpiece_id);

create table tongs.quench_release_manifest_snapshots(
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  workpiece_id uuid not null references tongs.episodes(id) on delete cascade,
  source_file_path text not null check(source_file_path='hammer/release-packet/manifest.v1.json'), source_file_revision bigint not null check(source_file_revision>0),
  source_storage_bucket text not null, source_storage_key text not null, manifest_version int not null check(manifest_version=1),
  manifest_content_hash text not null check(manifest_content_hash~'^[a-f0-9]{64}$'), manifest_bytes bytea not null,
  parsed_manifest_json jsonb not null check(jsonb_typeof(parsed_manifest_json)='object'), validation_contract_version text not null,
  validation_result_json jsonb not null check(jsonb_typeof(validation_result_json)='object'),
  canonical_readiness_status text not null check(canonical_readiness_status in('ready','needs_review','blocked')),
  ready_for_quench boolean not null, snapshotted_at timestamptz not null default now(), snapshotted_by uuid null references auth.users(id) on delete set null,
  unique(id,workspace_id,workpiece_id), unique(workpiece_id,source_file_path,source_file_revision,manifest_content_hash)
);

create table tongs.quench_destination_scopes(
  id uuid primary key default gen_random_uuid(), workspace_id uuid null references tongs.workspaces(id) on delete cascade,
  scope_key text not null, platform text not null check(platform in('youtube','rss')),
  adapter_id text not null check(adapter_id in('forge.youtube','forge.rss')), execution_context text not null check(execution_context='intent_only'),
  connection_ref text null, state text not null default 'active' check(state in('active','disabled')),
  current_capability_revision_id uuid null, created_at timestamptz not null default now(), created_by uuid null references auth.users(id) on delete set null,
  unique(id,workspace_id), unique(scope_key)
);

create table tongs.quench_destination_capability_revisions(
  id uuid primary key default gen_random_uuid(), destination_scope_id uuid not null references tongs.quench_destination_scopes(id),
  revision int not null check(revision>0), contract_version text not null,
  capabilities_json jsonb not null check(jsonb_typeof(capabilities_json)='object'), content_hash text not null check(content_hash~'^[a-f0-9]{64}$'),
  adapter_version text not null, effective_at timestamptz not null default now(), created_at timestamptz not null default now(),
  created_by uuid null references auth.users(id) on delete set null,
  unique(destination_scope_id,revision), unique(destination_scope_id,content_hash), unique(id,destination_scope_id)
);

alter table tongs.quench_destination_scopes add constraint quench_destination_scope_capability_fk
  foreign key(current_capability_revision_id,id) references tongs.quench_destination_capability_revisions(id,destination_scope_id);

create table tongs.quench_release_decision_revisions(
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  workpiece_id uuid not null references tongs.episodes(id) on delete cascade, destination_scope_id uuid not null references tongs.quench_destination_scopes(id),
  revision int not null check(revision>0), previous_decision_id uuid null,
  decision_kind text not null check(decision_kind in('single_candidate','experiment_intent')),
  intent_state text not null check(intent_state in('selected','experiment_planned','cancelled')),
  manifest_snapshot_id uuid not null, manifest_content_hash text not null check(manifest_content_hash~'^[a-f0-9]{64}$'),
  metadata_revision bigint not null check(metadata_revision>0), metadata_content_hash text not null check(metadata_content_hash~'^[a-f0-9]{64}$'),
  metadata_snapshot_json jsonb not null check(jsonb_typeof(metadata_snapshot_json)='object'),
  candidate_set_id uuid not null, candidate_set_revision int not null check(candidate_set_revision>0), candidate_set_content_hash text not null check(candidate_set_content_hash~'^[a-f0-9]{64}$'),
  active_binding_id uuid not null references tongs.workpiece_brand_bindings(id), active_binding_revision int not null check(active_binding_revision>0),
  capability_revision_id uuid not null, capability_content_hash text not null check(capability_content_hash~'^[a-f0-9]{64}$'),
  allocation_unit text null check(allocation_unit is null or allocation_unit='basis_points'),
  decision_content_hash text not null check(decision_content_hash~'^[a-f0-9]{64}$'), created_at timestamptz not null default now(),
  created_by uuid null references auth.users(id) on delete set null,
  unique(workspace_id,workpiece_id,destination_scope_id,revision), unique(id,workspace_id,workpiece_id,destination_scope_id),
  foreign key(manifest_snapshot_id,workspace_id,workpiece_id) references tongs.quench_release_manifest_snapshots(id,workspace_id,workpiece_id),
  foreign key(candidate_set_id,workspace_id,workpiece_id) references tongs.thumbnail_candidate_sets(id,workspace_id,workpiece_id),
  foreign key(capability_revision_id,destination_scope_id) references tongs.quench_destination_capability_revisions(id,destination_scope_id)
);

alter table tongs.quench_release_decision_revisions add constraint quench_decision_previous_same_scope_fk
  foreign key(previous_decision_id,workspace_id,workpiece_id,destination_scope_id)
  references tongs.quench_release_decision_revisions(id,workspace_id,workpiece_id,destination_scope_id);

create table tongs.quench_release_decision_sequences(
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade, workpiece_id uuid not null references tongs.episodes(id) on delete cascade,
  destination_scope_id uuid not null references tongs.quench_destination_scopes(id), current_decision_id uuid null, current_revision int not null default 0 check(current_revision>=0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), primary key(workspace_id,workpiece_id,destination_scope_id),
  foreign key(current_decision_id,workspace_id,workpiece_id,destination_scope_id)
    references tongs.quench_release_decision_revisions(id,workspace_id,workpiece_id,destination_scope_id),
  check((current_decision_id is null)=(current_revision=0))
);

create table tongs.quench_release_candidate_assignments(
  id uuid primary key default gen_random_uuid(), decision_id uuid not null, workspace_id uuid not null, workpiece_id uuid not null,
  destination_scope_id uuid not null, candidate_revision_id uuid not null, candidate_set_id uuid not null,
  assignment_role text not null check(assignment_role in('selected','control','variant')), assignment_ordinal int not null check(assignment_ordinal>0),
  allocation_basis_points int null check(allocation_basis_points between 1 and 10000), composite_asset_id uuid not null references tongs.assets(id),
  composite_content_hash text not null check(composite_content_hash~'^[a-f0-9]{64}$'), recipe_hash text not null check(recipe_hash~'^[a-f0-9]{64}$'),
  candidate_binding_id uuid not null references tongs.workpiece_brand_bindings(id), candidate_binding_revision int not null check(candidate_binding_revision>0),
  readability_evidence_hash text not null check(readability_evidence_hash~'^[a-f0-9]{64}$'), created_at timestamptz not null default now(),
  foreign key(decision_id,workspace_id,workpiece_id,destination_scope_id)
    references tongs.quench_release_decision_revisions(id,workspace_id,workpiece_id,destination_scope_id),
  foreign key(candidate_set_id,candidate_revision_id,workspace_id,workpiece_id)
    references tongs.thumbnail_candidate_set_members(candidate_set_id,candidate_revision_id,workspace_id,workpiece_id),
  unique(decision_id,candidate_revision_id), unique(decision_id,assignment_ordinal)
);

create table tongs.quench_release_operation_receipts(
  operation_id text primary key, operation_fingerprint text not null check(operation_fingerprint~'^[a-f0-9]{64}$'),
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade, workpiece_id uuid not null references tongs.episodes(id) on delete cascade,
  destination_scope_id uuid not null references tongs.quench_destination_scopes(id), mutation_kind text not null check(mutation_kind='commit_release_decision'),
  decision_id uuid not null, decision_revision int not null check(decision_revision>0), immutable_result_json jsonb not null check(jsonb_typeof(immutable_result_json)='object'),
  created_at timestamptz not null default now(), created_by uuid null references auth.users(id) on delete set null,
  foreign key(decision_id,workspace_id,workpiece_id,destination_scope_id)
    references tongs.quench_release_decision_revisions(id,workspace_id,workpiece_id,destination_scope_id)
);

create or replace function tongs.reject_quench_immutable_mutation() returns trigger language plpgsql set search_path=pg_catalog,tongs as $$
begin raise exception 'Quench canonical history is immutable' using errcode='55000'; end $$;

do $$ declare n text; begin foreach n in array array['quench_release_manifest_snapshots','quench_destination_capability_revisions','quench_release_decision_revisions','quench_release_candidate_assignments','quench_release_operation_receipts'] loop
 execute format('create trigger %I before update or delete on tongs.%I for each row execute function tongs.reject_quench_immutable_mutation()', 'trg_'||n||'_immutable',n); end loop; end $$;

create or replace function tongs.validate_quench_release_decision_cardinality() returns trigger language plpgsql set search_path=pg_catalog,tongs as $$
declare d tongs.quench_release_decision_revisions%rowtype; v_count int; v_selected int; v_control int; v_variant int; v_allocated int; v_total int;
begin select * into d from tongs.quench_release_decision_revisions where id=new.id;
 select count(*),count(*) filter(where assignment_role='selected'),count(*) filter(where assignment_role='control'),count(*) filter(where assignment_role='variant'),count(allocation_basis_points),coalesce(sum(allocation_basis_points),0)
 into v_count,v_selected,v_control,v_variant,v_allocated,v_total from tongs.quench_release_candidate_assignments where decision_id=d.id;
 if d.intent_state='cancelled' then if d.previous_decision_id is null or v_count<>0 then raise exception 'cancelled decision requires previous decision and zero assignments' using errcode='23514'; end if;
 elsif d.decision_kind='single_candidate' then if d.intent_state<>'selected' or v_count<>1 or v_selected<>1 or v_control<>0 or v_variant<>0 or v_allocated<>0 then raise exception 'invalid single-candidate assignment set' using errcode='23514'; end if;
 elsif d.decision_kind='experiment_intent' then if d.intent_state<>'experiment_planned' or v_count<2 or v_selected<>0 or v_control<>1 or v_variant<1 or (v_allocated<>0 and (v_allocated<>v_count or v_total<>10000)) then raise exception 'invalid experiment assignment set' using errcode='23514'; end if; end if;
 return null; end $$;

create constraint trigger trg_quench_decision_cardinality after insert on tongs.quench_release_decision_revisions
 deferrable initially deferred for each row execute function tongs.validate_quench_release_decision_cardinality();

-- Service-only: exact bytes are downloaded and hashed by Tongs before this snapshot function is called.
create or replace function tongs.snapshot_quench_release_manifest(p_workspace_id uuid,p_workpiece_id uuid,p_source_revision bigint,p_manifest_bytes bytea,p_manifest_hash text,p_parsed jsonb,p_validation jsonb,p_status text,p_ready boolean)
returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare f tongs.workpiece_files%rowtype; v_id uuid; v_hash text:=lower(p_manifest_hash);
begin
 if current_user not in('postgres','service_role','supabase_admin') then return jsonb_build_object('disposition','denied','code','service_role_required'); end if;
 select * into f from tongs.workpiece_files where workpiece_id=p_workpiece_id and path='hammer/release-packet/manifest.v1.json' for update;
 if not found then return jsonb_build_object('disposition','blocked','code','manifest_not_found'); end if;
 if f.revision<>p_source_revision or lower(f.hash_value)<>v_hash or encode(extensions.digest(p_manifest_bytes,'sha256'),'hex')<>v_hash then return jsonb_build_object('disposition','blocked','code','manifest_hash_mismatch'); end if;
 if p_parsed->>'packet_kind'<>'quench_release_packet' or (p_parsed->>'workpiece_id')::uuid<>p_workpiece_id or coalesce((p_parsed->>'workspace_id')::uuid,p_workspace_id)<>p_workspace_id then return jsonb_build_object('disposition','blocked','code','manifest_identity_mismatch'); end if;
 insert into tongs.quench_release_manifest_snapshots(workspace_id,workpiece_id,source_file_path,source_file_revision,source_storage_bucket,source_storage_key,manifest_version,manifest_content_hash,manifest_bytes,parsed_manifest_json,validation_contract_version,validation_result_json,canonical_readiness_status,ready_for_quench)
 values(p_workspace_id,p_workpiece_id,f.path,f.revision,f.storage_bucket,f.storage_key,1,v_hash,p_manifest_bytes,p_parsed,'forge.hammer-quench-manifest-validation.v1',p_validation,p_status,p_ready)
 on conflict(workpiece_id,source_file_path,source_file_revision,manifest_content_hash) do nothing;
 select id into v_id from tongs.quench_release_manifest_snapshots where workpiece_id=p_workpiece_id and source_file_path=f.path and source_file_revision=f.revision and manifest_content_hash=v_hash;
 return jsonb_build_object('disposition','verified','manifest_snapshot_id',v_id,'manifest_content_hash',v_hash); exception when others then return jsonb_build_object('disposition','blocked','code','manifest_invalid'); end $$;

create or replace function tongs.quench_release_decision_applicability(p_decision_id uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,tongs as $$
declare d tongs.quench_release_decision_revisions%rowtype; s tongs.quench_release_decision_sequences%rowtype; m tongs.quench_release_manifest_snapshots%rowtype;
 f tongs.workpiece_files%rowtype; c tongs.thumbnail_candidate_sets%rowtype; b tongs.workpiece_brand_bindings%rowtype; scope tongs.quench_destination_scopes%rowtype; v_reason text;
begin select * into d from tongs.quench_release_decision_revisions where id=p_decision_id; if not found then return jsonb_build_object('state','blocked','record_posture','historical','reason_codes',jsonb_build_array('decision_not_found')); end if;
 select * into s from tongs.quench_release_decision_sequences where workspace_id=d.workspace_id and workpiece_id=d.workpiece_id and destination_scope_id=d.destination_scope_id;
 if s.current_decision_id is distinct from d.id then return jsonb_build_object('state','superseded','record_posture','historical','reason_codes','[]'::jsonb); end if;
 select * into m from tongs.quench_release_manifest_snapshots where id=d.manifest_snapshot_id;
 select * into f from tongs.workpiece_files where workpiece_id=d.workpiece_id and path=m.source_file_path;
 if m.id is null or f.workpiece_id is null then v_reason:='manifest_unavailable';
 elsif lower(f.hash_value)<>m.manifest_content_hash or f.revision<>m.source_file_revision then return jsonb_build_object('state','requires_review','record_posture','current_revision','reason_codes',jsonb_build_array('manifest_advanced')); end if;
 if v_reason is null then select * into f from tongs.workpiece_files where workpiece_id=d.workpiece_id and path='metadata.json'; if not found then v_reason:='metadata_unavailable'; elsif f.revision<>d.metadata_revision or lower(f.hash_value)<>d.metadata_content_hash then return jsonb_build_object('state','requires_review','record_posture','current_revision','reason_codes',jsonb_build_array('metadata_advanced')); end if; end if;
 select * into b from tongs.workpiece_brand_bindings where workpiece_id=d.workpiece_id order by revision desc limit 1; if b.id is null then v_reason:=coalesce(v_reason,'binding_unavailable'); elsif b.id<>d.active_binding_id then return jsonb_build_object('state','requires_review','record_posture','current_revision','reason_codes',jsonb_build_array('binding_advanced')); end if;
 select * into c from tongs.thumbnail_candidate_sets where workpiece_id=d.workpiece_id order by revision desc limit 1; if c.id is null then v_reason:=coalesce(v_reason,'candidate_set_unavailable'); elsif c.id<>d.candidate_set_id then return jsonb_build_object('state','requires_review','record_posture','current_revision','reason_codes',jsonb_build_array('candidate_set_advanced')); end if;
 select * into scope from tongs.quench_destination_scopes where id=d.destination_scope_id; if scope.id is null or scope.state<>'active' then v_reason:=coalesce(v_reason,'destination_unavailable'); elsif scope.current_capability_revision_id<>d.capability_revision_id then return jsonb_build_object('state','requires_review','record_posture','current_revision','reason_codes',jsonb_build_array('capability_advanced')); end if;
 if v_reason is null and exists(select 1 from tongs.quench_release_candidate_assignments a join tongs.thumbnail_candidate_revisions r on r.id=a.candidate_revision_id left join tongs.assets x on x.id=a.composite_asset_id where a.decision_id=d.id and (x.id is null or x.status<>'ready' or x.content_hash<>a.composite_content_hash or tongs.thumbnail_candidate_eligibility(r.id,b.id) not in('current','approved_historical_brand'))) then v_reason:='candidate_verification_blocked'; end if;
 if v_reason is not null then return jsonb_build_object('state','blocked','record_posture','current_revision','reason_codes',jsonb_build_array(v_reason)); end if;
 return jsonb_build_object('state','current','record_posture','current_revision','reason_codes','[]'::jsonb); end $$;

create or replace function tongs.commit_quench_release_decision(p_workspace_id uuid,p_workpiece_id uuid,p_destination_scope_id uuid,p_expected_decision_id uuid,p_expected_revision int,p_decision_kind text,p_intent_state text,p_manifest_snapshot_id uuid,p_metadata_revision bigint,p_metadata_hash text,p_candidate_set_id uuid,p_active_binding_id uuid,p_capability_revision_id uuid,p_assignments jsonb,p_operation_id text,p_operation_fingerprint text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare v_user uuid:=auth.uid(); v_manifest_file tongs.workpiece_files%rowtype; v_metadata_file tongs.workpiece_files%rowtype; v_manifest tongs.quench_release_manifest_snapshots%rowtype;
 v_binding tongs.workpiece_brand_bindings%rowtype; v_set tongs.thumbnail_candidate_sets%rowtype; v_scope tongs.quench_destination_scopes%rowtype; v_cap tongs.quench_destination_capability_revisions%rowtype;
 v_seq tongs.quench_release_decision_sequences%rowtype; v_receipt tongs.quench_release_operation_receipts%rowtype; v_current tongs.quench_release_decision_revisions%rowtype;
 v_entry jsonb; v_candidate tongs.thumbnail_candidate_revisions%rowtype; v_asset tongs.assets%rowtype; v_id uuid:=gen_random_uuid(); v_revision int; v_ordered jsonb; v_hash text; v_result jsonb; v_count int:=0;
begin
 -- Authorization precedes every lock, receipt read, replay, and mutation.
 if v_user is null or p_workspace_id is null or not tongs.has_workspace_role(p_workspace_id,'editor') then return jsonb_build_object('disposition','denied','code','editor_required'); end if;
 if not exists(select 1 from tongs.episodes where id=p_workpiece_id and workspace_id=p_workspace_id) then return jsonb_build_object('disposition','denied','code','workspace_workpiece_mismatch'); end if;
 if p_operation_id is null or length(btrim(p_operation_id))=0 or p_operation_fingerprint!~'^[a-f0-9]{64}$' then return jsonb_build_object('disposition','invalid','code','invalid_operation_identity'); end if;
 -- Global order: manifest, metadata, binding, candidate set, capability, decision, operation.
 select * into v_manifest_file from tongs.workpiece_files where workpiece_id=p_workpiece_id and path='hammer/release-packet/manifest.v1.json' for update;
 select * into v_metadata_file from tongs.workpiece_files where workpiece_id=p_workpiece_id and path='metadata.json' for update;
 perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||p_workpiece_id::text||':brand',0));
 select * into v_binding from tongs.workpiece_brand_bindings where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id order by revision desc limit 1;
 perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||p_workpiece_id::text||':thumbnail-candidate-set',0));
 select * into v_set from tongs.thumbnail_candidate_sets where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id order by revision desc limit 1;
 perform pg_advisory_xact_lock(hashtextextended(p_destination_scope_id::text||':quench-capability',0));
 select * into v_scope from tongs.quench_destination_scopes where id=p_destination_scope_id and state='active';
 perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||p_workpiece_id::text||':'||p_destination_scope_id::text||':quench-decision',0));
 insert into tongs.quench_release_decision_sequences(workspace_id,workpiece_id,destination_scope_id) values(p_workspace_id,p_workpiece_id,p_destination_scope_id) on conflict do nothing;
 select * into v_seq from tongs.quench_release_decision_sequences where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and destination_scope_id=p_destination_scope_id for update;
 perform pg_advisory_xact_lock(hashtextextended(p_operation_id||':quench-operation',0));
 select * into v_receipt from tongs.quench_release_operation_receipts where operation_id=p_operation_id;
 if found then if v_receipt.workspace_id<>p_workspace_id or v_receipt.workpiece_id<>p_workpiece_id or v_receipt.destination_scope_id<>p_destination_scope_id or v_receipt.operation_fingerprint<>p_operation_fingerprint then return jsonb_build_object('disposition','operation_conflict','code','operation_identity_reused'); end if;
  return v_receipt.immutable_result_json||jsonb_build_object('disposition','replayed','applicability',tongs.quench_release_decision_applicability(v_receipt.decision_id)); end if;
 if v_manifest_file.workpiece_id is null then return jsonb_build_object('disposition','blocked','code','manifest_unavailable'); end if;
 if v_metadata_file.workpiece_id is null then return jsonb_build_object('disposition','blocked','code','metadata_unavailable'); end if;
 if v_binding.id is null or v_binding.id<>p_active_binding_id then return jsonb_build_object('disposition','binding_conflict'); end if;
 if v_set.id is null or v_set.id<>p_candidate_set_id then return jsonb_build_object('disposition','candidate_set_conflict'); end if;
 if v_scope.id is null or (v_scope.workspace_id is not null and v_scope.workspace_id<>p_workspace_id) then return jsonb_build_object('disposition','capability_conflict'); end if;
 select * into v_cap from tongs.quench_destination_capability_revisions where id=p_capability_revision_id and destination_scope_id=p_destination_scope_id;
 if not found or v_scope.current_capability_revision_id<>v_cap.id then return jsonb_build_object('disposition','capability_conflict'); end if;
 select * into v_manifest from tongs.quench_release_manifest_snapshots where id=p_manifest_snapshot_id and workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;
 if not found or v_manifest.source_file_revision<>v_manifest_file.revision or v_manifest.manifest_content_hash<>lower(v_manifest_file.hash_value) then return jsonb_build_object('disposition','manifest_conflict'); end if;
 if v_metadata_file.revision<>p_metadata_revision or lower(v_metadata_file.hash_value)<>lower(p_metadata_hash) then return jsonb_build_object('disposition','metadata_conflict'); end if;
 if v_seq.current_decision_id is distinct from p_expected_decision_id or v_seq.current_revision<>p_expected_revision then return jsonb_build_object('disposition','revision_conflict','current_decision_id',v_seq.current_decision_id,'current_revision',v_seq.current_revision); end if;
 if p_intent_state='cancelled' then if v_seq.current_decision_id is null or p_decision_kind not in('single_candidate','experiment_intent') or coalesce(jsonb_array_length(p_assignments),0)<>0 then return jsonb_build_object('disposition','invalid_assignment_set'); end if;
 else if jsonb_typeof(p_assignments)<>'array' then return jsonb_build_object('disposition','invalid_assignment_set'); end if; end if;
 create temporary table if not exists pg_temp.quench_assignments(ordinal int primary key,role text,candidate_id uuid unique,allocation int,composite_id uuid,composite_hash text,recipe_hash text,binding_id uuid,binding_revision int,readability_hash text) on commit drop; truncate pg_temp.quench_assignments;
 for v_entry in select value from jsonb_array_elements(coalesce(p_assignments,'[]'::jsonb)) loop v_count:=v_count+1;
  select * into v_candidate from tongs.thumbnail_candidate_revisions where id=(v_entry->>'candidate_revision_id')::uuid and workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;
  if not found or not exists(select 1 from tongs.thumbnail_candidate_set_members where candidate_set_id=v_set.id and candidate_revision_id=v_candidate.id and workspace_id=p_workspace_id and workpiece_id=p_workpiece_id) then return jsonb_build_object('disposition','invalid_assignment_set','code','candidate_not_in_set'); end if;
  select * into v_asset from tongs.assets where id=v_candidate.composite_asset_id; if not found or v_asset.status<>'ready' or v_asset.content_hash<>v_candidate.composite_content_hash then return jsonb_build_object('disposition','asset_verification_blocked'); end if;
  if tongs.thumbnail_candidate_eligibility(v_candidate.id,v_binding.id) not in('current','approved_historical_brand') then return jsonb_build_object('disposition','candidate_ineligible'); end if;
  insert into pg_temp.quench_assignments values((v_entry->>'assignment_ordinal')::int,v_entry->>'assignment_role',v_candidate.id,nullif(v_entry->>'allocation_basis_points','')::int,v_candidate.composite_asset_id,v_candidate.composite_content_hash,v_candidate.recipe_hash,v_candidate.candidate_binding_id,v_candidate.candidate_binding_revision,v_candidate.readability_evidence_hash);
 end loop;
 if p_intent_state='selected' and (p_decision_kind<>'single_candidate' or v_count<>1 or (select count(*) from pg_temp.quench_assignments where role='selected')<>1 or exists(select 1 from pg_temp.quench_assignments where allocation is not null)) then return jsonb_build_object('disposition','invalid_assignment_set'); end if;
 if p_intent_state='experiment_planned' and (p_decision_kind<>'experiment_intent' or v_count<2 or (select count(*) from pg_temp.quench_assignments where role='control')<>1 or (select count(*) from pg_temp.quench_assignments where role='variant')<1 or exists(select 1 from pg_temp.quench_assignments where role='selected') or ((select count(allocation) from pg_temp.quench_assignments)>0 and ((select count(allocation) from pg_temp.quench_assignments)<>v_count or (select sum(allocation) from pg_temp.quench_assignments)<>10000))) then return jsonb_build_object('disposition','invalid_assignment_set'); end if;
 select coalesce(jsonb_agg(jsonb_build_object('candidate_revision_id',candidate_id,'assignment_role',role,'assignment_ordinal',ordinal,'allocation_basis_points',allocation,'composite_asset_id',composite_id,'composite_content_hash',composite_hash,'recipe_hash',recipe_hash,'candidate_binding_id',binding_id,'candidate_binding_revision',binding_revision,'readability_evidence_hash',readability_hash) order by ordinal),'[]'::jsonb) into v_ordered from pg_temp.quench_assignments;
 v_hash:=encode(extensions.digest(convert_to(jsonb_strip_nulls(jsonb_build_object('workspace_id',p_workspace_id,'workpiece_id',p_workpiece_id,'destination_scope_id',p_destination_scope_id,'decision_kind',p_decision_kind,'intent_state',p_intent_state,'manifest_snapshot_id',v_manifest.id,'manifest_hash',v_manifest.manifest_content_hash,'metadata_revision',v_metadata_file.revision,'metadata_hash',lower(v_metadata_file.hash_value),'candidate_set_id',v_set.id,'candidate_set_revision',v_set.revision,'candidate_set_hash',v_set.content_hash,'active_binding_id',v_binding.id,'active_binding_revision',v_binding.revision,'capability_revision_id',v_cap.id,'capability_hash',v_cap.content_hash,'assignments',v_ordered))::text,'UTF8'),'sha256'),'hex');
 if p_operation_fingerprint<>v_hash then return jsonb_build_object('disposition','operation_conflict','code','operation_fingerprint_mismatch','canonical_fingerprint',v_hash); end if;
 select * into v_current from tongs.quench_release_decision_revisions where id=v_seq.current_decision_id;
 if v_current.decision_content_hash=v_hash then
  v_result:=jsonb_build_object('disposition','no_change','decision_id',v_current.id,'decision_revision',v_current.revision,'decision_content_hash',v_hash);
  insert into tongs.quench_release_operation_receipts(operation_id,operation_fingerprint,workspace_id,workpiece_id,destination_scope_id,mutation_kind,decision_id,decision_revision,immutable_result_json,created_by) values(p_operation_id,v_hash,p_workspace_id,p_workpiece_id,p_destination_scope_id,'commit_release_decision',v_current.id,v_current.revision,v_result,v_user);
  return v_result||jsonb_build_object('applicability',tongs.quench_release_decision_applicability(v_current.id));
 end if;
 v_revision:=v_seq.current_revision+1;
 insert into tongs.quench_release_decision_revisions(id,workspace_id,workpiece_id,destination_scope_id,revision,previous_decision_id,decision_kind,intent_state,manifest_snapshot_id,manifest_content_hash,metadata_revision,metadata_content_hash,metadata_snapshot_json,candidate_set_id,candidate_set_revision,candidate_set_content_hash,active_binding_id,active_binding_revision,capability_revision_id,capability_content_hash,allocation_unit,decision_content_hash,created_by)
 values(v_id,p_workspace_id,p_workpiece_id,p_destination_scope_id,v_revision,v_seq.current_decision_id,p_decision_kind,p_intent_state,v_manifest.id,v_manifest.manifest_content_hash,v_metadata_file.revision,lower(v_metadata_file.hash_value),jsonb_build_object('revision',v_metadata_file.revision,'content_hash',lower(v_metadata_file.hash_value)),v_set.id,v_set.revision,v_set.content_hash,v_binding.id,v_binding.revision,v_cap.id,v_cap.content_hash,case when exists(select 1 from pg_temp.quench_assignments where allocation is not null) then 'basis_points' end,v_hash,v_user);
 insert into tongs.quench_release_candidate_assignments(decision_id,workspace_id,workpiece_id,destination_scope_id,candidate_revision_id,candidate_set_id,assignment_role,assignment_ordinal,allocation_basis_points,composite_asset_id,composite_content_hash,recipe_hash,candidate_binding_id,candidate_binding_revision,readability_evidence_hash)
 select v_id,p_workspace_id,p_workpiece_id,p_destination_scope_id,candidate_id,v_set.id,role,ordinal,allocation,composite_id,composite_hash,recipe_hash,binding_id,binding_revision,readability_hash from pg_temp.quench_assignments;
 update tongs.quench_release_decision_sequences set current_decision_id=v_id,current_revision=v_revision,updated_at=now() where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and destination_scope_id=p_destination_scope_id;
 v_result:=jsonb_build_object('disposition','committed','decision_id',v_id,'decision_revision',v_revision,'decision_content_hash',v_hash);
 insert into tongs.quench_release_operation_receipts(operation_id,operation_fingerprint,workspace_id,workpiece_id,destination_scope_id,mutation_kind,decision_id,decision_revision,immutable_result_json,created_by) values(p_operation_id,v_hash,p_workspace_id,p_workpiece_id,p_destination_scope_id,'commit_release_decision',v_id,v_revision,v_result,v_user);
 return v_result||jsonb_build_object('applicability',tongs.quench_release_decision_applicability(v_id));
exception when unique_violation then select * into v_receipt from tongs.quench_release_operation_receipts where operation_id=p_operation_id; if found and v_receipt.operation_fingerprint=p_operation_fingerprint and v_receipt.workspace_id=p_workspace_id and v_receipt.workpiece_id=p_workpiece_id and v_receipt.destination_scope_id=p_destination_scope_id then return v_receipt.immutable_result_json||jsonb_build_object('disposition','replayed','applicability',tongs.quench_release_decision_applicability(v_receipt.decision_id)); end if; return jsonb_build_object('disposition','operation_conflict'); end $$;

-- System intent-only destination scopes. Capability hashes are canonical jsonb SHA-256.
insert into tongs.quench_destination_scopes(id,scope_key,platform,adapter_id,execution_context,state)
values('81000000-0000-4000-8000-000000000001','system:youtube:intent-only','youtube','forge.youtube','intent_only','active'),
      ('81000000-0000-4000-8000-000000000002','system:rss:intent-only','rss','forge.rss','intent_only','active');
insert into tongs.quench_destination_capability_revisions(id,destination_scope_id,revision,contract_version,capabilities_json,content_hash,adapter_version)
select id,scope_id,1,'forge.quench-destination-capabilities.v1',caps,encode(extensions.digest(convert_to(caps::text,'UTF8'),'sha256'),'hex'),'stub-v1' from (values
 ('82000000-0000-4000-8000-000000000001'::uuid,'81000000-0000-4000-8000-000000000001'::uuid,'{"supports_experiment_intent":true,"supports_thumbnail_selection":true,"supports_thumbnail_rotation":false,"supports_schedule":true,"supports_premiere":true,"supports_video":true,"supports_audio_only":false}'::jsonb),
 ('82000000-0000-4000-8000-000000000002'::uuid,'81000000-0000-4000-8000-000000000002'::uuid,'{"supports_experiment_intent":true,"supports_thumbnail_selection":true,"supports_thumbnail_rotation":false,"supports_schedule":true,"supports_premiere":false,"supports_video":false,"supports_audio_only":true}'::jsonb)
) x(id,scope_id,caps);
update tongs.quench_destination_scopes set current_capability_revision_id=case platform when 'youtube' then '82000000-0000-4000-8000-000000000001'::uuid else '82000000-0000-4000-8000-000000000002'::uuid end;

do $$ declare n text; begin foreach n in array array['quench_release_manifest_snapshots','quench_destination_scopes','quench_destination_capability_revisions','quench_release_decision_revisions','quench_release_decision_sequences','quench_release_candidate_assignments','quench_release_operation_receipts'] loop
 execute format('alter table tongs.%I enable row level security',n);
 execute format('revoke insert,update,delete on tongs.%I from authenticated',n); execute format('grant select on tongs.%I to authenticated',n); end loop; end $$;
create policy quench_release_manifest_snapshots_viewer on tongs.quench_release_manifest_snapshots for select to authenticated using(tongs.has_workspace_role(workspace_id,'viewer'));
create policy quench_destination_scopes_viewer on tongs.quench_destination_scopes for select to authenticated using(workspace_id is null or tongs.has_workspace_role(workspace_id,'viewer'));
create policy quench_destination_capability_revisions_viewer on tongs.quench_destination_capability_revisions for select to authenticated using(exists(select 1 from tongs.quench_destination_scopes s where s.id=destination_scope_id and (s.workspace_id is null or tongs.has_workspace_role(s.workspace_id,'viewer'))));
create policy quench_release_decision_revisions_viewer on tongs.quench_release_decision_revisions for select to authenticated using(tongs.has_workspace_role(workspace_id,'viewer'));
create policy quench_release_decision_sequences_viewer on tongs.quench_release_decision_sequences for select to authenticated using(tongs.has_workspace_role(workspace_id,'viewer'));
create policy quench_release_candidate_assignments_viewer on tongs.quench_release_candidate_assignments for select to authenticated using(tongs.has_workspace_role(workspace_id,'viewer'));
create policy quench_release_operation_receipts_viewer on tongs.quench_release_operation_receipts for select to authenticated using(tongs.has_workspace_role(workspace_id,'viewer'));

revoke all on function tongs.reject_quench_immutable_mutation(),tongs.validate_quench_release_decision_cardinality() from public,anon,authenticated;
revoke all on function tongs.snapshot_quench_release_manifest(uuid,uuid,bigint,bytea,text,jsonb,jsonb,text,boolean) from public,anon,authenticated;
grant execute on function tongs.snapshot_quench_release_manifest(uuid,uuid,bigint,bytea,text,jsonb,jsonb,text,boolean) to service_role;
revoke all on function tongs.quench_release_decision_applicability(uuid) from public,anon;
grant execute on function tongs.quench_release_decision_applicability(uuid) to authenticated,service_role;
revoke all on function tongs.commit_quench_release_decision(uuid,uuid,uuid,uuid,int,text,text,uuid,bigint,text,uuid,uuid,uuid,jsonb,text,text) from public,anon;
grant execute on function tongs.commit_quench_release_decision(uuid,uuid,uuid,uuid,int,text,text,uuid,bigint,text,uuid,uuid,uuid,jsonb,text,text) to authenticated,service_role;

comment on table tongs.quench_release_manifest_snapshots is 'Immutable exact Hammer manifest bytes verified by Tongs.';
comment on table tongs.quench_release_decision_revisions is 'Immutable Quench publication selection or experiment intent; not provider execution evidence.';
comment on function tongs.commit_quench_release_decision(uuid,uuid,uuid,uuid,int,text,text,uuid,bigint,text,uuid,uuid,uuid,jsonb,text,text) is 'Authorization-first, lock-ordered canonical Quench decision commit authority.';

commit;
