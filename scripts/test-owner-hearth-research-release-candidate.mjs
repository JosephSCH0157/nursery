import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const manifestPath = "docs/billing/proposals/owner-hearth-research-v1.release-manifest.json";
const migrationPath = "supabase/migrations/20261010120000_tongs_owner_funded_hearth_research.sql";
const activationPath = "docs/billing/proposals/owner-hearth-research-v1.activation.sql";

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const migration = readFileSync(migrationPath, "utf8");
const activation = readFileSync(activationPath, "utf8");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

assert.equal(manifest.schema, "forge.owner-hearth-research-release-candidate.v1");
assert.equal(manifest.status, "inactive_release_candidate");
assert.equal(manifest.migration.identifier, migrationPath.split("/").at(-1));
assert.equal(manifest.migration.sha256, sha256(migration));
assert.equal(sha256(migration), "a53c65232c4dbc44cb1f3c46ac5022d877fec2ad4d8e290dbe0653daaf75d809");
assert.equal(manifest.migration.applied, false);
assert.equal(manifest.permission_migration.identifier, "20261010130000_tongs_owner_hearth_research_permissions.sql");
const permissions = readFileSync(`supabase/migrations/${manifest.permission_migration.identifier}`, "utf8");
assert.equal(manifest.permission_migration.sha256, sha256(permissions));
assert.equal(manifest.permission_migration.applied, false);
assert.equal(manifest.permission_migration.function_inventory, 21);
assert.equal((migration.match(/create or replace function tongs\./g) ?? []).length, 21);
assert.match(permissions, /revoke all on function %s from public,anon,authenticated/);
assert.match(permissions, /existing\.result_package_id<>pkg\.id or existing\.reviewer_id<>actor/);
assert.match(permissions, /m\.workspace_id=owner_hearth_research_result_packages\.workspace_id/);
for (const part of ["guard", "restore"]) {
  assert.equal(sha256(readFileSync(manifest.safe_sequence_proposal[`${part}_path`], "utf8")), manifest.safe_sequence_proposal[`${part}_sha256`]);
}
assert.equal(manifest.safe_sequence_proposal.status, "requires_explicit_production_approval");
assert.equal(manifest.safe_sequence_proposal.separate_cli_migrations_without_guard_safe, false);
assert.equal(manifest.activation_proposal.path, activationPath);
assert.equal(manifest.activation_proposal.sha256, sha256(activation));

const limits = manifest.limits_micros;
assert.equal(limits.canary_quote, 144072);
assert.equal(limits.canary_aggregate_admission, limits.canary_quote + 3);
assert.equal(
  limits.additional_owner_authorization,
  136456 + 21306560 + limits.storage_and_recovery,
);
assert.equal(
  limits.proposed_shared_aggregate_ceiling,
  limits.existing_shared_exposure + limits.additional_owner_authorization + limits.aggregate_risk,
);

for (const authorityFlag of [
  "activation_authorized",
  "credentials_authorized",
  "budget_authorized",
  "paid_canary_authorized",
]) assert.equal(manifest[authorityFlag], false);
assert.equal(manifest.deployment_authorized, false);
assert.equal(manifest.production_migrations_authorized, false);
assert.equal(manifest.merge_authorized, false);
assert.equal(manifest.deployment_scope, "inactive_release_preparation_pending_safe_sequence_approval");
assert.equal(
  manifest.release_correction.authorized_parent_candidate,
  "985cbfc3b77ff3f198ea892d941430485e6402ca",
);
assert.equal(manifest.release_correction.scope, "six_nursery_integration_fixtures_and_forward_research_permissions");
assert.equal(manifest.owner_chat_authorization_changed, false);
assert.equal(manifest.eleven_route_enforcement_changed, false);

assert.equal((activation.match(/raise exception 'INACTIVE RELEASE CANDIDATE:/g) ?? []).length, 2);
assert.equal((activation.match(/^rollback;$/gm) ?? []).length, 2);
assert.match(migration, /'gpt-6-astra'.*130000/s);
assert.match(migration, /maximum_owner_authorization_micros[^;]+21526788/s);
assert.match(migration, /proposed_shared_aggregate_ceiling_micros[^;]+32366821/s);
assert.match(migration, /read_owner_hearth_research_canary_reconciliation/);
assert.match(migration, /submission_unknown/);
assert.match(migration, /customer_charge_micros/);

console.log(JSON.stringify({
  inactive_release_candidate: "passed",
  checksum_binding: "passed",
  owner_limit_arithmetic: "passed",
  double_rollback_activation_guard: "passed",
  unchanged_chat_and_cutover_declarations: "passed",
}));
