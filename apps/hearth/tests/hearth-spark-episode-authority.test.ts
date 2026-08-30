import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../../../supabase/migrations/20260830160000_tongs_spark_hearth_episode_authority.sql", import.meta.url), "utf8");
const workpiece = await readFile(new URL("../src/lib/hearth-workpiece.ts", import.meta.url), "utf8");
const shell = await readFile(new URL("../src/routes/HearthShell.tsx", import.meta.url), "utf8");
const tongs = await readFile(new URL("../../../packages/tongs/src/workpiece-commit-api.ts", import.meta.url), "utf8");

assert.match(migration, /add column if not exists linked_workpiece_id uuid/i);
assert.match(migration, /foreign key \(linked_workpiece_id, workspace_id\)[\s\S]*references tongs\.episodes\(id, workspace_id\)/i);
assert.match(migration, /create or replace function tongs\.get_or_create_hearth_spark_episode/i);
assert.match(migration, /security definer[\s\S]*has_workspace_role\(p_workspace_id, 'editor'\)/i);
assert.match(migration, /pg_advisory_xact_lock[\s\S]*for update/i);
assert.match(migration, /if v_spark\.linked_workpiece_id is not null[\s\S]*'outcome', 'existing'/i);
assert.match(migration, /create_episode_identity_internal[\s\S]*set linked_workpiece_id = v_workpiece_id/i);
assert.match(migration, /revoke all[\s\S]*grant execute[\s\S]*authenticated/i);

assert.match(workpiece, /createSparkEpisodeIdentity[\s\S]*get_or_create_hearth_spark_episode/i);
assert.match(workpiece, /getOrCreateHearthSparkWorkpiece[\s\S]*bootstrapFileExists[\s\S]*commitMetadata[\s\S]*commitScriptSeed/i);
assert.match(shell, /forgeSpark[\s\S]*getOrCreateHearthSparkWorkpiece/i);
assert.doesNotMatch(shell, /forgeSpark[\s\S]{0,500}createHearthCollectionWorkpiece/i);
assert.match(tongs, /barstock_sparks[\s\S]*linked_workpiece_id/i);
assert.match(tongs, /row\.linked_workpiece_id[\s\S]*linkedWorkpieceIdsByAssignment/i);

console.log("Hearth Spark canonical episode authority contract passed.");
