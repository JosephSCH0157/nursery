import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const certifier = readFileSync(new URL("./certify-beta-invitation-provisioning-historical-successor.ps1", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20261101084703_forge_beta_invitation_provisioning.sql", import.meta.url), "utf8");
const parityAdapter = readFileSync(new URL("./new-beta-invitation-public-slice-a-parity.ps1", import.meta.url), "utf8");

test("migration 429 certifier pins the exact successor lineage and contract test", () => {
  for (const required of [
    "`$targetMigration='20261101084703'",
    "'$predecessorHistoryRows=428'",
    "'$successorHistoryRows=429'",
    "20261031123320",
    "beta_invitation_provisioning.sql",
    "12989ba74c00c2bdc8a9d4c5d38ee4e3be3f1f4d23b9b0f8d2a1b145c7b7dbc7",
  ]) assert.ok(certifier.includes(required), `missing successor assertion: ${required}`);
});

test("public Slice A parity remains exact except for the reviewed invitation-aware trigger function", () => {
  assert.match(parityAdapter, /Expected exactly one immutable handle_new_user predecessor fingerprint/);
  assert.match(parityAdapter, /654de3745cc64b79795168d6800a0c3c/);
  assert.match(parityAdapter, /d0f79321297efa0ae5abb63eac26f58d/);
  assert.match(certifier, /new-beta-invitation-public-slice-a-parity\.ps1/);
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
