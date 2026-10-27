import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const originalPath = new URL("./certify-gate6h-successor.ps1", import.meta.url);
const successorPath = new URL("./certify-anvil-recording-authority-historical-successor.ps1", import.meta.url);
const coordinatorPath = new URL("./invoke-anvil-recording-authority-historical-certification.ps1", import.meta.url);
const original = readFileSync(originalPath);
const successor = readFileSync(successorPath, "utf8");
const coordinator = readFileSync(coordinatorPath, "utf8");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

test("Gate 6P harness remains byte-for-byte preserved", () => {
  assert.equal(sha256(original), "ca46cf852d98ce601cf91fcda0c2374d7ebf216a51b4bbafa882a673a2ff6c07");
});

test("recording authority successor defaults to the certified chain and exact target", () => {
  for (const required of [
    "[ValidateSet('CertifiedChain','ExternalAuthentic')][string]$HistoryMode='CertifiedChain'",
    "$HistoryMode -eq 'CertifiedChain'",
    "certifiedAuthenticFoundation=$true",
    "gate5fAnchorRows=411",
    "gate6pPredecessorRows=418",
    "AuthorizeExternalAuthenticCapsule",
    "forge-gate5d-read-only-*",
    "$targetMigration='20261027030139'",
    "$predecessorHistoryRows=418",
    "$successorHistoryRows=419",
    "Expected only $targetMigration pending",
    "existingRecordingReceiptsUnchanged=$true",
    "financiallyInactive=$true",
    "paidProviderOperations=0",
    "hostedRequests=0",
  ]) assert.ok(successor.includes(required), `missing fail-closed successor assertion: ${required}`);

  assert.doesNotMatch(successor, /\$HistoryMode='ExternalAuthentic'/);
  assert.match(successor, /if\(-not \$CliPreflightOnly\).*External authentic history requires an explicitly authorized encrypted capsule/s);
});

test("successor verifies preservation, authority behavior, catalog, and rollback", () => {
  for (const required of [
    "Get-RecordingReceiptHashes",
    "Existing recording receipt bytes changed",
    "verify-anvil-recording-authority-upgrade.mjs",
    "successor-catalog-fingerprint.json",
    "certify-anvil-recording-authority-repair.mjs",
    "productionShapedRollbackVerified=$true",
    "originalHistoryUnchanged=$true",
  ]) assert.ok(successor.includes(required), `missing certification evidence: ${required}`);
});

test("ordinary successor certification forbids fresh credentials and capsules", () => {
  for (const required of [
    "[ValidateSet('ToolingPreflight','CertifiedChain','Authentic')][string]$Mode='CertifiedChain'",
    "$Mode -eq 'CertifiedChain'",
    "Authentic inputs are forbidden during certified-chain certification.",
    "A real Gate 5D token must not be loaded during certified-chain certification.",
    "-HistoryMode CertifiedChain",
    "authenticRequestMade",
  ]) assert.ok(coordinator.includes(required), `missing certified-chain boundary: ${required}`);
});

test("exceptional authentic mode retains export and confidential cleanup", () => {
  for (const required of [
    "AuthorizeAuthenticHistoryTransfer",
    "export-gate5d-authentic-history-read-only.ps1",
    "certify-anvil-recording-authority-historical-successor.ps1",
    "-HistoryMode ExternalAuthentic",
    "Remove-ForgeGate5DCapsule -Directory $capsuleDirectory",
    "SetEnvironmentVariable('FORGE_GATE5D_DATABASE_READ_TOKEN',$null,'Process')",
    "successorHistoryRows -ne 419",
  ]) assert.ok(coordinator.includes(required), `missing coordinator boundary: ${required}`);
});
