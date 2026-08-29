begin;

create table if not exists tongs.workpiece_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references tongs.workspaces(id) on delete cascade,
  workpiece_id uuid not null references tongs.episodes(id) on delete cascade,
  job_type text not null,
  status text not null,
  requested_by uuid not null references auth.users(id),
  payload_json jsonb not null default '{}'::jsonb,
  result_json jsonb null,
  error_code text null,
  error_message text null,
  progress_percent integer null,
  attempt_count integer not null default 0,
  runner_id text null,
  lease_expires_at timestamptz null,
  heartbeat_at timestamptz null,
  started_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workpiece_jobs_job_type_check check (
    job_type in ('hammer_transcript_prep', 'hammer_transcript_regeneration')
  ),
  constraint workpiece_jobs_status_check check (
    status in ('queued', 'running', 'completed', 'failed', 'canceled')
  ),
  constraint workpiece_jobs_progress_check check (
    progress_percent is null or (progress_percent >= 0 and progress_percent <= 100)
  ),
  constraint workpiece_jobs_attempt_count_check check (
    attempt_count >= 0
  )
);

create index if not exists workpiece_jobs_lookup_idx
  on tongs.workpiece_jobs (workspace_id, workpiece_id, status, created_at desc);

create index if not exists workpiece_jobs_lease_idx
  on tongs.workpiece_jobs (status, lease_expires_at);

drop trigger if exists trg_workpiece_jobs_updated_at on tongs.workpiece_jobs;
create trigger trg_workpiece_jobs_updated_at
before update on tongs.workpiece_jobs
for each row execute function tongs.set_updated_at();

alter table tongs.workpiece_jobs enable row level security;

drop policy if exists workpiece_jobs_select_if_workspace_viewer on tongs.workpiece_jobs;
drop policy if exists workpiece_jobs_insert_if_workspace_editor on tongs.workpiece_jobs;

create policy workpiece_jobs_select_if_workspace_viewer
on tongs.workpiece_jobs
for select
to authenticated
using (
  tongs.has_workspace_role(workspace_id, 'viewer')
);

create policy workpiece_jobs_insert_if_workspace_editor
on tongs.workpiece_jobs
for insert
to authenticated
 with check (
   tongs.has_workspace_role(workspace_id, 'editor')
   and requested_by = auth.uid()
   and job_type in ('hammer_transcript_prep', 'hammer_transcript_regeneration')
 );

grant select, insert on table tongs.workpiece_jobs to authenticated;
grant all on table tongs.workpiece_jobs to service_role;

commit;
