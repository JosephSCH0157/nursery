-- Follow-up from the Slice 5A hosted advisor: generated customer-only FK
-- columns require their own leading-key indexes. These indexes change no
-- execution, persistence, customer-finance, or accounting semantics.
begin;

create index hearth_thumbnail_base_results_customer_operation_idx
  on tongs.hearth_thumbnail_base_generation_results(customer_operation_id)
  where customer_operation_id is not null;

create index hearth_timeline_image_results_customer_operation_idx
  on tongs.hearth_timeline_image_generation_results(customer_operation_id)
  where customer_operation_id is not null;

commit;
