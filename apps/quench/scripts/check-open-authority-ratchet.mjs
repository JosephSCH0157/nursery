import { readFile } from "node:fs/promises";

const route = await readFile(new URL("../../nursery/src/routes/Quench.tsx", import.meta.url), "utf8");
const service = await readFile(new URL("../../../packages/tongs/src/workpiece-commit-api.ts", import.meta.url), "utf8");

const forbidden = [
  ["workspace precedence", /pkg\.workspaceId\s*\?\?\s*activeHandoff\.workspaceId\s*\?\?/],
  ["review refresh through mutable latest projection", /setHandoffPreparedCase\(buildCanonicalReleaseCase\(refreshRoot\.data\)\)/],
];
for (const [label, pattern] of forbidden) {
  if (pattern.test(route)) throw new Error(`S5-1 open authority ratchet failed: ${label}`);
}

for (const required of [
  "quench/open-authority",
  "isQuenchOpenAuthority",
  "Source Conflict:",
  "Review New Package",
  "manifest_snapshot_id:openAuthority.manifest_snapshot_id",
]) {
  if (!route.includes(required)) throw new Error(`S5-1 open authority ratchet missing: ${required}`);
}

for (const [label, pattern] of [
  ["openQuenchAuthority", /openQuenchAuthority/],
  ["newer manifest detection", /newer_manifest_available:\s*current\.hammer\.manifest_snapshot_id\s*!==\s*manifestSnapshotId/],
  ["quench_review_manifest_advanced", /quench_review_manifest_advanced/],
]) {
  if (!pattern.test(service)) throw new Error(`S5-1 Tongs authority ratchet missing: ${label}`);
}

console.log("S5-1 Quench open authority ratchet passed.");
