begin;

alter table tongs.image_map_prompt_operation_receipts
  drop constraint image_map_prompt_operation_receipts_operation_id_check;

alter table tongs.image_map_prompt_operation_receipts
  add constraint image_map_prompt_operation_receipts_operation_id_check
  check (
    operation_id ~ '^forge:image-prompt:[a-zA-Z0-9._:-]{8,180}$'
    or operation_id ~ '^hearth:visual\.narrative_interpretation:(test|live):[0-9a-f]{64}$'
  );

commit;
