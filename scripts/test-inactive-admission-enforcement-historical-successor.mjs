import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const certifier = readFileSync(new URL("./certify-inactive-admission-enforcement-historical-successor.ps1", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20261101201817_forge_inactive_admission_enforcement.sql", import.meta.url), "utf8");
const canonicalCertifier = readFileSync(new URL("./certify-canonical-baseline-v1.ps1", import.meta.url), "utf8");

test("migration 430 certifier pins the exact successor lineage and authority test", () => {
  for (const required of [
    "`$targetMigration='20261101201817'",
    "'$predecessorHistoryRows=429'",
    "'$successorHistoryRows=430'",
    "20261101084703",
    "forge_inactive_admission_enforcement.sql",
    "ed35a3138ba4b15f63a50b5b8e8624ad45dcb9fdd2a6a9d990d52db42017c1bb",
    "account_admission_enforcement_inactive.sql",
  ]) assert.ok(certifier.includes(required), `missing successor assertion: ${required}`);
});

test("fresh B1 certifier targets the Slice 2B catalog and SQL contract", () => {
  assert.match(canonicalCertifier, /v1-inactive-admission-enforcement\/successor-catalog-fingerprint\.json/);
  assert.match(canonicalCertifier, /account_admission_enforcement_inactive\.sql/);
  assert.match(canonicalCertifier, /forge\.inactive-admission-enforcement-baseline-successor-certification\.v1/);
});

test("migration prepares all enforcement layers without activation", () => {
  assert.match(migration, /account_admission_pre_request/);
  assert.match(migration, /require_account_admission/);
  assert.match(migration, /current_request_is_admitted/);
  assert.match(migration, /forge\.account_admission_enforcement/);
  assert.doesNotMatch(migration, /create\s+policy/i);
  assert.doesNotMatch(migration, /alter\s+(role|database)[^;]+pgrst\.db_pre_request\s*=/i);
});
