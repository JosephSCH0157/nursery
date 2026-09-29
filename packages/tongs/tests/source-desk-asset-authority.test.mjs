import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("Source Desk timed media uses canonical asset inspection and service registration", async () => {
  const migration = await readFile(new URL("../../../supabase/migrations/20260826120000_tongs_source_desk_timed_media_authority.sql", import.meta.url), "utf8");
  const service = await readFile(new URL("../src/workpiece-commit-api.ts", import.meta.url), "utf8");
  for (const token of ["source_desk_audio", "source_desk_video", "duration_ms", "register_source_desk_timed_asset", "service_role"]) {
    assert.match(migration, new RegExp(token));
  }
  assert.match(service, /inspectSourceDeskMedia\(bytes, timedKind/);
  assert.match(service, /inspectMedia\(bytes, timedKind\)/);
  assert.match(service, /ownerCostOperationId/);
  assert.match(service, /source_desk_media_duration_invalid/);
  assert.match(service, /register_source_desk_timed_asset/);
});
