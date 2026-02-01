-- Adds stable binding between Calendar recording events and Hearth RecordingSession.
alter table if exists tongs.calendar_events
  add column if not exists session_id uuid;

create index if not exists calendar_events_session_id_idx
  on tongs.calendar_events (session_id);
