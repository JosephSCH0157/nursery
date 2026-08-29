begin;

alter table tongs.reference_visual_evidence_revisions
  drop constraint reference_visual_evidence_revisions_origin_check;

alter table tongs.reference_visual_evidence_revisions
  add constraint reference_visual_evidence_revisions_origin_check
  check (origin in (
    'ai_extracted',
    'creator_entered',
    'hearth_proposed_source_metadata',
    'hearth_extracted_source_content'
  ));

comment on constraint reference_visual_evidence_revisions_origin_check
  on tongs.reference_visual_evidence_revisions is
  'Preserves whether evidence was extracted by AI, entered by the creator, proposed from canonical Source metadata, or extracted by Hearth from a specific canonical Source collection member; all remain subject to creator confirmation.';

commit;
