import { spawnSync } from "node:child_process";
import { copyFileSync, readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const suffix = `${process.pid.toString(36)}${(Date.now() % 46656).toString(36)}`.toLowerCase();
const cleanId = `forge-he3-agc-${suffix}`;
const upgradeId = `forge-he3-agu-${suffix}`;
const cleanPort = Number(process.env.ANVIL_GATE_CLEAN_PORT ?? 59320);
const upgradePort = Number(process.env.ANVIL_GATE_UPGRADE_PORT ?? 60320);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", stdio: options.input ? ["pipe", "inherit", "inherit"] : "inherit", input: options.input, env: { ...process.env, ...options.env } });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed with ${result.status}`);
}

function disposable(action, id, port, cutoff) {
  run("node", ["scripts/he3a-disposable-supabase.mjs", action, id, String(port), ...(cutoff ? [cutoff] : [])]);
}

try {
  disposable("start", cleanId, cleanPort);
  run("node", ["scripts/verify-venue-neutral-recording-authority-db.mjs"], { env: { SUPABASE_DB_CONTAINER: `supabase_db_${cleanId}` } });

  disposable("start", upgradeId, upgradePort, "20260828170000");
  run("docker", ["exec", "-i", `supabase_db_${upgradeId}`, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], {
    input: readFileSync(path.join(root, "scripts/fixtures/anvil-phase1-upgrade.sql"), "utf8"),
  });
  const migrations = path.join(root, ".he3a", upgradeId, "supabase", "migrations");
  for (const name of ["20260829120000_tongs_venue_neutral_recording_authority.sql", "20260829130000_tongs_recording_canonical_media_verification.sql"]) {
    copyFileSync(path.join(root, "supabase", "migrations", name), path.join(migrations, name));
  }
  run("supabase", ["db", "push", "--workdir", path.join(".he3a", upgradeId), "--local", "--include-all", "--yes"]);
  run("docker", ["exec", "-i", `supabase_db_${upgradeId}`, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], {
    input: readFileSync(path.join(root, "scripts/verify-anvil-phase1-legacy-upgrade.sql"), "utf8"),
  });
  run("node", ["scripts/verify-venue-neutral-recording-authority-db.mjs"], { env: { SUPABASE_DB_CONTAINER: `supabase_db_${upgradeId}` } });
  process.stdout.write("Anvil clean and production-shaped upgrade migration certification passed.\n");
} finally {
  try { disposable("stop", cleanId, cleanPort); } catch {}
  try { disposable("stop", upgradeId, upgradePort); } catch {}
}
