import crypto from "node:crypto";

export const LOCAL_WRAPPERS_FINGERPRINT_SHA256 = "8b9d29b339edc0523f2270cfe7ca48b8cc3c59818221248fda13059927989d99";
export const PRODUCTION_WRAPPERS_FINGERPRINT_SHA256 = "7a718c878e7eb4ce66548b9bf056bf3e63ab447ba0a77c7b82f1f13427c04dce";

const CATALOG_SCHEMA = "forge.canonical-baseline-application-catalog-fingerprint.v1";
const COMPATIBILITY_SCHEMA = "forge.wrappers-extension-compatibility.v1";
const WRAPPERS_KEY = "extension|wrappers";

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fingerprint = (entries) => sha256(Buffer.from(entries.map((entry) =>
  `${entry.category}|${entry.identity}|${entry.sha256}`).join("\n"), "utf8"));

function exact(actual, expected, name) {
  if (actual !== expected) throw new Error(`${name}_mismatch`);
}

function validateSha256(value, name) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) throw new Error(`${name}_invalid`);
  return value;
}

function validateCompatibility(compatibility) {
  if (!compatibility || typeof compatibility !== "object" || Array.isArray(compatibility)) {
    throw new Error("wrappers_compatibility_missing");
  }
  exact(compatibility.schema, COMPATIBILITY_SCHEMA, "wrappers_compatibility_schema");
  exact(compatibility.extension, "wrappers", "wrappers_compatibility_extension");
  exact(compatibility.schemaName, "extensions", "wrappers_compatibility_schema_name");
  exact(compatibility.relocatable, true, "wrappers_compatibility_relocatable");
  exact(compatibility.rejectAllOtherVersions, true, "wrappers_compatibility_reject_other_versions");
  exact(compatibility.environments?.linked?.requiredVersion, "0.5.6", "wrappers_linked_version");
  exact(compatibility.environments?.local?.requiredVersion, "0.5.7", "wrappers_local_version");
  exact(
    validateSha256(compatibility.productionFingerprintSha256, "wrappers_production_fingerprint"),
    PRODUCTION_WRAPPERS_FINGERPRINT_SHA256,
    "wrappers_production_fingerprint",
  );
}

function validateCatalog(catalog) {
  if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) throw new Error("catalog_missing");
  exact(catalog.schema, CATALOG_SCHEMA, "catalog_schema");
  if (!Array.isArray(catalog.entries) || catalog.entries.length === 0) throw new Error("catalog_entries_missing");
  exact(catalog.objectCount, catalog.entries.length, "catalog_object_count");
  const seen = new Set();
  for (const entry of catalog.entries) {
    if (typeof entry?.category !== "string" || !entry.category || typeof entry?.identity !== "string" || !entry.identity) {
      throw new Error("catalog_entry_identity_invalid");
    }
    validateSha256(entry.sha256, "catalog_entry_sha256");
    const key = `${entry.category}|${entry.identity}`;
    if (seen.has(key)) throw new Error("catalog_entry_duplicate");
    seen.add(key);
  }
  exact(validateSha256(catalog.contractSha256, "catalog_contract_sha256"), fingerprint(catalog.entries), "catalog_contract_sha256");
}

export function normalizeCatalogForProduction(catalog, compatibility) {
  validateCatalog(catalog);
  validateCompatibility(compatibility);
  const normalized = structuredClone(catalog);
  const wrappers = normalized.entries.filter((entry) => `${entry.category}|${entry.identity}` === WRAPPERS_KEY);
  if (wrappers.length !== 1) throw new Error("wrappers_catalog_entry_count_mismatch");
  const sourceFingerprint = wrappers[0].sha256;
  if (sourceFingerprint !== LOCAL_WRAPPERS_FINGERPRINT_SHA256 &&
      sourceFingerprint !== PRODUCTION_WRAPPERS_FINGERPRINT_SHA256) {
    throw new Error("wrappers_catalog_fingerprint_unapproved");
  }
  wrappers[0].sha256 = PRODUCTION_WRAPPERS_FINGERPRINT_SHA256;
  normalized.contractSha256 = fingerprint(normalized.entries);
  validateCatalog(normalized);
  return {
    catalog: normalized,
    changed: sourceFingerprint !== PRODUCTION_WRAPPERS_FINGERPRINT_SHA256,
    sourceFingerprint,
    productionFingerprint: PRODUCTION_WRAPPERS_FINGERPRINT_SHA256,
    contractSha256: normalized.contractSha256,
    objectCount: normalized.objectCount,
  };
}
