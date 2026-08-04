import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../../../supabase/migrations/20260804150000_tongs_source_revision_authority.sql", import.meta.url);
const serviceUrl = new URL("../src/workpiece-commit-api.ts", import.meta.url);

test("Source authority separates stable identity, immutable revisions, and workpiece usage", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  for (const table of ["sources", "source_revisions", "source_sequences", "workpiece_source_link_revisions", "workpiece_source_link_sequences", "source_operation_receipts"]) {
    assert.match(sql, new RegExp(`create table tongs\\.${table}`));
  }
  assert.match(sql, /source_revision_id uuid not null/);
  assert.match(sql, /canonical_asset_revision_id uuid references tongs\.assets\(id\)/);
  assert.match(sql, /quotation_excerpt_hash text/);
  assert.match(sql, /media_range_json jsonb/);
});

test("Source authority is replay-safe, concurrency-checked, immutable, and direct-write protected", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /operation_fingerprint<>p_operation_fingerprint/);
  assert.match(sql, /source_revision_conflict/);
  assert.match(sql, /link_revision_conflict/);
  assert.match(sql, /reject_source_immutable_mutation/);
  assert.match(sql, /revoke all on tongs\.%I from public,anon,authenticated/);
});

test("legacy adoption is explicit and Tongs derives current file hashes before the RPC", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  const service = await readFile(serviceUrl, "utf8");
  assert.match(sql, /create or replace function tongs\.adopt_legacy_source/);
  assert.match(sql, /'adoption','legacy_current_state'/);
  assert.match(service, /const sourceHash = await sha256Hex\(canonicalJsonBytes\(sourceRead\.data\)\)/);
  assert.match(service, /p_legacy_links_revision: linksRead\.file_row\.revision/);
  assert.match(service, /p_legacy_links_hash: linksRead\.file_row\.hash_value\.toLowerCase\(\)/);
});

test("Source routes expose canonical read, revision, link, and adoption operations only through Tongs", async () => {
  const service = await readFile(serviceUrl, "utf8");
  assert.match(service, /sources"&&parts\[4\]==="commit-revision"/);
  assert.match(service, /sources"&&parts\[4\]==="link"/);
  assert.match(service, /sources"&&parts\[4\]==="adopt-legacy"/);
  assert.match(service, /\.rpc\("read_current_source"/);
  assert.match(service, /\.rpc\("read_workpiece_sources"/);
});
