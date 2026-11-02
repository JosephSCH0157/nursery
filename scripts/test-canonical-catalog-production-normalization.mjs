import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import test from "node:test";
import {
  LOCAL_WRAPPERS_FINGERPRINT_SHA256,
  PRODUCTION_WRAPPERS_FINGERPRINT_SHA256,
  normalizeCatalogForProduction,
} from "./lib/forge-catalog-production-normalization.mjs";

const catalogPath = new URL("../docs/database/baseline/v1-account-admission-activation-preparation/successor-catalog-fingerprint.json", import.meta.url);
const compatibilityPath = new URL("../docs/database/baseline/v1-gate3/wrappers-extension-compatibility.json", import.meta.url);
const compatibility = JSON.parse(fs.readFileSync(compatibilityPath, "utf8"));
const productionCatalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));

const wrappersEntry = (catalog) => catalog.entries.find((entry) =>
  entry.category === "extension" && entry.identity === "wrappers");

test("migration 431 catalog is production-normalized and normalization is idempotent", () => {
  assert.equal(wrappersEntry(productionCatalog).sha256, PRODUCTION_WRAPPERS_FINGERPRINT_SHA256);
  const result = normalizeCatalogForProduction(productionCatalog, compatibility);
  assert.equal(result.changed, false);
  assert.equal(result.contractSha256, "6cffa82600d1898621de9abb70000f82b723128de853bbddb6e08b58056ed3a1");
  assert.deepEqual(result.catalog, productionCatalog);
});

test("approved local wrappers 0.5.7 normalizes without changing any other catalog entry", () => {
  const local = structuredClone(productionCatalog);
  wrappersEntry(local).sha256 = LOCAL_WRAPPERS_FINGERPRINT_SHA256;
  local.contractSha256 = "a631d4c3f5ca6439a0e5a0b476662cbfc7a7543987140538f7d8ea6ab3b43fb1";
  const before = new Map(local.entries.filter((entry) => entry.identity !== "wrappers" || entry.category !== "extension")
    .map((entry) => [`${entry.category}|${entry.identity}`, entry.sha256]));
  const result = normalizeCatalogForProduction(local, compatibility);
  assert.equal(result.changed, true);
  assert.equal(wrappersEntry(result.catalog).sha256, PRODUCTION_WRAPPERS_FINGERPRINT_SHA256);
  assert.equal(result.contractSha256, productionCatalog.contractSha256);
  for (const entry of result.catalog.entries) {
    const key = `${entry.category}|${entry.identity}`;
    if (key !== "extension|wrappers") assert.equal(entry.sha256, before.get(key), key);
  }
});

test("unexpected wrappers fingerprints and compatibility drift fail closed", () => {
  const unexpected = structuredClone(productionCatalog);
  wrappersEntry(unexpected).sha256 = "f".repeat(64);
  unexpected.contractSha256 = "4".repeat(64);
  assert.throws(() => normalizeCatalogForProduction(unexpected, compatibility), /catalog_contract_sha256_mismatch/);

  const validUnexpected = structuredClone(productionCatalog);
  wrappersEntry(validUnexpected).sha256 = "f".repeat(64);
  validUnexpected.contractSha256 = crypto.createHash("sha256").update(Buffer.from(validUnexpected.entries.map((entry) =>
    `${entry.category}|${entry.identity}|${entry.sha256}`).join("\n"), "utf8")).digest("hex");
  assert.throws(() => normalizeCatalogForProduction(validUnexpected, compatibility), /wrappers_catalog_fingerprint_unapproved/);

  const wrongVersion = structuredClone(compatibility);
  wrongVersion.environments.linked.requiredVersion = "0.5.8";
  assert.throws(() => normalizeCatalogForProduction(productionCatalog, wrongVersion), /wrappers_linked_version_mismatch/);
});
