import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const predecessor = readFileSync(new URL("./certify-hammer-trigger-acl-hardening-historical-successor.ps1", import.meta.url));
const successor = readFileSync(new URL("./certify-hammer-brad-first-transcription-authority-historical-successor.ps1", import.meta.url), "utf8");
const coordinator = readFileSync(new URL("./invoke-hammer-brad-first-transcription-authority-historical-certification.ps1", import.meta.url), "utf8");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

test("Hammer trigger ACL hardening predecessor harness remains byte-for-byte preserved", () => {
  assert.equal(sha256(predecessor), "7f468c4ab510c6388c5e2be1ce1a463fd561a89c627e924905499f29595d3157");
});
test("Hammer Brad first-transcription authority successor uses the exact chained target and row counts", () => {
  for (const required of [
    "$targetMigration='20261029154824'",
    "$targetMigrationFile='20261029154824_hammer_brad_first_transcription_authority_bundle.sql'",
    "$predecessorHistoryRows=423",
    "$successorHistoryRows=424",
    "'20261029110858'",
    "Expected only $targetMigration pending",
    "hammerTriggerAclHardeningPredecessorRows=423",
    "migrationContractVerified=$true",
  ]) assert.ok(successor.includes(required), `missing chained-successor assertion: ${required}`);
});
test("certification checks security, inactivity, catalog equality, and predecessor preservation", () => {
  for (const required of [
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
    "successorHistoryRows -ne 424",
  ]) assert.ok(coordinator.includes(required), `missing coordinator boundary: ${required}`);
});
