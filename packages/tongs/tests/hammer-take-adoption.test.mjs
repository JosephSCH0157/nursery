import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../../../supabase/migrations/20260827160000_tongs_hammer_explicit_take_adoption.sql", import.meta.url);
const serviceUrl = new URL("../src/workpiece-commit-api.ts", import.meta.url);

test("explicit Hammer take adoption preserves old canonical evidence and atomically advances the episode", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /drop constraint if exists canonical_recordings_one_per_workpiece/i);
  assert.match(sql, /create or replace function tongs\.adopt_latest_kept_take_for_hammer/i);
  assert.match(sql, /update tongs\.recording_revisions set status='superseded'/i);
  assert.match(sql, /insert into tongs\.canonical_recordings/i);
  assert.match(sql, /update tongs\.episodes set canonical_recording_id=v_adopted\.id,active_revision_id=null/i);
});

test("Tongs exposes take adoption as a dedicated authenticated command", async () => {
  const service = await readFile(serviceUrl, "utf8");
  assert.match(service, /adoptLatestKeptTakeForHammer/);
  assert.match(service, /canonical-recording"\s*&& parts\[7\] === "adopt-latest-take"/);
  assert.match(service, /rpc\("adopt_latest_kept_take_for_hammer"/);
});
