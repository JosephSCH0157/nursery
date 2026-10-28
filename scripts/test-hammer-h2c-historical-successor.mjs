import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const predecessor = readFileSync(new URL("./certify-anvil-recording-authority-historical-successor.ps1", import.meta.url));
const successor = readFileSync(new URL("./certify-hammer-h2c-historical-successor.ps1", import.meta.url), "utf8");
const coordinator = readFileSync(new URL("./invoke-hammer-h2c-historical-certification.ps1", import.meta.url), "utf8");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

test("recording-authority predecessor harness remains byte-for-byte preserved", () => {
  assert.equal(sha256(predecessor), "a0c7d57c85e121576c09f9daabd3986155f0a0cba9a791acd1035f511ee7cb04");
});

test("Hammer H2-C successor uses the exact chained target and row counts", () => {
  for (const required of [
    "$targetMigration='20261028092438'",
    "$targetMigrationFile='20261028092438_hammer_h2c_inactive_assemblyai_transcription.sql'",
    "$predecessorHistoryRows=419",
    "$successorHistoryRows=420",
    "'20261027030139'",
    "Expected only $targetMigration pending",
    "recordingAuthorityPredecessorRows=419",
    "migrationContractVerified=$true",
  ]) assert.ok(successor.includes(required), `missing chained-successor assertion: ${required}`);
});

test("certification checks security, inactivity, catalog equality, and predecessor preservation", () => {
  for (const required of [
    "hammer_h2c_inactive_transcription_contract.sql",
    "successor-catalog-fingerprint.json",
    "existingRecordingReceiptsUnchanged=$true",
    "originalHistoryUnchanged=$true",
    "financiallyInactive=$true",
    "paidProviderOperations=0",
    "hostedRequests=0",
  ]) assert.ok(successor.includes(required), `missing certification evidence: ${required}`);
});

test("ordinary certification is local-only and authentic mode remains separately authorized", () => {
  for (const required of [
    "[ValidateSet('ToolingPreflight','CertifiedChain','Authentic')][string]$Mode='CertifiedChain'",
    "Authentic inputs are forbidden during certified-chain certification.",
    "A real Gate 5D token must not be loaded during certified-chain certification.",
    "AuthorizeAuthenticHistoryTransfer",
    "successorHistoryRows -ne 420",
  ]) assert.ok(coordinator.includes(required), `missing coordinator boundary: ${required}`);
});
