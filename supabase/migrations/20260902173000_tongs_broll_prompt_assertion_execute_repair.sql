begin;

-- Repair live privilege drift for the API-facing prompt assertion RPC. The
-- authenticated application calls this function before it starts a B-roll
-- candidate generation operation. Keep anonymous callers denied.
revoke all on function tongs.assert_current_broll_prompt(uuid,uuid,uuid,uuid,bigint,text)
  from public, anon;

grant execute on function tongs.assert_current_broll_prompt(uuid,uuid,uuid,uuid,bigint,text)
  to authenticated, service_role;

commit;
