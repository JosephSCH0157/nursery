-- Hearth attachments V2: add needs_text_extraction parse status and widen constraint.
-- Allows PDF uploads that both parsers failed on to be saved with a recoverable status
-- so the user can paste extracted text manually.

-- 1. Drop the inline check constraint (PostgreSQL auto-names it based on table+column).
alter table tongs.hearth_attachments
  drop constraint if exists hearth_attachments_parse_status_check;

-- 2. Re-add with the extended value set.
alter table tongs.hearth_attachments
  add constraint hearth_attachments_parse_status_check
  check (parse_status in ('pending', 'attached', 'failed', 'needs_text_extraction'));

-- 3. Add manual_text_source column: records how the extracted_text was supplied.
--    'parser_a' | 'parser_b' | 'manual' | null (pending/not yet set)
alter table tongs.hearth_attachments
  add column if not exists text_source text
    check (text_source is null or text_source in ('parser_a', 'parser_b', 'manual'));
