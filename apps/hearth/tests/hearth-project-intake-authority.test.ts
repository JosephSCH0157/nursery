import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");
const migration = readFileSync(resolve(root, "supabase/migrations/20260826150000_tongs_project_episode_identity_isolation.sql"), "utf8");
const hook = readFileSync(resolve(root, "apps/hearth/src/hooks/useHearthIntakeLifecycle.ts"), "utf8");
const client = readFileSync(resolve(root, "apps/hearth/src/lib/hearth-workpiece.ts"), "utf8");

assert.match(migration, /pg_advisory_xact_lock/);
assert.match(migration, /barstock_project_episode_links_membership_idx[\s\S]*workspace_id,project_id,workpiece_id/);
assert.match(migration, /insert into tongs\.episodes[\s\S]*insert into tongs\.barstock_project_episode_links/);
assert.match(migration, /security definer[\s\S]*has_workspace_role\(p_workspace_id,\s*'editor'\)/);
assert.doesNotMatch(hook, /upsertBarstockProjectEpisodeLink/);
assert.match(hook, /projectIntakeHandledRef\.current = projectIntakeKey;[\s\S]*setWorkpieceId\(null\)/);
assert.doesNotMatch(hook, /context\.workpieceId/);
assert.match(client, /hearth-project-episode:\$\{crypto\.randomUUID\(\)\}/);
assert.match(client, /createProjectEpisodeIdentity[\s\S]*commitMetadata[\s\S]*commitScriptSeed/);
assert.match(client, /bootstrapFileExists[\s\S]*if \(!await bootstrapFileExists\(resolved\.workpieceId, "metadata\.json"\)\)/);
assert.match(client, /if \(!await bootstrapFileExists\(resolved\.workpieceId, PRIMARY_SCRIPT_PATH\)\)/);

console.log("Hearth project intake authority contract passed.");
