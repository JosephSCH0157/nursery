import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  betaApplicationPayloadSha256,
  ingestVerifiedBetaApplication,
  isBetaAdmissionIntakeEnabled,
  normalizeVerifiedBetaApplication,
  type BetaAdmissionRpcClient,
} from "../server/auth/beta-admission-service";

const validSubmission = {
  "form-name": "anvil-beta-application",
  application_ref: "54262643-fda4-4eed-8a28-5f0b10db624e",
  name: "Forge Creator",
  email: "Creator@Example.test ",
  creator_type: "Podcast (solo)",
  frequency: "Weekly",
  goals: "Build a durable workflow",
  teleprompter_used: "",
  frustrations: "Context switching",
  notes: "",
  status: "approved",
};

test("verified form normalization whitelists applicant fields without trusting admission data", () => {
  const normalized = normalizeVerifiedBetaApplication(validSubmission);
  assert.equal(normalized.email, "creator@example.test");
  assert.equal(normalized.teleprompterUsed, null);
  assert.equal("status" in normalized, false);
  assert.match(betaApplicationPayloadSha256(normalized), /^[0-9a-f]{64}$/);
});

test("wrong forms and invalid application references fail closed", () => {
  assert.throws(
    () => normalizeVerifiedBetaApplication({ ...validSubmission, "form-name": "contact" }),
    /Unsupported Netlify form/,
  );
  assert.throws(
    () => normalizeVerifiedBetaApplication({ ...validSubmission, application_ref: "not-a-uuid" }),
    /Invalid beta application reference/,
  );
});

test("verified ingestion calls only the service-role admission RPC with normalized inputs", async () => {
  const rpcNames: string[] = [];
  let rpcArgs: Record<string, unknown> = {};
  const client: BetaAdmissionRpcClient = {
    schema(schema) {
      assert.equal(schema, "tongs");
      return {
        async rpc(name, args) {
          rpcNames.push(name);
          if (name === "account_admission_authority_version") {
            return { data: "forge-account-admission-v1", error: null };
          }
          rpcArgs = args ?? {};
          return { data: [{ disposition: "created" }], error: null };
        },
      };
    },
  };

  await ingestVerifiedBetaApplication(validSubmission, client, new Date("2026-10-30T12:00:00.000Z"));
  assert.deepEqual(rpcNames, ["account_admission_authority_version", "ingest_beta_access_application"]);
  assert.equal(rpcArgs.p_email, "creator@example.test");
  assert.equal(rpcArgs.p_source_reference, validSubmission.application_ref);
  assert.equal(rpcArgs.p_submitted_at, "2026-10-30T12:00:00.000Z");
  assert.equal("p_status" in rpcArgs, false);
});

test("production intake is disabled unless the exact opt-in flag is true", () => {
  assert.equal(isBetaAdmissionIntakeEnabled({}), false);
  assert.equal(isBetaAdmissionIntakeEnabled({ FORGE_BETA_INTAKE_ENABLED: "false" }), false);
  assert.equal(isBetaAdmissionIntakeEnabled({ FORGE_BETA_INTAKE_ENABLED: "TRUE" }), true);
});

test("ingestion rejects a missing or mismatched database authority version", async () => {
  const client: BetaAdmissionRpcClient = {
    schema() {
      return {
        async rpc(name) {
          if (name === "account_admission_authority_version") {
            return { data: "wrong-version", error: null };
          }
          assert.fail("ingestion RPC must not run after a version mismatch");
        },
      };
    },
  };
  await assert.rejects(() => ingestVerifiedBetaApplication(validSubmission, client), /dependency is unavailable/);
});

test("migration preserves the six-table inactive authority boundary", () => {
  const repositoryRoot = path.resolve(import.meta.dirname, "../../..");
  const migrationPath = path.join(
    repositoryRoot,
    "supabase/migrations/20261031123320_forge_beta_admission_foundation.sql",
  );
  const migration = fs.readFileSync(migrationPath, "utf8");
  for (const table of [
    "beta_access_applications",
    "beta_access_application_decisions",
    "beta_access_identity_bindings",
    "legacy_account_admission_cohort",
    "account_admission_events",
    "account_admissions",
  ]) {
    assert.match(migration, new RegExp(`create table tongs\\.${table} \\(`));
    assert.match(migration, new RegExp(`revoke all on tongs\\.${table} from public, anon, authenticated, service_role`));
  }
  assert.match(migration, /insert into tongs\.legacy_account_admission_cohort[\s\S]*from auth\.users/);
  assert.match(migration, /account_admissions is event-projected and cannot be changed directly/);
  assert.match(migration, /where admission\.user_id = p_user_id and admission\.effective_state = 'admitted'/);
  assert.match(migration, /grant execute on function tongs\.ingest_beta_access_application[\s\S]*to service_role/);
  assert.match(migration, /platform operator authority required/);
  assert.doesNotMatch(migration, /create policy/i);
});

