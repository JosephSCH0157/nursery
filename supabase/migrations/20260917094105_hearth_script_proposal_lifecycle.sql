-- Durable, append-only lifecycle for paid Hearth script proposals.
-- Proposal generation remains separate from creator-authorized application.
begin;

create table tongs.hearth_script_generation_proposal_draft_bindings(
  proposal_id uuid primary key references tongs.hearth_script_generation_proposals(id) on delete restrict,
  workspace_id uuid not null references tongs.workspaces(id) on delete restrict,
  workpiece_id uuid not null references tongs.episodes(id) on delete restrict,
  expected_draft_path text not null default 'hearth/drafts.v1.json'
    check(expected_draft_path='hearth/drafts.v1.json'),
  expected_draft_revision bigint not null check(expected_draft_revision>0),
  expected_draft_hash text not null check(expected_draft_hash~'^[0-9a-f]{64}$'),
  bound_at timestamptz not null default now()
);

create table tongs.hearth_script_generation_proposal_events(
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references tongs.hearth_script_generation_proposals(id) on delete restrict,
  event_type text not null check(event_type in ('application_started','applied','rejected','superseded')),
  idempotency_key text not null unique check(length(btrim(idempotency_key)) between 8 and 300),
  actor_id uuid not null references auth.users(id) on delete restrict,
  expected_draft_revision bigint not null check(expected_draft_revision>0),
  expected_draft_hash text not null check(expected_draft_hash~'^[0-9a-f]{64}$'),
  applied_draft_revision bigint,
  applied_draft_hash text,
  canonical_revision_id text,
  details jsonb not null default '{}'::jsonb check(jsonb_typeof(details)='object'),
  created_at timestamptz not null default now(),
  check(
    (event_type='applied' and applied_draft_revision is not null
      and applied_draft_hash is not null and applied_draft_hash~'^[0-9a-f]{64}$'
      and nullif(btrim(canonical_revision_id),'') is not null)
    or
    (event_type<>'applied' and applied_draft_revision is null
      and applied_draft_hash is null and canonical_revision_id is null)
  )
);

create unique index hearth_script_generation_proposal_terminal_event_idx
  on tongs.hearth_script_generation_proposal_events(proposal_id)
  where event_type in ('applied','rejected','superseded');
create unique index hearth_script_generation_proposal_started_event_idx
  on tongs.hearth_script_generation_proposal_events(proposal_id)
  where event_type='application_started';
create index hearth_script_generation_proposal_events_proposal_idx
  on tongs.hearth_script_generation_proposal_events(proposal_id,created_at,id);
create index hearth_script_generation_proposal_bindings_workspace_idx
  on tongs.hearth_script_generation_proposal_draft_bindings(workspace_id);
create index hearth_script_generation_proposal_bindings_workpiece_idx
  on tongs.hearth_script_generation_proposal_draft_bindings(workpiece_id);

alter table tongs.hearth_script_generation_proposal_draft_bindings enable row level security;
alter table tongs.hearth_script_generation_proposal_draft_bindings force row level security;
alter table tongs.hearth_script_generation_proposal_events enable row level security;
alter table tongs.hearth_script_generation_proposal_events force row level security;
revoke all on tongs.hearth_script_generation_proposal_draft_bindings,
  tongs.hearth_script_generation_proposal_events from public,anon,authenticated,service_role;
grant select on tongs.hearth_script_generation_proposal_draft_bindings,
  tongs.hearth_script_generation_proposal_events to service_role;
create policy hearth_script_generation_proposal_bindings_no_client_access
  on tongs.hearth_script_generation_proposal_draft_bindings
  for all to anon,authenticated using(false) with check(false);
create policy hearth_script_generation_proposal_events_no_client_access
  on tongs.hearth_script_generation_proposal_events
  for all to anon,authenticated using(false) with check(false);
create trigger hearth_script_generation_proposal_bindings_immutable
  before update or delete on tongs.hearth_script_generation_proposal_draft_bindings
  for each row execute function tongs._reject_accounting_mutation();
create trigger hearth_script_generation_proposal_events_immutable
  before update or delete on tongs.hearth_script_generation_proposal_events
  for each row execute function tongs._reject_accounting_mutation();

create or replace function tongs._bind_hearth_script_generation_proposal()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare draft_file tongs.workpiece_files%rowtype;
begin
  select * into draft_file from tongs.workpiece_files
  where workpiece_id=new.workpiece_id and path='hearth/drafts.v1.json'
  for share;
  if draft_file.workpiece_id is null or draft_file.revision<1
    or lower(coalesce(draft_file.hash_value,''))!~'^[0-9a-f]{64}$' then
    raise exception 'canonical Hearth draft authority is required before proposal persistence'
      using errcode='55000';
  end if;
  insert into tongs.hearth_script_generation_proposal_draft_bindings(
    proposal_id,workspace_id,workpiece_id,expected_draft_revision,expected_draft_hash,bound_at
  ) values(
    new.id,new.workspace_id,new.workpiece_id,draft_file.revision,
    lower(draft_file.hash_value),new.created_at
  );
  insert into tongs.hearth_script_generation_proposal_events(
    proposal_id,event_type,idempotency_key,actor_id,
    expected_draft_revision,expected_draft_hash,details,created_at
  )
  select older.id,'superseded','hearth-script-proposal:superseded:'||older.id::text,
    new.user_id,older_binding.expected_draft_revision,older_binding.expected_draft_hash,
    jsonb_build_object('superseded_by',new.id),new.created_at
  from tongs.hearth_script_generation_proposals older
  join tongs.hearth_script_generation_proposal_draft_bindings older_binding
    on older_binding.proposal_id=older.id
  where older.user_id=new.user_id and older.workspace_id=new.workspace_id
    and older.workpiece_id=new.workpiece_id and older.id<>new.id
    and not exists(
      select 1 from tongs.hearth_script_generation_proposal_events terminal
      where terminal.proposal_id=older.id
        and terminal.event_type in ('applied','rejected','superseded')
    )
  on conflict do nothing;
  return new;
end $$;

create trigger hearth_script_generation_proposals_bind_draft
after insert on tongs.hearth_script_generation_proposals
for each row execute function tongs._bind_hearth_script_generation_proposal();

-- Existing canary proposals predate the binding trigger. Bind only to a draft
-- file whose authority was already established before that proposal existed.
insert into tongs.hearth_script_generation_proposal_draft_bindings(
  proposal_id,workspace_id,workpiece_id,expected_draft_revision,expected_draft_hash,bound_at
)
select proposal.id,proposal.workspace_id,proposal.workpiece_id,draft_file.revision,
  lower(draft_file.hash_value),proposal.created_at
from tongs.hearth_script_generation_proposals proposal
join tongs.workpiece_files draft_file on draft_file.workpiece_id=proposal.workpiece_id
  and draft_file.path='hearth/drafts.v1.json'
  and draft_file.updated_at<=proposal.created_at
where lower(draft_file.hash_value)~'^[0-9a-f]{64}$'
on conflict(proposal_id) do nothing;

do $$ begin
  if exists(
    select 1 from tongs.hearth_script_generation_proposals proposal
    left join tongs.hearth_script_generation_proposal_draft_bindings binding
      on binding.proposal_id=proposal.id
    where binding.proposal_id is null
  ) then
    raise exception 'all existing Hearth script proposals require a canonical draft binding';
  end if;
end $$;

create or replace function tongs.read_my_pending_hearth_script_proposal(
  p_workspace_id uuid,p_workpiece_id uuid
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare proposal tongs.hearth_script_generation_proposals%rowtype;
  binding tongs.hearth_script_generation_proposal_draft_bindings%rowtype;
  paid_result_id uuid; started boolean;
begin
  if auth.uid() is null or not tongs.has_workspace_role(p_workspace_id,'viewer') then
    raise exception 'workspace access required' using errcode='42501';
  end if;
  select candidate.* into proposal
  from tongs.hearth_script_generation_proposals candidate
  where candidate.user_id=auth.uid() and candidate.workspace_id=p_workspace_id
    and candidate.workpiece_id=p_workpiece_id
    and not exists(
      select 1 from tongs.hearth_script_generation_proposal_events terminal
      where terminal.proposal_id=candidate.id
        and terminal.event_type in ('applied','rejected','superseded')
    )
  order by candidate.created_at desc,candidate.id desc limit 1;
  if proposal.id is null then return null; end if;
  select * into binding from tongs.hearth_script_generation_proposal_draft_bindings
    where proposal_id=proposal.id;
  select result.id into paid_result_id from tongs.openai_text_persisted_results result
    where result.reservation_id=proposal.reservation_id and result.route_code='hearth.script_generation';
  select exists(select 1 from tongs.hearth_script_generation_proposal_events event
    where event.proposal_id=proposal.id and event.event_type='application_started') into started;
  return proposal.result_json||jsonb_build_object(
    'proposal_id',proposal.id,'proposal_state','proposed','created_at',proposal.created_at,
    'operation_id',proposal.operation_id,'source_paid_result_id',paid_result_id,
    'expected_draft_revision',binding.expected_draft_revision,
    'expected_draft_hash',binding.expected_draft_hash,
    'application_started',started
  );
end $$;

create or replace function tongs.begin_my_hearth_script_proposal_application(
  p_workspace_id uuid,p_workpiece_id uuid,p_proposal_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare proposal tongs.hearth_script_generation_proposals%rowtype;
  binding tongs.hearth_script_generation_proposal_draft_bindings%rowtype;
  current_file tongs.workpiece_files%rowtype; terminal text; started uuid; paid_result_id uuid;
begin
  if auth.uid() is null or not tongs.has_workspace_role(p_workspace_id,'editor') then
    raise exception 'workspace editor authority required' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('hearth-script-proposal:'||p_proposal_id::text,0));
  select * into proposal from tongs.hearth_script_generation_proposals
    where id=p_proposal_id and user_id=auth.uid() and workspace_id=p_workspace_id
      and workpiece_id=p_workpiece_id for share;
  if proposal.id is null then return jsonb_build_object('disposition','not_found'); end if;
  select event_type into terminal from tongs.hearth_script_generation_proposal_events
    where proposal_id=proposal.id and event_type in ('applied','rejected','superseded')
    order by created_at desc,id desc limit 1;
  if terminal is not null then
    return jsonb_build_object('disposition',terminal,'proposal_id',proposal.id);
  end if;
  if exists(select 1 from tongs.hearth_script_generation_proposals newer
    where newer.user_id=proposal.user_id and newer.workspace_id=proposal.workspace_id
      and newer.workpiece_id=proposal.workpiece_id
      and (newer.created_at,newer.id)>(proposal.created_at,proposal.id)) then
    return jsonb_build_object('disposition','superseded','proposal_id',proposal.id);
  end if;
  select * into binding from tongs.hearth_script_generation_proposal_draft_bindings
    where proposal_id=proposal.id;
  select id into started from tongs.hearth_script_generation_proposal_events
    where proposal_id=proposal.id and event_type='application_started';
  select * into current_file from tongs.workpiece_files
    where workpiece_id=proposal.workpiece_id and path=binding.expected_draft_path for share;
  if started is null and (current_file.revision<>binding.expected_draft_revision
    or lower(current_file.hash_value)<>binding.expected_draft_hash) then
    return jsonb_build_object(
      'disposition','stale','proposal_id',proposal.id,
      'expected_draft_revision',binding.expected_draft_revision,
      'expected_draft_hash',binding.expected_draft_hash,
      'current_draft_revision',current_file.revision,
      'current_draft_hash',lower(current_file.hash_value)
    );
  end if;
  if started is null then
    insert into tongs.hearth_script_generation_proposal_events(
      proposal_id,event_type,idempotency_key,actor_id,
      expected_draft_revision,expected_draft_hash,details
    ) values(
      proposal.id,'application_started','hearth-script-proposal:apply-start:'||proposal.id::text,
      auth.uid(),binding.expected_draft_revision,binding.expected_draft_hash,
      jsonb_build_object('workspace_id',p_workspace_id,'workpiece_id',p_workpiece_id)
    ) returning id into started;
  end if;
  select result.id into paid_result_id from tongs.openai_text_persisted_results result
    where result.reservation_id=proposal.reservation_id and result.route_code='hearth.script_generation';
  return proposal.result_json||jsonb_build_object(
    'disposition',case when current_file.revision=binding.expected_draft_revision
      and lower(current_file.hash_value)=binding.expected_draft_hash then 'started' else 'resume' end,
    'proposal_id',proposal.id,'proposal_state','proposed',
    'expected_draft_revision',binding.expected_draft_revision,
    'expected_draft_hash',binding.expected_draft_hash,
    'current_draft_revision',current_file.revision,
    'current_draft_hash',lower(current_file.hash_value),
    'created_at',proposal.created_at,'operation_id',proposal.operation_id,
    'source_paid_result_id',paid_result_id,'application_started',true,
    'canonical_revision_id','hearth-script-proposal-'||proposal.id::text
  );
end $$;

create or replace function tongs.complete_my_hearth_script_proposal_application(
  p_workspace_id uuid,p_workpiece_id uuid,p_proposal_id uuid,
  p_canonical_revision_id text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare proposal tongs.hearth_script_generation_proposals%rowtype;
  binding tongs.hearth_script_generation_proposal_draft_bindings%rowtype;
  current_file tongs.workpiece_files%rowtype; applied_event tongs.hearth_script_generation_proposal_events%rowtype;
begin
  if auth.uid() is null or not tongs.has_workspace_role(p_workspace_id,'editor') then
    raise exception 'workspace editor authority required' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('hearth-script-proposal:'||p_proposal_id::text,0));
  select * into proposal from tongs.hearth_script_generation_proposals
    where id=p_proposal_id and user_id=auth.uid() and workspace_id=p_workspace_id
      and workpiece_id=p_workpiece_id for share;
  if proposal.id is null then return jsonb_build_object('disposition','not_found'); end if;
  select * into applied_event from tongs.hearth_script_generation_proposal_events
    where proposal_id=proposal.id and event_type='applied';
  if applied_event.id is not null then
    return jsonb_build_object(
      'disposition','applied_replay','proposal_id',proposal.id,
      'applied_draft_revision',applied_event.applied_draft_revision,
      'applied_draft_hash',applied_event.applied_draft_hash,
      'canonical_revision_id',applied_event.canonical_revision_id
    );
  end if;
  if exists(select 1 from tongs.hearth_script_generation_proposal_events
    where proposal_id=proposal.id and event_type in ('rejected','superseded')) then
    return jsonb_build_object('disposition','terminal_conflict','proposal_id',proposal.id);
  end if;
  if not exists(select 1 from tongs.hearth_script_generation_proposal_events
    where proposal_id=proposal.id and event_type='application_started') then
    return jsonb_build_object('disposition','application_not_started','proposal_id',proposal.id);
  end if;
  select * into binding from tongs.hearth_script_generation_proposal_draft_bindings
    where proposal_id=proposal.id;
  select * into current_file from tongs.workpiece_files
    where workpiece_id=proposal.workpiece_id and path=binding.expected_draft_path for share;
  if current_file.revision<>binding.expected_draft_revision+1
    or lower(current_file.hash_value)=binding.expected_draft_hash
    or btrim(coalesce(p_canonical_revision_id,''))<>'hearth-script-proposal-'||proposal.id::text then
    return jsonb_build_object(
      'disposition','canonical_commit_unverified','proposal_id',proposal.id,
      'expected_previous_revision',binding.expected_draft_revision,
      'current_draft_revision',current_file.revision,
      'current_draft_hash',lower(current_file.hash_value)
    );
  end if;
  insert into tongs.hearth_script_generation_proposal_events(
    proposal_id,event_type,idempotency_key,actor_id,
    expected_draft_revision,expected_draft_hash,applied_draft_revision,
    applied_draft_hash,canonical_revision_id,details
  ) values(
    proposal.id,'applied','hearth-script-proposal:applied:'||proposal.id::text,auth.uid(),
    binding.expected_draft_revision,binding.expected_draft_hash,current_file.revision,
    lower(current_file.hash_value),btrim(p_canonical_revision_id),
    jsonb_build_object('workspace_id',p_workspace_id,'workpiece_id',p_workpiece_id)
  ) returning * into applied_event;
  return jsonb_build_object(
    'disposition','applied','proposal_id',proposal.id,
    'applied_draft_revision',applied_event.applied_draft_revision,
    'applied_draft_hash',applied_event.applied_draft_hash,
    'canonical_revision_id',applied_event.canonical_revision_id
  );
end $$;

create or replace function tongs.reject_my_hearth_script_proposal(
  p_workspace_id uuid,p_workpiece_id uuid,p_proposal_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare proposal tongs.hearth_script_generation_proposals%rowtype;
  binding tongs.hearth_script_generation_proposal_draft_bindings%rowtype; terminal text;
begin
  if auth.uid() is null or not tongs.has_workspace_role(p_workspace_id,'editor') then
    raise exception 'workspace editor authority required' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('hearth-script-proposal:'||p_proposal_id::text,0));
  select * into proposal from tongs.hearth_script_generation_proposals
    where id=p_proposal_id and user_id=auth.uid() and workspace_id=p_workspace_id
      and workpiece_id=p_workpiece_id for share;
  if proposal.id is null then return jsonb_build_object('disposition','not_found'); end if;
  select event_type into terminal from tongs.hearth_script_generation_proposal_events
    where proposal_id=proposal.id and event_type in ('applied','rejected','superseded') limit 1;
  if terminal is not null then return jsonb_build_object('disposition',terminal||'_replay','proposal_id',proposal.id); end if;
  select * into binding from tongs.hearth_script_generation_proposal_draft_bindings where proposal_id=proposal.id;
  insert into tongs.hearth_script_generation_proposal_events(
    proposal_id,event_type,idempotency_key,actor_id,
    expected_draft_revision,expected_draft_hash,details
  ) values(
    proposal.id,'rejected','hearth-script-proposal:rejected:'||proposal.id::text,
    auth.uid(),binding.expected_draft_revision,binding.expected_draft_hash,
    jsonb_build_object('workspace_id',p_workspace_id,'workpiece_id',p_workpiece_id)
  );
  return jsonb_build_object('disposition','rejected','proposal_id',proposal.id);
end $$;

revoke all on function tongs.read_my_pending_hearth_script_proposal(uuid,uuid),
  tongs.begin_my_hearth_script_proposal_application(uuid,uuid,uuid),
  tongs.complete_my_hearth_script_proposal_application(uuid,uuid,uuid,text),
  tongs.reject_my_hearth_script_proposal(uuid,uuid,uuid) from public,anon;
grant execute on function tongs.read_my_pending_hearth_script_proposal(uuid,uuid),
  tongs.begin_my_hearth_script_proposal_application(uuid,uuid,uuid),
  tongs.complete_my_hearth_script_proposal_application(uuid,uuid,uuid,text),
  tongs.reject_my_hearth_script_proposal(uuid,uuid,uuid) to authenticated,service_role;

comment on table tongs.hearth_script_generation_proposal_draft_bindings is
  'Immutable generation-time canonical draft authority used for stale-safe proposal application.';
comment on table tongs.hearth_script_generation_proposal_events is
  'Append-only creator decisions and application receipts for immutable Hearth script proposals.';
comment on function tongs.read_my_pending_hearth_script_proposal(uuid,uuid) is
  'Returns at most the deterministic newest pending proposal for the authenticated user and exact active workspace/workpiece.';

notify pgrst,'reload schema';
commit;

