import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  RECORDING_AUTHORITY_SUCCESSOR_CONTRACT_PATH,
  RECORDING_AUTHORITY_SUCCESSOR_CONTRACT_SHA256,
  verifyFrozenEvidence,
} from "./lib/forge-frozen-evidence.mjs";

const root = path.resolve(import.meta.dirname, "..");
const suffix = `${process.pid.toString(36)}${(Date.now() % 46656).toString(36)}`.toLowerCase();
const upgradeId = `forge-he3-recording-authority-${suffix}`;
const rollbackId = `forge-he3-recording-rollback-${suffix}`;
const upgradePort = Number(process.env.RECORDING_AUTHORITY_UPGRADE_PORT ?? 61320);
const rollbackPort = Number(process.env.RECORDING_AUTHORITY_ROLLBACK_PORT ?? 62320);
const migration = "20261027030139_anvil_recording_authority_repair.sql";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function recordingAuthorityPredecessorNames(names, successorVersions) {
  const target = migration.slice(0, 14);
  if (successorVersions.at(-1) !== target || new Set(successorVersions).size !== successorVersions.length) {
    throw new Error("Invalid recording-authority successor chronology");
  }
  const prefix = names.filter((name) => name.slice(0, 14) <= target).sort();
  if (prefix.map((name) => name.slice(0, 14)).join(",") !== successorVersions.join(",")) {
    throw new Error("Recording-authority predecessor versions differ from the frozen contract");
  }
  if (prefix.at(-1) !== migration) throw new Error("Recording-authority target filename differs");
  return prefix.slice(0, -1);
}

export function assertRecordingAuthorityStage(directory, files) {
  const actual = readdirSync(directory).filter((name) => name.endsWith(".sql")).sort();
  const expected = files.map((file) => file.name).sort();
  if (actual.join("\n") !== expected.join("\n")) throw new Error("Recording-authority staged migration names differ");
  for (const file of files) {
    if (sha256(readFileSync(path.join(directory, file.name))) !== file.sha256) {
      throw new Error(`Recording-authority staged migration bytes differ: ${file.name}`);
    }
  }
}

function certificationPlan() {
  verifyFrozenEvidence({ repositoryRoot: root, scope: "all", requireExactWorktreeBytes: true });
  const bytes = readFileSync(path.join(root, RECORDING_AUTHORITY_SUCCESSOR_CONTRACT_PATH));
  if (sha256(bytes) !== RECORDING_AUTHORITY_SUCCESSOR_CONTRACT_SHA256) throw new Error("Recording-authority contract bytes differ");
  const contract = JSON.parse(bytes);
  const sources = [
    ...readdirSync(path.join(root, "database/canonical-baseline-v1/supabase/migrations"))
      .filter((name) => name.endsWith(".sql"))
      .map((name) => ({ name, source: path.join(root, "database/canonical-baseline-v1/supabase/migrations", name) })),
    ...readdirSync(path.join(root, "supabase/migrations"))
      .filter((name) => name.endsWith(".sql") && name.slice(0, 14) >= "20261022000000")
      .map((name) => ({ name, source: path.join(root, "supabase/migrations", name) })),
  ];
  const names = recordingAuthorityPredecessorNames(sources.map((file) => file.name), contract.baselineSuccessor.versions);
  const predecessor = sources.filter((file) => names.includes(file.name))
    .map((file) => ({ ...file, sha256: sha256(readFileSync(file.source)) }));
  const target = sources.find((file) => file.name === migration);
  if (!target || sha256(readFileSync(target.source)) !== contract.sharedTailAddition.sha256) throw new Error("Recording-authority target bytes differ");
  return { predecessor, target: { ...target, sha256: contract.sharedTailAddition.sha256 } };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    encoding: "utf8",
    maxBuffer: 30 * 1024 * 1024,
    stdio: options.capture ? ["pipe", "pipe", "pipe"] : options.input ? ["pipe", "inherit", "inherit"] : "inherit",
    input: options.input,
    env: { ...process.env, ...options.env },
  });
  if (options.allowFailure) return result;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed with ${result.status}`);
  return result;
}
function workdir(id) {
  return path.join(root, ".he3a", id);
}
function disposableStart(id, port, plan) {
  const target = workdir(id);
  const source = path.join(root, "database", "canonical-baseline-v1");
  const migrations = path.join(target, "supabase", "migrations");
  mkdirSync(migrations, { recursive: true });
  copyFileSync(path.join(source, ".forge-database-lineage.json"), path.join(target, ".forge-database-lineage.json"));
  let config = readFileSync(path.join(source, "supabase", "config.toml"), "utf8");
  config = config.replace(/^project_id\s*=\s*"[^"]+"/m, `project_id = "${id}"`)
    .replace(/^port\s*=\s*55321$/m, `port = ${port}`)
    .replace(/^port\s*=\s*55322$/m, `port = ${port + 1}`)
    .replace(/^shadow_port\s*=\s*55320$/m, `shadow_port = ${port - 1}`);
  writeFileSync(path.join(target, "supabase", "config.toml"), config);
  for (const name of readdirSync(path.join(source, "supabase", "migrations"))) {
    if (name.endsWith(".sql")) copyFileSync(path.join(source, "supabase", "migrations", name), path.join(migrations, name));
  }
  for (const name of readdirSync(path.join(root, "supabase", "migrations")).sort()) {
    const version = /^(\d{8,14})_/.exec(name)?.[1];
    if (version && version >= "20261022000000") {
      copyFileSync(path.join(root, "supabase", "migrations", name), path.join(migrations, name));
    }
  }
  cpSync(path.join(root, "supabase", "templates"), path.join(target, "supabase", "templates"), { recursive: true });
  // Validate the complete canonical B1 + T assembly before selecting the frozen
  // 418-equivalent predecessor. Later tail migrations require their own fixtures;
  // installing them while omitting 419 is neither a predecessor nor a valid tail.
  run("pwsh", ["-NoProfile", "-File", path.join(root, "scripts/verify-supabase-lineage.ps1"), "-Lineage", "baseline",
    "-Workdir", target, "-DatabaseTarget", "none", "-Mode", "bootstrap", "-RepositoryRoot", root], { cwd: tmpdir() });
  const retained = new Set(plan.predecessor.map((file) => file.name));
  for (const name of readdirSync(migrations)) {
    if (name.endsWith(".sql") && !retained.has(name)) rmSync(path.join(migrations, name));
  }
  assertRecordingAuthorityStage(migrations, plan.predecessor);
  run("supabase", ["start", "--workdir", target, "--ignore-health-check", "--yes", "--agent=no"]);
  assertDatabaseStage(id, plan.predecessor);
}
function disposableStop(id) {
  const target = workdir(id);
  if (!existsSync(target)) return;
  run("supabase", ["stop", "--workdir", target, "--no-backup", "--yes", "--agent=no"], { allowFailure: true });
  const resolved = path.resolve(target);
  const disposableRoot = path.resolve(root, ".he3a") + path.sep;
  if (!resolved.startsWith(disposableRoot) || path.basename(resolved) !== id) {
    throw new Error(`refusing to remove unexpected disposable path: ${resolved}`);
  }
  rmSync(resolved, { recursive: true, force: true });
}
function psql(id, input, allowFailure = false, capture = false) {
  return run("docker", ["exec", "-i", `supabase_db_${id}`, "psql", "-X", "-v", "ON_ERROR_STOP=1",
    "-t", "-A", "-U", "postgres", "-d", "postgres"], { input, allowFailure, capture });
}
function assertDatabaseStage(id, files) {
  const result = psql(id, `select jsonb_build_object(
    'lineage',(select lineage from forge_meta.database_lineage where singleton=true),
    'versions',(select jsonb_agg(version order by version) from supabase_migrations.schema_migrations)
  )::text;`, false, true);
  const state = JSON.parse(result.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1));
  const expected = files.map((file) => file.name.slice(0, 14)).sort();
  if (state.lineage !== "baseline-v1" || JSON.stringify(state.versions) !== JSON.stringify(expected)) {
    throw new Error("Recording-authority disposable database lineage/history differs");
  }
}
function installPendingMigration(id, plan) {
  const migrationDir = path.join(root, ".he3a", id, "supabase", "migrations");
  assertRecordingAuthorityStage(migrationDir, plan.predecessor);
  assertDatabaseStage(id, plan.predecessor);
  copyFileSync(path.join(root, "supabase", "migrations", migration), path.join(migrationDir, migration));
  const successor = [...plan.predecessor, plan.target];
  assertRecordingAuthorityStage(migrationDir, successor);
  const dryRun = run("supabase", ["db", "push", "--local", "--dry-run", "--workdir", workdir(id), "--agent=no"], { capture: true });
  const pending = [...new Set((dryRun.stdout + dryRun.stderr).match(/2026\d{10}/g) ?? [])];
  if (pending.join(",") !== migration.slice(0, 14)) throw new Error("Expected only recording-authority migration 419 pending");
  run("supabase", ["migration", "up", "--local", "--workdir", path.join(".he3a", id), "--yes", "--agent=no"]);
  assertDatabaseStage(id, successor);
}

function main() {
  run("docker", ["info"], { capture: true });
  const version = run("supabase", ["--version"], { capture: true, cwd: tmpdir() }).stdout.trim();
  if (version !== "2.84.2") throw new Error(`Supabase CLI 2.84.2 is required; found ${version}`);
  const plan = certificationPlan();
  try {
    disposableStart(upgradeId, upgradePort, plan);
    psql(upgradeId, readFileSync(path.join(root, "scripts", "fixtures", "anvil-recording-authority-production-drift.sql"), "utf8"));
    installPendingMigration(upgradeId, plan);
    run("node", ["scripts/verify-anvil-recording-authority-upgrade.mjs"], {
      env: { SUPABASE_DB_CONTAINER: `supabase_db_${upgradeId}` },
    });

    disposableStart(rollbackId, rollbackPort, plan);
    psql(rollbackId, readFileSync(path.join(root, "scripts", "fixtures", "anvil-recording-authority-production-drift.sql"), "utf8"));
    psql(rollbackId, `begin;
      update tongs.anvil_recording_keep_requests
      set workpiece_id='d5000000-0000-4000-8000-000000000003'
      where id='b5200000-0000-4000-8000-000000000001';
      commit;`);
    const migrationSql = readFileSync(path.join(root, "supabase", "migrations", migration), "utf8");
    const failed = psql(rollbackId, migrationSql, true);
    if (failed.status === 0) throw new Error("invalid-lineage migration unexpectedly succeeded");
    const rollbackProof = psql(rollbackId, `select jsonb_build_object(
      'keep_authority_column',exists(select 1 from pg_attribute where attrelid='tongs.anvil_recording_keep_requests'::regclass
        and attname='recording_capture_authority_id' and not attisdropped),
      'keep_trigger',exists(select 1 from pg_trigger where tgrelid='tongs.anvil_recording_keep_requests'::regclass
        and tgname='trg_recording_keep_immutable' and not tgisinternal)
    )::text;`, false, true);
    const proof = JSON.parse(rollbackProof.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1));
    if (proof.keep_authority_column || proof.keep_trigger) throw new Error(`failed preflight did not roll back atomically: ${JSON.stringify(proof)}`);
    assertDatabaseStage(rollbackId, plan.predecessor);
    process.stdout.write("ok - failed lineage preflight rolls the migration back atomically\n");
    process.stdout.write("Anvil recording authority production-shaped upgrade certification passed.\n");
  } finally {
    try { disposableStop(upgradeId); } catch {}
    try { disposableStop(rollbackId); } catch {}
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
