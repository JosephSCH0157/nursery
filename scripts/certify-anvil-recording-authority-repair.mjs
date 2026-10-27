import { copyFileSync, cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const suffix = `${process.pid.toString(36)}${(Date.now() % 46656).toString(36)}`.toLowerCase();
const upgradeId = `forge-he3-recording-authority-${suffix}`;
const rollbackId = `forge-he3-recording-rollback-${suffix}`;
const upgradePort = Number(process.env.RECORDING_AUTHORITY_UPGRADE_PORT ?? 61320);
const rollbackPort = Number(process.env.RECORDING_AUTHORITY_ROLLBACK_PORT ?? 62320);
const migration = "20261027030139_anvil_recording_authority_repair.sql";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
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
function disposableStart(id, port) {
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
    if (version && version >= "20261022000000" && name !== migration) {
      copyFileSync(path.join(root, "supabase", "migrations", name), path.join(migrations, name));
    }
  }
  cpSync(path.join(root, "supabase", "templates"), path.join(target, "supabase", "templates"), { recursive: true });
  run("supabase", ["start", "--workdir", target, "--ignore-health-check", "--yes", "--agent=no"]);
}
function disposableStop(id) {
  const target = workdir(id);
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
function installPendingMigration(id) {
  const migrationDir = path.join(root, ".he3a", id, "supabase", "migrations");
  copyFileSync(path.join(root, "supabase", "migrations", migration), path.join(migrationDir, migration));
  run("supabase", ["migration", "up", "--local", "--workdir", path.join(".he3a", id), "--yes", "--agent=no"]);
}

try {
  disposableStart(upgradeId, upgradePort);
  psql(upgradeId, readFileSync(path.join(root, "scripts", "fixtures", "anvil-recording-authority-production-drift.sql"), "utf8"));
  installPendingMigration(upgradeId);
  run("node", ["scripts/verify-anvil-recording-authority-upgrade.mjs"], {
    env: { SUPABASE_DB_CONTAINER: `supabase_db_${upgradeId}` },
  });

  disposableStart(rollbackId, rollbackPort);
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
  process.stdout.write("ok - failed lineage preflight rolls the migration back atomically\n");
  process.stdout.write("Anvil recording authority production-shaped upgrade certification passed.\n");
} finally {
  try { disposableStop(upgradeId); } catch {}
  try { disposableStop(rollbackId); } catch {}
}
