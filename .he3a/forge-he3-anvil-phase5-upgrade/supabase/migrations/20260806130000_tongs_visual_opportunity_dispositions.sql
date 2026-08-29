begin;

create table tongs.visual_opportunity_disposition_revisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  workpiece_id uuid not null,
  child_kind text not null check (child_kind in ('image','reference_clip','reference_visual','broll')),
  opportunity_id text not null check (length(btrim(opportunity_id)) > 0),
  opportunity_revision_identity text not null check (length(btrim(opportunity_revision_identity)) > 0),
  child_plan_revision_id uuid not null,
  child_plan_revision bigint not null check (child_plan_revision > 0),
  revision bigint not null check (revision > 0),
  previous_revision_id uuid,
  previous_revision bigint,
  disposition text not null check (disposition in ('active','skipped')),
  skip_reason text check (skip_reason is null or skip_reason in ('rights_unavailable','material_unobtainable','editorially_unneeded','duplicate_coverage','other')),
  creator_note text,
  operation_id text not null unique,
  operation_fingerprint text not null check (operation_fingerprint ~ '^[0-9a-f]{64}$'),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (id, workspace_id, workpiece_id, child_kind, opportunity_id, revision),
  unique (workspace_id, workpiece_id, child_kind, opportunity_id, revision),
  foreign key (previous_revision_id, workspace_id, workpiece_id, child_kind, opportunity_id, previous_revision)
    references tongs.visual_opportunity_disposition_revisions(id, workspace_id, workpiece_id, child_kind, opportunity_id, revision),
  check ((disposition = 'skipped' and skip_reason is not null) or (disposition = 'active' and skip_reason is null)),
  check (creator_note is null or length(btrim(creator_note)) between 1 and 2000)
);

create table tongs.visual_opportunity_disposition_sequences (
  workspace_id uuid not null,
  workpiece_id uuid not null,
  child_kind text not null check (child_kind in ('image','reference_clip','reference_visual','broll')),
  opportunity_id text not null,
  current_revision_id uuid not null,
  current_revision bigint not null check (current_revision > 0),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, workpiece_id, child_kind, opportunity_id),
  foreign key (current_revision_id, workspace_id, workpiece_id, child_kind, opportunity_id, current_revision)
    references tongs.visual_opportunity_disposition_revisions(id, workspace_id, workpiece_id, child_kind, opportunity_id, revision)
);

alter table tongs.visual_opportunity_disposition_revisions enable row level security;
alter table tongs.visual_opportunity_disposition_sequences enable row level security;
create policy visual_disposition_revisions_read on tongs.visual_opportunity_disposition_revisions for select to authenticated using (tongs.has_workspace_role(workspace_id,'viewer'));
create policy visual_disposition_sequences_read on tongs.visual_opportunity_disposition_sequences for select to authenticated using (tongs.has_workspace_role(workspace_id,'viewer'));
revoke all on tongs.visual_opportunity_disposition_revisions, tongs.visual_opportunity_disposition_sequences from public, anon, authenticated;
grant select on tongs.visual_opportunity_disposition_revisions, tongs.visual_opportunity_disposition_sequences to authenticated, service_role;
grant all on tongs.visual_opportunity_disposition_revisions, tongs.visual_opportunity_disposition_sequences to service_role;

create or replace function tongs.reject_visual_disposition_revision_mutation()
returns trigger language plpgsql set search_path=pg_catalog,tongs as $$
begin
  raise exception 'visual opportunity disposition revisions are immutable' using errcode='55000';
end $$;
create trigger visual_opportunity_disposition_revisions_immutable
before update or delete on tongs.visual_opportunity_disposition_revisions
for each row execute function tongs.reject_visual_disposition_revision_mutation();

create or replace function tongs.set_visual_opportunity_disposition(
  p_workspace_id uuid,
  p_workpiece_id uuid,
  p_child_kind text,
  p_opportunity_id text,
  p_opportunity_revision_identity text,
  p_child_plan_revision_id uuid,
  p_child_plan_revision bigint,
  p_expected_disposition_revision_id uuid,
  p_expected_disposition_revision bigint,
  p_disposition text,
  p_skip_reason text,
  p_creator_note text,
  p_operation_id text,
  p_operation_fingerprint text,
  p_actor_id uuid
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, tongs
as $$
declare
  prior tongs.visual_opportunity_disposition_revisions%rowtype;
  seq tongs.visual_opportunity_disposition_sequences%rowtype;
  replay tongs.visual_opportunity_disposition_revisions%rowtype;
  next_id uuid := gen_random_uuid();
  next_revision bigint;
  normalized_note text := nullif(btrim(p_creator_note),'');
  canonical jsonb;
  expected_hash text;
  result jsonb;
  target_valid boolean := false;
begin
  if not tongs.has_workspace_role(p_workspace_id,'editor') then raise exception 'workspace editor authority required' using errcode='42501'; end if;
  if p_actor_id is distinct from auth.uid() and current_user not in ('service_role','postgres','supabase_admin') then raise exception 'actor identity mismatch' using errcode='42501'; end if;
  if p_child_kind not in ('image','reference_clip','reference_visual','broll') or p_disposition not in ('active','skipped') then return jsonb_build_object('disposition','invalid_request'); end if;
  if (p_disposition='skipped' and p_skip_reason not in ('rights_unavailable','material_unobtainable','editorially_unneeded','duplicate_coverage','other')) or (p_disposition='active' and p_skip_reason is not null) then return jsonb_build_object('disposition','invalid_reason'); end if;

  select * into replay from tongs.visual_opportunity_disposition_revisions where operation_id=p_operation_id;
  if found then
    if replay.operation_fingerprint<>p_operation_fingerprint then return jsonb_build_object('disposition','operation_identity_conflict'); end if;
    return jsonb_build_object('disposition','replay','disposition_revision',to_jsonb(replay));
  end if;

  select * into seq from tongs.visual_opportunity_disposition_sequences
    where workspace_id=p_workspace_id and workpiece_id=p_workpiece_id and child_kind=p_child_kind and opportunity_id=p_opportunity_id for update;
  if found then
    if seq.current_revision_id is distinct from p_expected_disposition_revision_id or seq.current_revision<>p_expected_disposition_revision then
      return jsonb_build_object('disposition','revision_conflict','current_revision_id',seq.current_revision_id,'current_revision',seq.current_revision);
    end if;
    select * into prior from tongs.visual_opportunity_disposition_revisions where id=seq.current_revision_id;
    next_revision:=seq.current_revision+1;
  else
    if p_expected_disposition_revision_id is not null or coalesce(p_expected_disposition_revision,0)<>0 then return jsonb_build_object('disposition','revision_conflict','current_revision_id',null,'current_revision',0); end if;
    next_revision:=1;
  end if;

  if p_child_kind='image' then
    select exists(
      select 1 from tongs.workpiece_image_map_sequences s join tongs.image_map_revisions p on p.id=s.current_revision_id
      cross join lateral jsonb_array_elements(coalesce(p.document_json->'entries','[]'::jsonb)) e
      where s.workspace_id=p_workspace_id and s.workpiece_id=p_workpiece_id and p.id=p_child_plan_revision_id and p.revision=p_child_plan_revision
        and e->>'id'=p_opportunity_id and e->>'id'=p_opportunity_revision_identity
    ) into target_valid;
  elsif p_child_kind='broll' then
    select exists(
      select 1 from tongs.broll_plan_sequences s join tongs.broll_plan_beat_membership m on m.plan_revision_id=s.current_plan_revision_id
      where s.workspace_id=p_workspace_id and s.workpiece_id=p_workpiece_id and s.current_plan_revision_id=p_child_plan_revision_id and s.current_plan_revision=p_child_plan_revision
        and m.beat_id::text=p_opportunity_id and m.beat_revision_id::text=p_opportunity_revision_identity
    ) into target_valid;
  elsif p_child_kind='reference_clip' then
    select exists(
      select 1 from tongs.reference_clip_plan_sequences s join tongs.reference_clip_plan_membership m on m.plan_revision_id=s.current_plan_revision_id
      where s.workspace_id=p_workspace_id and s.workpiece_id=p_workpiece_id and s.current_plan_revision_id=p_child_plan_revision_id and s.current_plan_revision=p_child_plan_revision
        and m.opportunity_id::text=p_opportunity_id and m.opportunity_revision_id::text=p_opportunity_revision_identity
    ) into target_valid;
  else
    select exists(
      select 1 from tongs.reference_visual_plan_sequences s join tongs.reference_visual_plan_membership m on m.plan_revision_id=s.current_plan_revision_id
      where s.workspace_id=p_workspace_id and s.workpiece_id=p_workpiece_id and s.current_plan_revision_id=p_child_plan_revision_id and s.current_plan_revision=p_child_plan_revision
        and m.opportunity_id::text=p_opportunity_id and m.opportunity_revision_id::text=p_opportunity_revision_identity
    ) into target_valid;
  end if;
  if not target_valid then return jsonb_build_object('disposition','target_revision_conflict'); end if;

  canonical:=jsonb_build_object('workspace_id',p_workspace_id,'workpiece_id',p_workpiece_id,'child_kind',p_child_kind,'opportunity_id',p_opportunity_id,'opportunity_revision_identity',p_opportunity_revision_identity,'child_plan_revision_id',p_child_plan_revision_id,'child_plan_revision',p_child_plan_revision,'revision',next_revision,'previous_revision_id',prior.id,'previous_revision',prior.revision,'disposition',p_disposition,'skip_reason',p_skip_reason,'creator_note',normalized_note,'actor_id',p_actor_id);
  expected_hash:=encode(extensions.digest(convert_to(canonical::text,'utf8'),'sha256'),'hex');
  insert into tongs.visual_opportunity_disposition_revisions(id,workspace_id,workpiece_id,child_kind,opportunity_id,opportunity_revision_identity,child_plan_revision_id,child_plan_revision,revision,previous_revision_id,previous_revision,disposition,skip_reason,creator_note,operation_id,operation_fingerprint,content_hash,created_by)
  values(next_id,p_workspace_id,p_workpiece_id,p_child_kind,p_opportunity_id,p_opportunity_revision_identity,p_child_plan_revision_id,p_child_plan_revision,next_revision,prior.id,prior.revision,p_disposition,p_skip_reason,normalized_note,p_operation_id,p_operation_fingerprint,expected_hash,p_actor_id);
  insert into tongs.visual_opportunity_disposition_sequences(workspace_id,workpiece_id,child_kind,opportunity_id,current_revision_id,current_revision)
  values(p_workspace_id,p_workpiece_id,p_child_kind,p_opportunity_id,next_id,next_revision)
  on conflict(workspace_id,workpiece_id,child_kind,opportunity_id) do update set current_revision_id=excluded.current_revision_id,current_revision=excluded.current_revision,updated_at=now();
  select jsonb_build_object('disposition','committed','disposition_revision',to_jsonb(r)) into result from tongs.visual_opportunity_disposition_revisions r where r.id=next_id;
  return result;
end $$;

create or replace function tongs.read_visual_opportunity_dispositions(p_workspace_id uuid,p_workpiece_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog,tongs as $$
select case when not tongs.has_workspace_role(p_workspace_id,'viewer') then null else jsonb_build_object(
  'workspace_id',p_workspace_id,'workpiece_id',p_workpiece_id,
  'dispositions',coalesce((select jsonb_agg(to_jsonb(r) order by r.child_kind,r.opportunity_id)
    from tongs.visual_opportunity_disposition_sequences s join tongs.visual_opportunity_disposition_revisions r on r.id=s.current_revision_id
    where s.workspace_id=p_workspace_id and s.workpiece_id=p_workpiece_id),'[]'::jsonb)
) end $$;

revoke all on function tongs.set_visual_opportunity_disposition(uuid,uuid,text,text,text,uuid,bigint,uuid,bigint,text,text,text,text,text,uuid), tongs.read_visual_opportunity_dispositions(uuid,uuid) from public,anon;
revoke all on function tongs.reject_visual_disposition_revision_mutation() from public,anon,authenticated;
grant execute on function tongs.set_visual_opportunity_disposition(uuid,uuid,text,text,text,uuid,bigint,uuid,bigint,text,text,text,text,text,uuid), tongs.read_visual_opportunity_dispositions(uuid,uuid) to authenticated,service_role;

commit;
