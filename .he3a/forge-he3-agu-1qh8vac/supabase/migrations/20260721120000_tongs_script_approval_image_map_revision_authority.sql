-- Canonical immutable script-approval and image-map revision authority.
-- Legacy mutable files remain compatibility inputs and never establish currentness.

begin;

do $guard$
declare
  v_not_null boolean;
  v_null_count bigint;
begin
  select a.attnotnull into v_not_null
  from pg_catalog.pg_attribute a
  where a.attrelid = 'tongs.episodes'::regclass
    and a.attname = 'workspace_id'
    and not a.attisdropped;
  if v_not_null is distinct from true then
    raise exception 'tongs.episodes.workspace_id must be NOT NULL';
  end if;
  select count(*) into v_null_count from tongs.episodes where workspace_id is null;
  if v_null_count <> 0 then
    raise exception 'tongs.episodes contains % rows without workspace ownership', v_null_count;
  end if;
  if exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'tongs.episodes'::regclass
      and conname = 'episodes_id_workspace_id_key'
  ) then
    raise exception 'episodes_id_workspace_id_key already exists';
  end if;
  if exists (
    select 1
    from pg_catalog.pg_index i
    where i.indrelid = 'tongs.episodes'::regclass
      and i.indisunique
      and i.indkey::smallint[] = array[
        (select attnum from pg_catalog.pg_attribute where attrelid='tongs.episodes'::regclass and attname='id'),
        (select attnum from pg_catalog.pg_attribute where attrelid='tongs.episodes'::regclass and attname='workspace_id')
      ]::smallint[]
  ) then
    raise exception 'equivalent unique (id, workspace_id) index already exists';
  end if;
end
$guard$;

alter table tongs.episodes
  add constraint episodes_id_workspace_id_key unique (id, workspace_id);

create table tongs.script_approval_revisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  workpiece_id uuid not null,
  approval_revision bigint not null check (approval_revision > 0),
  source_file_path text not null check (source_file_path = 'script/script.md'),
  source_file_revision bigint not null check (source_file_revision > 0),
  script_content_hash text not null check (script_content_hash ~ '^[0-9a-f]{64}$'),
  semantic_state_hash text not null check (semantic_state_hash ~ '^[0-9a-f]{64}$'),
  immutable_revision_hash text not null check (immutable_revision_hash ~ '^[0-9a-f]{64}$'),
  script_text text not null,
  approval_contract_version text not null check (length(btrim(approval_contract_version)) > 0),
  creator_version_label text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (id, workspace_id, workpiece_id, approval_revision),
  unique (workspace_id, workpiece_id, approval_revision),
  unique (workspace_id, workpiece_id, source_file_revision, script_content_hash),
  unique (workspace_id, workpiece_id, immutable_revision_hash),
  foreign key (workpiece_id, workspace_id)
    references tongs.episodes(id, workspace_id) on delete cascade
);

create table tongs.workpiece_script_approval_sequences (
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  workpiece_id uuid not null,
  current_approval_id uuid,
  current_revision bigint not null default 0 check (current_revision >= 0),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, workpiece_id),
  foreign key (workpiece_id, workspace_id)
    references tongs.episodes(id, workspace_id) on delete cascade,
  foreign key (current_approval_id, workspace_id, workpiece_id, current_revision)
    references tongs.script_approval_revisions(id, workspace_id, workpiece_id, approval_revision),
  check (
    (current_approval_id is null and current_revision = 0)
    or (current_approval_id is not null and current_revision > 0)
  )
);

create table tongs.image_map_revisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  workpiece_id uuid not null,
  revision bigint not null check (revision > 0),
  previous_revision_id uuid,
  previous_revision bigint,
  source_script_approval_id uuid,
  source_script_approval_revision bigint,
  source_script_content_hash text
    check (source_script_content_hash is null or source_script_content_hash ~ '^[0-9a-f]{64}$'),
  anchor_contract_version text not null check (length(btrim(anchor_contract_version)) > 0),
  provenance_state text not null
    check (provenance_state in ('current','stale','unresolved','provenance_unknown')),
  document_json jsonb not null check (jsonb_typeof(document_json) = 'object'),
  document_content_hash text not null check (document_content_hash ~ '^[0-9a-f]{64}$'),
  semantic_state_hash text not null check (semantic_state_hash ~ '^[0-9a-f]{64}$'),
  immutable_revision_hash text not null check (immutable_revision_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (id, workspace_id, workpiece_id, revision),
  unique (workspace_id, workpiece_id, revision),
  unique (workspace_id, workpiece_id, immutable_revision_hash),
  foreign key (workpiece_id, workspace_id)
    references tongs.episodes(id, workspace_id) on delete cascade,
  foreign key (previous_revision_id, workspace_id, workpiece_id, previous_revision)
    references tongs.image_map_revisions(id, workspace_id, workpiece_id, revision),
  foreign key (source_script_approval_id, workspace_id, workpiece_id, source_script_approval_revision)
    references tongs.script_approval_revisions(id, workspace_id, workpiece_id, approval_revision),
  check ((previous_revision_id is null) = (previous_revision is null)),
  check ((source_script_approval_id is null) = (source_script_approval_revision is null)),
  check (
    (revision = 1 and previous_revision_id is null)
    or (revision > 1 and previous_revision_id is not null and previous_revision = revision - 1)
  ),
  check (
    provenance_state = 'provenance_unknown'
    or (source_script_approval_id is not null and source_script_content_hash is not null)
  )
);

create table tongs.workpiece_image_map_sequences (
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  workpiece_id uuid not null,
  current_revision_id uuid,
  current_revision bigint not null default 0 check (current_revision >= 0),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, workpiece_id),
  foreign key (workpiece_id, workspace_id)
    references tongs.episodes(id, workspace_id) on delete cascade,
  foreign key (current_revision_id, workspace_id, workpiece_id, current_revision)
    references tongs.image_map_revisions(id, workspace_id, workpiece_id, revision),
  check (
    (current_revision_id is null and current_revision = 0)
    or (current_revision_id is not null and current_revision > 0)
  )
);

create table tongs.hearth_authority_operation_receipts (
  operation_id text primary key
    check (operation_id ~ '^forge:(script-approval|image-map):[a-zA-Z0-9._:-]{8,180}$'),
  operation_fingerprint text not null check (operation_fingerprint ~ '^[0-9a-f]{64}$'),
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  workpiece_id uuid not null,
  mutation_kind text not null check (mutation_kind in (
    'commit_script_approval','commit_image_map','repair_to_approved_script',
    'resolve_manual_anchor','reapply_visual_plan','regenerate_from_approved_script'
  )),
  source_image_map_revision_id uuid,
  source_image_map_revision bigint,
  target_script_approval_id uuid,
  target_script_approval_revision bigint,
  result_image_map_revision_id uuid,
  result_image_map_revision bigint,
  result_script_approval_id uuid,
  result_script_approval_revision bigint,
  immutable_result_json jsonb not null check (jsonb_typeof(immutable_result_json)='object'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (workpiece_id, workspace_id)
    references tongs.episodes(id, workspace_id) on delete cascade,
  foreign key (source_image_map_revision_id, workspace_id, workpiece_id, source_image_map_revision)
    references tongs.image_map_revisions(id, workspace_id, workpiece_id, revision),
  foreign key (target_script_approval_id, workspace_id, workpiece_id, target_script_approval_revision)
    references tongs.script_approval_revisions(id, workspace_id, workpiece_id, approval_revision),
  foreign key (result_image_map_revision_id, workspace_id, workpiece_id, result_image_map_revision)
    references tongs.image_map_revisions(id, workspace_id, workpiece_id, revision),
  foreign key (result_script_approval_id, workspace_id, workpiece_id, result_script_approval_revision)
    references tongs.script_approval_revisions(id, workspace_id, workpiece_id, approval_revision),
  check ((source_image_map_revision_id is null) = (source_image_map_revision is null)),
  check ((target_script_approval_id is null) = (target_script_approval_revision is null)),
  check ((result_image_map_revision_id is null) = (result_image_map_revision is null)),
  check ((result_script_approval_id is null) = (result_script_approval_revision is null)),
  check (
    (mutation_kind='commit_script_approval'
      and source_image_map_revision_id is null
      and target_script_approval_id is null
      and result_image_map_revision_id is null
      and result_script_approval_id is not null)
    or
    (mutation_kind='commit_image_map'
      and result_script_approval_id is null
      and result_image_map_revision_id is not null)
    or
    (mutation_kind in ('repair_to_approved_script','resolve_manual_anchor','reapply_visual_plan','regenerate_from_approved_script')
      and source_image_map_revision_id is not null
      and target_script_approval_id is not null
      and result_image_map_revision_id is not null
      and result_script_approval_id is null)
  )
);

create index script_approval_revisions_current_idx
  on tongs.script_approval_revisions(workspace_id, workpiece_id, approval_revision desc);
create index image_map_revisions_current_idx
  on tongs.image_map_revisions(workspace_id, workpiece_id, revision desc);
create index hearth_authority_receipts_workpiece_idx
  on tongs.hearth_authority_operation_receipts(workspace_id, workpiece_id, created_at desc);

create or replace function tongs.reject_hearth_authority_immutable_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, tongs
as $function$
begin
  raise exception '% is immutable', tg_table_name using errcode='55000';
end
$function$;

create trigger script_approval_revisions_immutable before update or delete on tongs.script_approval_revisions
  for each row execute function tongs.reject_hearth_authority_immutable_mutation();
create trigger image_map_revisions_immutable before update or delete on tongs.image_map_revisions
  for each row execute function tongs.reject_hearth_authority_immutable_mutation();
create trigger hearth_authority_operation_receipts_immutable before update or delete on tongs.hearth_authority_operation_receipts
  for each row execute function tongs.reject_hearth_authority_immutable_mutation();

create or replace function tongs.image_map_plan_provenance(p_document jsonb)
returns text
language plpgsql
immutable
strict
set search_path = pg_catalog, tongs
as $function$
declare
  v_entries jsonb := p_document->'entries';
  v_entry jsonb;
  v_state text;
  v_seen integer := 0;
  v_has_unknown boolean := false;
  v_has_stale boolean := false;
  v_has_unresolved boolean := false;
begin
  if jsonb_typeof(v_entries) <> 'array' then
    raise exception 'image-map document entries must be an array';
  end if;
  for v_entry in select value from jsonb_array_elements(v_entries) loop
    v_seen := v_seen + 1;
    v_state := v_entry#>>'{canonical_anchor_assessment,state}';
    if v_state not in ('current','stale','unresolved','provenance_unknown') then
      raise exception 'invalid or missing canonical entry assessment';
    end if;
    v_has_unknown := v_has_unknown or v_state='provenance_unknown';
    v_has_stale := v_has_stale or v_state='stale';
    v_has_unresolved := v_has_unresolved or v_state='unresolved';
  end loop;
  -- Deterministic severity: unknown > stale > unresolved > current.
  if v_has_unknown then return 'provenance_unknown'; end if;
  if v_has_stale then return 'stale'; end if;
  if v_has_unresolved then return 'unresolved'; end if;
  return 'current';
end
$function$;

create or replace function tongs.commit_script_approval_snapshot(
  p_workspace_id uuid,
  p_workpiece_id uuid,
  p_expected_current_revision bigint,
  p_source_file_path text,
  p_source_file_revision bigint,
  p_script_text text,
  p_approval_contract_version text,
  p_creator_version_label text,
  p_operation_id text,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, tongs
as $function$
declare
  v_sequence tongs.workpiece_script_approval_sequences%rowtype;
  v_current tongs.script_approval_revisions%rowtype;
  v_revision tongs.script_approval_revisions%rowtype;
  v_receipt tongs.hearth_authority_operation_receipts%rowtype;
  v_hash text;
  v_semantic_hash text;
  v_revision_hash text;
  v_fingerprint text;
  v_result jsonb;
begin
  if p_actor_id is null then
    raise exception 'actor is required' using errcode='22023';
  end if;
  if p_source_file_path <> 'script/script.md' or p_script_text is null then
    raise exception 'invalid script approval input' using errcode='22023';
  end if;
  v_hash := encode(extensions.digest(convert_to(p_script_text,'UTF8'),'sha256'),'hex');
  v_semantic_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'workspace_id',p_workspace_id,'workpiece_id',p_workpiece_id,'source_file_path',p_source_file_path,
    'script_content_hash',v_hash,'script_text',p_script_text,'approval_contract_version',p_approval_contract_version
  )::text,'UTF8'),'sha256'),'hex');
  v_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'contract','forge.script-approval-operation.v1','workspace_id',p_workspace_id,
    'workpiece_id',p_workpiece_id,'expected_revision',p_expected_current_revision,
    'source_file_path',p_source_file_path,'source_file_revision',p_source_file_revision,
    'script_hash',v_hash,'approval_contract_version',p_approval_contract_version
  )::text,'UTF8'),'sha256'),'hex');

  select * into v_receipt from tongs.hearth_authority_operation_receipts where operation_id=p_operation_id;
  if found then
    if v_receipt.operation_fingerprint <> v_fingerprint then
      return jsonb_build_object('disposition','operation_identity_conflict');
    end if;
    return v_receipt.immutable_result_json;
  end if;

  insert into tongs.workpiece_script_approval_sequences(workspace_id,workpiece_id)
  values(p_workspace_id,p_workpiece_id) on conflict do nothing;
  select * into v_sequence from tongs.workpiece_script_approval_sequences
    where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id for update;
  if v_sequence.current_revision <> p_expected_current_revision then
    return jsonb_build_object('disposition','revision_conflict','current_revision',v_sequence.current_revision,'current_approval_id',v_sequence.current_approval_id);
  end if;
  if v_sequence.current_approval_id is not null then
    select * into v_current from tongs.script_approval_revisions where id=v_sequence.current_approval_id;
    if v_current.semantic_state_hash=v_semantic_hash and v_current.script_content_hash=v_hash and v_current.script_text=p_script_text then
      v_result := jsonb_build_object('disposition','no_change','approval',to_jsonb(v_current));
      insert into tongs.hearth_authority_operation_receipts(
        operation_id,operation_fingerprint,workspace_id,workpiece_id,mutation_kind,
        result_script_approval_id,result_script_approval_revision,immutable_result_json,created_by
      ) values(p_operation_id,v_fingerprint,p_workspace_id,p_workpiece_id,'commit_script_approval',
        v_current.id,v_current.approval_revision,v_result,p_actor_id);
      return v_result;
    end if;
  end if;

  v_revision_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'semantic_state_hash',v_semantic_hash,'approval_revision',v_sequence.current_revision+1,
    'source_file_revision',p_source_file_revision,'created_at',clock_timestamp()::text,'operation_id',p_operation_id
  )::text,'UTF8'),'sha256'),'hex');
  insert into tongs.script_approval_revisions(
    workspace_id,workpiece_id,approval_revision,source_file_path,source_file_revision,
    script_content_hash,semantic_state_hash,immutable_revision_hash,script_text,approval_contract_version,creator_version_label,created_by
  ) values(p_workspace_id,p_workpiece_id,v_sequence.current_revision+1,p_source_file_path,p_source_file_revision,
    v_hash,v_semantic_hash,v_revision_hash,p_script_text,p_approval_contract_version,p_creator_version_label,
    p_actor_id) returning * into v_revision;
  update tongs.workpiece_script_approval_sequences set current_approval_id=v_revision.id,
    current_revision=v_revision.approval_revision,updated_at=now()
    where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;
  v_result := jsonb_build_object('disposition','committed','approval',to_jsonb(v_revision));
  insert into tongs.hearth_authority_operation_receipts(
    operation_id,operation_fingerprint,workspace_id,workpiece_id,mutation_kind,
    result_script_approval_id,result_script_approval_revision,immutable_result_json,created_by
  ) values(p_operation_id,v_fingerprint,p_workspace_id,p_workpiece_id,'commit_script_approval',
    v_revision.id,v_revision.approval_revision,v_result,v_revision.created_by);
  return v_result;
end
$function$;

create or replace function tongs.commit_image_map_revision(
  p_workspace_id uuid,
  p_workpiece_id uuid,
  p_expected_current_revision bigint,
  p_expected_current_revision_id uuid,
  p_target_script_approval_id uuid,
  p_anchor_contract_version text,
  p_document_json jsonb,
  p_mutation_kind text,
  p_affected_entry_ids text[],
  p_normalized_mutation_inputs jsonb,
  p_operation_contract_version text,
  p_operation_id text,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, tongs
as $function$
declare
  v_sequence tongs.workpiece_image_map_sequences%rowtype;
  v_approval_sequence tongs.workpiece_script_approval_sequences%rowtype;
  v_approval tongs.script_approval_revisions%rowtype;
  v_current tongs.image_map_revisions%rowtype;
  v_revision tongs.image_map_revisions%rowtype;
  v_receipt tongs.hearth_authority_operation_receipts%rowtype;
  v_provenance text;
  v_document_hash text;
  v_semantic_hash text;
  v_revision_hash text;
  v_fingerprint text;
  v_result jsonb;
  v_next bigint;
begin
  if p_actor_id is null then
    raise exception 'actor is required' using errcode='22023';
  end if;
  if p_mutation_kind not in ('commit_image_map','repair_to_approved_script','resolve_manual_anchor','reapply_visual_plan','regenerate_from_approved_script') then
    raise exception 'invalid image-map mutation kind' using errcode='22023';
  end if;
  v_provenance := tongs.image_map_plan_provenance(p_document_json);
  v_document_hash := encode(extensions.digest(convert_to(p_document_json::text,'UTF8'),'sha256'),'hex');

  select * into v_approval_sequence from tongs.workpiece_script_approval_sequences
    where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id for share;
  if p_target_script_approval_id is not null then
    if not found or v_approval_sequence.current_approval_id is distinct from p_target_script_approval_id then
      return jsonb_build_object('disposition','script_revision_conflict');
    end if;
    select * into v_approval from tongs.script_approval_revisions
      where id=p_target_script_approval_id and workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;
    if not found then return jsonb_build_object('disposition','canonical_approval_required'); end if;
  elsif v_provenance <> 'provenance_unknown' then
    return jsonb_build_object('disposition','canonical_approval_required');
  end if;

  v_semantic_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'workspace_id',p_workspace_id,'workpiece_id',p_workpiece_id,
    'source_script_approval_id',v_approval.id,'source_script_hash',v_approval.script_content_hash,
    'anchor_contract_version',p_anchor_contract_version,'provenance_state',v_provenance,
    'document_content_hash',v_document_hash,'document',p_document_json
  )::text,'UTF8'),'sha256'),'hex');
  v_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'contract',p_operation_contract_version,'workspace_id',p_workspace_id,'workpiece_id',p_workpiece_id,
    'mutation_kind',p_mutation_kind,'source_revision_id',p_expected_current_revision_id,
    'source_revision',p_expected_current_revision,'target_approval_id',v_approval.id,
    'target_script_hash',v_approval.script_content_hash,
    'affected_entry_ids',to_jsonb((select array_agg(x order by x) from unnest(coalesce(p_affected_entry_ids,array[]::text[])) x)),
    'normalized_inputs',coalesce(p_normalized_mutation_inputs,'{}'::jsonb)
  )::text,'UTF8'),'sha256'),'hex');

  select * into v_receipt from tongs.hearth_authority_operation_receipts where operation_id=p_operation_id;
  if found then
    if v_receipt.operation_fingerprint <> v_fingerprint then return jsonb_build_object('disposition','operation_identity_conflict'); end if;
    return v_receipt.immutable_result_json;
  end if;

  insert into tongs.workpiece_image_map_sequences(workspace_id,workpiece_id)
  values(p_workspace_id,p_workpiece_id) on conflict do nothing;
  select * into v_sequence from tongs.workpiece_image_map_sequences
    where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id for update;
  if v_sequence.current_revision <> p_expected_current_revision
    or v_sequence.current_revision_id is distinct from p_expected_current_revision_id then
    return jsonb_build_object('disposition','revision_conflict','current_revision',v_sequence.current_revision,'current_revision_id',v_sequence.current_revision_id);
  end if;
  if v_sequence.current_revision_id is not null then
    select * into v_current from tongs.image_map_revisions where id=v_sequence.current_revision_id;
    if v_current.semantic_state_hash=v_semantic_hash then
      v_result := jsonb_build_object('disposition','no_change','image_map_revision',to_jsonb(v_current));
      insert into tongs.hearth_authority_operation_receipts(
        operation_id,operation_fingerprint,workspace_id,workpiece_id,mutation_kind,
        source_image_map_revision_id,source_image_map_revision,target_script_approval_id,target_script_approval_revision,
        result_image_map_revision_id,result_image_map_revision,immutable_result_json,created_by
      ) values(p_operation_id,v_fingerprint,p_workspace_id,p_workpiece_id,p_mutation_kind,
        case when p_mutation_kind='commit_image_map' then null else v_current.id end,
        case when p_mutation_kind='commit_image_map' then null else v_current.revision end,
        v_approval.id,v_approval.approval_revision,v_current.id,v_current.revision,v_result,
        p_actor_id);
      return v_result;
    end if;
  end if;
  v_next := v_sequence.current_revision+1;
  v_revision_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'semantic_state_hash',v_semantic_hash,'revision',v_next,'previous_revision_id',v_sequence.current_revision_id,
    'created_at',clock_timestamp()::text,'operation_id',p_operation_id
  )::text,'UTF8'),'sha256'),'hex');
  insert into tongs.image_map_revisions(
    workspace_id,workpiece_id,revision,previous_revision_id,previous_revision,
    source_script_approval_id,source_script_approval_revision,source_script_content_hash,
    anchor_contract_version,provenance_state,document_json,document_content_hash,
    semantic_state_hash,immutable_revision_hash,created_by
  ) values(p_workspace_id,p_workpiece_id,v_next,v_sequence.current_revision_id,
    case when v_sequence.current_revision=0 then null else v_sequence.current_revision end,
    v_approval.id,v_approval.approval_revision,v_approval.script_content_hash,
    p_anchor_contract_version,v_provenance,p_document_json,v_document_hash,v_semantic_hash,v_revision_hash,
    p_actor_id) returning * into v_revision;
  update tongs.workpiece_image_map_sequences set current_revision_id=v_revision.id,current_revision=v_revision.revision,updated_at=now()
    where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;
  v_result := jsonb_build_object('disposition','committed','image_map_revision',to_jsonb(v_revision));
  insert into tongs.hearth_authority_operation_receipts(
    operation_id,operation_fingerprint,workspace_id,workpiece_id,mutation_kind,
    source_image_map_revision_id,source_image_map_revision,target_script_approval_id,target_script_approval_revision,
    result_image_map_revision_id,result_image_map_revision,immutable_result_json,created_by
  ) values(p_operation_id,v_fingerprint,p_workspace_id,p_workpiece_id,p_mutation_kind,
    case when p_mutation_kind='commit_image_map' then null else v_sequence.current_revision_id end,
    case when p_mutation_kind='commit_image_map' then null else nullif(v_sequence.current_revision,0) end,
    v_approval.id,v_approval.approval_revision,v_revision.id,v_revision.revision,v_result,v_revision.created_by);
  return v_result;
end
$function$;

alter table tongs.script_approval_revisions enable row level security;
alter table tongs.workpiece_script_approval_sequences enable row level security;
alter table tongs.image_map_revisions enable row level security;
alter table tongs.workpiece_image_map_sequences enable row level security;
alter table tongs.hearth_authority_operation_receipts enable row level security;

create policy script_approval_revisions_viewer on tongs.script_approval_revisions
  for select to authenticated using (tongs.has_workspace_role(workspace_id,'viewer'));
create policy script_approval_sequences_viewer on tongs.workpiece_script_approval_sequences
  for select to authenticated using (tongs.has_workspace_role(workspace_id,'viewer'));
create policy image_map_revisions_viewer on tongs.image_map_revisions
  for select to authenticated using (tongs.has_workspace_role(workspace_id,'viewer'));
create policy image_map_sequences_viewer on tongs.workpiece_image_map_sequences
  for select to authenticated using (tongs.has_workspace_role(workspace_id,'viewer'));
create policy hearth_authority_receipts_viewer on tongs.hearth_authority_operation_receipts
  for select to authenticated using (tongs.has_workspace_role(workspace_id,'viewer'));

revoke all on tongs.script_approval_revisions,tongs.workpiece_script_approval_sequences,
  tongs.image_map_revisions,tongs.workpiece_image_map_sequences,tongs.hearth_authority_operation_receipts
  from public,anon,authenticated;
grant select on tongs.script_approval_revisions,tongs.workpiece_script_approval_sequences,
  tongs.image_map_revisions,tongs.workpiece_image_map_sequences,tongs.hearth_authority_operation_receipts
  to authenticated;

revoke all on function tongs.commit_script_approval_snapshot(uuid,uuid,bigint,text,bigint,text,text,text,text,uuid) from public,anon,authenticated;
revoke all on function tongs.commit_image_map_revision(uuid,uuid,bigint,uuid,uuid,text,jsonb,text,text[],jsonb,text,text,uuid) from public,anon,authenticated;
grant execute on function tongs.commit_script_approval_snapshot(uuid,uuid,bigint,text,bigint,text,text,text,text,uuid) to service_role;
grant execute on function tongs.commit_image_map_revision(uuid,uuid,bigint,uuid,uuid,text,jsonb,text,text[],jsonb,text,text,uuid) to service_role;

comment on column tongs.image_map_revisions.semantic_state_hash is
  'Canonical semantic state hash used for no-change detection; excludes immutable revision identity.';
comment on column tongs.image_map_revisions.immutable_revision_hash is
  'Unique immutable revision identity including lineage, operation identity, and creation boundary.';
comment on function tongs.image_map_plan_provenance(jsonb) is
  'Deterministic aggregate of entry assessments: provenance_unknown > stale > unresolved > current.';
comment on table tongs.script_approval_revisions is
  'Immutable creator-approved script bytes. Legacy milestone notes are not approval authority.';
comment on table tongs.image_map_revisions is
  'Immutable image-map documents with canonical script provenance and per-entry anchor assessments.';

commit;
