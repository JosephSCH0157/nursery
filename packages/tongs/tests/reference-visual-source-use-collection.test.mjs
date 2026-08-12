import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(new URL("../../../supabase/migrations/20260811190000_tongs_collection_aware_reference_visual_source_use.sql", import.meta.url), "utf8");

test("Source-use commit validates the current Source-set member instead of legacy opportunity linkage", () => {
  assert.match(sql, /reference_visual_source_set_revisions/);
  assert.match(sql, /reference_visual_source_set_members/);
  assert.match(sql, /sm\.source_revision_id=p_source_revision_id/);
  assert.match(sql, /sm\.workpiece_source_link_revision_id=p_workpiece_source_link_revision_id/);
  assert.match(sql, /source_set_member_id',source_member\.id/);
  assert.doesNotMatch(sql, /opp\.source_status<>'linked'/);
});
