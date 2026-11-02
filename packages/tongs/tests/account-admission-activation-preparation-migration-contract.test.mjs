import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../../../supabase/migrations/20261102032722_forge_admission_activation_preparation.sql", import.meta.url), "utf8");

test("migration 431 remains inactive and adds only the exact pre-admission RPC exceptions", () => {
  assert.match(migration, /forge\.account-admission-enforcement\.v2/);
  assert.match(migration, /set_config\('forge\.account_admission_enforcement', 'on', true\)/);
  assert.match(migration, /v_method = 'POST'/);
  assert.match(migration, /v_raw_path ~ '\^\/\[\^\/\]'/);
  assert.match(migration, /'rpc\/read_my_admission_onboarding'/);
  assert.match(migration, /'rpc\/resolve_bellows_join_link'/);
  for (const rpc of [
    "list_beta_access_applications",
    "decide_beta_access_application",
    "set_account_admission_state",
    "list_beta_invitation_applications",
  ]) assert.match(migration, new RegExp(`'rpc/${rpc}'`));
  assert.doesNotMatch(migration, /v_path\s+(?:like|~)|rpc\/\*/i);
  assert.match(migration, /from tongs\.platform_operators operator[\s\S]+operator\.user_id = v_user_id/);
  assert.doesNotMatch(migration, /alter\s+(?:role|database)[^;]+pgrst\.db_pre_request\s*=/i);
  assert.doesNotMatch(migration, /create\s+policy/i);
  assert.doesNotMatch(migration, /forge_account_admission_required_v1/);
});

test("migration 431 preserves the exact pre-request ACL and owner", () => {
  assert.match(migration, /alter function tongs\.account_admission_pre_request\(\) owner to postgres/i);
  assert.match(migration, /revoke all on function tongs\.account_admission_pre_request\(\)[\s\S]+from public, anon, authenticated, service_role/i);
  assert.match(migration, /grant execute on function tongs\.account_admission_pre_request\(\)[\s\S]+to anon, authenticated, service_role/i);
});
