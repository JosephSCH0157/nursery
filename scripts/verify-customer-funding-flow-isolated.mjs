import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const replayScript = resolve(root, "scripts/certify-mid-september-migration-replay.ps1");
const alignmentMigration = resolve(root, "supabase/migrations/20261015090533_align_customer_funding_v4_authority.sql");
const fundingRegression = resolve(root, "supabase/tests/customer_funding_flow.sql");
const alignmentMigrationSha256 = "4ddb04a9eeba6b203f75f01df40a6d0f8dca9a5f6389b987514063d34a97b057";
const fundingRegressionSha256 = "d318b914ba960530e905c502f30ef886a59ea20f5ac913f6445f5aadfd7f4028";
const completionMarker = "FORGE_CUSTOMER_FUNDING_V4_REGRESSION_PASSED";

export function assertReviewedArtifact(path, expectedSha256, label) {
  if (!existsSync(path)) throw new Error(`${label} is missing: ${path}`);
  const actualSha256 = createHash("sha256").update(readFileSync(path)).digest("hex");
  if (actualSha256 !== expectedSha256) {
    throw new Error(`${label} differs from the reviewed artifact; expected sha256=${expectedSha256}, actual sha256=${actualSha256}`);
  }
}

export function assertCanonicalReplayResult(result) {
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`canonical customer-funding replay failed with exit ${result.status}`);
  }
  if (typeof result.stdout !== "string" || !result.stdout.includes(completionMarker)) {
    throw new Error("canonical replay returned success without executing the customer-funding v4 regression");
  }
}

export function runCustomerFundingCertification() {
  assertReviewedArtifact(alignmentMigration, alignmentMigrationSha256, "customer-funding v4 alignment migration");
  assertReviewedArtifact(fundingRegression, fundingRegressionSha256, "customer-funding v4 regression");
  if (!existsSync(replayScript)) throw new Error(`canonical replay script is missing: ${replayScript}`);

  const result = spawnSync(
    process.platform === "win32" ? "pwsh.exe" : "pwsh",
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-File", replayScript, "-SkipLinkedFingerprint"],
    { cwd: root, encoding: "utf8", maxBuffer: 100 * 1024 * 1024 },
  );
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  assertCanonicalReplayResult(result);

  console.log(JSON.stringify({
    isolated_database: true,
    canonical_phased_replay: "passed",
    customer_funding_contract: "forge.customer-funding.v4",
    customer_funding_regression: "passed",
    transactional_rollback: "passed",
    linked_comparison: "skipped",
  }));
}

if (resolve(process.argv[1] ?? "") === resolve(fileURLToPath(import.meta.url))) {
  runCustomerFundingCertification();
}
