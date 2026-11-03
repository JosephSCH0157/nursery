import crypto from "node:crypto";

export const ACTIVE_CATALOG_CONTRACT_SCHEMA = "forge.account-admission-active-catalog-contract.v1";
export const CATALOG_SCHEMA = "forge.canonical-baseline-application-catalog-fingerprint.v1";

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const key = (entry) => `${entry.category}|${entry.identity}`;
const fingerprint = (entries) => sha256(Buffer.from(entries.map((entry) =>
  `${entry.category}|${entry.identity}|${entry.sha256}`).join("\n"), "utf8"));
const EXPECTED_UNCHANGED_CATEGORIES = [
  "column", "constraint", "default_acl", "event_trigger", "extension", "function", "index",
  "relation", "schema", "sequence", "trigger", "type",
];
const EXPECTED_ACTIVE_ENFORCEMENT = {
  preRequestSetting: "tongs.account_admission_pre_request",
  dataApiPolicyName: "forge_account_admission_required_v1",
  dataApiPolicyCount: 250,
  dataApiPolicyMode: "RESTRICTIVE",
  dataApiPolicyCommand: "ALL",
  dataApiPolicyRoles: ["authenticated"],
  dataApiUsing: "tongs.current_request_is_admitted()",
  dataApiWithCheck: "tongs.current_request_is_admitted()",
  storagePolicies: [
    {
      name: "forge_account_admission_storage_insert_v1", command: "insert", permissive: "RESTRICTIVE",
      roles: ["authenticated"], using: "", withCheck: "tongs.current_request_is_admitted()",
    },
    {
      name: "forge_account_admission_storage_select_v1", command: "select", permissive: "RESTRICTIVE",
      roles: ["authenticated"], using: "tongs.current_request_is_admitted()", withCheck: "",
    },
    {
      name: "forge_account_admission_storage_update_v1", command: "update", permissive: "RESTRICTIVE",
      roles: ["authenticated"], using: "tongs.current_request_is_admitted()",
      withCheck: "tongs.current_request_is_admitted()",
    },
  ],
  realtimeAdmissionPolicyCount: 0,
  persistentFinancialAdmissionSettingCount: 0,
};

function exact(actual, expected, name) {
  if (actual !== expected) throw new Error(`${name}_mismatch`);
}

function hash(value, name) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) throw new Error(`${name}_invalid`);
  return value;
}

function parse(text, name) {
  try { return JSON.parse(text); }
  catch { throw new Error(`${name}_invalid_json`); }
}

function validateCatalog(catalog, name) {
  if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) throw new Error(`${name}_missing`);
  exact(catalog.schema, CATALOG_SCHEMA, `${name}_schema`);
  if (!Array.isArray(catalog.entries) || !catalog.entries.length) throw new Error(`${name}_entries_missing`);
  exact(catalog.objectCount, catalog.entries.length, `${name}_object_count`);
  const counts = {};
  const seen = new Set();
  let previous = "";
  for (const entry of catalog.entries) {
    if (typeof entry?.category !== "string" || !entry.category || typeof entry?.identity !== "string" || !entry.identity) {
      throw new Error(`${name}_entry_identity_invalid`);
    }
    hash(entry.sha256, `${name}_entry_sha256`);
    const entryKey = key(entry);
    if (seen.has(entryKey)) throw new Error(`${name}_entry_duplicate`);
    if (previous && previous.localeCompare(entryKey) >= 0) throw new Error(`${name}_entry_order_invalid`);
    previous = entryKey;
    seen.add(entryKey);
    counts[entry.category] = (counts[entry.category] ?? 0) + 1;
  }
  exact(catalog.contractSha256, fingerprint(catalog.entries), `${name}_contract_sha256`);
  exact(JSON.stringify(catalog.categoryCounts), JSON.stringify(counts), `${name}_category_counts`);
  return catalog;
}

export function compareCatalogToExpected(expected, observed) {
  validateCatalog(expected, "expected_catalog");
  validateCatalog(observed, "observed_catalog");
  exact(observed.objectCount, expected.objectCount, "observed_catalog_object_count");
  exact(observed.contractSha256, expected.contractSha256, "observed_catalog_contract_sha256");
  const expectedByKey = new Map(expected.entries.map((entry) => [key(entry), entry.sha256]));
  const observedByKey = new Map(observed.entries.map((entry) => [key(entry), entry.sha256]));
  for (const [entryKey, expectedHash] of expectedByKey) {
    if (!observedByKey.has(entryKey)) throw new Error(`observed_catalog_missing:${entryKey}`);
    exact(observedByKey.get(entryKey), expectedHash, `observed_catalog_entry:${entryKey}`);
  }
  for (const entryKey of observedByKey.keys()) {
    if (!expectedByKey.has(entryKey)) throw new Error(`observed_catalog_unexpected:${entryKey}`);
  }
  return true;
}

export function compareInactiveAndActiveCatalogs(inactiveCatalog, activeCatalog, surface) {
  validateCatalog(inactiveCatalog, "inactive_catalog");
  validateCatalog(activeCatalog, "active_catalog");
  if (surface?.schema !== "forge.account-admission-activation-database-surface.v1") throw new Error("activation_surface_schema_mismatch");
  const expectedPolicyKeys = new Set((surface.dataApiRelations ?? [])
    .filter((relation) => relation.kind === "table" || relation.kind === "partitioned_table")
    .map((relation) => `policy|${relation.schema}.${relation.name}.forge_account_admission_required_v1`));
  exact(expectedPolicyKeys.size, 250, "activation_surface_base_relation_count");

  const inactiveByKey = new Map(inactiveCatalog.entries.map((entry) => [key(entry), entry.sha256]));
  const activeByKey = new Map(activeCatalog.entries.map((entry) => [key(entry), entry.sha256]));
  const added = [...activeByKey.keys()].filter((entryKey) => !inactiveByKey.has(entryKey));
  const removed = [...inactiveByKey.keys()].filter((entryKey) => !activeByKey.has(entryKey));
  const changed = [...activeByKey.keys()].filter((entryKey) =>
    inactiveByKey.has(entryKey) && inactiveByKey.get(entryKey) !== activeByKey.get(entryKey));
  exact(added.length, 250, "active_catalog_added_count");
  exact(removed.length, 0, "active_catalog_removed_count");
  exact(changed.join("\n"), "dependency_set|public+tongs", "active_catalog_changed_keys");
  for (const entryKey of added) {
    if (!expectedPolicyKeys.has(entryKey)) throw new Error(`active_catalog_unexpected_addition:${entryKey}`);
  }
  for (const entryKey of expectedPolicyKeys) {
    if (!activeByKey.has(entryKey)) throw new Error(`active_catalog_missing_policy:${entryKey}`);
  }
  exact(activeCatalog.categoryCounts.policy, inactiveCatalog.categoryCounts.policy + 250, "active_catalog_policy_count");
  for (const [category, count] of Object.entries(inactiveCatalog.categoryCounts)) {
    if (category !== "policy" && category !== "dependency_set") {
      exact(activeCatalog.categoryCounts[category], count, `active_catalog_unchanged_category:${category}`);
    }
  }
  return { addedPolicyCount: added.length, removedObjectCount: removed.length, changedExistingKeys: changed };
}

export function validateActiveCatalogContract({ contractText, inactiveCatalogText, activeCatalogText, surfaceText, activationSql }) {
  const contract = parse(contractText, "active_contract");
  const inactiveCatalog = parse(inactiveCatalogText, "inactive_catalog");
  const activeCatalog = parse(activeCatalogText, "active_catalog");
  const surface = parse(surfaceText, "activation_surface");
  exact(contract.schema, ACTIVE_CATALOG_CONTRACT_SCHEMA, "active_contract_schema");
  exact(contract.repository, "JosephSCH0157/nursery", "active_contract_repository");
  exact(contract.authoritySource?.path, "supabase/activation/forge-account-admission-activation-v1.sql", "active_contract_activation_sql_path");
  exact(sha256(activationSql), contract.authoritySource?.sha256, "active_contract_activation_sql_sha256");
  exact(contract.surfaceSource?.path, "docs/admission/ADMISSION_ACTIVATION_DATABASE_SURFACE.v1.json", "active_contract_surface_path");
  exact(sha256(surfaceText), contract.surfaceSource?.sha256, "active_contract_surface_sha256");
  exact(contract.inactiveCatalog?.path, "docs/database/baseline/v1-account-admission-activation-preparation/successor-catalog-fingerprint.json", "active_contract_inactive_path");
  exact(sha256(inactiveCatalogText), contract.inactiveCatalog?.fileSha256, "active_contract_inactive_file_sha256");
  exact(contract.activeCatalog?.path, "docs/database/baseline/v1-account-admission-activation-active/active-catalog-fingerprint.json", "active_contract_active_path");
  exact(sha256(activeCatalogText), contract.activeCatalog?.fileSha256, "active_contract_active_file_sha256");
  validateCatalog(inactiveCatalog, "inactive_catalog");
  validateCatalog(activeCatalog, "active_catalog");
  exact(inactiveCatalog.objectCount, contract.inactiveCatalog.objectCount, "active_contract_inactive_object_count");
  exact(inactiveCatalog.contractSha256, contract.inactiveCatalog.contractSha256, "active_contract_inactive_catalog_sha256");
  exact(activeCatalog.objectCount, contract.activeCatalog.objectCount, "active_contract_active_object_count");
  exact(activeCatalog.contractSha256, contract.activeCatalog.contractSha256, "active_contract_active_catalog_sha256");
  const inactiveDependency = inactiveCatalog.entries.find((entry) => key(entry) === "dependency_set|public+tongs");
  const activeDependency = activeCatalog.entries.find((entry) => key(entry) === "dependency_set|public+tongs");
  exact(inactiveDependency?.sha256, contract.inactiveCatalog.dependencySetSha256, "active_contract_inactive_dependency_set");
  exact(activeDependency?.sha256, contract.activeCatalog.dependencySetSha256, "active_contract_active_dependency_set");
  const delta = compareInactiveAndActiveCatalogs(inactiveCatalog, activeCatalog, surface);
  exact(delta.addedPolicyCount, contract.expectedDelta?.addedPolicyCount, "active_contract_added_policy_count");
  exact(delta.removedObjectCount, contract.expectedDelta?.removedObjectCount, "active_contract_removed_object_count");
  exact(JSON.stringify(delta.changedExistingKeys), JSON.stringify(contract.expectedDelta?.changedExistingKeys), "active_contract_changed_keys");
  exact(JSON.stringify(contract.expectedDelta?.unchangedCategories), JSON.stringify(EXPECTED_UNCHANGED_CATEGORIES), "active_contract_unchanged_categories");
  exact(JSON.stringify(contract.activeEnforcement), JSON.stringify(EXPECTED_ACTIVE_ENFORCEMENT), "active_contract_enforcement_definition");
  exact(contract.rejectMissingActivePolicies, true, "active_contract_reject_missing");
  exact(contract.rejectAdditionalActivePolicies, true, "active_contract_reject_additional");
  exact(contract.rejectModifiedActivePolicies, true, "active_contract_reject_modified");
  exact(contract.preserveInactiveCatalog, true, "active_contract_preserve_inactive");
  return {
    inactiveObjectCount: inactiveCatalog.objectCount,
    inactiveCatalogSha256: inactiveCatalog.contractSha256,
    activeObjectCount: activeCatalog.objectCount,
    activeCatalogSha256: activeCatalog.contractSha256,
    ...delta,
  };
}
