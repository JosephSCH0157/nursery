import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const predecessor = readFileSync(new URL("./certify-hammer-h2c-historical-successor.ps1", import.meta.url));
const successor = readFileSync(new URL("./certify-hammer-first-transcription-historical-successor.ps1", import.meta.url), "utf8");
const coordinator = readFileSync(new URL("./invoke-hammer-first-transcription-historical-certification.ps1", import.meta.url), "utf8");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

test("Hammer H2-C predecessor harness remains byte-for-byte preserved", () => {
  assert.equal(sha256(predecessor), "0866b72708445c724a0dd424a49a14ef50d6ab3578526533058f18f9085966e8");
});

test("Hammer first transcription successor uses the exact chained target and row counts", () => {
  for (const required of [
    "$targetMigration='20261029004958'",
    "$targetMigrationFile='20261029004958_hammer_first_transcription_activation.sql'",
    "$predecessorHistoryRows=420",
    "$successorHistoryRows=421",
    "'20261028092438'",
    "Expected only $targetMigration pending",
    "hammerH2CPredecessorRows=420",
    "migrationContractVerified=$true",
  ]) assert.ok(successor.includes(required), `missing chained-successor assertion: ${required}`);
});

test("certification checks security, inactivity, catalog equality, and predecessor preservation", () => {
  for (const required of [
    "hammer_first_transcription_activation_contract.sql",
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
    "successorHistoryRows -ne 421",
  ]) assert.ok(coordinator.includes(required), `missing coordinator boundary: ${required}`);
});
