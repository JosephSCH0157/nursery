import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const predecessor = readFileSync(new URL("./certify-hammer-scoped-live-funding-historical-successor.ps1", import.meta.url));
const successor = readFileSync(new URL("./certify-hammer-trigger-acl-hardening-historical-successor.ps1", import.meta.url), "utf8");
const coordinator = readFileSync(new URL("./invoke-hammer-trigger-acl-hardening-historical-certification.ps1", import.meta.url), "utf8");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

test("Hammer scoped Live funding predecessor harness remains byte-for-byte preserved", () => {
  assert.equal(sha256(predecessor), "cc583b11ac27fa9d0b3100c25f399fd6e0742d4796ec53892d57bd5db8e6792f");
});
test("Hammer trigger ACL hardening successor uses the exact chained target and row counts", () => {
  for (const required of [
    "$targetMigration='20261029110858'",
    "$targetMigrationFile='20261029110858_hammer_trigger_acl_hardening.sql'",
    "$predecessorHistoryRows=422",
    "$successorHistoryRows=423",
    "'20261029033827'",
    "Expected only $targetMigration pending",
    "hammerScopedLiveFundingPredecessorRows=422",
    "migrationContractVerified=$true",
  ]) assert.ok(successor.includes(required), `missing chained-successor assertion: ${required}`);
});
test("certification checks security, inactivity, catalog equality, and predecessor preservation", () => {
  for (const required of [
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
    "successorHistoryRows -ne 423",
  ]) assert.ok(coordinator.includes(required), `missing coordinator boundary: ${required}`);
});
