import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const certifier = readFileSync(new URL("./certify-beta-invitation-provisioning-historical-successor.ps1", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20261101084703_forge_beta_invitation_provisioning.sql", import.meta.url), "utf8");

test("migration 429 certifier pins the exact successor lineage and contract test", () => {
  for (const required of [
    "`$targetMigration='20261101084703'",
    "'$predecessorHistoryRows=428'",
    "'$successorHistoryRows=429'",
    "20261031123320",
    "beta_invitation_provisioning.sql",
    "874191695f41999ff77244dbf549d20611b1018f3991b728a38b1e7003bbe389",
  ]) assert.ok(certifier.includes(required), `missing successor assertion: ${required}`);
});

test("migration remains invitation/provisioning authority without runtime admission enforcement", () => {
  assert.match(migration, /create table tongs\.beta_access_invitation_events/);
  assert.match(migration, /force row level security/);
  assert.match(migration, /grant execute on function tongs\.claim_beta_invitation_dispatch[\s\S]*to service_role/);
  assert.match(migration, /existing Auth identity must be confirmed before collision binding/);
  assert.match(migration, /if new\.invited_at is not null then[\s\S]*return new/);
  assert.doesNotMatch(migration, /create policy/i);
  assert.doesNotMatch(migration, /is_account_admitted[\s\S]*(storage\.objects|realtime)/i);
});
