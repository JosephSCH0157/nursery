import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const original = readFileSync(new URL("../../../supabase/migrations/20260816190000_tongs_hammer_editorial_authority_revision.sql", import.meta.url), "utf8");
const forward = readFileSync(new URL("../../../supabase/migrations/20260819120000_tongs_hammer_editorial_authority_terminal_conflict.sql", import.meta.url), "utf8");

function normalizedContract(sql) {
  return sql
    .slice(sql.indexOf("create or replace function tongs.acknowledge_hammer_editorial_authority"))
    .replace("errcode = '40001'", "errcode = 'PT409'")
    .replace(/\n-- Reassert[\s\S]*$/i, "")
    .replace(/\ncommit;\s*$/i, "")
    .trim();
}

test("forward migration changes only the expected-conflict SQLSTATE", () => {
  assert.match(original, /errcode = '40001', message = 'editorial_authority_conflict'/);
  assert.match(forward, /errcode = 'PT409', message = 'editorial_authority_conflict'/);
  assert.doesNotMatch(forward, /errcode = '40001'/);
  assert.equal(normalizedContract(forward), normalizedContract(original));
});

test("forward migration remains ordered and does not modify tables or add an RPC", () => {
  assert.ok("20260819120000" > "20260816190000");
  assert.equal((forward.match(/create or replace function/gi) ?? []).length, 1);
  assert.doesNotMatch(forward, /alter table|create policy|drop policy|grant update/i);
  assert.match(forward, /security definer\s+set search_path = pg_catalog, tongs/i);
  assert.match(forward, /revoke all on function[\s\S]+from public/i);
  assert.match(forward, /grant execute on function[\s\S]+to authenticated/i);
  assert.match(forward, /grant execute on function[\s\S]+to service_role/i);
  assert.match(forward, /alter function[\s\S]+owner to postgres/i);
});
