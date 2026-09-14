import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../../../supabase/migrations/20260826150000_tongs_project_episode_identity_isolation.sql", import.meta.url), "utf8");
const intake = await readFile(new URL("../src/hooks/useHearthIntakeLifecycle.ts", import.meta.url), "utf8");
const workpiece = await readFile(new URL("../src/lib/hearth-workpiece.ts", import.meta.url), "utf8");
const loader = await readFile(new URL("../src/hooks/useHearthInitialLoader.ts", import.meta.url), "utf8");

assert.match(migration, /drop constraint if exists barstock_project_episode_links_project_unique/i);
assert.match(migration, /unique index if not exists barstock_project_episode_links_membership_idx[\s\S]*workspace_id,project_id,workpiece_id/i);
assert.match(migration, /creation_operation_key/);
assert.match(migration, /create_hearth_project_episode/);
assert.match(migration, /list_hearth_project_episodes/);
assert.match(migration, /validate_hearth_project_episode/);
assert.doesNotMatch(migration, /create table[^;]+series/i);

assert.match(intake, /project-only route is a collection context/i);
assert.match(intake, /setWorkpieceId\(null\)/);
assert.doesNotMatch(intake, /context\.workpieceId/);
assert.match(workpiece, /create_hearth_project_episode/);
assert.doesNotMatch(workpiece, /get_or_create_hearth_project_workpiece/);
assert.match(loader, /resolvedWorkpieceId && args\.routeProjectId/);
assert.match(loader, /validateBarstockProjectEpisode/);

console.log("Hearth project/episode identity isolation tests passed.");
