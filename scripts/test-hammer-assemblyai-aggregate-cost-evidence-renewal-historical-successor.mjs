import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const certifier = readFileSync(new URL("./certify-hammer-assemblyai-aggregate-cost-evidence-renewal-historical-successor.ps1", import.meta.url), "utf8");
const canonicalCertifier = readFileSync(new URL("./certify-canonical-baseline-v1.ps1", import.meta.url), "utf8");

test("migration 432 certifier pins the exact successor lineage and inactive contract", () => {
  for (const required of [
    "`$targetMigration='20261103173603'",
    "'$predecessorHistoryRows=431'",
    "'$successorHistoryRows=432'",
    "20261102032722",
    "hammer_assemblyai_aggregate_cost_evidence_renewal.sql",
    "9ccf6395fe4fcd4959729a6399c3c28196fc14cf2b0bd2ef724ea7c4ad18a18a",
    "hammer-assemblyai-aggregate-cost-evidence-renewal",
  ]) assert.ok(certifier.includes(required), `missing successor assertion: ${required}`);
});

test("canonical certifier targets the migration 432 catalog", () => {
  assert.match(canonicalCertifier, /v1-hammer-assemblyai-aggregate-cost-evidence-renewal\/successor-catalog-fingerprint\.json/);
  assert.match(canonicalCertifier, /forge\.hammer-assemblyai-aggregate-cost-evidence-renewal-baseline-successor-certification\.v1/);
});
