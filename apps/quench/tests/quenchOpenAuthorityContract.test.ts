import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../../../supabase/migrations/20260827210000_tongs_quench_open_authority_s5_1.sql", import.meta.url);
const serviceUrl = new URL("../../../packages/tongs/src/workpiece-commit-api.ts", import.meta.url);
const routeUrl = new URL("../../nursery/src/routes/Quench.tsx", import.meta.url);
const packetTypesUrl = new URL("../src/core/hammer-release-packet.types.ts", import.meta.url);
const packetIngestUrl = new URL("../src/core/hammer-release-packet.ingest.ts", import.meta.url);

test("S5-1 persists one immutable idempotent open authority", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /create table tongs\.quench_open_authority_receipts/);
  assert.match(sql, /foreign key\(manifest_snapshot_id, workspace_id, workpiece_id\)[\s\S]*quench_release_manifest_snapshots/);
  assert.match(sql, /open_operation_id uuid not null unique/);
  assert.match(sql, /trg_quench_open_authority_receipts_immutable/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /quench_open_idempotency_conflict/);
  assert.doesNotMatch(sql, /\bend \$\$;/);
  const replay = sql.indexOf("where open_operation_id = p_open_operation_id");
  const latest = sql.indexOf("order by source_file_revision desc");
  assert.ok(replay >= 0 && latest > replay, "replay must resolve before any current-manifest lookup");
});

test("open M1 then observe M2 without retargeting review projection", async () => {
  const service = await readFile(serviceUrl, "utf8");
  assert.match(service, /manifest_snapshot_id:manifestSnapshotId[\s\S]*manifest_content_hash:manifestContentHash/);
  assert.match(service, /newer_manifest_available:current\.hammer\.manifest_snapshot_id!==manifestSnapshotId/);
  assert.match(service, /eq\("manifest_snapshot_id",manifestSnapshotId\)/);
  assert.match(service, /quench_review_manifest_advanced/);
});

test("Quench route requires agreement and recovers only the open operation key", async () => {
  const route = await readFile(routeUrl, "utf8");
  assert.doesNotMatch(route, /pkg\.workspaceId\?\?activeHandoff\.workspaceId\?\?shell\.workspaceId/);
  assert.match(route, /route, handoff, and package identities disagree/);
  assert.match(route, /forge\.quench\.open-authority\.v1/);
  assert.match(route, /Review New Package/);
  assert.match(route, /manifest_snapshot_id:openAuthority\.manifest_snapshot_id/);
});

test("Quench review contract retains S4 canonical package-media evidence", async () => {
  const packetTypes = await readFile(packetTypesUrl, "utf8");
  const packetIngest = await readFile(packetIngestUrl, "utf8");
  assert.match(packetTypes, /media_reference\?: Record<string, unknown> \| null/);
  assert.match(packetTypes, /packaging_media_readiness\?: Record<string, unknown>/);
  assert.match(packetIngest, /media_reference: asObject\(row\.media_reference\)/);
});
