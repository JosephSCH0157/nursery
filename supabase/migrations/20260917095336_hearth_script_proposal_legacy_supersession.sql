-- Ensure proposals persisted before the lifecycle trigger cannot resurface after
-- a newer proposal reaches a terminal state. All correction evidence is append-only.
begin;

insert into tongs.hearth_script_generation_proposal_events(
  proposal_id,event_type,idempotency_key,actor_id,
  expected_draft_revision,expected_draft_hash,details,created_at
)
select older.id,'superseded','hearth-script-proposal:superseded:'||older.id::text,
  older.user_id,binding.expected_draft_revision,binding.expected_draft_hash,
  jsonb_build_object('superseded_by',newer.id,'reason','newer_persisted_proposal'),newer.created_at
from tongs.hearth_script_generation_proposals older
join tongs.hearth_script_generation_proposal_draft_bindings binding
  on binding.proposal_id=older.id
join lateral (
  select candidate.id,candidate.created_at
  from tongs.hearth_script_generation_proposals candidate
  where candidate.user_id=older.user_id and candidate.workspace_id=older.workspace_id
    and candidate.workpiece_id=older.workpiece_id
    and (candidate.created_at,candidate.id)>(older.created_at,older.id)
  order by candidate.created_at desc,candidate.id desc limit 1
) newer on true
where not exists(
  select 1 from tongs.hearth_script_generation_proposal_events terminal
  where terminal.proposal_id=older.id
    and terminal.event_type in ('applied','rejected','superseded')
)
on conflict do nothing;

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
      select 1 from tongs.hearth_script_generation_proposals newer
      where newer.user_id=candidate.user_id and newer.workspace_id=candidate.workspace_id
        and newer.workpiece_id=candidate.workpiece_id
        and (newer.created_at,newer.id)>(candidate.created_at,candidate.id)
    )
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

revoke all on function tongs.read_my_pending_hearth_script_proposal(uuid,uuid) from public,anon;
grant execute on function tongs.read_my_pending_hearth_script_proposal(uuid,uuid) to authenticated,service_role;

comment on function tongs.read_my_pending_hearth_script_proposal(uuid,uuid) is
  'Returns only the newest durable pending Hearth script proposal for the authenticated creator; older proposals never resurface.';

commit;

