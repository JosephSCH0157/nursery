import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const predecessor = readFileSync(new URL("./certify-hammer-brad-first-transcription-authority-historical-successor.ps1", import.meta.url));
const successor = readFileSync(new URL("./certify-hammer-owner-funded-first-transcription-historical-successor.ps1", import.meta.url), "utf8");
const coordinator = readFileSync(new URL("./invoke-hammer-owner-funded-first-transcription-historical-certification.ps1", import.meta.url), "utf8");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

test("Hammer Brad authority predecessor harness remains byte-for-byte preserved", () => {
  assert.equal(sha256(predecessor), "d0e7efe7d5da0d4a12197116facc925e85ccafbf3472de26bf10f3ff04e1e727");
});
test("Hammer owner-funded first-transcription successor uses the exact chained target and row counts", () => {
  for (const required of [
    "$targetMigration='20261029172356'",
    "$targetMigrationFile='20261029172356_hammer_owner_funded_first_transcription.sql'",
    "$predecessorHistoryRows=424",
    "$successorHistoryRows=425",
    "'20261029154824'",
    "Expected only $targetMigration pending",
    "hammerBradFirstTranscriptionAuthorityPredecessorRows=424",
    "migrationContractVerified=$true",
  ]) assert.ok(successor.includes(required), `missing chained-successor assertion: ${required}`);
});
test("certification checks security, inactivity, catalog equality, and predecessor preservation", () => {
  for (const required of [
    "hammer_owner_funded_first_transcription_contract.sql",
    "hammer_brad_first_transcription_authority_bundle_contract.sql",
    "hammer_trigger_acl_hardening_contract.sql",
    "hammer_scoped_live_funding_contract.sql",
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
    "successorHistoryRows -ne 425",
  ]) assert.ok(coordinator.includes(required), `missing coordinator boundary: ${required}`);
});
