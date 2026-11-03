import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pwsh = process.platform === "win32" ? "pwsh.exe" : "pwsh";
const assembleScript = resolve(root, "scripts/new-forge-database-workdir.ps1");
const databaseScript = resolve(root, "scripts/invoke-forge-database.ps1");
const testScript = resolve(root, "scripts/test-forge-account-admission-activation.mjs");
const captureCatalogScript = resolve(root, "scripts/capture-canonical-baseline-v1-catalog.ps1");
const normalizeCatalogScript = resolve(root, "scripts/normalize-canonical-catalog-for-production.mjs");
const verifyActiveCatalogScript = resolve(root, "scripts/verify-forge-account-admission-active-catalog-contract.mjs");
const activationSqlPath = resolve(root, "supabase/activation/forge-account-admission-activation-v1.sql");
const deactivationSqlPath = resolve(root, "supabase/activation/forge-account-admission-deactivation-v1.sql");
const activeCatalogSqlPath = resolve(root, "supabase/tests/account_admission_active_catalog_contract.sql");
const expectedActiveCatalogPath = resolve(root, "docs/database/baseline/v1-account-admission-activation-active/active-catalog-fingerprint.json");
const wrappersCompatibilityPath = resolve(root, "docs/database/baseline/v1-gate3/wrappers-extension-compatibility.json");

function run(command, args, { cwd = root, env = process.env, quiet = false, input } = {}) {
  const result = spawnSync(command, args, { cwd, env, input, encoding: "utf8", maxBuffer: 100 * 1024 * 1024 });
  if (!quiet && result.stdout) process.stdout.write(result.stdout);
  if (!quiet && result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed with exit ${result.status}`);
  return result.stdout.trim();
}

function runDatabaseSql(container, sql, pgOptions) {
  return run("docker", [
    "exec", "-i", ...(pgOptions ? ["-e", `PGOPTIONS=${pgOptions}`] : []), container,
    "psql", "-U", "postgres", "-d", "postgres", "-X", "-q", "-v", "ON_ERROR_STOP=1",
  ], { input: sql });
}

function childEnvironment() {
  const env = { ...process.env };
  for (const name of [
    "DATABASE_URL", "DIRECT_URL", "SUPABASE_ACCESS_TOKEN", "SUPABASE_DB_PASSWORD", "SUPABASE_DB_URL",
    "SUPABASE_PROJECT_ID", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "TONGS_SUPABASE_URL",
    "TONGS_SERVICE_ROLE_KEY", "OPENAI_API_KEY", "STRIPE_SECRET_KEY",
  ]) delete env[name];
  return env;
}

function containers(includeStopped = false) {
  const output = run("docker", ["ps", ...(includeStopped ? ["-a"] : []), "--format", "{{.Names}}"], { quiet: true });
  return new Set(output ? output.split(/\r?\n/).filter(Boolean) : []);
}

function canListen(port) {
  return new Promise((resolvePromise) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => resolvePromise(false));
    server.listen({ host: "127.0.0.1", port }, () => server.close(() => resolvePromise(true)));
  });
}

async function selectPortBase() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const base = 20000 + Math.floor(Math.random() * 40000);
    if (await canListen(base - 1) && await canListen(base) && await canListen(base + 1)) return base;
  }
  throw new Error("Unable to allocate an isolated local Supabase port range");
}

function assertLoopback(url, expectedPort, label) {
  const parsed = new URL(url);
  if (!new Set(["127.0.0.1", "localhost", "::1"]).has(parsed.hostname)) throw new Error(`${label} is not loopback`);
  if (Number(parsed.port) !== expectedPort) throw new Error(`${label} port mismatch`);
}

export async function runAccountAdmissionActivationIsolated() {
  if ([assembleScript, databaseScript, testScript, captureCatalogScript, normalizeCatalogScript,
    verifyActiveCatalogScript, activationSqlPath, deactivationSqlPath, activeCatalogSqlPath,
    expectedActiveCatalogPath, wrappersCompatibilityPath].some((file) => !existsSync(file))) {
    throw new Error("Supported account-admission activation certification tooling is missing");
  }
  if (run("supabase", ["--version"], { quiet: true }).split(/\r?\n/, 1)[0] !== "2.84.2") {
    throw new Error("Supabase CLI 2.84.2 is required");
  }
  run("docker", ["info"], { quiet: true });

  const env = childEnvironment();
  const before = containers(true);
  const temporaryRoot = mkdtempSync(join(os.tmpdir(), "forge-s2c-runtime-probes-"));
  const workdir = join(temporaryRoot, "baseline-v1");
  const projectId = `forge-s2c-runtime-${randomBytes(6).toString("hex")}`;
  const apiPort = await selectPortBase();
  const databasePort = apiPort + 1;
  const databaseContainer = `supabase_db_${projectId}`;
  let startAttempted = false;
  let catalogActivationApplied = false;
  let cleanupError;

  try {
    run(pwsh, [
      "-NoLogo", "-NoProfile", "-NonInteractive", "-File", assembleScript,
      "-OutputPath", workdir, "-ProjectId", projectId, "-ApiPort", String(apiPort),
      "-Lineage", "baseline", "-RepositoryRoot", root,
    ], { env });
    startAttempted = true;
    run(pwsh, [
      "-NoLogo", "-NoProfile", "-NonInteractive", "-File", databaseScript,
      "-Lineage", "baseline", "-Action", "Start", "-Workdir", workdir, "-RepositoryRoot", root,
    ], { env });
    const status = JSON.parse(run("supabase", ["status", "--output", "json", "--workdir", workdir, "--agent=no"], { env, quiet: true }));
    assertLoopback(status.API_URL, apiPort, "Supabase API");
    assertLoopback(status.DB_URL, databasePort, "Supabase database");
    const inspected = run("docker", ["inspect", "--format={{.Name}}", databaseContainer], { quiet: true });
    if (inspected !== `/${databaseContainer}`) throw new Error("Owned PostgreSQL container identity mismatch");
    const testEnv = {
      ...env,
      SUPABASE_DB_CONTAINER: databaseContainer,
      FORGE_OWNED_DATABASE_PROJECT_ID: projectId,
      S2C_LOCAL_SUPABASE_URL: status.API_URL,
      S2C_LOCAL_ANON_KEY: status.ANON_KEY,
      S2C_LOCAL_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    };
    run(process.execPath, ["--test", testScript], { env: testEnv });
    const localCatalogPath = join(temporaryRoot, "active-catalog-local.json");
    const normalizedCatalogPath = join(temporaryRoot, "active-catalog-production-normalized.json");
    try {
      runDatabaseSql(databaseContainer, readFileSync(activationSqlPath, "utf8"),
        "-c forge.activation_application_commit=1111111111111111111111111111111111111111 -c forge.activation_operator=local-active-catalog-certification");
      catalogActivationApplied = true;
      run(pwsh, [
        "-NoLogo", "-NoProfile", "-NonInteractive", "-File", captureCatalogScript,
        "-Target", "local", "-OutputPath", localCatalogPath,
        "-ExpectedPath", expectedActiveCatalogPath,
        "-ExtensionCompatibilityPath", wrappersCompatibilityPath,
        "-RepositoryRoot", root,
      ], { cwd: workdir, env });
      run(process.execPath, [
        normalizeCatalogScript,
        "--catalog", localCatalogPath,
        "--compatibility", wrappersCompatibilityPath,
        "--output", normalizedCatalogPath,
      ], { env });
      run(process.execPath, [
        verifyActiveCatalogScript,
        "--repository-root", root,
        "--observed-catalog", normalizedCatalogPath,
      ], { env });
      runDatabaseSql(databaseContainer, readFileSync(activeCatalogSqlPath, "utf8"));
    } finally {
      if (catalogActivationApplied) {
        runDatabaseSql(databaseContainer, readFileSync(deactivationSqlPath, "utf8"),
          "-c forge.deactivation_operator=local-active-catalog-certification");
        catalogActivationApplied = false;
      }
    }
    console.log(JSON.stringify({
      ok: true,
      schema: "forge.account-admission-activation-isolated-certification.v1",
      lineage: "baseline-v1",
      projectId,
      postgresContainer: databaseContainer,
      postgresVersion: 17,
      authIdentitiesDisposable: true,
      actualPostgrestRequestsExecuted: true,
      activeCatalogObjectCount: 16862,
      activeCatalogSha256: "8238bcdadc568f60fdf3f7881d1795463f3b288c4577b2537e60bd0491e7d8e8",
      activeCatalogReproduced: true,
      hostedRequests: 0,
      credentialsReturned: false,
    }));
  } finally {
    if (startAttempted) {
      try {
        run(pwsh, [
          "-NoLogo", "-NoProfile", "-NonInteractive", "-File", databaseScript,
          "-Lineage", "baseline", "-Action", "Stop", "-Workdir", workdir, "-RepositoryRoot", root,
        ], { env });
      } catch (error) {
        cleanupError = error;
      }
    }
    const after = containers(true);
    const ownedRemaining = [...after].filter((name) => name.endsWith(`_${projectId}`));
    const unrelatedRemoved = [...before].filter((name) => !after.has(name));
    if (ownedRemaining.length) cleanupError ??= new Error(`Owned disposable containers remain: ${ownedRemaining.join(", ")}`);
    if (unrelatedRemoved.length) cleanupError ??= new Error(`Unrelated containers disappeared: ${unrelatedRemoved.join(", ")}`);
    if (!cleanupError) rmSync(temporaryRoot, { recursive: true, force: true });
    if (cleanupError) throw cleanupError;
  }
}

if (resolve(process.argv[1] ?? "") === resolve(fileURLToPath(import.meta.url))) {
  runAccountAdmissionActivationIsolated().catch((error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}
