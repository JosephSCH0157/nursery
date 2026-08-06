import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../../../supabase/migrations/20260806130000_tongs_visual_opportunity_dispositions.sql", import.meta.url);
const apiUrl = new URL("../src/workpiece-commit-api.ts", import.meta.url);

test("visual dispositions are immutable, revision-safe, replay-safe, and cover all visual opportunity classes", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  for (const kind of ["image", "reference_clip", "reference_visual", "broll"]) assert.match(sql, new RegExp(`'${kind}'`));
  for (const reason of ["rights_unavailable", "material_unobtainable", "editorially_unneeded", "duplicate_coverage", "other"]) assert.match(sql, new RegExp(`'${reason}'`));
  assert.match(sql, /for update/i);
  assert.match(sql, /operation_identity_conflict/i);
  assert.match(sql, /revision_conflict/i);
  assert.match(sql, /target_revision_conflict/i);
  assert.match(sql, /previous_revision_id/i);
  assert.match(sql, /reject_visual_disposition_revision_mutation/i);
  assert.match(sql, /before update or delete/i);
  assert.match(sql, /revoke all on tongs\.visual_opportunity_disposition_revisions[^;]+authenticated/is);
});

test("Hammer excludes skipped outputs and retains canonical omission evidence", async () => {
  const source = await readFile(apiUrl, "utf8");
  assert.match(source, /read_visual_opportunity_dispositions/);
  assert.match(source, /omissions\?: Array/);
  assert.match(source, /disposition_revision_id/);
  assert.match(source, /skippedKeys/);
  assert.match(source, /reference_clip:\$\{item\.entry_id\}/);
  assert.match(source, /broll:\$\{item\.entry_id\}/);
});
