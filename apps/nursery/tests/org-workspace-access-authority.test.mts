import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const repoUrl = new URL("../src/features/orgs/data/workspaceAccessRepo.ts", import.meta.url);

test("organization member loading uses the canonical Tongs RPC", async () => {
  const source = await readFile(repoUrl, "utf8");

  assert.match(source, /schema\(["']tongs["']\)/);
  assert.match(source, /rpc\(["']list_org_members["']/);
  assert.match(source, /user_email/);
});

test("organization member loading never depends on the legacy public profiles table", async () => {
  const source = await readFile(repoUrl, "utf8");

  assert.doesNotMatch(source, /from\(["']profiles["']\)/);
  assert.doesNotMatch(source, /loadProfilesByUserId/);
});
