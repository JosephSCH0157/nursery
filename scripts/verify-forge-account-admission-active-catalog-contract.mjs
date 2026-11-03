import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  compareCatalogToExpected,
  validateActiveCatalogContract,
} from "./lib/forge-account-admission-active-catalog-contract.mjs";

const args = process.argv.slice(2);
const rootIndex = args.indexOf("--repository-root");
const repositoryRoot = path.resolve(rootIndex >= 0 && args[rootIndex + 1]
  ? args[rootIndex + 1]
  : path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const read = (relativePath) => fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");

try {
  const result = validateActiveCatalogContract({
    contractText: read("docs/database/baseline/v1-account-admission-activation-active/active-contract.v1.json"),
    inactiveCatalogText: read("docs/database/baseline/v1-account-admission-activation-preparation/successor-catalog-fingerprint.json"),
    activeCatalogText: read("docs/database/baseline/v1-account-admission-activation-active/active-catalog-fingerprint.json"),
    surfaceText: read("docs/admission/ADMISSION_ACTIVATION_DATABASE_SURFACE.v1.json"),
    activationSql: read("supabase/activation/forge-account-admission-activation-v1.sql"),
  });
  const observedIndex = args.indexOf("--observed-catalog");
  let observedCatalogVerified = false;
  if (observedIndex >= 0) {
    if (!args[observedIndex + 1]) throw new Error("observed_catalog_path_missing");
    const expected = JSON.parse(read("docs/database/baseline/v1-account-admission-activation-active/active-catalog-fingerprint.json"));
    const observed = JSON.parse(fs.readFileSync(path.resolve(args[observedIndex + 1]), "utf8"));
    compareCatalogToExpected(expected, observed);
    observedCatalogVerified = true;
  }
  process.stdout.write(`${JSON.stringify({
    ok: true,
    schema: "forge.account-admission-active-catalog-contract-receipt.v1",
    ...result,
    observedCatalogVerified,
  })}\n`);
} catch (error) {
  process.stderr.write(`Active account-admission catalog contract failed: ${error.message}\n`);
  process.exitCode = 1;
}
