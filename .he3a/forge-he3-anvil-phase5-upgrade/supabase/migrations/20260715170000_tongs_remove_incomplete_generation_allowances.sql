-- Forward cleanup for the incomplete generation-allowance authority deployed by
-- 20260714190000. The original migration remains in history as applied.

begin;

drop function if exists tongs.reclaim_expired_generation_reservations(uuid);
drop function if exists tongs.compensate_generation_persistence_failures(uuid, text, uuid, jsonb);
drop function if exists tongs.extend_generation_reservation(uuid, text, uuid);
drop function if exists tongs.complete_generation_operation(uuid, text, uuid);
drop function if exists tongs.record_generation_outputs(uuid, text, uuid, text, text, text, text, jsonb);
drop function if exists tongs.reserve_generation_allowance(uuid, text, uuid, integer, uuid, uuid);
drop function if exists tongs.get_my_generation_allowances();
drop function if exists tongs._reclaim_expired_generation_reservations(uuid);
drop function if exists tongs._ensure_generation_starter(uuid);

drop table if exists tongs.generation_ledger;
drop table if exists tongs.generation_operations;
drop table if exists tongs.generation_balances;

alter table tongs.ai_usage_events
  drop column if exists modality;

commit;
