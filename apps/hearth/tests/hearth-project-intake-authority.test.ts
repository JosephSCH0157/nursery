import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");
const migration = readFileSync(resolve(root, "supabase/migrations/20260825180000_tongs_hearth_project_intake_authority.sql"), "utf8");
const hook = readFileSync(resolve(root, "apps/hearth/src/hooks/useHearthIntakeLifecycle.ts"), "utf8");
const client = readFileSync(resolve(root, "apps/hearth/src/lib/hearth-workpiece.ts"), "utf8");

assert.match(migration, /pg_advisory_xact_lock/);
assert.match(migration, /barstock_project_episode_links[\s\S]*workspace_id = p_workspace_id and project_id = p_project_id/);
assert.match(migration, /insert into tongs\.episodes[\s\S]*insert into tongs\.barstock_project_episode_links/);
assert.match(migration, /security definer[\s\S]*has_workspace_role\(p_workspace_id, 'editor'\)/);
assert.doesNotMatch(hook, /upsertBarstockProjectEpisodeLink/);
assert.match(hook, /projectIntakeHandledRef\.current = projectIntakeKey;[\s\S]*createProjectWorkpiece/);
assert.match(client, /hearth-project-intake:\$\{args\.workspaceId\}:\$\{projectId\}/);
assert.match(client, /resolveProjectWorkpieceIdentity[\s\S]*commitMetadata[\s\S]*commitScriptSeed/);
assert.match(client, /bootstrapFileExists[\s\S]*if \(!await bootstrapFileExists\(resolved\.workpieceId, "metadata\.json"\)\)/);
assert.match(client, /if \(!await bootstrapFileExists\(resolved\.workpieceId, PRIMARY_SCRIPT_PATH\)\)/);

console.log("Hearth project intake authority contract passed.");
