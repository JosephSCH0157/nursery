-- PostgreSQL truncates identifiers at 63 bytes. Expose a stable, explicit RPC
-- name rather than relying on the implicit truncation of the audited
-- compatibility-correction function.
begin;

create or replace function tongs.correct_owner_hearth_nonbillable_result(
 p_reservation_id uuid,p_event_key text
) returns jsonb language sql security definer set search_path=pg_catalog as $$
 select tongs.correct_owner_hearth_compatibility_result_after_nonbillable_rej(p_reservation_id,p_event_key);
$$;

revoke all on function tongs.correct_owner_hearth_nonbillable_result(uuid,text)
 from public,anon,authenticated;
grant execute on function tongs.correct_owner_hearth_nonbillable_result(uuid,text)
 to service_role;

notify pgrst,'reload schema';
commit;
