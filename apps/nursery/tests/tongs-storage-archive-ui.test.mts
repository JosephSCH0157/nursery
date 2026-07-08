import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));

function readWorkspaceFile(relativePath: string): string {
  return fs.readFileSync(path.resolve(TEST_DIR, relativePath), "utf8");
}

test("Tongs storage exposes archive review flow and archive-first delete guidance", () => {
  const source = readWorkspaceFile("../src/routes/TongsStorage.tsx");

  assert.match(source, /Archived Episodes/);
  assert.match(source, /Archive removes this episode from active lanes/);
  assert.match(source, /Restore to active/);
  assert.match(source, /Archive this episode before deleting it\./);
  assert.match(source, /Clear archived episode/);
  assert.match(source, /Clear All Archived Episodes/);
  assert.match(source, /archive_reason\?\.startsWith\("deleted:"\)/);
  assert.match(source, /Reclaimed ~\$\{formatBytes\(totalBytesReclaimed\)/);
  assert.match(source, /onKeyDown=\{\(event\) => \{/);
  assert.doesNotMatch(source, /Archive Episode \(Coming soon\)/);
});

test("workspace delete rpc requires active episodes to be archived first", () => {
  const migration = readWorkspaceFile("../../../supabase/migrations/20260708165000_tongs_workspace_delete_requires_archived_episodes.sql");

  assert.match(migration, /Archive all episodes before deleting this workspace/);
  assert.match(migration, /and e\.archived_at is null/);
});
