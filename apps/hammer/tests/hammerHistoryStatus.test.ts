import assert from "node:assert/strict";
import { resolveHammerHistoryStatus } from "../src/lib/hammerHistoryStatus";

async function testFirstOpenSuppressesMessage() {
  assert.equal(resolveHammerHistoryStatus({
    historyExists: false,
    snapshotManifestExists: false,
    historyPresenceSentinelExists: false,
    snapshotRecoveryStatus: null,
  }), null);
}

async function testMissingHistoryWarnsWhenExpected() {
  assert.equal(resolveHammerHistoryStatus({
    historyExists: false,
    snapshotManifestExists: true,
    historyPresenceSentinelExists: false,
    snapshotRecoveryStatus: null,
  }) != null, true);

  assert.equal(resolveHammerHistoryStatus({
    historyExists: false,
    snapshotManifestExists: false,
    historyPresenceSentinelExists: true,
    snapshotRecoveryStatus: null,
  }) != null, true);
}

async function testHistoryShowsSnapshotRecoveryStatusWhenPresent() {
  assert.equal(resolveHammerHistoryStatus({
    historyExists: true,
    snapshotManifestExists: false,
    historyPresenceSentinelExists: false,
    snapshotRecoveryStatus: "Snapshot fallback: manifest unavailable. Opened with full history replay.",
  }), "Snapshot fallback: manifest unavailable. Opened with full history replay.");
}

async function run() {
  await testFirstOpenSuppressesMessage();
  await testMissingHistoryWarnsWhenExpected();
  await testHistoryShowsSnapshotRecoveryStatusWhenPresent();
  // eslint-disable-next-line no-console
  console.log("Hammer history status helper tests passed.");
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Hammer history status helper tests failed:", error);
  process.exit(1);
});

