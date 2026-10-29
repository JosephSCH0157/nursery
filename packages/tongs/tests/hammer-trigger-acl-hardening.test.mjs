import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../../supabase/migrations/20261029110858_hammer_trigger_acl_hardening.sql", import.meta.url),
  "utf8",
);

test("Hammer trigger ACL hardening is forward-only and preserves trigger behavior", () => {
  assert.match(migration, /where version = '20261029033827'/);
  assert.match(migration, /revoke all on function tongs\._stamp_spending_quote_environment\(\) from public/);
  assert.match(migration, /revoke all on function tongs\._stamp_spending_quote_environment\(\) from anon/);
  assert.match(migration, /revoke all on function tongs\._stamp_spending_quote_environment\(\) from authenticated/);
  assert.match(migration, /grant execute on function tongs\._stamp_spending_quote_environment\(\) to service_role/);
  assert.match(migration, /customer_spending_quotes_financial_environment/);
  assert.match(migration, /trigger_row\.tgfoid = v_trigger_function/);
  assert.doesNotMatch(migration, /create or replace function tongs\._stamp_spending_quote_environment/);
  assert.doesNotMatch(migration, /insert into tongs\.(?:hammer_scoped_live_funding_authorities|hammer_first_transcription_activation_authorities)/i);
});
