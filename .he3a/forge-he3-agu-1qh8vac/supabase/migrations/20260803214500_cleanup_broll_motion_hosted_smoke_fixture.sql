-- Remove the isolated hosted motion-prompt smoke fixture. Immutable rows block parent cascades,
-- so disable only their user triggers for this exact cleanup transaction and restore immediately.
begin;

alter table tongs.workspaces disable row level security;
alter table tongs.orgs disable row level security;
alter table tongs.broll_prompt_sequences disable row level security;
alter table tongs.broll_plan_sequences disable row level security;
alter table tongs.script_approval_revisions disable trigger user;
alter table tongs.broll_plan_revisions disable trigger user;
alter table tongs.broll_beat_revisions disable trigger user;
alter table tongs.broll_plan_beat_membership disable trigger user;
alter table tongs.broll_prompt_revisions disable trigger user;
alter table tongs.broll_candidates disable trigger user;
alter table tongs.broll_candidate_revisions disable trigger user;
alter table tongs.broll_selections disable trigger user;
alter table tongs.broll_operation_receipts disable trigger user;

delete from tongs.broll_prompt_sequences where workspace_id='ecfa2615-a0f6-4e9c-9f5f-3b756137a6f5';
delete from tongs.broll_plan_sequences where workspace_id='ecfa2615-a0f6-4e9c-9f5f-3b756137a6f5';
delete from tongs.workspaces where id='ecfa2615-a0f6-4e9c-9f5f-3b756137a6f5' or org_id='634d7b83-e9ed-40a0-8968-dba8df7cff64';
delete from tongs.orgs where id='634d7b83-e9ed-40a0-8968-dba8df7cff64';
delete from auth.users where id='8265496e-6def-4ec1-8f0f-6e148188a9b1';

alter table tongs.broll_operation_receipts enable trigger user;
alter table tongs.broll_selections enable trigger user;
alter table tongs.broll_candidate_revisions enable trigger user;
alter table tongs.broll_candidates enable trigger user;
alter table tongs.broll_prompt_revisions enable trigger user;
alter table tongs.broll_plan_beat_membership enable trigger user;
alter table tongs.broll_beat_revisions enable trigger user;
alter table tongs.broll_plan_revisions enable trigger user;
alter table tongs.script_approval_revisions enable trigger user;
alter table tongs.broll_plan_sequences enable row level security;
alter table tongs.broll_prompt_sequences enable row level security;
alter table tongs.orgs enable row level security;
alter table tongs.workspaces enable row level security;

commit;
