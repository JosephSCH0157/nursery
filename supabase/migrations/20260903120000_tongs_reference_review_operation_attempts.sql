-- Creator-level Reference Material orchestration attempts.
-- This ledger is coordination evidence only. Native Source, Clip, Visual,
-- disposition, asset, selection, and Hammer authorities remain canonical.

create table tongs.reference_review_operation_attempts (
  attempt_id uuid primary key default gen_random_uuid(),
  operation_id text not null,
  operation_fingerprint text not null check (operation_fingerprint ~ '^[0-9a-f]{64}$'),
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  workpiece_id uuid not null references tongs.episodes(id) on delete cascade,
  media_family text not null check (media_family in ('reference_clip','reference_visual')),
  intent_kind text not null check (intent_kind in ('use_source','save_edits','replace','approve','skip')),
  opportunity_id uuid not null,
  expected_opportunity_revision_id uuid not null,
  expected_plan_revision_id uuid not null,
  expected_revisions_json jsonb not null default '{}'::jsonb check (jsonb_typeof(expected_revisions_json)='object'),
  parent_attempt_id uuid references tongs.reference_review_operation_attempts(attempt_id),
  ai_authorization text not null default 'not_applicable' check (ai_authorization in ('not_applicable','standing_approved','standing_denied','explicitly_approved','explicitly_denied')),
  terminal_outcome text check (terminal_outcome in ('succeeded','failed')),
  failure_code text,
  failure_message text,
  canonical_receipt_json jsonb,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  foreign key (workpiece_id,workspace_id) references tongs.episodes(id,workspace_id) on delete cascade,
  unique (workspace_id, operation_id),
  check ((terminal_outcome is null) = (completed_at is null)),
  check ((terminal_outcome='succeeded') = (canonical_receipt_json is not null)),
  check (terminal_outcome <> 'failed' or (failure_code is not null and failure_message is not null)),
  check (parent_attempt_id is null or parent_attempt_id <> attempt_id),
  check (canonical_receipt_json is null or not (
    canonical_receipt_json ?| array['asset','assets','evidence','sources','source_members','preview_url','image_url','video_url']
  ))
);

comment on table tongs.reference_review_operation_attempts is
  'Immutable creator-level orchestration attempts. This is not media, Source, evidence, selection, disposition, asset, or Hammer authority.';
comment on column tongs.reference_review_operation_attempts.canonical_receipt_json is
  'Identity-only completion evidence referencing native canonical authorities; never stores media payloads, Source membership, evidence, or preview URLs.';

create index reference_review_attempts_workpiece_idx
  on tongs.reference_review_operation_attempts(workspace_id,workpiece_id,created_at desc);
create index reference_review_attempts_opportunity_idx
  on tongs.reference_review_operation_attempts(workspace_id,workpiece_id,media_family,opportunity_id,created_at desc);
create index reference_review_attempts_parent_idx
  on tongs.reference_review_operation_attempts(parent_attempt_id) where parent_attempt_id is not null;

create or replace function tongs.protect_reference_review_operation_attempt()
returns trigger language plpgsql set search_path=pg_catalog,tongs as $$
begin
  if tg_op='DELETE' then raise exception 'Reference review attempts are immutable' using errcode='55000';end if;
  if old.terminal_outcome is not null then raise exception 'Terminal Reference review attempts are immutable' using errcode='55000';end if;
  if new.attempt_id<>old.attempt_id or new.operation_id<>old.operation_id or new.operation_fingerprint<>old.operation_fingerprint or new.workspace_id<>old.workspace_id or new.workpiece_id<>old.workpiece_id or new.media_family<>old.media_family or new.intent_kind<>old.intent_kind or new.opportunity_id<>old.opportunity_id or new.expected_opportunity_revision_id<>old.expected_opportunity_revision_id or new.expected_plan_revision_id<>old.expected_plan_revision_id or new.expected_revisions_json<>old.expected_revisions_json or new.parent_attempt_id is distinct from old.parent_attempt_id or new.ai_authorization<>old.ai_authorization or new.created_by<>old.created_by or new.created_at<>old.created_at then raise exception 'Reference review attempt identity is immutable' using errcode='55000';end if;
  return new;
end$$;
create trigger reference_review_operation_attempts_immutable before update or delete on tongs.reference_review_operation_attempts for each row execute function tongs.protect_reference_review_operation_attempt();

alter table tongs.reference_review_operation_attempts enable row level security;
create policy reference_review_attempts_viewer on tongs.reference_review_operation_attempts
  for select to authenticated using (tongs.has_workspace_role(workspace_id,'viewer'));
revoke all on tongs.reference_review_operation_attempts from public,anon,authenticated;
grant select on tongs.reference_review_operation_attempts to authenticated;

create or replace function tongs.begin_reference_review_operation_attempt(
  p_workspace_id uuid,
  p_workpiece_id uuid,
  p_operation_id text,
  p_operation_fingerprint text,
  p_media_family text,
  p_intent_kind text,
  p_opportunity_id uuid,
  p_expected_opportunity_revision_id uuid,
  p_expected_plan_revision_id uuid,
  p_expected_revisions_json jsonb default '{}'::jsonb,
  p_parent_attempt_id uuid default null,
  p_ai_authorization text default 'not_applicable'
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare v_actor uuid:=auth.uid();v_existing tongs.reference_review_operation_attempts%rowtype;v_parent tongs.reference_review_operation_attempts%rowtype;v_created tongs.reference_review_operation_attempts%rowtype;
begin
  if v_actor is null or not tongs.has_workspace_role(p_workspace_id,'editor') then raise exception 'Reference review requires workspace editor authority' using errcode='42501';end if;
  if p_operation_id is null or length(btrim(p_operation_id))<8 or p_operation_fingerprint!~'^[0-9a-f]{64}$' then return jsonb_build_object('disposition','invalid_operation_identity');end if;
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||p_operation_id||':reference-review-attempt',0));
  select * into v_existing from tongs.reference_review_operation_attempts where workspace_id=p_workspace_id and operation_id=p_operation_id;
  if found then
    if v_existing.operation_fingerprint<>p_operation_fingerprint then return jsonb_build_object('disposition','operation_identity_conflict');end if;
    return jsonb_build_object('disposition','existing','attempt',to_jsonb(v_existing));
  end if;
  if p_parent_attempt_id is not null then
    select * into v_parent from tongs.reference_review_operation_attempts where attempt_id=p_parent_attempt_id and workspace_id=p_workspace_id and workpiece_id=p_workpiece_id;
    if not found or v_parent.terminal_outcome<>'failed' then return jsonb_build_object('disposition','invalid_retry_parent');end if;
    if v_parent.media_family<>p_media_family or v_parent.intent_kind<>p_intent_kind or v_parent.opportunity_id<>p_opportunity_id then return jsonb_build_object('disposition','retry_scope_mismatch');end if;
  end if;
  insert into tongs.reference_review_operation_attempts(operation_id,operation_fingerprint,workspace_id,workpiece_id,media_family,intent_kind,opportunity_id,expected_opportunity_revision_id,expected_plan_revision_id,expected_revisions_json,parent_attempt_id,ai_authorization,created_by)
  values(p_operation_id,p_operation_fingerprint,p_workspace_id,p_workpiece_id,p_media_family,p_intent_kind,p_opportunity_id,p_expected_opportunity_revision_id,p_expected_plan_revision_id,coalesce(p_expected_revisions_json,'{}'::jsonb),p_parent_attempt_id,p_ai_authorization,v_actor)
  returning * into v_created;
  return jsonb_build_object('disposition','started','attempt',to_jsonb(v_created));
end$$;

create or replace function tongs.finish_reference_review_operation_attempt(
  p_attempt_id uuid,
  p_outcome text,
  p_failure_code text default null,
  p_failure_message text default null,
  p_canonical_receipt_json jsonb default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog,tongs as $$
declare v_current tongs.reference_review_operation_attempts%rowtype;v_updated tongs.reference_review_operation_attempts%rowtype;
begin
  if auth.role()<>'service_role' then raise exception 'Only Tongs service authority may finish a Reference review attempt' using errcode='42501';end if;
  select * into v_current from tongs.reference_review_operation_attempts where attempt_id=p_attempt_id for update;
  if not found then return jsonb_build_object('disposition','attempt_not_found');end if;
  if v_current.terminal_outcome is not null then return jsonb_build_object('disposition','terminal','attempt',to_jsonb(v_current));end if;
  if p_outcome not in ('succeeded','failed') then return jsonb_build_object('disposition','invalid_outcome');end if;
  if p_outcome='succeeded' and (p_canonical_receipt_json is null or p_canonical_receipt_json ?| array['asset','assets','evidence','sources','source_members','preview_url','image_url','video_url']) then return jsonb_build_object('disposition','invalid_canonical_receipt');end if;
  if p_outcome='failed' and (nullif(btrim(p_failure_code),'') is null or nullif(btrim(p_failure_message),'') is null) then return jsonb_build_object('disposition','failure_details_required');end if;
  update tongs.reference_review_operation_attempts set terminal_outcome=p_outcome,failure_code=case when p_outcome='failed' then btrim(p_failure_code) end,failure_message=case when p_outcome='failed' then btrim(p_failure_message) end,canonical_receipt_json=case when p_outcome='succeeded' then p_canonical_receipt_json end,completed_at=now() where attempt_id=p_attempt_id returning * into v_updated;
  return jsonb_build_object('disposition',p_outcome,'attempt',to_jsonb(v_updated));
end$$;

revoke all on function tongs.begin_reference_review_operation_attempt(uuid,uuid,text,text,text,text,uuid,uuid,uuid,jsonb,uuid,text) from public,anon;
grant execute on function tongs.begin_reference_review_operation_attempt(uuid,uuid,text,text,text,text,uuid,uuid,uuid,jsonb,uuid,text) to authenticated;
revoke all on function tongs.finish_reference_review_operation_attempt(uuid,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function tongs.finish_reference_review_operation_attempt(uuid,text,text,text,jsonb) to service_role;
