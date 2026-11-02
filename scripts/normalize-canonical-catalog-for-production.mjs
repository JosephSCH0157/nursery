#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { normalizeCatalogForProduction } from "./lib/forge-catalog-production-normalization.mjs";

const args = process.argv.slice(2);
const value = (name) => {
  const index = args.indexOf(name);
  if (index < 0 || !args[index + 1]) throw new Error(`${name.slice(2)}_missing`);
  return args[index + 1];
};

try {
  const catalogPath = path.resolve(value("--catalog"));
  const compatibilityPath = path.resolve(value("--compatibility"));
  const outputPath = path.resolve(value("--output"));
  const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
  const compatibility = JSON.parse(fs.readFileSync(compatibilityPath, "utf8"));
  const result = normalizeCatalogForProduction(catalog, compatibility);
  fs.writeFileSync(outputPath, `${JSON.stringify(result.catalog, null, 2)}\n`, { encoding: "utf8", flag: "w" });
  process.stdout.write(`${JSON.stringify({
    ok: true,
    schema: "forge.production-normalized-catalog-result.v1",
    changed: result.changed,
    objectCount: result.objectCount,
    contractSha256: result.contractSha256,
    sourceFingerprint: result.sourceFingerprint,
    productionFingerprint: result.productionFingerprint,
  })}\n`);
} catch (error) {
  process.stderr.write(`Catalog production normalization failed: ${error.message}\n`);
  process.exitCode = 1;
}
