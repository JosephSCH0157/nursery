-- Hearth canonical evidence and producer-preflight authority.
-- Typed JSON is the immutable contract snapshot. Normalized rows are
-- transactionally generated, read-only projections of that snapshot.

begin;
create table tongs.hearth_research_artifact_revisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  workpiece_id uuid not null,
  revision bigint not null check(revision > 0),
  previous_revision_id uuid,
  previous_revision bigint,
  brief_fingerprint text not null check(length(btrim(brief_fingerprint)) between 8 and 256),
  artifact_status text not null check(artifact_status in ('complete','partial')),
  artifact_json jsonb not null check(jsonb_typeof(artifact_json)='object'),
  artifact_content_hash text not null check(artifact_content_hash ~ '^[0-9a-f]{64}$'),
  projection_content_hash text not null check(projection_content_hash ~ '^[0-9a-f]{64}$'),
  immutable_revision_hash text not null check(immutable_revision_hash ~ '^[0-9a-f]{64}$'),
  contract_version text not null check(length(btrim(contract_version)) between 3 and 120),
  committed_by uuid not null references auth.users(id),
  committed_at timestamptz not null default now(),
  unique(id,workspace_id,workpiece_id,revision),
  unique(workspace_id,workpiece_id,revision),
  unique(workspace_id,workpiece_id,immutable_revision_hash),
  foreign key(workpiece_id,workspace_id) references tongs.episodes(id,workspace_id) on delete cascade,
  foreign key(previous_revision_id,workspace_id,workpiece_id,previous_revision)
    references tongs.hearth_research_artifact_revisions(id,workspace_id,workpiece_id,revision),
  check((previous_revision_id is null)=(previous_revision is null)),
  check((revision=1 and previous_revision_id is null) or
        (revision>1 and previous_revision_id is not null and previous_revision=revision-1))
);
create table tongs.workpiece_hearth_research_sequences (
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  workpiece_id uuid not null,
  current_artifact_id uuid,
  current_revision bigint not null default 0 check(current_revision>=0),
  updated_at timestamptz not null default now(),
  primary key(workspace_id,workpiece_id),
  foreign key(workpiece_id,workspace_id) references tongs.episodes(id,workspace_id) on delete cascade,
  foreign key(current_artifact_id,workspace_id,workpiece_id,current_revision)
    references tongs.hearth_research_artifact_revisions(id,workspace_id,workpiece_id,revision),
  check((current_artifact_id is null and current_revision=0) or
        (current_artifact_id is not null and current_revision>0))
);
create table tongs.hearth_research_artifact_claims (
  artifact_id uuid not null,
  workspace_id uuid not null,
  workpiece_id uuid not null,
  artifact_revision bigint not null,
  ordinal integer not null check(ordinal>=0),
  claim_key text not null check(length(btrim(claim_key)) between 1 and 240),
  claim_text text not null check(length(btrim(claim_text))>0),
  claim_kind text,
  provenance_status text not null check(provenance_status in (
    'creator_supplied_unverified','verified_by_current_run','reported_by_accessible_secondary',
    'conflicting','unsupported','inaccessible_source_only','opinion_interpretation','uncertain'
  )),
  claim_scope text not null check(claim_scope in ('current_subject','adjacent_context')),
  source_ids text[] not null default '{}',
  entity_json jsonb,
  content_hash text not null check(content_hash ~ '^[0-9a-f]{64}$'),
  primary key(artifact_id,ordinal),
  unique(artifact_id,claim_key),
  foreign key(artifact_id,workspace_id,workpiece_id,artifact_revision)
    references tongs.hearth_research_artifact_revisions(id,workspace_id,workpiece_id,revision) on delete cascade,
  check(entity_json is null or jsonb_typeof(entity_json)='object')
);
create table tongs.hearth_research_evidence_snapshots (
  artifact_id uuid not null,
  workspace_id uuid not null,
  workpiece_id uuid not null,
  artifact_revision bigint not null,
  ordinal integer not null check(ordinal>=0),
  evidence_key text not null check(length(btrim(evidence_key)) between 1 and 240),
  source_id text not null check(length(btrim(source_id))>0),
  source_revision_id uuid,
  source_revision bigint,
  evidence_state text not null check(evidence_state in ('inspected','inaccessible')),
  authority text not null,
  access_failure_reason text,
  citation_json jsonb not null check(jsonb_typeof(citation_json)='object'),
  excerpt text check(excerpt is null or length(excerpt)<=8192),
  inspected_at timestamptz,
  content_hash text not null check(content_hash ~ '^[0-9a-f]{64}$'),
  primary key(artifact_id,ordinal),
  unique(artifact_id,evidence_key),
  foreign key(artifact_id,workspace_id,workpiece_id,artifact_revision)
    references tongs.hearth_research_artifact_revisions(id,workspace_id,workpiece_id,revision) on delete cascade,
  check((source_revision_id is null)=(source_revision is null))
);
create table tongs.hearth_research_claim_evidence (
  artifact_id uuid not null,
  claim_ordinal integer not null,
  evidence_ordinal integer not null,
  workspace_id uuid not null,
  workpiece_id uuid not null,
  relationship text not null check(relationship in ('supports','reports','conflicts','context','inaccessible_only')),
  primary key(artifact_id,claim_ordinal,evidence_ordinal),
  foreign key(artifact_id,claim_ordinal) references tongs.hearth_research_artifact_claims(artifact_id,ordinal) on delete cascade,
  foreign key(artifact_id,evidence_ordinal) references tongs.hearth_research_evidence_snapshots(artifact_id,ordinal) on delete cascade
);
create table tongs.hearth_research_operation_receipts (
  operation_id text primary key check(operation_id ~ '^forge:hearth-research:[a-zA-Z0-9._:-]{8,180}$'),
  operation_fingerprint text not null check(operation_fingerprint ~ '^[0-9a-f]{64}$'),
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  workpiece_id uuid not null,
  result_artifact_id uuid not null,
  result_revision bigint not null,
  immutable_result_json jsonb not null check(jsonb_typeof(immutable_result_json)='object'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key(result_artifact_id,workspace_id,workpiece_id,result_revision)
    references tongs.hearth_research_artifact_revisions(id,workspace_id,workpiece_id,revision),
  foreign key(workpiece_id,workspace_id) references tongs.episodes(id,workspace_id) on delete cascade
);
-- An immutable review snapshot gives a pre-approval script stable identity.
-- It is distinct from the mutable working file and from later creator approval.
create table tongs.hearth_script_review_revisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  workpiece_id uuid not null,
  source_file_path text not null check(source_file_path='script/script.md'),
  source_file_revision bigint not null check(source_file_revision>0),
  script_content_hash text not null check(script_content_hash ~ '^[0-9a-f]{64}$'),
  script_text text not null,
  snapshot_content_hash text not null check(snapshot_content_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(id,workspace_id,workpiece_id),
  unique(workspace_id,workpiece_id,source_file_revision,script_content_hash),
  foreign key(workpiece_id,workspace_id) references tongs.episodes(id,workspace_id) on delete cascade
);
create table tongs.hearth_editorial_preflight_reports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  workpiece_id uuid not null,
  revision bigint not null check(revision>0),
  previous_revision_id uuid,
  previous_revision bigint,
  script_review_revision_id uuid not null,
  source_file_path text not null check(source_file_path='script/script.md'),
  source_file_revision bigint not null check(source_file_revision>0),
  script_content_hash text not null check(script_content_hash ~ '^[0-9a-f]{64}$'),
  research_artifact_id uuid,
  research_artifact_revision bigint,
  research_artifact_hash text check(research_artifact_hash is null or research_artifact_hash ~ '^[0-9a-f]{64}$'),
  checker_contract_version text not null check(length(btrim(checker_contract_version)) between 3 and 120),
  report_json jsonb not null check(jsonb_typeof(report_json)='object'),
  report_content_hash text not null check(report_content_hash ~ '^[0-9a-f]{64}$'),
  projection_content_hash text not null check(projection_content_hash ~ '^[0-9a-f]{64}$'),
  immutable_revision_hash text not null check(immutable_revision_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(id,workspace_id,workpiece_id,revision),
  unique(workspace_id,workpiece_id,revision),
  unique(workspace_id,workpiece_id,immutable_revision_hash),
  foreign key(workpiece_id,workspace_id) references tongs.episodes(id,workspace_id) on delete cascade,
  foreign key(script_review_revision_id,workspace_id,workpiece_id)
    references tongs.hearth_script_review_revisions(id,workspace_id,workpiece_id),
  foreign key(previous_revision_id,workspace_id,workpiece_id,previous_revision)
    references tongs.hearth_editorial_preflight_reports(id,workspace_id,workpiece_id,revision),
  foreign key(research_artifact_id,workspace_id,workpiece_id,research_artifact_revision)
    references tongs.hearth_research_artifact_revisions(id,workspace_id,workpiece_id,revision),
  check((previous_revision_id is null)=(previous_revision is null)),
  check((research_artifact_id is null)=(research_artifact_revision is null)),
  check((research_artifact_id is null)=(research_artifact_hash is null)),
  check((revision=1 and previous_revision_id is null) or
        (revision>1 and previous_revision_id is not null and previous_revision=revision-1))
);
create table tongs.workpiece_hearth_preflight_sequences (
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  workpiece_id uuid not null,
  current_report_id uuid,
  current_revision bigint not null default 0 check(current_revision>=0),
  updated_at timestamptz not null default now(),
  primary key(workspace_id,workpiece_id),
  foreign key(workpiece_id,workspace_id) references tongs.episodes(id,workspace_id) on delete cascade,
  foreign key(current_report_id,workspace_id,workpiece_id,current_revision)
    references tongs.hearth_editorial_preflight_reports(id,workspace_id,workpiece_id,revision),
  check((current_report_id is null and current_revision=0) or
        (current_report_id is not null and current_revision>0))
);
create table tongs.hearth_editorial_preflight_findings (
  report_id uuid not null,
  workspace_id uuid not null,
  workpiece_id uuid not null,
  report_revision bigint not null,
  ordinal integer not null check(ordinal>=0),
  finding_key text not null check(length(btrim(finding_key)) between 1 and 200),
  finding_code text not null check(length(btrim(finding_code)) between 1 and 120),
  severity text not null check(severity in ('blocker','warning','note')),
  category text not null check(length(btrim(category)) between 1 and 120),
  message text not null check(length(btrim(message))>0),
  finding_json jsonb not null check(jsonb_typeof(finding_json)='object'),
  content_hash text not null check(content_hash ~ '^[0-9a-f]{64}$'),
  primary key(report_id,ordinal),
  unique(report_id,finding_key),
  foreign key(report_id,workspace_id,workpiece_id,report_revision)
    references tongs.hearth_editorial_preflight_reports(id,workspace_id,workpiece_id,revision) on delete cascade
);
create table tongs.hearth_preflight_finding_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  workpiece_id uuid not null,
  report_id uuid not null,
  report_revision bigint not null,
  finding_ordinal integer not null,
  action text not null check(action in ('acknowledge','resolve')),
  note text,
  operation_id text not null unique check(operation_id ~ '^forge:hearth-preflight-finding:[a-zA-Z0-9._:-]{8,180}$'),
  acted_by uuid not null references auth.users(id),
  acted_at timestamptz not null default now(),
  unique(id,workspace_id,workpiece_id),
  foreign key(report_id,finding_ordinal) references tongs.hearth_editorial_preflight_findings(report_id,ordinal),
  foreign key(report_id,workspace_id,workpiece_id,report_revision)
    references tongs.hearth_editorial_preflight_reports(id,workspace_id,workpiece_id,revision),
  foreign key(workpiece_id,workspace_id) references tongs.episodes(id,workspace_id) on delete cascade
);
create table tongs.hearth_preflight_review_receipts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  workpiece_id uuid not null,
  report_id uuid not null,
  report_revision bigint not null,
  script_content_hash text not null check(script_content_hash ~ '^[0-9a-f]{64}$'),
  research_artifact_id uuid,
  research_artifact_hash text check(research_artifact_hash is null or research_artifact_hash ~ '^[0-9a-f]{64}$'),
  operation_id text not null unique check(operation_id ~ '^forge:hearth-preflight-review:[a-zA-Z0-9._:-]{8,180}$'),
  reviewed_by uuid not null references auth.users(id),
  reviewed_at timestamptz not null default now(),
  unique(report_id),
  foreign key(report_id,workspace_id,workpiece_id,report_revision)
    references tongs.hearth_editorial_preflight_reports(id,workspace_id,workpiece_id,revision),
  foreign key(workpiece_id,workspace_id) references tongs.episodes(id,workspace_id) on delete cascade,
  check((research_artifact_id is null)=(research_artifact_hash is null))
);
create table tongs.hearth_preflight_operation_receipts (
  operation_id text primary key check(operation_id ~ '^forge:hearth-preflight:[a-zA-Z0-9._:-]{8,180}$'),
  operation_fingerprint text not null check(operation_fingerprint ~ '^[0-9a-f]{64}$'),
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  workpiece_id uuid not null,
  result_report_id uuid not null,
  result_revision bigint not null,
  immutable_result_json jsonb not null check(jsonb_typeof(immutable_result_json)='object'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key(result_report_id,workspace_id,workpiece_id,result_revision)
    references tongs.hearth_editorial_preflight_reports(id,workspace_id,workpiece_id,revision),
  foreign key(workpiece_id,workspace_id) references tongs.episodes(id,workspace_id) on delete cascade
);
create table tongs.script_approval_preflight_bindings (
  script_approval_id uuid not null,
  workspace_id uuid not null,
  workpiece_id uuid not null,
  script_approval_revision bigint not null,
  preflight_report_id uuid not null,
  preflight_report_revision bigint not null,
  preflight_script_hash text not null check(preflight_script_hash ~ '^[0-9a-f]{64}$'),
  research_artifact_id uuid,
  research_artifact_hash text check(research_artifact_hash is null or research_artifact_hash ~ '^[0-9a-f]{64}$'),
  bound_by uuid not null references auth.users(id),
  bound_at timestamptz not null default now(),
  primary key(script_approval_id,preflight_report_id),
  foreign key(script_approval_id,workspace_id,workpiece_id,script_approval_revision)
    references tongs.script_approval_revisions(id,workspace_id,workpiece_id,approval_revision),
  foreign key(preflight_report_id,workspace_id,workpiece_id,preflight_report_revision)
    references tongs.hearth_editorial_preflight_reports(id,workspace_id,workpiece_id,revision),
  check((research_artifact_id is null)=(research_artifact_hash is null))
);
alter table tongs.workpiece_ready_transition_requests
  add column preflight_report_id uuid,
  add column preflight_report_revision bigint,
  add column preflight_script_hash text,
  add column research_artifact_id uuid,
  add column research_artifact_hash text;
alter table tongs.workpiece_ready_script_meta
  add column preflight_report_id uuid,
  add column preflight_report_revision bigint,
  add column preflight_script_hash text,
  add column research_artifact_id uuid,
  add column research_artifact_hash text;
alter table tongs.recording_capture_authorities
  add column preflight_report_id uuid,
  add column preflight_report_revision bigint,
  add column preflight_script_hash text,
  add column research_artifact_id uuid,
  add column research_artifact_hash text;
alter table tongs.workpiece_ready_transition_requests
  add constraint ready_transition_preflight_fkey foreign key(preflight_report_id,workspace_id,workpiece_id,preflight_report_revision)
    references tongs.hearth_editorial_preflight_reports(id,workspace_id,workpiece_id,revision),
  add constraint ready_transition_preflight_shape check(
    (preflight_report_id is null and preflight_report_revision is null and preflight_script_hash is null)
    or (preflight_report_id is not null and preflight_report_revision>0 and preflight_script_hash ~ '^[0-9a-f]{64}$'));
alter table tongs.workpiece_ready_script_meta
  add constraint ready_meta_preflight_fkey foreign key(preflight_report_id,workspace_id,workpiece_id,preflight_report_revision)
    references tongs.hearth_editorial_preflight_reports(id,workspace_id,workpiece_id,revision),
  add constraint ready_meta_preflight_shape check(
    (preflight_report_id is null and preflight_report_revision is null and preflight_script_hash is null)
    or (preflight_report_id is not null and preflight_report_revision>0 and preflight_script_hash ~ '^[0-9a-f]{64}$'));
alter table tongs.recording_capture_authorities
  add constraint recording_capture_preflight_fkey foreign key(preflight_report_id,workspace_id,workpiece_id,preflight_report_revision)
    references tongs.hearth_editorial_preflight_reports(id,workspace_id,workpiece_id,revision),
  -- Approved-script authorities created before Hearth preflight remain explicit
  -- legacy rows with a NULL proof tuple. NOT VALID skips only the historical
  -- table scan; PostgreSQL still enforces this CHECK for every new write.
  add constraint recording_capture_preflight_shape check(
    (script_binding_kind='none' and preflight_report_id is null)
    or (script_binding_kind='approved_canonical_script' and preflight_report_id is not null and preflight_report_revision>0
      and preflight_script_hash ~ '^[0-9a-f]{64}$')) not valid;
create function tongs.reject_hearth_evidence_projection_mutation()
returns trigger language plpgsql set search_path=pg_catalog,tongs as $$
begin raise exception using errcode='55000',message=tg_table_name||' is immutable'; end $$;
create trigger hearth_research_artifact_revisions_immutable before update or delete on tongs.hearth_research_artifact_revisions for each row execute function tongs.reject_hearth_evidence_projection_mutation();
create trigger hearth_research_artifact_claims_immutable before update or delete on tongs.hearth_research_artifact_claims for each row execute function tongs.reject_hearth_evidence_projection_mutation();
create trigger hearth_research_evidence_snapshots_immutable before update or delete on tongs.hearth_research_evidence_snapshots for each row execute function tongs.reject_hearth_evidence_projection_mutation();
create trigger hearth_research_claim_evidence_immutable before update or delete on tongs.hearth_research_claim_evidence for each row execute function tongs.reject_hearth_evidence_projection_mutation();
create trigger hearth_research_operation_receipts_immutable before update or delete on tongs.hearth_research_operation_receipts for each row execute function tongs.reject_hearth_evidence_projection_mutation();
create trigger hearth_script_review_revisions_immutable before update or delete on tongs.hearth_script_review_revisions for each row execute function tongs.reject_hearth_evidence_projection_mutation();
create trigger hearth_editorial_preflight_reports_immutable before update or delete on tongs.hearth_editorial_preflight_reports for each row execute function tongs.reject_hearth_evidence_projection_mutation();
create trigger hearth_editorial_preflight_findings_immutable before update or delete on tongs.hearth_editorial_preflight_findings for each row execute function tongs.reject_hearth_evidence_projection_mutation();
create trigger hearth_preflight_finding_acknowledgements_immutable before update or delete on tongs.hearth_preflight_finding_acknowledgements for each row execute function tongs.reject_hearth_evidence_projection_mutation();
create trigger hearth_preflight_review_receipts_immutable before update or delete on tongs.hearth_preflight_review_receipts for each row execute function tongs.reject_hearth_evidence_projection_mutation();
create trigger hearth_preflight_operation_receipts_immutable before update or delete on tongs.hearth_preflight_operation_receipts for each row execute function tongs.reject_hearth_evidence_projection_mutation();
create trigger script_approval_preflight_bindings_immutable before update or delete on tongs.script_approval_preflight_bindings for each row execute function tongs.reject_hearth_evidence_projection_mutation();
create or replace function tongs.commit_hearth_research_artifact_v1(
  p_workspace_id uuid,p_workpiece_id uuid,p_expected_revision bigint,p_expected_revision_id uuid,
  p_artifact_json jsonb,p_contract_version text,p_operation_id text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $function$
declare
  v_user uuid := auth.uid(); v_seq tongs.workpiece_hearth_research_sequences%rowtype;
  v_row tongs.hearth_research_artifact_revisions%rowtype; v_receipt tongs.hearth_research_operation_receipts%rowtype;
  v_hash text;v_projection_hash text;v_immutable text;v_fingerprint text;v_status text;v_brief text;v_result jsonb;
  v_item jsonb;v_ordinal int:=0;v_claim_key text;v_source_ids text[];v_evidence record;
begin
  if v_user is null or not tongs.has_workspace_role(p_workspace_id,'editor') then return jsonb_build_object('disposition','denied','reason','editor_required');end if;
  if not exists(select 1 from tongs.episodes where id=p_workpiece_id and workspace_id=p_workspace_id) then return jsonb_build_object('disposition','not_found','reason','episode_membership_invalid');end if;
  if p_artifact_json->>'schema'<>'forge.hearth.research-artifact.v1' or jsonb_typeof(p_artifact_json->'result')<>'object' then return jsonb_build_object('disposition','invalid','reason','artifact_contract_invalid');end if;
  v_status:=p_artifact_json#>>'{result,artifact,status}';
  if v_status not in ('complete','partial') then return jsonb_build_object('disposition','invalid','reason','only_substantive_artifacts_are_canonical');end if;
  if p_artifact_json#>>'{result,artifact,workpieceId}' is distinct from p_workpiece_id::text then return jsonb_build_object('disposition','invalid','reason','workpiece_identity_mismatch');end if;
  v_brief:=coalesce(p_artifact_json#>>'{result,brief,briefFingerprint}',p_artifact_json#>>'{result,artifact,briefFingerprint}','');
  if length(v_brief)<8 then return jsonb_build_object('disposition','invalid','reason','brief_fingerprint_required');end if;
  v_hash:=encode(extensions.digest(convert_to(p_artifact_json::text,'UTF8'),'sha256'),'hex');
  v_projection_hash:=encode(extensions.digest(convert_to(jsonb_build_object('claims',coalesce(p_artifact_json#>'{result,creatorClaims}','[]'::jsonb),'findings',coalesce(p_artifact_json#>'{result,artifact,findings}','[]'::jsonb),'evidence',coalesce(p_artifact_json#>'{result,evidence}','[]'::jsonb))::text,'UTF8'),'sha256'),'hex');
  v_fingerprint:=encode(extensions.digest(convert_to(jsonb_build_object('workspace_id',p_workspace_id,'workpiece_id',p_workpiece_id,'expected_revision',p_expected_revision,'expected_revision_id',p_expected_revision_id,'artifact_hash',v_hash,'contract_version',p_contract_version)::text,'UTF8'),'sha256'),'hex');
  select * into v_receipt from tongs.hearth_research_operation_receipts where operation_id=p_operation_id;
  if found then if v_receipt.operation_fingerprint<>v_fingerprint then return jsonb_build_object('disposition','operation_identity_conflict');end if;return v_receipt.immutable_result_json;end if;
  insert into tongs.workpiece_hearth_research_sequences(workspace_id,workpiece_id) values(p_workspace_id,p_workpiece_id) on conflict do nothing;
  select * into v_seq from tongs.workpiece_hearth_research_sequences where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id for update;
  if v_seq.current_revision<>p_expected_revision or v_seq.current_artifact_id is distinct from p_expected_revision_id then return jsonb_build_object('disposition','revision_conflict','current_revision',v_seq.current_revision,'current_artifact_id',v_seq.current_artifact_id);end if;
  if v_seq.current_artifact_id is not null and exists(select 1 from tongs.hearth_research_artifact_revisions where id=v_seq.current_artifact_id and artifact_content_hash=v_hash) then
    select * into v_row from tongs.hearth_research_artifact_revisions where id=v_seq.current_artifact_id;
    v_result:=jsonb_build_object('disposition','no_change','artifact',to_jsonb(v_row));
  else
    v_immutable:=encode(extensions.digest(convert_to(jsonb_build_object('artifact_hash',v_hash,'revision',v_seq.current_revision+1,'previous_revision_id',v_seq.current_artifact_id,'operation_id',p_operation_id)::text,'UTF8'),'sha256'),'hex');
    insert into tongs.hearth_research_artifact_revisions(workspace_id,workpiece_id,revision,previous_revision_id,previous_revision,brief_fingerprint,artifact_status,artifact_json,artifact_content_hash,projection_content_hash,immutable_revision_hash,contract_version,committed_by)
    values(p_workspace_id,p_workpiece_id,v_seq.current_revision+1,v_seq.current_artifact_id,nullif(v_seq.current_revision,0),v_brief,v_status,p_artifact_json,v_hash,v_projection_hash,v_immutable,p_contract_version,v_user) returning * into v_row;
    for v_item in select value from jsonb_array_elements(coalesce(p_artifact_json#>'{result,creatorClaims}','[]'::jsonb)) loop
      v_claim_key:=coalesce(nullif(v_item->>'claimId',''),'creator-'||v_ordinal::text);
      v_source_ids:=array(select jsonb_array_elements_text(coalesce(v_item->'sourceIds','[]'::jsonb)));
      insert into tongs.hearth_research_artifact_claims values(v_row.id,p_workspace_id,p_workpiece_id,v_row.revision,v_ordinal,v_claim_key,v_item->>'text',v_item->>'claimKind',coalesce(v_item->>'provenanceStatus','creator_supplied_unverified'),coalesce(v_item->>'scope','current_subject'),v_source_ids,v_item->'entityLead',encode(extensions.digest(convert_to(v_item::text,'UTF8'),'sha256'),'hex'));
      v_ordinal:=v_ordinal+1;
    end loop;
    for v_item in select value from jsonb_array_elements(coalesce(p_artifact_json#>'{result,artifact,findings}','[]'::jsonb)) loop
      v_claim_key:='finding-'||v_ordinal::text;
      v_source_ids:=array(select jsonb_array_elements_text(coalesce(v_item->'sourceIds','[]'::jsonb)));
      insert into tongs.hearth_research_artifact_claims values(v_row.id,p_workspace_id,p_workpiece_id,v_row.revision,v_ordinal,v_claim_key,v_item->>'text',null,case v_item->>'status' when 'verified_fact' then 'verified_by_current_run' when 'reported_claim' then 'reported_by_accessible_secondary' when 'editorial_interpretation' then 'opinion_interpretation' else coalesce(v_item->>'provenanceStatus','uncertain') end,coalesce(v_item->>'scope','current_subject'),v_source_ids,jsonb_strip_nulls(jsonb_build_object('name',v_item->>'businessName','entityRole',v_item->>'entityRole','businessStatus',v_item->>'businessStatus')),encode(extensions.digest(convert_to(v_item::text,'UTF8'),'sha256'),'hex'));
      v_ordinal:=v_ordinal+1;
    end loop;
    v_ordinal:=0;
    for v_item in select value from jsonb_array_elements(coalesce(p_artifact_json#>'{result,evidence}','[]'::jsonb)) loop
      if length(coalesce(v_item->>'excerpt',''))>8192 then return jsonb_build_object('disposition','invalid','reason','evidence_excerpt_too_large');end if;
      insert into tongs.hearth_research_evidence_snapshots(artifact_id,workspace_id,workpiece_id,artifact_revision,ordinal,evidence_key,source_id,evidence_state,authority,access_failure_reason,citation_json,excerpt,inspected_at,content_hash)
      values(v_row.id,p_workspace_id,p_workpiece_id,v_row.revision,v_ordinal,coalesce(nullif(v_item->>'evidenceId',''),'evidence-'||v_ordinal),v_item->>'sourceId',coalesce(v_item->>'state','inaccessible'),coalesce(v_item->>'authority','unassessed'),null,jsonb_build_object('sourceId',v_item->>'sourceId'),v_item->>'excerpt',null,encode(extensions.digest(convert_to(v_item::text,'UTF8'),'sha256'),'hex'));
      v_ordinal:=v_ordinal+1;
    end loop;
    for v_item in select to_jsonb(c) from tongs.hearth_research_artifact_claims c where c.artifact_id=v_row.id loop
      for v_evidence in select e.ordinal,e.source_id,e.evidence_state from tongs.hearth_research_evidence_snapshots e where e.artifact_id=v_row.id and e.source_id=any(array(select jsonb_array_elements_text(v_item->'source_ids'))) loop
        insert into tongs.hearth_research_claim_evidence values(v_row.id,(v_item->>'ordinal')::int,v_evidence.ordinal,p_workspace_id,p_workpiece_id,case when v_evidence.evidence_state='inaccessible' then 'inaccessible_only' when v_item->>'provenance_status'='conflicting' then 'conflicts' when v_item->>'provenance_status'='reported_by_accessible_secondary' then 'reports' else 'supports' end);
      end loop;
    end loop;
    update tongs.workpiece_hearth_research_sequences set current_artifact_id=v_row.id,current_revision=v_row.revision,updated_at=now() where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;
    v_result:=jsonb_build_object('disposition','committed','artifact',to_jsonb(v_row));
  end if;
  insert into tongs.hearth_research_operation_receipts values(p_operation_id,v_fingerprint,p_workspace_id,p_workpiece_id,v_row.id,v_row.revision,v_result,v_user,now());
  return v_result;
exception when invalid_text_representation or not_null_violation or check_violation then return jsonb_build_object('disposition','invalid','reason','artifact_projection_invalid');
end;$function$;
create or replace function tongs.read_current_hearth_research_artifact_v1(p_workspace_id uuid,p_workpiece_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare v_user uuid:=auth.uid();v_seq tongs.workpiece_hearth_research_sequences%rowtype;v_row tongs.hearth_research_artifact_revisions%rowtype;v_hash text;
begin
 if v_user is null or not tongs.has_workspace_role(p_workspace_id,'viewer') then return jsonb_build_object('disposition','denied');end if;
 select * into v_seq from tongs.workpiece_hearth_research_sequences where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;
 if not found or v_seq.current_artifact_id is null then return jsonb_build_object('disposition','empty','artifact',null);end if;
 select * into v_row from tongs.hearth_research_artifact_revisions where id=v_seq.current_artifact_id;
 v_hash:=encode(extensions.digest(convert_to(v_row.artifact_json::text,'UTF8'),'sha256'),'hex');
 if v_hash<>v_row.artifact_content_hash then return jsonb_build_object('disposition','integrity_error','reason','canonical_json_hash_mismatch');end if;
 return jsonb_build_object('disposition','current','artifact',to_jsonb(v_row),'claims',(select coalesce(jsonb_agg(to_jsonb(c) order by ordinal),'[]') from tongs.hearth_research_artifact_claims c where c.artifact_id=v_row.id),'evidence',(select coalesce(jsonb_agg(to_jsonb(e) order by ordinal),'[]') from tongs.hearth_research_evidence_snapshots e where e.artifact_id=v_row.id));
end$$;
create or replace function tongs.commit_hearth_editorial_preflight_v1(
 p_workspace_id uuid,p_workpiece_id uuid,p_expected_revision bigint,p_expected_revision_id uuid,
 p_expected_source_file_revision bigint,p_expected_script_hash text,p_script_text text,
 p_research_artifact_id uuid,p_research_artifact_hash text,p_checker_contract_version text,
 p_report_json jsonb,p_operation_id text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $function$
declare v_user uuid:=auth.uid();v_file tongs.workpiece_files%rowtype;v_research tongs.hearth_research_artifact_revisions%rowtype;
 v_seq tongs.workpiece_hearth_preflight_sequences%rowtype;v_review tongs.hearth_script_review_revisions%rowtype;v_report tongs.hearth_editorial_preflight_reports%rowtype;v_receipt tongs.hearth_preflight_operation_receipts%rowtype;
 v_script text;v_hash text;v_report_hash text;v_projection_hash text;v_immutable text;v_fingerprint text;v_result jsonb;v_item jsonb;v_ordinal int:=0;
begin
 if v_user is null or not tongs.has_workspace_role(p_workspace_id,'editor') then return jsonb_build_object('disposition','denied','reason','editor_required');end if;
 if p_report_json->>'schema'<>'forge.hearth.editorial-preflight.v1' or jsonb_typeof(p_report_json->'findings')<>'array' then return jsonb_build_object('disposition','invalid','reason','report_contract_invalid');end if;
 select * into v_file from tongs.workpiece_files where workpiece_id=p_workpiece_id and path='script/script.md' for share;
 if not found or v_file.revision<>p_expected_source_file_revision or lower(v_file.hash_value)<>lower(p_expected_script_hash) then return jsonb_build_object('disposition','stale','reason','script_source_changed');end if;
 v_script:=tongs.normalize_script_approval_text(p_script_text);v_hash:=encode(extensions.digest(convert_to(v_script,'UTF8'),'sha256'),'hex');
 if v_hash<>lower(p_expected_script_hash) then return jsonb_build_object('disposition','stale','reason','script_bytes_changed');end if;
 if p_research_artifact_id is not null then
   select r.* into v_research from tongs.hearth_research_artifact_revisions r join tongs.workpiece_hearth_research_sequences s on s.current_artifact_id=r.id where r.id=p_research_artifact_id and r.workspace_id=p_workspace_id and r.workpiece_id=p_workpiece_id;
   if not found or v_research.artifact_content_hash<>lower(p_research_artifact_hash) then return jsonb_build_object('disposition','stale','reason','research_artifact_changed');end if;
 end if;
 v_report_hash:=encode(extensions.digest(convert_to(p_report_json::text,'UTF8'),'sha256'),'hex');
 v_projection_hash:=encode(extensions.digest(convert_to(coalesce(p_report_json->'findings','[]'::jsonb)::text,'UTF8'),'sha256'),'hex');
 v_fingerprint:=encode(extensions.digest(convert_to(jsonb_build_object('workspace_id',p_workspace_id,'workpiece_id',p_workpiece_id,'source_revision',p_expected_source_file_revision,'script_hash',v_hash,'research_id',p_research_artifact_id,'research_hash',p_research_artifact_hash,'checker',p_checker_contract_version,'report_hash',v_report_hash)::text,'UTF8'),'sha256'),'hex');
 select * into v_receipt from tongs.hearth_preflight_operation_receipts where operation_id=p_operation_id;
 if found then if v_receipt.operation_fingerprint<>v_fingerprint then return jsonb_build_object('disposition','operation_identity_conflict');end if;return v_receipt.immutable_result_json;end if;
 insert into tongs.workpiece_hearth_preflight_sequences(workspace_id,workpiece_id) values(p_workspace_id,p_workpiece_id) on conflict do nothing;
 select * into v_seq from tongs.workpiece_hearth_preflight_sequences where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id for update;
 if v_seq.current_revision<>p_expected_revision or v_seq.current_report_id is distinct from p_expected_revision_id then return jsonb_build_object('disposition','revision_conflict','current_revision',v_seq.current_revision,'current_report_id',v_seq.current_report_id);end if;
 select * into v_review from tongs.hearth_script_review_revisions where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and source_file_revision=p_expected_source_file_revision and script_content_hash=v_hash;
 if not found then
   insert into tongs.hearth_script_review_revisions(workspace_id,workpiece_id,source_file_path,source_file_revision,script_content_hash,script_text,snapshot_content_hash,created_by)
   values(p_workspace_id,p_workpiece_id,'script/script.md',p_expected_source_file_revision,v_hash,v_script,encode(extensions.digest(convert_to(jsonb_build_object('workpiece_id',p_workpiece_id,'source_revision',p_expected_source_file_revision,'script_hash',v_hash)::text,'UTF8'),'sha256'),'hex'),v_user)
   returning * into v_review;
 end if;
 v_immutable:=encode(extensions.digest(convert_to(jsonb_build_object('report_hash',v_report_hash,'revision',v_seq.current_revision+1,'previous_revision_id',v_seq.current_report_id,'script_review_revision_id',v_review.id,'operation_id',p_operation_id)::text,'UTF8'),'sha256'),'hex');
 insert into tongs.hearth_editorial_preflight_reports(workspace_id,workpiece_id,revision,previous_revision_id,previous_revision,script_review_revision_id,source_file_path,source_file_revision,script_content_hash,research_artifact_id,research_artifact_revision,research_artifact_hash,checker_contract_version,report_json,report_content_hash,projection_content_hash,immutable_revision_hash,created_by)
 values(p_workspace_id,p_workpiece_id,v_seq.current_revision+1,v_seq.current_report_id,nullif(v_seq.current_revision,0),v_review.id,'script/script.md',p_expected_source_file_revision,v_hash,v_research.id,v_research.revision,v_research.artifact_content_hash,p_checker_contract_version,p_report_json,v_report_hash,v_projection_hash,v_immutable,v_user) returning * into v_report;
 for v_item in select value from jsonb_array_elements(p_report_json->'findings') loop
   insert into tongs.hearth_editorial_preflight_findings values(v_report.id,p_workspace_id,p_workpiece_id,v_report.revision,v_ordinal,coalesce(nullif(v_item->>'id',''),'finding-'||v_ordinal),coalesce(nullif(v_item->>'code',''),'unknown'),coalesce(nullif(v_item->>'severity',''),'warning'),coalesce(nullif(v_item->>'category',''),'editorial'),coalesce(nullif(v_item->>'message',''),'Unspecified producer finding.'),v_item,encode(extensions.digest(convert_to(v_item::text,'UTF8'),'sha256'),'hex'));
   v_ordinal:=v_ordinal+1;
 end loop;
 update tongs.workpiece_hearth_preflight_sequences set current_report_id=v_report.id,current_revision=v_report.revision,updated_at=now() where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;
 v_result:=jsonb_build_object('disposition','committed','report',to_jsonb(v_report),'findings',p_report_json->'findings');
 insert into tongs.hearth_preflight_operation_receipts values(p_operation_id,v_fingerprint,p_workspace_id,p_workpiece_id,v_report.id,v_report.revision,v_result,v_user,now());
 return v_result;
exception when invalid_text_representation or not_null_violation or check_violation then return jsonb_build_object('disposition','invalid','reason','preflight_projection_invalid');
end;$function$;
create or replace function tongs.acknowledge_hearth_preflight_finding_v1(p_workspace_id uuid,p_workpiece_id uuid,p_report_id uuid,p_finding_key text,p_action text,p_note text,p_operation_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare v_user uuid:=auth.uid();v_finding tongs.hearth_editorial_preflight_findings%rowtype;v_ack tongs.hearth_preflight_finding_acknowledgements%rowtype;
begin
 if v_user is null or not tongs.has_workspace_role(p_workspace_id,'editor') then return jsonb_build_object('disposition','denied');end if;
 select * into v_ack from tongs.hearth_preflight_finding_acknowledgements where operation_id=p_operation_id;
 if found then return jsonb_build_object('disposition','duplicate','acknowledgement',to_jsonb(v_ack));end if;
 select * into v_finding from tongs.hearth_editorial_preflight_findings where report_id=p_report_id and finding_key=p_finding_key and workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;
 if not found then return jsonb_build_object('disposition','not_found','reason','finding_not_found');end if;
 if p_action not in ('acknowledge','resolve') or (v_finding.severity='blocker' and p_action<>'resolve') then return jsonb_build_object('disposition','invalid','reason','blocking_findings_require_resolution');end if;
 insert into tongs.hearth_preflight_finding_acknowledgements(workspace_id,workpiece_id,report_id,report_revision,finding_ordinal,action,note,operation_id,acted_by)
 values(p_workspace_id,p_workpiece_id,p_report_id,v_finding.report_revision,v_finding.ordinal,p_action,nullif(btrim(coalesce(p_note,'')),''),p_operation_id,v_user) returning * into v_ack;
 return jsonb_build_object('disposition','saved','acknowledgement',to_jsonb(v_ack));
end$$;
create or replace function tongs.review_hearth_editorial_preflight_v1(p_workspace_id uuid,p_workpiece_id uuid,p_report_id uuid,p_operation_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare v_user uuid:=auth.uid();v_report tongs.hearth_editorial_preflight_reports%rowtype;v_receipt tongs.hearth_preflight_review_receipts%rowtype;
begin
 if v_user is null or not tongs.has_workspace_role(p_workspace_id,'editor') then return jsonb_build_object('disposition','denied');end if;
 select * into v_receipt from tongs.hearth_preflight_review_receipts where operation_id=p_operation_id or report_id=p_report_id;
 if found then return jsonb_build_object('disposition','duplicate','review',to_jsonb(v_receipt));end if;
 select r.* into v_report from tongs.hearth_editorial_preflight_reports r join tongs.workpiece_hearth_preflight_sequences s on s.current_report_id=r.id where r.id=p_report_id and r.workspace_id=p_workspace_id and r.workpiece_id=p_workpiece_id;
 if not found then return jsonb_build_object('disposition','stale','reason','preflight_not_current');end if;
 if exists(select 1 from tongs.hearth_editorial_preflight_findings f where f.report_id=v_report.id and ((f.severity='blocker' and not exists(select 1 from tongs.hearth_preflight_finding_acknowledgements a where a.report_id=f.report_id and a.finding_ordinal=f.ordinal and a.action='resolve')) or (f.severity='warning' and not exists(select 1 from tongs.hearth_preflight_finding_acknowledgements a where a.report_id=f.report_id and a.finding_ordinal=f.ordinal and a.action in ('acknowledge','resolve'))))) then return jsonb_build_object('disposition','blocked','reason','findings_unhandled');end if;
 insert into tongs.hearth_preflight_review_receipts(workspace_id,workpiece_id,report_id,report_revision,script_content_hash,research_artifact_id,research_artifact_hash,operation_id,reviewed_by)
 values(p_workspace_id,p_workpiece_id,v_report.id,v_report.revision,v_report.script_content_hash,v_report.research_artifact_id,v_report.research_artifact_hash,p_operation_id,v_user) returning * into v_receipt;
 return jsonb_build_object('disposition','reviewed','review',to_jsonb(v_receipt));
end$$;
create or replace function tongs.read_current_hearth_preflight_v1(p_workspace_id uuid,p_workpiece_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare v_user uuid:=auth.uid();v_report tongs.hearth_editorial_preflight_reports%rowtype;v_file tongs.workpiece_files%rowtype;v_research tongs.hearth_research_artifact_revisions%rowtype;v_review tongs.hearth_preflight_review_receipts%rowtype;v_stale text[]:='{}';
begin
 if v_user is null or not tongs.has_workspace_role(p_workspace_id,'viewer') then return jsonb_build_object('disposition','denied');end if;
 select r.* into v_report from tongs.hearth_editorial_preflight_reports r join tongs.workpiece_hearth_preflight_sequences s on s.current_report_id=r.id where s.workspace_id=p_workspace_id and s.workpiece_id=p_workpiece_id;
 if not found then return jsonb_build_object('disposition','empty','report',null);end if;
 select * into v_file from tongs.workpiece_files where workpiece_id=p_workpiece_id and path=v_report.source_file_path;
 if not found or v_file.revision<>v_report.source_file_revision or lower(v_file.hash_value)<>v_report.script_content_hash then v_stale:=array_append(v_stale,'script_changed');end if;
 if v_report.research_artifact_id is not null then select r.* into v_research from tongs.hearth_research_artifact_revisions r join tongs.workpiece_hearth_research_sequences s on s.current_artifact_id=r.id where s.workspace_id=p_workspace_id and s.workpiece_id=p_workpiece_id;
   if not found or v_research.id<>v_report.research_artifact_id or v_research.artifact_content_hash<>v_report.research_artifact_hash then v_stale:=array_append(v_stale,'research_changed');end if;end if;
 select * into v_review from tongs.hearth_preflight_review_receipts where report_id=v_report.id;
 return jsonb_build_object('disposition',case when cardinality(v_stale)>0 then 'stale' else 'current' end,'stale_reasons',to_jsonb(v_stale),'report',to_jsonb(v_report),'review',case when v_review.id is null then null else to_jsonb(v_review) end,'findings',(select coalesce(jsonb_agg(to_jsonb(f)||jsonb_build_object('latest_action',(select a.action from tongs.hearth_preflight_finding_acknowledgements a where a.report_id=f.report_id and a.finding_ordinal=f.ordinal order by a.acted_at desc limit 1)) order by f.ordinal),'[]') from tongs.hearth_editorial_preflight_findings f where f.report_id=v_report.id));
end$$;
create or replace function tongs.approve_canonical_script_v3(p_workspace_id uuid,p_workpiece_id uuid,p_expected_current_approval_revision bigint,p_expected_source_file_revision bigint,p_expected_source_content_hash text,p_script_text text,p_creator_version_label text,p_preflight_report_id uuid,p_operation_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $function$
declare v_user uuid:=auth.uid();v_report tongs.hearth_editorial_preflight_reports%rowtype;v_review tongs.hearth_preflight_review_receipts%rowtype;v_research tongs.hearth_research_artifact_revisions%rowtype;v_result jsonb;v_approval_id uuid;v_approval_revision bigint;
begin
 if v_user is null or not tongs.has_workspace_role(p_workspace_id,'editor') then return jsonb_build_object('disposition','denied','reason','editor_required');end if;
 select r.* into v_report from tongs.hearth_editorial_preflight_reports r join tongs.workpiece_hearth_preflight_sequences s on s.current_report_id=r.id where r.id=p_preflight_report_id and r.workspace_id=p_workspace_id and r.workpiece_id=p_workpiece_id;
 if not found or v_report.source_file_revision<>p_expected_source_file_revision or v_report.script_content_hash<>lower(p_expected_source_content_hash) then return jsonb_build_object('disposition','stale_preflight','reason','script_preflight_mismatch');end if;
 select * into v_review from tongs.hearth_preflight_review_receipts where report_id=v_report.id;
 if not found then return jsonb_build_object('disposition','preflight_unreviewed');end if;
 if v_report.research_artifact_id is not null then select r.* into v_research from tongs.hearth_research_artifact_revisions r join tongs.workpiece_hearth_research_sequences s on s.current_artifact_id=r.id where r.id=v_report.research_artifact_id and r.artifact_content_hash=v_report.research_artifact_hash;
   if not found then return jsonb_build_object('disposition','stale_preflight','reason','research_changed');end if;end if;
 select tongs.commit_script_approval_snapshot(p_workspace_id,p_workpiece_id,p_expected_current_approval_revision,'script/script.md',p_expected_source_file_revision,tongs.normalize_script_approval_text(p_script_text),'forge.script-approval.v3',p_creator_version_label,p_operation_id,v_user) into v_result;
 if v_result->>'disposition' not in ('committed','no_change') then return v_result;end if;
 v_approval_id:=(v_result#>>'{approval,id}')::uuid;v_approval_revision:=(v_result#>>'{approval,approval_revision}')::bigint;
 insert into tongs.script_approval_preflight_bindings(script_approval_id,workspace_id,workpiece_id,script_approval_revision,preflight_report_id,preflight_report_revision,preflight_script_hash,research_artifact_id,research_artifact_hash,bound_by)
 values(v_approval_id,p_workspace_id,p_workpiece_id,v_approval_revision,v_report.id,v_report.revision,v_report.script_content_hash,v_report.research_artifact_id,v_report.research_artifact_hash,v_user)
 on conflict(script_approval_id) do nothing;
 return v_result||jsonb_build_object('preflight_report_id',v_report.id,'preflight_report_revision',v_report.revision);
end;$function$;
create or replace function tongs.hearth_transition_preflighted_script_ready_v3(p_workspace_id uuid,p_workpiece_id uuid,p_script_approval_id uuid,p_preflight_report_id uuid,p_idempotency_key text,p_publish_evidence jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $function$
declare v_user uuid:=auth.uid();v_key text:=btrim(coalesce(p_idempotency_key,''));v_approval tongs.script_approval_revisions%rowtype;v_binding tongs.script_approval_preflight_bindings%rowtype;v_report tongs.hearth_editorial_preflight_reports%rowtype;v_review tongs.hearth_preflight_review_receipts%rowtype;v_existing tongs.workpiece_ready_transition_requests%rowtype;v_transition tongs.workpiece_ready_transition_requests%rowtype;v_ready tongs.workpiece_ready_script_meta%rowtype;v_fingerprint text;
begin
 if v_user is null or not tongs.has_workspace_role(p_workspace_id,'editor') then return jsonb_build_object('outcome','denied','reason','editor_required');end if;
 select * into v_approval from tongs.script_approval_revisions where id=p_script_approval_id and workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;
 select * into v_binding from tongs.script_approval_preflight_bindings where script_approval_id=v_approval.id and preflight_report_id=p_preflight_report_id;
 select * into v_report from tongs.hearth_editorial_preflight_reports where id=v_binding.preflight_report_id;
 select * into v_review from tongs.hearth_preflight_review_receipts where report_id=v_report.id;
 if v_approval.id is null or v_binding.script_approval_id is null or v_review.id is null or v_approval.script_content_hash<>v_report.script_content_hash then return jsonb_build_object('outcome','conflict','reason','reviewed_preflight_required');end if;
 if not exists(select 1 from tongs.workpiece_script_approval_sequences where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and current_approval_id=v_approval.id) then return jsonb_build_object('outcome','stale','reason','approval_not_current');end if;
 if not exists(select 1 from tongs.workpiece_hearth_preflight_sequences where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and current_report_id=v_report.id) then return jsonb_build_object('outcome','stale','reason','preflight_not_current');end if;
 if v_report.research_artifact_id is not null and not exists(select 1 from tongs.workpiece_hearth_research_sequences s join tongs.hearth_research_artifact_revisions r on r.id=s.current_artifact_id where s.workspace_id=p_workspace_id and s.workpiece_id=p_workpiece_id and r.id=v_report.research_artifact_id and r.artifact_content_hash=v_report.research_artifact_hash) then return jsonb_build_object('outcome','stale','reason','research_not_current');end if;
 if length(v_key) not between 8 and 200 or p_publish_evidence->>'transition'<>'hearth.preflighted-script.ready.v3' or p_publish_evidence->>'script_approval_id' is distinct from v_approval.id::text or p_publish_evidence->>'preflight_report_id' is distinct from v_report.id::text then return jsonb_build_object('outcome','conflict','reason','invalid_publish_evidence');end if;
 v_fingerprint:=md5(concat_ws(chr(31),p_workspace_id,p_workpiece_id,v_approval.id,v_report.id,v_approval.script_content_hash,p_publish_evidence::text));
 select * into v_existing from tongs.workpiece_ready_transition_requests where workspace_id=p_workspace_id and idempotency_key=v_key;
 if found then if v_existing.request_fingerprint<>v_fingerprint then return jsonb_build_object('outcome','conflict','reason','idempotency_reuse');end if;select * into v_ready from tongs.workpiece_ready_script_meta where transition_id=v_existing.id;return jsonb_build_object('outcome','duplicate','ready',to_jsonb(v_ready));end if;
 insert into tongs.workpiece_ready_transition_requests(workspace_id,workpiece_id,script_path,script_revision,script_hash,script_approval_id,script_approval_revision,script_approval_hash,preflight_report_id,preflight_report_revision,preflight_script_hash,research_artifact_id,research_artifact_hash,idempotency_key,request_fingerprint,publish_evidence,transitioned_by)
 values(p_workspace_id,p_workpiece_id,v_approval.source_file_path,v_approval.source_file_revision,v_approval.script_content_hash,v_approval.id,v_approval.approval_revision,v_approval.script_content_hash,v_report.id,v_report.revision,v_report.script_content_hash,v_report.research_artifact_id,v_report.research_artifact_hash,v_key,v_fingerprint,p_publish_evidence,v_user) returning * into v_transition;
 insert into tongs.workpiece_ready_script_meta(workspace_id,workpiece_id,script_path,marked_ready_by,marked_ready_at,updated_by,script_revision,script_hash,script_approval_id,script_approval_revision,script_approval_hash,preflight_report_id,preflight_report_revision,preflight_script_hash,research_artifact_id,research_artifact_hash,transition_id,publish_evidence)
 values(p_workspace_id,p_workpiece_id,v_approval.source_file_path,v_user,now(),v_user,v_approval.source_file_revision,v_approval.script_content_hash,v_approval.id,v_approval.approval_revision,v_approval.script_content_hash,v_report.id,v_report.revision,v_report.script_content_hash,v_report.research_artifact_id,v_report.research_artifact_hash,v_transition.id,p_publish_evidence)
 on conflict(workpiece_id,script_path) do update set workspace_id=excluded.workspace_id,marked_ready_by=excluded.marked_ready_by,marked_ready_at=excluded.marked_ready_at,updated_by=excluded.updated_by,script_revision=excluded.script_revision,script_hash=excluded.script_hash,script_approval_id=excluded.script_approval_id,script_approval_revision=excluded.script_approval_revision,script_approval_hash=excluded.script_approval_hash,preflight_report_id=excluded.preflight_report_id,preflight_report_revision=excluded.preflight_report_revision,preflight_script_hash=excluded.preflight_script_hash,research_artifact_id=excluded.research_artifact_id,research_artifact_hash=excluded.research_artifact_hash,transition_id=excluded.transition_id,publish_evidence=excluded.publish_evidence returning * into v_ready;
 return jsonb_build_object('outcome','saved','ready',to_jsonb(v_ready));
end;$function$;
create or replace view tongs.current_workpiece_ready_scripts with(security_invoker=true) as
select m.workspace_id,m.workpiece_id,m.script_path,m.script_revision,m.script_hash,m.transition_id,m.marked_ready_by,m.marked_ready_at,m.publish_evidence,a.created_at script_updated_at,m.script_approval_id,m.script_approval_revision,m.script_approval_hash,a.created_at script_approved_at,m.preflight_report_id,m.preflight_report_revision,m.preflight_script_hash,m.research_artifact_id,m.research_artifact_hash,r.reviewed_at preflight_reviewed_at
from tongs.workpiece_ready_script_meta m
join tongs.episodes e on e.id=m.workpiece_id and e.workspace_id=m.workspace_id
join tongs.script_approval_revisions a on a.id=m.script_approval_id and a.workspace_id=m.workspace_id and a.workpiece_id=m.workpiece_id and a.approval_revision=m.script_approval_revision and a.script_content_hash=m.script_approval_hash
join tongs.script_approval_preflight_bindings b on b.script_approval_id=a.id and b.preflight_report_id=m.preflight_report_id and b.preflight_script_hash=a.script_content_hash
join tongs.hearth_editorial_preflight_reports p on p.id=b.preflight_report_id and p.script_content_hash=a.script_content_hash
join tongs.hearth_preflight_review_receipts r on r.report_id=p.id
join tongs.workpiece_hearth_preflight_sequences ps on ps.workspace_id=m.workspace_id and ps.workpiece_id=m.workpiece_id and ps.current_report_id=p.id
join tongs.workpiece_files f on f.workpiece_id=m.workpiece_id and f.path=m.script_path and f.revision=m.script_revision and lower(f.hash_value)=m.script_hash
left join tongs.workpiece_hearth_research_sequences rs on rs.workspace_id=m.workspace_id and rs.workpiece_id=m.workpiece_id
where e.archived_at is null and (p.research_artifact_id is null or (rs.current_artifact_id=p.research_artifact_id and p.research_artifact_hash=m.research_artifact_hash));
-- Recording authority captures the complete Ready proof. Unscripted Bellows
-- remains valid; any approved script binding must include reviewed preflight.
create or replace function tongs.establish_recording_capture_authority(p_workspace_id uuid,p_workpiece_id uuid,p_venue text,p_execution_id uuid,p_operation_key text,p_recording_session_id uuid default null,p_venue_version text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $function$
declare v_user uuid:=auth.uid();v_key text:=btrim(coalesce(p_operation_key,''));v_venue text:=lower(btrim(coalesce(p_venue,'')));v_fingerprint text;v_ready record;v_existing tongs.recording_capture_authorities%rowtype;v_saved tongs.recording_capture_authorities%rowtype;v_execution tongs.anvil_capture_executions%rowtype;
begin
 if v_user is null or not tongs.has_workspace_role(p_workspace_id,'editor') then return jsonb_build_object('outcome','denied','reason','editor_required');end if;
 if v_venue not in ('anvil','bellows') or length(v_key) not between 8 and 200 or (v_venue='anvil' and p_execution_id is null) then return jsonb_build_object('outcome','conflict','reason','invalid_capture_request');end if;
 if not exists(select 1 from tongs.episodes where id=p_workpiece_id and workspace_id=p_workspace_id and archived_at is null and deleted_at is null) then return jsonb_build_object('outcome','not_found','reason','episode_membership_invalid');end if;
 v_fingerprint:=md5(concat_ws('|',p_workspace_id,p_workpiece_id,v_venue,p_execution_id,p_recording_session_id));perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||v_key,0));
 select * into v_existing from tongs.recording_capture_authorities where workspace_id=p_workspace_id and operation_key=v_key;
 if found then if v_existing.request_fingerprint<>v_fingerprint then return jsonb_build_object('outcome','conflict','reason','operation_key_reused');end if;select * into v_execution from tongs.anvil_capture_executions where recording_capture_authority_id=v_existing.id;return jsonb_build_object('outcome','duplicate','capture_authority',to_jsonb(v_existing),'venue_execution',case when v_execution.execution_id is null then null else to_jsonb(v_execution) end);end if;
 select * into v_ready from tongs.current_workpiece_ready_scripts where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and script_path='script/script.md';
 if v_venue='anvil' and v_ready.transition_id is null then return jsonb_build_object('outcome','conflict','reason','preflighted_ready_script_required');end if;
 insert into tongs.recording_capture_authorities(workspace_id,workpiece_id,recording_session_id,ready_transition_id,script_path,script_revision,script_hash,script_approval_id,script_approval_revision,script_approval_hash,preflight_report_id,preflight_report_revision,preflight_script_hash,research_artifact_id,research_artifact_hash,operation_key,provenance,established_by,venue,script_binding_kind,request_fingerprint)
 values(p_workspace_id,p_workpiece_id,p_recording_session_id,v_ready.transition_id,v_ready.script_path,v_ready.script_revision,v_ready.script_hash,v_ready.script_approval_id,v_ready.script_approval_revision,v_ready.script_approval_hash,v_ready.preflight_report_id,v_ready.preflight_report_revision,v_ready.preflight_script_hash,v_ready.research_artifact_id,v_ready.research_artifact_hash,v_key,'live_established',v_user,v_venue,case when v_ready.transition_id is null then 'none' else 'approved_canonical_script' end,v_fingerprint) returning * into v_saved;
 if v_venue='anvil' then insert into tongs.anvil_capture_executions(execution_id,recording_capture_authority_id,operation_key,anvil_version,created_by) values(p_execution_id,v_saved.id,v_key,p_venue_version,v_user) returning * into v_execution;end if;
 return jsonb_build_object('outcome','established','capture_authority',to_jsonb(v_saved),'venue_execution',case when v_execution.execution_id is null then null else to_jsonb(v_execution) end);
end;$function$;
-- RLS is viewer-readable; all mutation is through authenticated RPCs.
alter table tongs.hearth_research_artifact_revisions enable row level security;
alter table tongs.workpiece_hearth_research_sequences enable row level security;
alter table tongs.hearth_research_artifact_claims enable row level security;
alter table tongs.hearth_research_evidence_snapshots enable row level security;
alter table tongs.hearth_research_claim_evidence enable row level security;
alter table tongs.hearth_research_operation_receipts enable row level security;
alter table tongs.hearth_script_review_revisions enable row level security;
alter table tongs.hearth_editorial_preflight_reports enable row level security;
alter table tongs.workpiece_hearth_preflight_sequences enable row level security;
alter table tongs.hearth_editorial_preflight_findings enable row level security;
alter table tongs.hearth_preflight_finding_acknowledgements enable row level security;
alter table tongs.hearth_preflight_review_receipts enable row level security;
alter table tongs.hearth_preflight_operation_receipts enable row level security;
alter table tongs.script_approval_preflight_bindings enable row level security;
create policy hearth_research_artifacts_viewer on tongs.hearth_research_artifact_revisions for select to authenticated using(tongs.has_workspace_role(workspace_id,'viewer'));
create policy hearth_research_sequences_viewer on tongs.workpiece_hearth_research_sequences for select to authenticated using(tongs.has_workspace_role(workspace_id,'viewer'));
create policy hearth_research_claims_viewer on tongs.hearth_research_artifact_claims for select to authenticated using(tongs.has_workspace_role(workspace_id,'viewer'));
create policy hearth_research_evidence_viewer on tongs.hearth_research_evidence_snapshots for select to authenticated using(tongs.has_workspace_role(workspace_id,'viewer'));
create policy hearth_research_relationships_viewer on tongs.hearth_research_claim_evidence for select to authenticated using(tongs.has_workspace_role(workspace_id,'viewer'));
create policy hearth_research_receipts_viewer on tongs.hearth_research_operation_receipts for select to authenticated using(tongs.has_workspace_role(workspace_id,'viewer'));
create policy hearth_script_review_viewer on tongs.hearth_script_review_revisions for select to authenticated using(tongs.has_workspace_role(workspace_id,'viewer'));
create policy hearth_preflight_reports_viewer on tongs.hearth_editorial_preflight_reports for select to authenticated using(tongs.has_workspace_role(workspace_id,'viewer'));
create policy hearth_preflight_sequences_viewer on tongs.workpiece_hearth_preflight_sequences for select to authenticated using(tongs.has_workspace_role(workspace_id,'viewer'));
create policy hearth_preflight_findings_viewer on tongs.hearth_editorial_preflight_findings for select to authenticated using(tongs.has_workspace_role(workspace_id,'viewer'));
create policy hearth_preflight_ack_viewer on tongs.hearth_preflight_finding_acknowledgements for select to authenticated using(tongs.has_workspace_role(workspace_id,'viewer'));
create policy hearth_preflight_review_viewer on tongs.hearth_preflight_review_receipts for select to authenticated using(tongs.has_workspace_role(workspace_id,'viewer'));
create policy hearth_preflight_receipts_viewer on tongs.hearth_preflight_operation_receipts for select to authenticated using(tongs.has_workspace_role(workspace_id,'viewer'));
create policy script_approval_preflight_viewer on tongs.script_approval_preflight_bindings for select to authenticated using(tongs.has_workspace_role(workspace_id,'viewer'));
revoke insert,update,delete on tongs.hearth_research_artifact_revisions,tongs.workpiece_hearth_research_sequences,tongs.hearth_research_artifact_claims,tongs.hearth_research_evidence_snapshots,tongs.hearth_research_claim_evidence,tongs.hearth_research_operation_receipts,tongs.hearth_script_review_revisions,tongs.hearth_editorial_preflight_reports,tongs.workpiece_hearth_preflight_sequences,tongs.hearth_editorial_preflight_findings,tongs.hearth_preflight_finding_acknowledgements,tongs.hearth_preflight_review_receipts,tongs.hearth_preflight_operation_receipts,tongs.script_approval_preflight_bindings from authenticated;
grant select on tongs.hearth_research_artifact_revisions,tongs.workpiece_hearth_research_sequences,tongs.hearth_research_artifact_claims,tongs.hearth_research_evidence_snapshots,tongs.hearth_research_claim_evidence,tongs.hearth_research_operation_receipts,tongs.hearth_script_review_revisions,tongs.hearth_editorial_preflight_reports,tongs.workpiece_hearth_preflight_sequences,tongs.hearth_editorial_preflight_findings,tongs.hearth_preflight_finding_acknowledgements,tongs.hearth_preflight_review_receipts,tongs.hearth_preflight_operation_receipts,tongs.script_approval_preflight_bindings to authenticated;
grant all on tongs.hearth_research_artifact_revisions,tongs.workpiece_hearth_research_sequences,tongs.hearth_research_artifact_claims,tongs.hearth_research_evidence_snapshots,tongs.hearth_research_claim_evidence,tongs.hearth_research_operation_receipts,tongs.hearth_script_review_revisions,tongs.hearth_editorial_preflight_reports,tongs.workpiece_hearth_preflight_sequences,tongs.hearth_editorial_preflight_findings,tongs.hearth_preflight_finding_acknowledgements,tongs.hearth_preflight_review_receipts,tongs.hearth_preflight_operation_receipts,tongs.script_approval_preflight_bindings to service_role;
revoke execute on function tongs.approve_canonical_script_v2(uuid,uuid,bigint,bigint,text,text,text,text) from authenticated;
revoke execute on function tongs.hearth_transition_approved_script_ready(uuid,uuid,uuid,text,jsonb) from authenticated;
revoke all on function tongs.commit_hearth_research_artifact_v1(uuid,uuid,bigint,uuid,jsonb,text,text),tongs.read_current_hearth_research_artifact_v1(uuid,uuid),tongs.commit_hearth_editorial_preflight_v1(uuid,uuid,bigint,uuid,bigint,text,text,uuid,text,text,jsonb,text),tongs.acknowledge_hearth_preflight_finding_v1(uuid,uuid,uuid,text,text,text,text),tongs.review_hearth_editorial_preflight_v1(uuid,uuid,uuid,text),tongs.read_current_hearth_preflight_v1(uuid,uuid),tongs.approve_canonical_script_v3(uuid,uuid,bigint,bigint,text,text,text,uuid,text),tongs.hearth_transition_preflighted_script_ready_v3(uuid,uuid,uuid,uuid,text,jsonb) from public,anon;
grant execute on function tongs.commit_hearth_research_artifact_v1(uuid,uuid,bigint,uuid,jsonb,text,text),tongs.read_current_hearth_research_artifact_v1(uuid,uuid),tongs.commit_hearth_editorial_preflight_v1(uuid,uuid,bigint,uuid,bigint,text,text,uuid,text,text,jsonb,text),tongs.acknowledge_hearth_preflight_finding_v1(uuid,uuid,uuid,text,text,text,text),tongs.review_hearth_editorial_preflight_v1(uuid,uuid,uuid,text),tongs.read_current_hearth_preflight_v1(uuid,uuid),tongs.approve_canonical_script_v3(uuid,uuid,bigint,bigint,text,text,text,uuid,text),tongs.hearth_transition_preflighted_script_ready_v3(uuid,uuid,uuid,uuid,text,jsonb) to authenticated,service_role;
comment on table tongs.hearth_research_artifact_revisions is 'Immutable canonical evidence state Hearth currently has for an Episode; commit does not assert creator truth acceptance.';
comment on table tongs.hearth_script_review_revisions is 'Immutable exact-byte snapshot of a canonical working draft reviewed before approval.';
comment on table tongs.hearth_editorial_preflight_reports is 'Immutable deterministic producer review bound to exact draft and evidence hashes.';
commit;
