import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { summarizeSupabaseStartup } from "../scripts/browser-supabase-diagnostics.mjs";

const migration = "20261011120000_tongs_hammer_cleanup_review_decisions.sql";

test("reports migration progress, SQLSTATE and statement without echoing SQL", () => {
  const result = summarizeSupabaseStartup(`Applying migration ${migration}...\nERROR: syntax error at or near \"secret-literal\" (SQLSTATE 42601)\nAt statement: 7\nSELECT 'private-data';`, [migration]);
  assert.equal(result.lastReportedMigration, migration);
  assert.deepEqual(result.sqlStates, ["42601"]);
  assert.deepEqual(result.statementNumbers, [7]);
  assert.deepEqual(result.errorCategories, ["sql_syntax_error"]);
  assert.ok(!JSON.stringify(result).includes("secret-literal"));
  assert.ok(!JSON.stringify(result).includes("private-data"));
});

test("never passes through credentials, auth state, URLs or unknown log lines", () => {
  const secrets = ["sb_secret_superprivate", "eyJhbGciOiJIUzI1NiJ9.payload.signature", "postgresql://user:private-password@db.invalid/db", "sk-project-key", "arbitrary-private-value"];
  const log = `${secrets.join("\n")}\nApplying migration 20261011120000_untrusted_secret.sql...\n::error::${secrets[0]}\nERROR: completely unknown failure ${secrets[4]}`;
  const result = summarizeSupabaseStartup(log, [migration]);
  assert.equal(result.lastReportedMigration, null);
  assert.deepEqual(result.errorCategories, []);
  for (const secret of secrets) assert.ok(!JSON.stringify(result).includes(secret));
  assert.ok(!JSON.stringify(result).includes("untrusted_secret"));
});

test("reports fixed infrastructure categories separately from migration progress", () => {
  const result = summarizeSupabaseStartup("Error: failed to pull private-registry/token\nconnection refused\ncontainer unhealthy", [migration]);
  assert.equal(result.lastReportedMigration, null);
  assert.deepEqual(result.errorCategories, ["connection_refused", "container_unhealthy", "image_pull_failed"]);
});

test("handles terminal colors and duplicate diagnostics without claiming migration success", () => {
  const result = summarizeSupabaseStartup(`\x1b[32mApplying migration ${migration}...\x1b[0m\r\nSQLSTATE 42501\nSQLSTATE 42501\nAt statement: 4\nAt statement: 4\npermission denied`, [migration]);
  assert.equal(result.lastReportedMigration, migration);
  assert.deepEqual(result.sqlStates, ["42501"]);
  assert.deepEqual(result.statementNumbers, [4]);
  assert.equal(result.rawOutputWithheld, true);
  assert.ok(!("migrationSucceeded" in result));
});

test("CLI summarizes a private file and keeps missing-file errors private", () => {
  const directory = mkdtempSync(join(tmpdir(), "forge-startup-diagnostics-"));
  const script = fileURLToPath(new URL("../scripts/browser-supabase-diagnostics.mjs", import.meta.url));
  try {
    const migrations = join(directory, "migrations");
    mkdirSync(migrations);
    writeFileSync(join(migrations, migration), "-- fixture only\n");
    const log = join(directory, "private.log");
    writeFileSync(log, `Applying migration ${migration}...\nERROR: syntax error at or near \"do-not-print\" (SQLSTATE 42601)\nAt statement: 3`);
    const result = spawnSync(process.execPath, [script, log, migrations], { encoding: "utf8" });
    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");
    assert.equal(JSON.parse(result.stdout).lastReportedMigration, migration);
    assert.ok(!result.stdout.includes("do-not-print"));
    const missing = spawnSync(process.execPath, [script, join(directory, "private-missing-file"), migrations], { encoding: "utf8" });
    assert.equal(missing.status, 0);
    assert.equal(missing.stderr, "");
    assert.deepEqual(JSON.parse(missing.stdout), { diagnosticRevision: 1, diagnosticUnavailable: true, rawOutputWithheld: true });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("actual workflow shell preserves startup/migration exit codes without exposing raw output", () => {
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const workflow = readFileSync(join(root, ".github/workflows/pr-smoke.yml"), "utf8");
  const block = workflow.match(/      - name: Start disposable Supabase and apply repository migrations\r?\n        run: \|\r?\n([\s\S]*?)      - name: Configure disposable credentials/);
  assert.ok(block, "startup block must remain recognizable for failure-path verification");
  const shell = block[1].split(/\r?\n/).map((line) => line.replace(/^          /, "")).join("\n");
  assert.match(workflow, /name: Stop job-owned disposable Supabase\r?\n\s+if: always\(\)/);
  const directory = mkdtempSync(join(tmpdir(), "forge-startup-shell-"));
  const bash = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
  try {
    for (const [stage, expectedStatus] of [["start", 7], ["migration", 11], ["success", 0]] as const) {
      // Function replaces only the external CLI: the checked-in workflow body runs unchanged.
      const stub = `supabase() {\n  echo 'private-cli-secret'\n  if [ "$1" = "$FAIL_STAGE" ]; then\n    echo 'ERROR: syntax error at or near "private-sql" (SQLSTATE 42601)' >&2\n    return "$FAIL_STATUS"\n  fi\n}\n`;
      const result = spawnSync(bash, ["-e", "-o", "pipefail", "-c", stub + shell + "\necho REACHED_NEXT_STEP\n"], {
        cwd: root,
        encoding: "utf8",
        timeout: 20_000,
        env: { ...process.env, RUNNER_TEMP: directory.replaceAll("\\", "/"), FORGE_BROWSER_SUPABASE_WORKDIR: directory.replaceAll("\\", "/"), FAIL_STAGE: stage, FAIL_STATUS: String(expectedStatus) },
      });
      assert.equal(result.status, expectedStatus, `stage ${stage}: ${result.error?.message ?? result.stderr}`);
      assert.ok(!result.stdout.includes("private-cli-secret"));
      assert.ok(!result.stdout.includes("private-sql"));
      assert.equal(result.stderr, "");
      assert.equal(result.stdout.includes("REACHED_NEXT_STEP"), stage === "success");
      if (stage !== "success") assert.ok(result.stdout.includes('"sqlStates":["42601"]'));
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
