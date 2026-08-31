import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL("../../../supabase/migrations/20260831090000_tongs_hammer_import_adoptable_take.sql", import.meta.url),
  "utf8",
);

assert.match(migration, /create or replace view tongs\.current_workpiece_recorded_takes/i);
assert.match(migration, /hammer_recording_import_requests h[\s\S]*where h\.state='committed'/i);
assert.match(migration, /h\.id keep_id/i);
assert.match(migration, /'hammer_import'::text source_kind/i);
assert.match(migration, /h\.committed_at kept_at/i);
assert.match(migration, /hammer\.recording-import-acceptance\.v1/i);
assert.doesNotMatch(migration, /where h\.state\s*<>\s*'committed'/i);

console.log("Hammer committed imports are projected as adoptable takes.");
