import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pwsh = process.platform === "win32" ? "pwsh.exe" : "pwsh";
const assembleScript = resolve(root, "scripts/new-forge-database-workdir.ps1");
const databaseScript = resolve(root, "scripts/invoke-forge-database.ps1");
const catalogScript = resolve(root, "scripts/capture-canonical-baseline-v1-catalog.ps1");
const fixture = resolve(root, "supabase/tests/fixtures/current_authority_reservation_concurrency_b1.sql");

const reviewedArtifacts = new Map([
  ["supabase/migrations/20261011530000_visual_unified_plan_test_product.sql", "211f35d98f749c757060fb7380249651f0bfb4d0539848d6656d91141754cf8c"],
  ["supabase/migrations/20261011550000_visual_unified_plan_v5_compatibility_authority.sql", "ccd666253f2ed81510c608269e04524728ef85762fdb2c765725286baabc7d59"],
  ["supabase/migrations/20261012020000_forge_ai_global_model_preference_and_hammer_authority.sql", "8173122d7902f27fd4cc818a9c90e90884d4df5d35bca759bc57967180b0673c"],
  ["supabase/migrations/20261012080000_hearth_luna_operation_only_model_authority.sql", "df90b9df70841f6961507b8afad5c285336846e6c18236bf5f5cc64ee040b016"],
  ["supabase/migrations/20260911120000_tongs_private_pricing_reservations_shadow.sql", "3bfd6413764aaa0e8a888a5b22692bc43d6102e70b1fb59e394d1b671a3777a0"],
  ["supabase/migrations/20260916110806_tongs_forge_credit_economy.sql", "e5dc137d677d935896542d7ba7879355648ef584275a8723cb2aed956350a000"],
  ["supabase/migrations/20260918120000_tongs_failure_relief_openai_text_shadow.sql", "2cd19aae5cb6334eefd25d94f4a502c0966b7cc0e6f58ed6322bcb20d673cf2f"],
  ["supabase/migrations/20260922120000_tongs_openai_hearth_luna_pilot_proposal.sql", "15843d61d08d58a6d92c97ac00e00ea2d6c9437dd15156406259f6fd6e7a1f9a"],
  ["supabase/migrations/20261006130000_tongs_openai_model_catalog_revision_2.sql", "7558b47e5976e3cda7a01626b42e54b24ba9db5c5d9b30510ec44ee7b03abfee"],
  ["scripts/verify-private-pricing-reservation-concurrency.mjs", "efbe89315a42b2eed285c9c411e1f148f6d950ed608ee74416a23caab61c0dfd"],
]);

// Updated only after review of the fixture itself. A mismatch stops before Docker.
const fixtureSha256 = "262f40ac432757877941aba90467829e86e5f1f1fb0c2d6db313130252ae61c6";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertHash(path, expected, label = path) {
  const absolute = resolve(root, path);
  if (!existsSync(absolute)) throw new Error(`${label} is missing: ${absolute}`);
  const actual = sha256(readFileSync(absolute));
  if (actual !== expected) throw new Error(`${label} hash mismatch: expected ${expected}, found ${actual}`);
}

function run(command, args, { cwd = root, env = process.env, input, allowFailure = false } = {}) {
  const result = spawnSync(command, args, {
    cwd, env, input, encoding: "utf8", maxBuffer: 100 * 1024 * 1024,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit ${result.status}`);
  }
  return result;
}

function capture(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    env: options.env ?? process.env,
    input: options.input,
    encoding: "utf8",
    maxBuffer: 100 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit ${result.status}: ${(result.stderr || result.stdout).trim()}`);
  }
  return result.stdout.trim();
}

function localChildEnv() {
  const env = { ...process.env };
  for (const name of [
    "DATABASE_URL", "DIRECT_URL", "SUPABASE_ACCESS_TOKEN", "SUPABASE_DB_PASSWORD",
    "SUPABASE_PROJECT_ID", "SUPABASE_URL", "OPENAI_API_KEY", "STRIPE_SECRET_KEY",
  ]) delete env[name];
  return env;
}

function dockerContainers(includeStopped = false) {
  const output = capture("docker", ["ps", ...(includeStopped ? ["-a"] : []), "--format", "{{.Names}}"]).trim();
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

function assertLocalDatabaseTarget(databaseUrl, expectedPort) {
  const parsed = new URL(databaseUrl);
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) throw new Error("Database target is not PostgreSQL");
  if (!["127.0.0.1", "localhost", "::1"].includes(parsed.hostname)) {
    throw new Error(`Refusing non-local database target: ${parsed.hostname}`);
  }
  if (Number(parsed.port) !== expectedPort) {
    throw new Error(`Local database port mismatch: expected ${expectedPort}, found ${parsed.port}`);
  }
}

function psqlArgs(container) {
  return ["exec", "-i", container, "psql", "--no-psqlrc", "--set", "ON_ERROR_STOP=1", "--username", "postgres", "--dbname", "postgres", "--tuples-only", "--no-align"];
}

function psql(container, sql, allowFailure = false) {
  return run("docker", [...psqlArgs(container), "--command", sql], { allowFailure });
}

function psqlCapture(container, sql) {
  return capture("docker", [...psqlArgs(container), "--command", sql]);
}

function psqlAsync(container, sql) {
  return new Promise((resolvePromise) => {
    const child = spawn("docker", psqlArgs(container));
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolvePromise({ code, stdout, stderr }));
    child.stdin.end(sql);
  });
}

function captureCatalog(workdir, outputPath, env) {
  const output = capture(pwsh, [
    "-NoLogo", "-NoProfile", "-NonInteractive", "-File", catalogScript,
    "-Target", "local", "-OutputPath", outputPath, "-RepositoryRoot", root,
  ], { cwd: workdir, env });
  return JSON.parse(output.split(/\r?\n/).filter(Boolean).at(-1));
}

function sleep(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

async function observeConcurrentSessions(container) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const count = Number(psqlCapture(container, `
      select count(*) from pg_stat_activity
      where application_name in('forge-current-authority-race-a','forge-current-authority-race-b')
        and state='active';
    `));
    if (count === 2) return true;
    await sleep(100);
  }
  return false;
}

function raceSql(label, quoteId, reservationId, operationId, workpieceId, fingerprint, idempotencyKey) {
  return `
    set application_name='forge-current-authority-race-${label}';
    select set_config('request.jwt.claim.role','service_role',false);
    select set_config('request.jwt.claim.sub','',false);
    set role service_role;
    select pg_sleep(2);
    select tongs.reserve_customer_openai_text_quote(
      '${quoteId}','${reservationId}',
      'ca100000-0000-4000-8000-000000000001','${operationId}',
      'visual.unified_plan','ca100000-0000-4000-8000-000000000003',
      '${workpieceId}','${fingerprint}','gpt-5.6-luna','forge','${idempotencyKey}'
    );
  `;
}

export async function runCurrentAuthorityReservationConcurrency() {
  for (const [path, expected] of reviewedArtifacts) assertHash(path, expected);
  assertHash(fixture, fixtureSha256, "current-authority B1 fixture");
  if (!existsSync(assembleScript) || !existsSync(databaseScript) || !existsSync(catalogScript)) {
    throw new Error("Supported canonical database tooling is missing");
  }
  if (capture("supabase", ["--version"]).split(/\r?\n/, 1)[0] !== "2.84.2") {
    throw new Error("Supabase CLI 2.84.2 is required");
  }
  capture("docker", ["info"]);

  const env = localChildEnv();
  const before = dockerContainers(true);
  const temporaryRoot = mkdtempSync(join(os.tmpdir(), "forge-current-authority-race-"));
  const workdir = join(temporaryRoot, "baseline-v1");
  const projectId = `forge-current-auth-race-${randomBytes(6).toString("hex")}`;
  const apiPort = await selectPortBase();
  const databasePort = apiPort + 1;
  const databaseContainer = `supabase_db_${projectId}`;
  let startAttempted = false;
  let cleanupError;

  try {
    for (const unsafeUrl of [
      `postgresql://postgres:postgres@db.example.supabase.co:${databasePort}/postgres`,
      `postgresql://postgres:postgres@127.0.0.1:${databasePort + 10}/postgres`,
    ]) {
      let rejected = false;
      try { assertLocalDatabaseTarget(unsafeUrl, databasePort); } catch { rejected = true; }
      if (!rejected) throw new Error(`Database target guard accepted unsafe URL: ${unsafeUrl}`);
    }

    run(pwsh, [
      "-NoLogo", "-NoProfile", "-NonInteractive", "-File", assembleScript,
      "-Lineage", "baseline", "-OutputPath", workdir, "-ProjectId", projectId,
      "-ApiPort", String(apiPort), "-SiteUrl", `http://127.0.0.1:${apiPort}`,
    ], { env });
    startAttempted = true;
    run(pwsh, [
      "-NoLogo", "-NoProfile", "-NonInteractive", "-File", databaseScript,
      "-Lineage", "baseline", "-Action", "Start", "-Workdir", workdir,
    ], { env });

    const status = JSON.parse(capture("supabase", ["status", "--output", "json", "--workdir", workdir, "--agent=no"], { env }));
    assertLocalDatabaseTarget(status.DB_URL, databasePort);
    if (!dockerContainers().has(databaseContainer)) throw new Error(`Owned database container is not running: ${databaseContainer}`);

    const lineage = JSON.parse(psqlCapture(databaseContainer, `
      select json_build_object(
        'lineage',(select lineage from forge_meta.database_lineage where singleton),
        'lineage_count',(select count(*) from forge_meta.database_lineage),
        'migration_count',(select count(*) from supabase_migrations.schema_migrations),
        'migration_head',(select max(version) from supabase_migrations.schema_migrations)
      )::text;
    `));
    if (lineage.lineage !== "baseline-v1" || lineage.lineage_count !== 1 || lineage.migration_count !== 18 || lineage.migration_head !== "20261102032722") {
      throw new Error(`Canonical B1 lineage mismatch: ${JSON.stringify(lineage)}`);
    }

    const preCatalog = captureCatalog(workdir, join(temporaryRoot, "catalog-before-fixture.json"), env);
    const fixtureResult = run("docker", psqlArgs(databaseContainer), { input: readFileSync(fixture, "utf8") });
    if (!fixtureResult.stdout.includes("FORGE_CURRENT_AUTHORITY_RESERVATION_FIXTURE_READY")) {
      throw new Error("Current-authority fixture completion marker was not emitted");
    }

    const accountingEventsBefore = Number(psqlCapture(databaseContainer, "select count(*) from tongs.accounting_journal_events;"));
    const providerOperationsBefore = Number(psqlCapture(databaseContainer, `
      select
        (select count(*) from tongs.openai_text_provider_captures)
        +(select count(*) from tongs.hammer_transcription_provider_attempts)
        +(select count(*) from tongs.paid_media_provider_attempts)
        +(select count(*) from tongs.owner_cost_provider_attempts);
    `));
    if (providerOperationsBefore !== 0) throw new Error(`Provider-operation state is not empty before race: ${providerOperationsBefore}`);

    const raceInputs = [
      {
        label: "a", quoteId: "ca100000-0000-4000-8000-000000000030",
        reservationId: "ca100000-0000-4000-8000-000000000040",
        operationId: "current-authority-race-operation-a", workpieceId: "visual-plan-a",
        fingerprint: "a".repeat(64), idempotencyKey: "current-authority-reserve-a",
      },
      {
        label: "b", quoteId: "ca100000-0000-4000-8000-000000000031",
        reservationId: "ca100000-0000-4000-8000-000000000041",
        operationId: "current-authority-race-operation-b", workpieceId: "visual-plan-b",
        fingerprint: "b".repeat(64), idempotencyKey: "current-authority-reserve-b",
      },
    ];
    const pending = raceInputs.map((input) => psqlAsync(databaseContainer, raceSql(
      input.label, input.quoteId, input.reservationId, input.operationId,
      input.workpieceId, input.fingerprint, input.idempotencyKey,
    )));
    const concurrentSessionsObserved = await observeConcurrentSessions(databaseContainer);
    const results = await Promise.all(pending);
    if (!concurrentSessionsObserved) throw new Error("Did not observe both reservation sessions active concurrently");

    const succeeded = results.map((result, index) => ({ ...result, index })).filter((result) => result.code === 0);
    const rejected = results.map((result, index) => ({ ...result, index })).filter((result) =>
      result.code !== 0 && /insufficient verified funding|insufficient verified deposit balance/.test(result.stderr));
    if (succeeded.length !== 1 || rejected.length !== 1) {
      throw new Error(`Expected one reservation and one funding rejection: ${JSON.stringify(results)}`);
    }

    const rejectedInput = raceInputs[rejected[0].index];
    const unauthorizedAttempt = psql(databaseContainer, `
      select set_config('request.jwt.claim.role','service_role',false);
      set role service_role;
      select tongs.begin_provider_attempt(
        '${rejectedInput.reservationId}','rejected-reservation-attempt',30,
        '{"fixture":"must-not-authorize"}'::jsonb
      );
    `, true);
    if (unauthorizedAttempt.status === 0 || !/funding reservation not found/.test(unauthorizedAttempt.stderr)) {
      throw new Error("A rejected reservation unexpectedly admitted a provider attempt");
    }

    const immutableBinding = psql(databaseContainer, `
      update tongs.openai_text_customer_quote_bindings
      set runtime_model='tampered-model'
      where quote_id='ca100000-0000-4000-8000-000000000030';
    `, true);
    if (immutableBinding.status === 0 || !/immutable|cannot be updated|mutation/i.test(immutableBinding.stderr)) {
      throw new Error("Immutable provider quote binding accepted mutation");
    }

    const proof = JSON.parse(psqlCapture(databaseContainer, `
      with held as (
        select * from tongs._active_funding_hold(
          'customer_deposit','ca100000-0000-4000-8000-000000000020'
        )
      )
      select json_build_object(
        'quotes',(select count(*) from tongs.customer_spending_quotes where id::text like 'ca100000-%'),
        'acceptances',(select count(*) from tongs.customer_spending_quote_acceptances where quote_id::text like 'ca100000-%'),
        'quote_bindings',(select count(*) from tongs.openai_text_customer_quote_bindings where quote_id::text like 'ca100000-%'),
        'reservations',(select count(*) from tongs.funding_reservations where funding_source_id='ca100000-0000-4000-8000-000000000020'),
        'held_customer_charge_micros',(select customer_charge_micros from held),
        'held_credit_units',(select credit_units from held),
        'held_wholesale_micros',(select wholesale_spend_micros from held),
        'available_customer_charge_micros',20000-(select customer_charge_micros from held),
        'available_credit_units',4-(select credit_units from held),
        'reservation_events',(select count(*) from tongs.funding_reservation_events where reservation_id::text like 'ca100000-%'),
        'distinct_event_keys',(select count(distinct event_key) from tongs.funding_reservation_events where reservation_id::text like 'ca100000-%'),
        'distinct_reservation_sequences',(select count(*) from(
          select reservation_id,sequence from tongs.funding_reservation_events
          where reservation_id::text like 'ca100000-%' group by reservation_id,sequence
        ) unique_sequences),
        'funding_bindings',(select count(*) from tongs.openai_text_funding_bindings where reservation_id::text like 'ca100000-%'),
        'scope_stamps',(select count(*) from tongs.funding_reservations where rollout_authorization_id='ca100000-0000-4000-8000-000000000010'),
        'provider_execution_enabled',(select provider_execution_enabled from tongs._current_paid_execution_control()),
        'provider_operations',(
          (select count(*) from tongs.openai_text_provider_captures)
          +(select count(*) from tongs.hammer_transcription_provider_attempts)
          +(select count(*) from tongs.paid_media_provider_attempts)
          +(select count(*) from tongs.owner_cost_provider_attempts)
        )
      )::text;
    `));
    const expected = {
      quotes: 2, acceptances: 2, quote_bindings: 2, reservations: 1,
      held_customer_charge_micros: 20000, held_credit_units: 4,
      held_wholesale_micros: 13773, available_customer_charge_micros: 0,
      available_credit_units: 0, reservation_events: 1, distinct_event_keys: 1,
      distinct_reservation_sequences: 1, funding_bindings: 1, scope_stamps: 1,
      provider_execution_enabled: false, provider_operations: 0,
    };
    for (const [key, value] of Object.entries(expected)) {
      if (proof[key] !== value) throw new Error(`Concurrency proof mismatch for ${key}: expected ${value}, found ${proof[key]}`);
    }

    const accountingEventsAfter = Number(psqlCapture(databaseContainer, "select count(*) from tongs.accounting_journal_events;"));
    if (accountingEventsAfter !== accountingEventsBefore) {
      throw new Error(`Reservation race unexpectedly wrote accounting events: before=${accountingEventsBefore}, after=${accountingEventsAfter}`);
    }

    const postCatalog = captureCatalog(workdir, join(temporaryRoot, "catalog-after-race.json"), env);
    if (preCatalog.objectCount !== postCatalog.objectCount || preCatalog.contractSha256 !== postCatalog.contractSha256) {
      throw new Error(`Test fixture changed catalog/ACL/RLS: before=${JSON.stringify(preCatalog)}, after=${JSON.stringify(postCatalog)}`);
    }

    console.log("FORGE_CURRENT_AUTHORITY_RESERVATION_CONCURRENCY_PASSED");
    console.log(JSON.stringify({
      isolated_database: true,
      lineage,
      reviewed_contract: {
        route_code: "visual.unified_plan", model: "gpt-5.6-luna",
        catalog_revision: 17, provider_contract: "forge.unified-visual-plan-provider.v5",
        customer_charge_micros: 20000, customer_credit_units: 4,
        wholesale_ceiling_micros: 13773, maximum_concurrency: 1,
      },
      race: {
        requested_customer_charge_micros: 40000,
        available_customer_charge_micros: 20000,
        requested_credit_units: 8, available_credit_units: 4,
        concurrent_sessions_observed: true, succeeded: 1, rejected: 1,
      },
      proof,
      original_historical_regression_sha256: reviewedArtifacts.get("scripts/verify-private-pricing-reservation-concurrency.mjs"),
      fixture_sha256: fixtureSha256,
      catalog_acl_rls: {
        object_count: preCatalog.objectCount,
        contract_sha256: preCatalog.contractSha256,
        unchanged: true,
      },
      accounting_events_unchanged_by_race: true,
      provider_operations: 0,
      external_financial_operations: 0,
      hosted_environment_variables: "removed",
      project_id: projectId,
      database_port: databasePort,
    }));
  } finally {
    if (startAttempted) {
      try {
        run(pwsh, [
          "-NoLogo", "-NoProfile", "-NonInteractive", "-File", databaseScript,
          "-Lineage", "baseline", "-Action", "Stop", "-Workdir", workdir,
        ], { env });
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
  runCurrentAuthorityReservationConcurrency().catch((error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}
