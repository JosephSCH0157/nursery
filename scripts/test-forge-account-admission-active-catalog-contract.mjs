import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import test from "node:test";
import {
  compareCatalogToExpected,
  compareInactiveAndActiveCatalogs,
  validateActiveCatalogContract,
} from "./lib/forge-account-admission-active-catalog-contract.mjs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const paths = {
  contract: "docs/database/baseline/v1-account-admission-activation-active/active-contract.v1.json",
  inactive: "docs/database/baseline/v1-account-admission-activation-preparation/successor-catalog-fingerprint.json",
  active: "docs/database/baseline/v1-account-admission-activation-active/active-catalog-fingerprint.json",
  surface: "docs/admission/ADMISSION_ACTIVATION_DATABASE_SURFACE.v1.json",
  activation: "supabase/activation/forge-account-admission-activation-v1.sql",
};
const inputs = () => ({
  contractText: read(paths.contract),
  inactiveCatalogText: read(paths.inactive),
  activeCatalogText: read(paths.active),
  surfaceText: read(paths.surface),
  activationSql: read(paths.activation),
});
const fingerprint = (entries) => crypto.createHash("sha256").update(entries.map((entry) =>
  `${entry.category}|${entry.identity}|${entry.sha256}`).join("\n")).digest("hex");
const recalculate = (catalog) => {
  catalog.entries.sort((left, right) => `${left.category}|${left.identity}`.localeCompare(`${right.category}|${right.identity}`));
  catalog.objectCount = catalog.entries.length;
  catalog.categoryCounts = Object.fromEntries([...new Set(catalog.entries.map((entry) => entry.category))]
    .sort().map((category) => [category, catalog.entries.filter((entry) => entry.category === category).length]));
  catalog.contractSha256 = fingerprint(catalog.entries);
  return catalog;
};

test("active catalog contract accounts for the complete inactive-to-active delta", () => {
  assert.deepEqual(validateActiveCatalogContract(inputs()), {
    inactiveObjectCount: 16612,
    inactiveCatalogSha256: "6cffa82600d1898621de9abb70000f82b723128de853bbddb6e08b58056ed3a1",
    activeObjectCount: 16862,
    activeCatalogSha256: "8238bcdadc568f60fdf3f7881d1795463f3b288c4577b2537e60bd0491e7d8e8",
    addedPolicyCount: 250,
    removedObjectCount: 0,
    changedExistingKeys: ["dependency_set|public+tongs"],
  });
});

test("inactive catalog cannot pass active catalog verification", () => {
  const input = inputs();
  const inactive = JSON.parse(input.inactiveCatalogText);
  const surface = JSON.parse(input.surfaceText);
  assert.throws(() => compareInactiveAndActiveCatalogs(inactive, structuredClone(inactive), surface), /added_count/);
  assert.throws(() => compareCatalogToExpected(JSON.parse(input.activeCatalogText), inactive), /object_count/);
});

test("missing, additional, and modified active admission policies fail closed", () => {
  const expected = JSON.parse(inputs().activeCatalogText);
  const policyIndex = expected.entries.findIndex((entry) =>
    entry.category === "policy" && entry.identity.endsWith(".forge_account_admission_required_v1"));
  assert.ok(policyIndex >= 0);
  const missing = recalculate(structuredClone(expected));
  missing.entries.splice(policyIndex, 1);
  recalculate(missing);
  assert.throws(() => compareCatalogToExpected(expected, missing), /object_count|missing/);
  const additional = recalculate(structuredClone(expected));
  additional.entries.push({ category: "policy", identity: "tongs.unexpected.forge_account_admission_required_v1", sha256: "0".repeat(64) });
  recalculate(additional);
  assert.throws(() => compareCatalogToExpected(expected, additional), /object_count|unexpected/);
  const modified = recalculate(structuredClone(expected));
  modified.entries[policyIndex].sha256 = "f".repeat(64);
  recalculate(modified);
  assert.throws(() => compareCatalogToExpected(expected, modified), /contract_sha256|entry/);
});

test("active contract is bound to the reviewed activation SQL and frozen inactive catalog", () => {
  const activation = inputs();
  activation.activationSql += "\n-- drift";
  assert.throws(() => validateActiveCatalogContract(activation), /activation_sql_sha256/);
  const inactive = inputs();
  inactive.inactiveCatalogText = inactive.inactiveCatalogText.replace(
    "6cffa82600d1898621de9abb70000f82b723128de853bbddb6e08b58056ed3a1",
    "0".repeat(64),
  );
  assert.throws(() => validateActiveCatalogContract(inactive), /inactive_file_sha256/);
  const storageDefinition = inputs();
  const contract = JSON.parse(storageDefinition.contractText);
  contract.activeEnforcement.storagePolicies[0].withCheck = "true";
  storageDefinition.contractText = JSON.stringify(contract);
  assert.throws(() => validateActiveCatalogContract(storageDefinition), /enforcement_definition/);
});
