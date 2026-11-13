import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (name) => readFileSync(new URL(name, import.meta.url), "utf8");
const frozen = read("./certify-anvil-recording-authority-historical-successor.ps1");
const current = read("./certify-anvil-recording-authority-historical-current.ps1");
const coordinator = read("./invoke-anvil-recording-authority-historical-certification.ps1");
const originalCopy = "    Copy-Item -Path (Join-Path $repo 'supabase/migrations/*.sql') -Destination (Join-Path $workdir 'supabase/migrations')";
const staging = /    # Current adapter:[\s\S]*?    # precheck verifies all frozen source bytes before any historical lane runs\./;

test("current historical adapter preserves every frozen harness byte outside migration selection", () => {
  assert.equal(current.replace(staging, originalCopy), frozen);
  const block = current.match(staging)?.[0];
  assert.ok(block);
  for (const requirement of [
    "0f43b227ad3714c33afc80fef9907a8a7fcb5a2ce69d851f28312c06c44fa74f",
    "$historicalManifest.migrations.version",
    "$successorContract.baselineSuccessor.versions",
    "($_.Name -split '_',2)[0] -le $targetMigration",
    "$expectedVersions.Count -ne $successorHistoryRows",
    "($versions-join ',') -cne ($expectedVersions-join ',')",
    "throw 'Recording-authority staged chronology differs from the frozen contract.'",
  ]) assert.ok(block.includes(requirement), `missing frozen-chronology constraint: ${requirement}`);
});

test("coordinator routes certified-chain work to the current adapter without changing authentic authorization", () => {
  assert.ok(coordinator.includes("'certify-anvil-recording-authority-historical-current.ps1') -HistoryMode CertifiedChain"));
  assert.ok(coordinator.includes("'certify-anvil-recording-authority-historical-successor.ps1') -HistoryMode ExternalAuthentic"));
  assert.ok(coordinator.includes("Authentic history transfer requires a separate explicit owner authorization switch."));
});
