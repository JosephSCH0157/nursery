-- S4-1: Canonical Asset Persistence and Resolution Authority.
-- Additive authority schema only. Hearth/Hammer caller migration is deferred.

begin;

-- Existing tongs.assets rows are all workpiece-scoped. Make that fact explicit
-- before permitting the separate workspace-global shape.
alter table tongs.assets
  add column if not exists asset_scope text,
  add column if not exists workspace_reuse_policy text,
  add column if not exists provenance_classification text,
  add column if not exists provenance_json jsonb not null default '{}'::jsonb;

update tongs.assets
set asset_scope = 'workpiece',
    workspace_reuse_policy = 'not_applicable',
    provenance_classification = 'canonical_native',
    provenance_json = case
      when provenance_json = '{}'::jsonb
        then jsonb_build_object('classification_basis', 'pre_s4_1_tongs_asset_row')
      else provenance_json
    end
where asset_scope is null
   or workspace_reuse_policy is null
   or provenance_classification is null;

alter table tongs.assets
  alter column workpiece_id drop not null,
  alter column asset_scope set not null,
  alter column workspace_reuse_policy set not null,
  alter column provenance_classification set not null,
  alter column asset_scope set default 'workpiece',
  alter column workspace_reuse_policy set default 'not_applicable',
  alter column provenance_classification set default 'canonical_native',
  drop constraint if exists assets_scope_shape_check,
  add constraint assets_scope_shape_check check (
    (asset_scope = 'workpiece' and workpiece_id is not null and workspace_reuse_policy = 'not_applicable')
    or
    (asset_scope = 'workspace' and workpiece_id is null and workspace_reuse_policy in ('allowed', 'restricted'))
  ),
  drop constraint if exists assets_provenance_classification_check,
  add constraint assets_provenance_classification_check check (
    provenance_classification in ('canonical_native','legacy_resolved','legacy_unresolved','conflicting_evidence')
  ),
  drop constraint if exists assets_provenance_json_check,
  add constraint assets_provenance_json_check check (jsonb_typeof(provenance_json) = 'object');

comment on column tongs.assets.asset_scope is
  'Canonical ownership discriminator. workpiece requires workpiece_id; workspace requires null workpiece_id. Null never means unknown.';
comment on column tongs.assets.workspace_reuse_policy is
  'Explicit policy for using workspace-scoped media in a workpiece. It is never inferred from null workpiece ownership.';
comment on column tongs.assets.provenance_classification is
  'Canonical identity provenance. Unresolved legacy references belong in asset_legacy_reference_evidence, not fabricated asset rows.';
comment on column tongs.assets.path is
  'Presentation/workpiece metadata only. A path never selects canonical asset identity.';

-- Exact scope relationships for server resolution and derivative FKs.
create unique index if not exists assets_id_workspace_uidx
  on tongs.assets(id, workspace_id);
create unique index if not exists assets_id_workspace_workpiece_uidx
  on tongs.assets(id, workspace_id, workpiece_id);
create index if not exists assets_workspace_scope_kind_state_idx
  on tongs.assets(workspace_id, asset_scope, asset_kind, status, created_at desc);
create index if not exists assets_workspace_path_hash_audit_idx
  on tongs.assets(workspace_id, path, content_hash)
  where content_hash is not null;

alter table tongs.assets
  drop constraint if exists assets_workpiece_workspace_authority_fkey,
  add constraint assets_workpiece_workspace_authority_fkey
    foreign key(workpiece_id, workspace_id)
    references tongs.episodes(id, workspace_id)
    on delete cascade
    not valid;

-- Identity-bearing columns cannot be retargeted. Pending rows may acquire their
-- verified byte evidence once; ready/referenced rows cannot change identity.
create or replace function tongs.enforce_canonical_asset_identity_immutability()
returns trigger
language plpgsql
set search_path = pg_catalog, tongs
as $function$
begin
  if new.workspace_id is distinct from old.workspace_id
    or new.asset_scope is distinct from old.asset_scope
    or new.workpiece_id is distinct from old.workpiece_id
    or new.provenance_classification is distinct from old.provenance_classification then
    raise exception 'canonical_asset_identity_immutable' using errcode = '55000';
  end if;

  if old.status in ('ready','superseded') or old.reference_committed_at is not null then
    if new.storage_bucket is distinct from old.storage_bucket
      or new.storage_key is distinct from old.storage_key
      or new.content_hash is distinct from old.content_hash
      or new.bytes is distinct from old.bytes
      or new.mime_type is distinct from old.mime_type
      or new.asset_kind is distinct from old.asset_kind then
      raise exception 'canonical_asset_evidence_immutable' using errcode = '55000';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_assets_canonical_identity_immutable on tongs.assets;
create trigger trg_assets_canonical_identity_immutable
before update on tongs.assets
for each row execute function tongs.enforce_canonical_asset_identity_immutability();

-- Historical references remain separate evidence until exact resolution is
-- proven. Assigning an audit UUID does not create a canonical media object.
create table if not exists tongs.asset_legacy_reference_evidence (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  expected_workpiece_id uuid null,
  source_surface text not null check(length(btrim(source_surface)) > 0),
  source_record_key text not null check(length(btrim(source_record_key)) > 0),
  legacy_identifier text null,
  path_assertion text null,
  storage_bucket_assertion text null,
  storage_key_assertion text null,
  content_hash_assertion text null check(content_hash_assertion is null or content_hash_assertion ~ '^[0-9a-f]{64}$'),
  mime_type_assertion text null,
  width_assertion integer null check(width_assertion is null or width_assertion > 0),
  height_assertion integer null check(height_assertion is null or height_assertion > 0),
  duration_ms_assertion bigint null check(duration_ms_assertion is null or duration_ms_assertion > 0),
  classification text not null default 'legacy_unresolved'
    check(classification in ('canonical_proven','legacy_resolved','legacy_unresolved','conflicting_evidence')),
  resolved_asset_id uuid null,
  resolution_evidence_json jsonb not null default '{}'::jsonb check(jsonb_typeof(resolution_evidence_json)='object'),
  created_at timestamptz not null default now(),
  resolved_at timestamptz null,
  created_by uuid not null references auth.users(id),
  unique(workspace_id, source_surface, source_record_key),
  constraint asset_legacy_expected_workpiece_fkey foreign key(expected_workpiece_id, workspace_id)
    references tongs.episodes(id, workspace_id) on delete cascade,
  constraint asset_legacy_resolved_asset_fkey foreign key(resolved_asset_id, workspace_id)
    references tongs.assets(id, workspace_id),
  check (
    (classification in ('canonical_proven','legacy_resolved') and resolved_asset_id is not null and resolved_at is not null)
    or
    (classification in ('legacy_unresolved','conflicting_evidence') and resolved_asset_id is null and resolved_at is null)
  )
);

create index if not exists asset_legacy_reference_unresolved_idx
  on tongs.asset_legacy_reference_evidence(workspace_id, classification, source_surface)
  where classification in ('legacy_unresolved','conflicting_evidence');

alter table tongs.asset_legacy_reference_evidence enable row level security;
drop policy if exists asset_legacy_reference_select_workspace on tongs.asset_legacy_reference_evidence;
create policy asset_legacy_reference_select_workspace
on tongs.asset_legacy_reference_evidence for select to authenticated
using(tongs.can_access_workspace(workspace_id));

-- Tongs-only exact legacy resolution. Path alone is deliberately insufficient.
create or replace function tongs.resolve_legacy_asset_reference_exact(
  p_reference_id uuid,
  p_canonical_asset_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, tongs
as $function$
declare
  v_ref tongs.asset_legacy_reference_evidence%rowtype;
  v_asset tongs.assets%rowtype;
  v_intrinsic jsonb;
  v_duration bigint;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service authority required' using errcode='42501';
  end if;
  select * into v_ref from tongs.asset_legacy_reference_evidence where id=p_reference_id for update;
  if not found then return jsonb_build_object('disposition','legacy_reference_missing'); end if;
  if v_ref.classification in ('canonical_proven','legacy_resolved') then
    if v_ref.resolved_asset_id <> p_canonical_asset_id then
      return jsonb_build_object('disposition','conflicting_evidence');
    end if;
    return jsonb_build_object('disposition','already_resolved','canonical_asset_id',v_ref.resolved_asset_id);
  end if;
  select * into v_asset from tongs.assets
    where id=p_canonical_asset_id and workspace_id=v_ref.workspace_id;
  if not found then return jsonb_build_object('disposition','canonical_asset_missing'); end if;
  if v_ref.expected_workpiece_id is not null and not (
    (v_asset.asset_scope='workpiece' and v_asset.workpiece_id=v_ref.expected_workpiece_id)
    or (v_asset.asset_scope='workspace' and v_asset.workspace_reuse_policy='allowed')
  ) then return jsonb_build_object('disposition','canonical_asset_workpiece_mismatch'); end if;

  -- Exact storage identity or exact content hash is mandatory. Path is only corroboration.
  if not (
    (v_ref.storage_bucket_assertion is not null and v_ref.storage_key_assertion is not null
      and v_ref.storage_bucket_assertion=v_asset.storage_bucket and v_ref.storage_key_assertion=v_asset.storage_key)
    or
    (v_ref.content_hash_assertion is not null and v_ref.content_hash_assertion=v_asset.content_hash)
  ) then
    return jsonb_build_object('disposition','asset_relationship_unverified');
  end if;
  if v_ref.content_hash_assertion is not null and v_ref.content_hash_assertion is distinct from v_asset.content_hash then
    return jsonb_build_object('disposition','canonical_asset_hash_mismatch');
  end if;
  if v_ref.mime_type_assertion is not null and v_ref.mime_type_assertion is distinct from v_asset.mime_type then
    return jsonb_build_object('disposition','canonical_asset_kind_mismatch');
  end if;
  if v_ref.path_assertion is not null and v_ref.path_assertion is distinct from v_asset.path then
    return jsonb_build_object('disposition','conflicting_evidence');
  end if;
  v_intrinsic := coalesce(v_asset.metadata_json,'{}'::jsonb);
  v_duration := case
    when nullif(v_intrinsic->>'duration_ms','') ~ '^[0-9]+$'
      then (v_intrinsic->>'duration_ms')::bigint
    else null
  end;
  if v_ref.width_assertion is not null and v_ref.width_assertion is distinct from v_asset.width then return jsonb_build_object('disposition','conflicting_evidence'); end if;
  if v_ref.height_assertion is not null and v_ref.height_assertion is distinct from v_asset.height then return jsonb_build_object('disposition','conflicting_evidence'); end if;
  if v_ref.duration_ms_assertion is not null and v_ref.duration_ms_assertion is distinct from v_duration then
    return jsonb_build_object('disposition','conflicting_evidence');
  end if;

  update tongs.asset_legacy_reference_evidence
  set classification='legacy_resolved', resolved_asset_id=v_asset.id, resolved_at=now(),
      resolution_evidence_json=jsonb_build_object(
        'resolver','tongs.resolve_legacy_asset_reference_exact.v1',
        'actor_id',p_actor_id,
        'canonical_asset_id',v_asset.id,
        'content_hash',v_asset.content_hash,
        'storage_bucket',v_asset.storage_bucket,
        'storage_key',v_asset.storage_key
      )
  where id=v_ref.id;
  return jsonb_build_object('disposition','legacy_resolved','canonical_asset_id',v_asset.id);
end;
$function$;

-- One canonical resolver: ID selects; optional evidence only validates.
create or replace function tongs.resolve_canonical_asset_authority(
  p_workspace_id uuid,
  p_canonical_asset_id uuid,
  p_expected_workpiece_id uuid default null,
  p_required_asset_kind text default null,
  p_expected_content_hash text default null,
  p_expected_storage_bucket text default null,
  p_expected_storage_key text default null,
  p_expected_path text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, tongs
as $function$
declare
  v_asset tongs.assets%rowtype;
  v_state text;
  v_code text;
  v_duration bigint;
begin
  if auth.role() <> 'service_role' and not tongs.can_access_workspace(p_workspace_id) then
    raise exception 'workspace access required' using errcode='42501';
  end if;
  select * into v_asset from tongs.assets where id=p_canonical_asset_id;
  if not found then
    return jsonb_build_object('state','unresolved','code','canonical_asset_missing','canonical_asset_id',p_canonical_asset_id);
  end if;
  if v_asset.workspace_id <> p_workspace_id then
    return jsonb_build_object('state','relationship_mismatch','code','canonical_asset_workspace_mismatch','canonical_asset_id',p_canonical_asset_id);
  end if;
  if p_expected_workpiece_id is not null then
    if v_asset.asset_scope='workpiece' and v_asset.workpiece_id is distinct from p_expected_workpiece_id then
      return jsonb_build_object('state','relationship_mismatch','code','canonical_asset_workpiece_mismatch','canonical_asset_id',p_canonical_asset_id);
    end if;
    if v_asset.asset_scope='workspace' and v_asset.workspace_reuse_policy<>'allowed' then
      return jsonb_build_object('state','relationship_mismatch','code','canonical_asset_workspace_reuse_not_allowed','canonical_asset_id',p_canonical_asset_id);
    end if;
  end if;
  if p_required_asset_kind is not null and v_asset.asset_kind <> p_required_asset_kind then
    return jsonb_build_object('state','invalid','code','canonical_asset_kind_mismatch','canonical_asset_id',p_canonical_asset_id);
  end if;
  if p_expected_content_hash is not null and v_asset.content_hash is distinct from lower(p_expected_content_hash) then
    return jsonb_build_object('state','invalid','code','canonical_asset_hash_mismatch','canonical_asset_id',p_canonical_asset_id);
  end if;
  if (p_expected_storage_bucket is not null and v_asset.storage_bucket is distinct from p_expected_storage_bucket)
    or (p_expected_storage_key is not null and v_asset.storage_key is distinct from p_expected_storage_key)
    or (p_expected_path is not null and v_asset.path is distinct from p_expected_path) then
    return jsonb_build_object('state','invalid','code','canonical_asset_storage_evidence_mismatch','canonical_asset_id',p_canonical_asset_id);
  end if;
  if v_asset.provenance_classification='legacy_unresolved' then v_state:='unresolved'; v_code:='legacy_asset_unresolved';
  elsif v_asset.provenance_classification='conflicting_evidence' then v_state:='invalid'; v_code:='canonical_asset_conflicting_evidence';
  elsif v_asset.status='pending' then v_state:='processing'; v_code:=null;
  elsif v_asset.status<>'ready' then v_state:='invalid'; v_code:='canonical_asset_not_ready';
  elsif v_asset.content_hash is null or v_asset.ready_at is null then v_state:='invalid'; v_code:='canonical_asset_evidence_incomplete';
  elsif v_asset.mime_type like 'image/%' and (v_asset.width is null or v_asset.height is null) then v_state:='invalid'; v_code:='canonical_asset_intrinsic_metadata_missing';
  elsif v_asset.mime_type like 'video/%' and not (
    nullif(v_asset.metadata_json->>'duration_ms','') ~ '^[1-9][0-9]*$'
  ) then v_state:='invalid'; v_code:='canonical_asset_intrinsic_metadata_missing';
  else v_state:='ready'; v_code:=null;
  end if;
  v_duration:=case when nullif(v_asset.metadata_json->>'duration_ms','') ~ '^[0-9]+$' then (v_asset.metadata_json->>'duration_ms')::bigint else null end;
  return jsonb_strip_nulls(jsonb_build_object(
    'state',v_state,'code',v_code,
    'canonical_asset_id',v_asset.id,
    'workspace_id',v_asset.workspace_id,
    'scope',jsonb_strip_nulls(jsonb_build_object('kind',v_asset.asset_scope,'workpiece_id',v_asset.workpiece_id,'workspace_reuse_policy',v_asset.workspace_reuse_policy)),
    'asset_kind',v_asset.asset_kind,
    'content_hash',v_asset.content_hash,
    'storage_bucket',v_asset.storage_bucket,
    'storage_object_key',v_asset.storage_key,
    'path',v_asset.path,
    'mime_type',v_asset.mime_type,
    'bytes',v_asset.bytes,
    'intrinsic_width',v_asset.width,
    'intrinsic_height',v_asset.height,
    'duration_ms',v_duration,
    'asset_status',v_asset.status,
    'provenance_classification',v_asset.provenance_classification,
    'provenance',v_asset.provenance_json,
    'ready_at',v_asset.ready_at
  ));
end;
$function$;

-- Immutable script basis fields for the already-proven derivative revision
-- authorities. This does not create a generic derivative registry.
create or replace function tongs.reject_script_derivative_basis_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, tongs
as $function$
declare
  v_key text;
  v_old jsonb:=to_jsonb(old);
  v_new jsonb:=to_jsonb(new);
begin
  foreach v_key in array array[
    'workspace_id','workpiece_id',
    'script_approval_id','script_approval_revision','script_content_hash',
    'source_script_approval_id','source_script_approval_revision','source_script_content_hash'
  ] loop
    if v_old ? v_key and (v_old->v_key) is distinct from (v_new->v_key) then
      raise exception 'script_derivative_basis_immutable:%',v_key using errcode='55000';
    end if;
  end loop;
  return new;
end;
$function$;

do $triggers$
declare v_table text;
begin
  foreach v_table in array array[
    'image_map_revisions','broll_plan_revisions','broll_beat_revisions',
    'reference_clip_plan_revisions','reference_clip_opportunity_revisions',
    'reference_visual_plan_revisions','reference_visual_opportunity_revisions'
  ] loop
    if to_regclass('tongs.'||v_table) is not null then
      execute format('drop trigger if exists trg_%I_s4_derivative_basis on tongs.%I',v_table,v_table);
      execute format('create trigger trg_%I_s4_derivative_basis before update on tongs.%I for each row execute function tongs.reject_script_derivative_basis_mutation()',v_table,v_table);
    end if;
  end loop;
end;
$triggers$;

-- Add exact same-workspace/workpiece relationships only to rows whose S4-0
-- semantics were proven canonical. NOT VALID preserves ambiguous history while
-- enforcing the relationship for every new write.
do $relationships$
begin
  if to_regclass('tongs.broll_candidate_revisions') is not null then
    alter table tongs.broll_candidate_revisions drop constraint if exists broll_candidate_asset_authority_fkey;
    alter table tongs.broll_candidate_revisions add constraint broll_candidate_asset_authority_fkey
      foreign key(asset_id,workspace_id,workpiece_id) references tongs.assets(id,workspace_id,workpiece_id) not valid;
    alter table tongs.broll_candidate_revisions drop constraint if exists broll_candidate_poster_asset_authority_fkey;
    alter table tongs.broll_candidate_revisions add constraint broll_candidate_poster_asset_authority_fkey
      foreign key(poster_asset_id,workspace_id,workpiece_id) references tongs.assets(id,workspace_id,workpiece_id) not valid;
  end if;
  if to_regclass('tongs.reference_clip_candidate_revisions') is not null then
    alter table tongs.reference_clip_candidate_revisions drop constraint if exists reference_clip_asset_authority_fkey;
    alter table tongs.reference_clip_candidate_revisions add constraint reference_clip_asset_authority_fkey
      foreign key(asset_id,workspace_id,workpiece_id) references tongs.assets(id,workspace_id,workpiece_id) not valid;
    alter table tongs.reference_clip_candidate_revisions drop constraint if exists reference_clip_poster_asset_authority_fkey;
    alter table tongs.reference_clip_candidate_revisions add constraint reference_clip_poster_asset_authority_fkey
      foreign key(poster_asset_id,workspace_id,workpiece_id) references tongs.assets(id,workspace_id,workpiece_id) not valid;
  end if;
  if to_regclass('tongs.reference_visual_candidate_revisions') is not null then
    alter table tongs.reference_visual_candidate_revisions drop constraint if exists reference_visual_asset_authority_fkey;
    alter table tongs.reference_visual_candidate_revisions add constraint reference_visual_asset_authority_fkey
      foreign key(asset_id,workspace_id,workpiece_id) references tongs.assets(id,workspace_id,workpiece_id) not valid;
  end if;
  if to_regclass('tongs.reference_visual_sequence_membership') is not null then
    alter table tongs.reference_visual_sequence_membership drop constraint if exists reference_visual_sequence_asset_authority_fkey;
    alter table tongs.reference_visual_sequence_membership add constraint reference_visual_sequence_asset_authority_fkey
      foreign key(asset_id,workspace_id,workpiece_id) references tongs.assets(id,workspace_id,workpiece_id) not valid;
  end if;
end;
$relationships$;

-- Ambiguous-row report: same presentation path with different canonical byte
-- identities is never auto-resolved, and staged unresolved references remain visible.
create or replace view tongs.canonical_asset_ambiguous_evidence_report
with (security_invoker=true)
as
select
  a.workspace_id,
  'same_path_different_content'::text as ambiguity_kind,
  a.path as evidence_key,
  null::text as source_surface,
  array_agg(a.id order by a.created_at) as candidate_asset_ids,
  array_agg(distinct a.content_hash) filter(where a.content_hash is not null) as content_hashes,
  count(*)::bigint as reference_count
from tongs.assets a
group by a.workspace_id,a.path
having count(distinct a.content_hash) filter(where a.content_hash is not null)>1
union all
select
  r.workspace_id,
  r.classification as ambiguity_kind,
  coalesce(r.storage_bucket_assertion||'/'||r.storage_key_assertion,r.path_assertion,r.legacy_identifier,r.source_record_key) as evidence_key,
  r.source_surface,
  array[]::uuid[] as candidate_asset_ids,
  case when r.content_hash_assertion is null then array[]::text[] else array[r.content_hash_assertion] end as content_hashes,
  1::bigint as reference_count
from tongs.asset_legacy_reference_evidence r
where r.classification in ('legacy_unresolved','conflicting_evidence');

-- Direct authenticated reads remain available; identity-bearing mutations are
-- restricted to Tongs authority operations/service role.
drop policy if exists assets_insert_if_workspace_access on tongs.assets;
drop policy if exists assets_update_if_workspace_access on tongs.assets;
drop policy if exists assets_delete_if_workspace_access on tongs.assets;

revoke all on table tongs.asset_legacy_reference_evidence from public,anon,authenticated;
grant select on table tongs.asset_legacy_reference_evidence to authenticated,service_role;
grant insert,update,delete on table tongs.asset_legacy_reference_evidence to service_role;
grant select on table tongs.canonical_asset_ambiguous_evidence_report to authenticated,service_role;

revoke all on function tongs.resolve_canonical_asset_authority(uuid,uuid,uuid,text,text,text,text,text) from public,anon;
grant execute on function tongs.resolve_canonical_asset_authority(uuid,uuid,uuid,text,text,text,text,text) to authenticated,service_role;
revoke all on function tongs.resolve_legacy_asset_reference_exact(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function tongs.resolve_legacy_asset_reference_exact(uuid,uuid,uuid) to service_role;

commit;
