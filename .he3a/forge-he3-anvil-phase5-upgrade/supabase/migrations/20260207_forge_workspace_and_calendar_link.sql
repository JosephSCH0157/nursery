-- =========================================
-- Forge schema evolution: workspaces + calendar
-- =========================================

-- 1) Give workspaces a human-readable name.
alter table tongs.workspaces
add column if not exists name text not null default 'New Workspace';

-- Backfill existing rows with readable defaults.
update tongs.workspaces
set name = 'Workspace ' || left(id::text, 8)
where name = 'New Workspace';

-- 2) Allow calendar events to link to Forge assignments.
alter table tongs.calendar_events
add column if not exists assignment_id uuid null;

-- (Future-proofing: FK can be added once assignments table exists.)
-- alter table tongs.calendar_events
-- add constraint calendar_events_assignment_id_fkey
-- foreign key (assignment_id)
-- references tongs.assignments(id)
-- on delete set null;
