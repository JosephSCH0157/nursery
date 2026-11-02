import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const assembleScript = resolve(root, "scripts/new-forge-database-workdir.ps1");
const databaseScript = resolve(root, "scripts/invoke-forge-database.ps1");
const catalogScript = resolve(root, "scripts/capture-canonical-baseline-v1-catalog.ps1");
const migrations = resolve(root, "supabase/migrations");
const historicalCreditEconomy = resolve(migrations, "20260916110806_tongs_forge_credit_economy.sql");
const alignmentMigration = resolve(migrations, "20261015090533_align_customer_funding_v4_authority.sql");
const fundingRegression = resolve(root, "supabase/tests/customer_funding_flow.sql");
const creditContractFixture = resolve(root, "supabase/tests/fixtures/customer_funding_b1_credit_contract.sql");
const historicalFundingSelector = resolve(migrations, "20261011140000_tongs_unified_financial_environment.sql");
const historicalReconciliation = resolve(migrations, "20261003120000_tongs_openai_cost_reconciliation_connection.sql");
const historicalRunwayQuote = resolve(migrations, "20261011740000_runway_customer_quote_expiry_replay.sql");

const alignmentMigrationSha256 = "4ddb04a9eeba6b203f75f01df40a6d0f8dca9a5f6389b987514063d34a97b057";
const historicalCreditEconomySha256 = "e5dc137d677d935896542d7ba7879355648ef584275a8723cb2aed956350a000";
const fundingRegressionSha256 = "d318b914ba960530e905c502f30ef886a59ea20f5ac913f6445f5aadfd7f4028";
const creditContractFixtureSha256 = "db756d3c1bbc90e530cf41f977c91de784d019d55c04955c16168ae5976b1dba";
const fundingSelectorSha256 = "4334055af650823d1aa2a5df928f4bc80b208f29f77e1dfe0e96e42f8e77b052";
const reconciliationSha256 = "9c07e382772c3e2b9ee63b14a677496b1ee07d08022c02a9672a42cc0c16e0ea";
const runwayQuoteSha256 = "478fc574c90b829ea47bab7da0bd34c5901c8690bfe689d313bca81b688e7354";
const customerFundingV4FunctionSha256 = "3bcab056a448a45bc7b075e31f6af1cc41809e66de2d725f4e5412aadec8f783";
const completionMarker = "FORGE_CUSTOMER_FUNDING_V4_REGRESSION_PASSED";
const pwsh = process.platform === "win32" ? "pwsh.exe" : "pwsh";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function run(command, args, { cwd = root, env = process.env, input } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    input,
    encoding: input == null ? "utf8" : undefined,
    maxBuffer: 100 * 1024 * 1024,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed with exit ${result.status}`);
  return result.stdout;
}

function capture(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    env: options.env ?? process.env,
    encoding: "utf8",
    maxBuffer: 100 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit ${result.status}: ${(result.stderr || result.stdout).trim()}`);
  }
  return result.stdout.trim();
}

export function assertReviewedArtifact(path, expectedSha256, label) {
  if (!existsSync(path)) throw new Error(`${label} is missing: ${path}`);
  const actualSha256 = sha256(readFileSync(path));
  if (actualSha256 !== expectedSha256) {
    throw new Error(`${label} differs from the reviewed artifact; expected sha256=${expectedSha256}, actual sha256=${actualSha256}`);
  }
}

function newlineCounts(bytes) {
  const text = bytes.toString("utf8");
  return {
    crlf: (text.match(/\r\n/g) ?? []).length,
    lf: (text.match(/(?<!\r)\n/g) ?? []).length,
    cr: (text.match(/\r(?!\n)/g) ?? []).length,
  };
}

export function assertHistoricalBytes(path, { label, expectedSha256, expectedLength, expectedLf }) {
  if (!existsSync(path)) throw new Error(`${label} is missing: ${path}`);
  assertHistoricalByteBuffer(readFileSync(path), { label, expectedSha256, expectedLength, expectedLf });
}

function assertHistoricalByteBuffer(bytes, { label, expectedSha256, expectedLength, expectedLf }) {
  const counts = newlineCounts(bytes);
  const actualSha256 = sha256(bytes);
  if (actualSha256 !== expectedSha256 ||
      (expectedLength != null && bytes.length !== expectedLength) ||
      counts.crlf !== 0 || counts.lf !== expectedLf || counts.cr !== 0) {
    throw new Error(`${label} bytes drifted; expected sha256=${expectedSha256}, length=${expectedLength ?? "hash-pinned"}, LF=${expectedLf}, CRLF=0, CR=0; actual sha256=${actualSha256}, length=${bytes.length}, LF=${counts.lf}, CRLF=${counts.crlf}, CR=${counts.cr}`);
  }
}

function assertHistoricalNegativePreflights(path, contract) {
  const bytes = readFileSync(path);
  const text = bytes.toString("utf8");
  const firstLf = text.indexOf("\n");
  if (firstLf < 0) throw new Error(`${contract.label} contains no LF for negative proofs`);
  const mutations = [
    ["CRLF-converted input", Buffer.from(text.replaceAll("\n", "\r\n"), "utf8")],
    ["mixed-newline input", Buffer.from(`${text.slice(0, firstLf)}\r\n${text.slice(firstLf + 1)}`, "utf8")],
    ["one-byte semantic mutation", Buffer.from(bytes)],
  ];
  mutations[2][1][0] = mutations[2][1][0] === 98 ? 99 : 98;
  const cases = [...mutations, ["missing-source input", null]];
  for (const [label, mutation] of cases) {
    let rejected = false;
    try {
      if (mutation == null) assertHistoricalBytes(`${path}.missing`, contract);
      else assertHistoricalByteBuffer(mutation, contract);
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error(`${contract.label} negative preflight accepted ${label}`);
  }
  console.log(`${contract.label} byte preflight rejected CRLF, mixed-newline, one-byte, and missing-source inputs as expected.`);
}

function localChildEnv() {
  const env = { ...process.env };
  for (const name of ["DATABASE_URL", "SUPABASE_ACCESS_TOKEN", "SUPABASE_DB_PASSWORD", "SUPABASE_PROJECT_ID", "SUPABASE_URL"]) delete env[name];
  return env;
}

function dockerContainers(includeStopped = false) {
  const output = capture("docker", ["ps", ...(includeStopped ? ["-a"] : []), "--format", "{{.Names}}"]);
  return new Set(output ? output.split(/\r?\n/).filter(Boolean) : []);
}

async function canListen(port) {
  return await new Promise((resolvePromise) => {
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

export function assertLocalDatabaseTarget(databaseUrl, expectedPort) {
  const parsed = new URL(databaseUrl);
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) throw new Error("Local database target is not PostgreSQL");
  if (!["127.0.0.1", "localhost", "::1"].includes(parsed.hostname)) throw new Error(`Refusing non-local database target: ${parsed.hostname}`);
  if (Number(parsed.port) !== expectedPort) throw new Error(`Local database port mismatch: expected ${expectedPort}, found ${parsed.port}`);
}

function assertTargetGuardNegatives(expectedPort) {
  for (const url of [
    `postgresql://postgres:postgres@db.example.supabase.co:${expectedPort}/postgres`,
    `postgresql://postgres:postgres@127.0.0.1:${expectedPort + 10}/postgres`,
  ]) {
    let rejected = false;
    try { assertLocalDatabaseTarget(url, expectedPort); } catch { rejected = true; }
    if (!rejected) throw new Error(`Database target guard accepted unsafe URL: ${url}`);
  }
}

function psql(container, sql) {
  return capture("docker", ["exec", container, "psql", "--no-psqlrc", "--set", "ON_ERROR_STOP=1", "--username", "postgres", "--dbname", "postgres", "--tuples-only", "--no-align", "--command", sql]);
}

function captureCatalog(workdir, outputPath, env) {
  const result = capture(pwsh, [
    "-NoLogo", "-NoProfile", "-NonInteractive", "-File", catalogScript,
    "-Target", "local", "-OutputPath", outputPath, "-RepositoryRoot", root,
  ], { cwd: workdir, env });
  return JSON.parse(result.split(/\r?\n/).filter(Boolean).at(-1));
}

function assertCanonicalAuthority(container) {
  const authority = JSON.parse(psql(container, `
with claims as (
  select set_config('request.jwt.claim.role','authenticated',false),
         set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false)
)
select json_build_object(
  'lineage',(select lineage from forge_meta.database_lineage where singleton),
  'lineage_count',(select count(*) from forge_meta.database_lineage),
  'migration_count',(select count(*) from supabase_migrations.schema_migrations),
  'latest_migration',(select max(version) from supabase_migrations.schema_migrations),
  'historical_alignment_count',(select count(*) from supabase_migrations.schema_migrations where version='20261015090533'),
  'contract_version',(select tongs.read_my_customer_funding()->>'contract_version' from claims),
  'function_sha256',encode(extensions.digest(pg_get_functiondef('tongs.read_my_customer_funding()'::regprocedure),'sha256'),'hex')
)::text;
`));
  const expected = {
    lineage: "baseline-v1",
    lineage_count: 1,
    migration_count: 18,
    latest_migration: "20261102032722",
    historical_alignment_count: 0,
    contract_version: "forge.customer-funding.v4",
    function_sha256: customerFundingV4FunctionSha256,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (String(authority[key]) !== String(value)) throw new Error(`Canonical customer-funding authority mismatch for ${key}: expected ${value}, found ${authority[key]}`);
  }
  return authority;
}

function assertRollback(container) {
  const rollback = JSON.parse(psql(container, `
select json_build_object(
  'fixture_users',(select count(*) from auth.users where id::text like 'cf400000-%'),
  'fixture_quotes',(select count(*) from tongs.customer_spending_quotes where id::text like 'cf400000-%'),
  'fixture_deposits',(select count(*) from tongs.customer_deposits where id::text like 'cf400000-%'),
  'fixture_reservations',(select count(*) from tongs.funding_reservations where id::text like 'cf400000-%'),
  'fixture_journal_events',(select count(*) from tongs.accounting_journal_events where id::text like 'cf400000-%')
)::text;
`));
  for (const [name, count] of Object.entries(rollback)) {
    if (Number(count) !== 0) throw new Error(`Customer-funding regression did not roll back ${name}: ${count}`);
  }
  return rollback;
}

function assertFixtureOnlyState(container, phase) {
  const state = JSON.parse(psql(container, `
select json_build_object(
  'contract_count',(select count(*) from tongs.forge_credit_contract_revisions),
  'matching_contract_count',(
    select count(*) from tongs.forge_credit_contract_revisions
    where contract_code='forge.credit-economy.v1'
      and revision=1
      and lifecycle_state='active'
      and credit_value_micros=5000
      and currency='USD'
      and markup_basis_points=3300
      and tax_treatment='pre_tax_customer_value'
      and reason='One Forge Credit is exactly $0.005 of pre-tax customer value; supplier cost is private.'
  ),
  'pack_terms',(select count(*) from tongs.forge_credit_pack_terms),
  'allowance_terms',(select count(*) from tongs.customer_subscription_allowance_terms),
  'runtime_revisions',(select count(*) from tongs.financial_runtime_environment_revisions),
  'account_balances',(select count(*) from tongs.account_balances),
  'customer_deposits',(select count(*) from tongs.customer_deposits),
  'paid_allowances',(select count(*) from tongs.paid_allowance_grants),
  'beta_grants',(select count(*) from tongs.beta_credit_grants),
  'legacy_balances',(select count(*) from tongs.legacy_credit_opening_balances),
  'organization_funding',(select count(*) from tongs.organization_funding_account_revisions),
  'funding_reservations',(select count(*) from tongs.funding_reservations),
  'ai_credit_reservations',(select count(*) from tongs.ai_credit_reservations),
  'test_reservations',(select count(*) from tongs.test_funding_reservations),
  'certification_reservations',(select count(*) from tongs.openai_text_test_certification_reservations),
  'execution_controls',(select count(*) from tongs.paid_execution_control_revisions),
  'pricing_policies',(select count(*) from tongs.private_pricing_policies),
  'pricing_revisions',(select count(*) from tongs.private_pricing_revisions),
  'pricing_publications',(select count(*) from tongs.private_pricing_publications),
  'environment_configuration',(select count(*) from tongs.financial_environment_configuration_revisions),
  'activation_records',(
    (select count(*) from tongs.owner_paid_execution_canary_activation_revisions)
    +(select count(*) from tongs.openai_text_activation_decisions)
    +(select count(*) from tongs.openai_text_activation_proposals)
    +(select count(*) from tongs.openai_text_rollout_revisions)
    +(select count(*) from tongs.openai_text_failure_loss_rollout_revisions)
    +(select count(*) from tongs.runway_execution_rollout_revisions)
  ),
  'credential_records',(
    (select count(*) from tongs.credential_lifecycle_records)
    +(select count(*) from tongs.publishing_provider_connections)
    +(select count(*) from tongs.publishing_provider_credential_authorities)
    +(select count(*) from tongs.publishing_provider_credential_generations)
  ),
  'provider_operations',(
    (select count(*) from tongs.owner_cost_provider_attempts)
    +(select count(*) from tongs.paid_media_provider_attempts)
    +(select count(*) from tongs.openai_text_provider_captures)
    +(select count(*) from tongs.hammer_transcription_operations)
    +(select count(*) from tongs.hammer_transcription_provider_attempts)
  )
)::text;
`));
  for (const [name, count] of Object.entries(state)) {
    const expected = name === "contract_count" || name === "matching_contract_count" ? 1 : 0;
    if (Number(count) !== expected) {
      throw new Error(`Customer-funding ${phase} state mismatch for ${name}: expected ${expected}, found ${count}`);
    }
  }
  return state;
}

export async function runCustomerFundingCertification() {
  assertReviewedArtifact(historicalCreditEconomy, historicalCreditEconomySha256, "historical Forge Credit economy migration");
  assertReviewedArtifact(alignmentMigration, alignmentMigrationSha256, "customer-funding v4 alignment migration");
  assertReviewedArtifact(fundingRegression, fundingRegressionSha256, "customer-funding v4 regression");
  assertReviewedArtifact(creditContractFixture, creditContractFixtureSha256, "customer-funding B1 credit-contract fixture");
  const byteContracts = [
    [historicalFundingSelector, { label: "Historical funding-selector source", expectedSha256: fundingSelectorSha256, expectedLength: null, expectedLf: 1595 }],
    [historicalReconciliation, { label: "Historical reconciliation source", expectedSha256: reconciliationSha256, expectedLength: 47053, expectedLf: 549 }],
    [historicalRunwayQuote, { label: "Historical Runway quote source", expectedSha256: runwayQuoteSha256, expectedLength: 16185, expectedLf: 221 }],
  ];
  for (const [path, contract] of byteContracts) assertHistoricalBytes(path, contract);
  for (const [path, contract] of byteContracts.slice(1)) assertHistoricalNegativePreflights(path, contract);

  if (!existsSync(assembleScript) || !existsSync(databaseScript) || !existsSync(catalogScript)) throw new Error("Supported canonical database tooling is missing");
  if (capture("supabase", ["--version"]).split(/\r?\n/, 1)[0] !== "2.84.2") throw new Error("Supabase CLI 2.84.2 is required");

  const env = localChildEnv();
  const before = dockerContainers(true);
  const temporaryRoot = mkdtempSync(join(os.tmpdir(), "forge-customer-funding-"));
  const workdir = join(temporaryRoot, "baseline-v1");
  const projectId = `forge-customer-funding-${randomBytes(6).toString("hex")}`;
  const apiPort = await selectPortBase();
  const databasePort = apiPort + 1;
  const databaseContainer = `supabase_db_${projectId}`;
  let startAttempted = false;
  let cleanupError;
  try {
    assertTargetGuardNegatives(databasePort);
    run(pwsh, ["-NoLogo", "-NoProfile", "-NonInteractive", "-File", assembleScript, "-Lineage", "baseline", "-OutputPath", workdir, "-ProjectId", projectId, "-ApiPort", String(apiPort), "-SiteUrl", `http://127.0.0.1:${apiPort}`], { env });
    startAttempted = true;
    run(pwsh, ["-NoLogo", "-NoProfile", "-NonInteractive", "-File", databaseScript, "-Lineage", "baseline", "-Action", "Start", "-Workdir", workdir], { env });

    const status = JSON.parse(capture("supabase", ["status", "--output", "json", "--workdir", workdir, "--agent=no"], { env }));
    assertLocalDatabaseTarget(status.DB_URL, databasePort);
    if (!dockerContainers().has(databaseContainer)) throw new Error(`Expected owned database container is not running: ${databaseContainer}`);

    const authority = assertCanonicalAuthority(databaseContainer);
    const preCatalog = captureCatalog(workdir, join(temporaryRoot, "catalog-before-fixture.json"), env);
    run("docker", ["exec", "-i", databaseContainer, "psql", "--no-psqlrc", "--set", "ON_ERROR_STOP=1", "--username", "postgres", "--dbname", "postgres"], { input: readFileSync(creditContractFixture) });
    const fixtureState = assertFixtureOnlyState(databaseContainer, "post-fixture");
    run("docker", ["exec", "-i", databaseContainer, "psql", "--no-psqlrc", "--set", "ON_ERROR_STOP=1", "--username", "postgres", "--dbname", "postgres"], { input: readFileSync(fundingRegression) });
    const rollback = assertRollback(databaseContainer);
    const postRegressionState = assertFixtureOnlyState(databaseContainer, "post-regression");
    const postCatalog = captureCatalog(workdir, join(temporaryRoot, "catalog-after-regression.json"), env);
    if (preCatalog.objectCount !== postCatalog.objectCount || preCatalog.contractSha256 !== postCatalog.contractSha256) {
      throw new Error(`Customer-funding fixture changed catalog/ACL/RLS authority: before=${JSON.stringify(preCatalog)}, after=${JSON.stringify(postCatalog)}`);
    }
    console.log(completionMarker);
    console.log(JSON.stringify({
      isolated_database: true,
      lineage: authority.lineage,
      canonical_baseline: "passed",
      customer_funding_contract: authority.contract_version,
      fixture_sha256: creditContractFixtureSha256,
      fixture_state: fixtureState,
      customer_funding_regression: "passed",
      transactional_rollback: rollback,
      post_regression_state: postRegressionState,
      catalog_acl_rls: {
        object_count: preCatalog.objectCount,
        contract_sha256: preCatalog.contractSha256,
        unchanged: true,
      },
      provider_operations: 0,
      external_financial_operations: 0,
      project_id: projectId,
      database_port: databasePort,
      hosted_environment_variables: "removed",
      historical_upgrade_claim: "not_made",
    }));
  } finally {
    if (startAttempted) {
      try {
        run(pwsh, ["-NoLogo", "-NoProfile", "-NonInteractive", "-File", databaseScript, "-Lineage", "baseline", "-Action", "Stop", "-Workdir", workdir], { env });
      } catch (error) {
        cleanupError = error;
      }
    }
    const after = dockerContainers(true);
    const ownedRemaining = [...after].filter((name) => name.endsWith(`_${projectId}`));
    const unrelatedRemoved = [...before].filter((name) => !after.has(name));
    if (ownedRemaining.length) cleanupError ??= new Error(`Owned disposable containers remain: ${ownedRemaining.join(", ")}`);
    if (unrelatedRemoved.length) cleanupError ??= new Error(`Unrelated pre-existing containers disappeared: ${unrelatedRemoved.join(", ")}`);
    if (!cleanupError) rmSync(temporaryRoot, { recursive: true, force: true });
    if (cleanupError) throw cleanupError;
  }
}

if (resolve(process.argv[1] ?? "") === resolve(fileURLToPath(import.meta.url))) {
  runCustomerFundingCertification().catch((error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}
