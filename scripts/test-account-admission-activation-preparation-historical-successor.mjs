import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const certifier = readFileSync(new URL("./certify-account-admission-activation-preparation-historical-successor.ps1", import.meta.url), "utf8");
const canonicalCertifier = readFileSync(new URL("./certify-canonical-baseline-v1.ps1", import.meta.url), "utf8");

test("migration 431 certifier pins the exact successor lineage and inactive contract", () => {
  for (const required of [
    "`$targetMigration='20261102032722'",
    "'$predecessorHistoryRows=430'",
    "'$successorHistoryRows=431'",
    "20261101201817",
    "forge_admission_activation_preparation.sql",
    "9f0422321cd023149571ef1cba4b18abb99ab4b03673ab24800bf15d969459af",
    "account_admission_activation_preparation_inactive.sql",
  ]) assert.ok(certifier.includes(required), `missing successor assertion: ${required}`);
});

test("fresh B1 certifier targets the Slice 2C catalog and SQL contract", () => {
  assert.match(canonicalCertifier, /v1-account-admission-activation-preparation\/successor-catalog-fingerprint\.json/);
  assert.match(canonicalCertifier, /account_admission_activation_preparation_inactive\.sql/);
  assert.match(canonicalCertifier, /forge\.account-admission-activation-preparation-baseline-successor-certification\.v1/);
});
