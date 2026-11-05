import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

const pwsh = process.platform === "win32"
  ? "C:\\Program Files\\PowerShell\\7\\pwsh.exe"
  : "/mnt/c/Program Files/PowerShell/7/pwsh.exe";
const repo = "D:\\nursery\\nursery";
const expected = [
  "20261103193845_repair_hammer_transcription_integrated_recovery.sql",
  "20261103234636_repair_shared_spending_quote_financial_environment.sql",
  "20261104003358_repair_hammer_aggregate_attempt_smallint_signature.sql",
  "20261104071802_repair_owner_hearth_aggregate_admission_enforcement.sql",
  "20261104143249_align_provider_requests_and_luna_financial_authority.sql",
];
const header = "DRY RUN: migrations will *not* be pushed to the database.\nConnecting to remote database...\nWould push these migrations:\n";
const windowsMojibakeBullet = "\u0393\u00c7\u00f3";
const plan = (files, bullet = windowsMojibakeBullet) => `${header}${files.map((file) => ` ${bullet} ${file}`).join("\n")}\n`;
const run = ({ stdout = "Finished supabase db push.\n", stderr = plan(expected), exitCode = 0 }) => {
  const payload = Buffer.from(JSON.stringify({ stdout, stderr, exitCode }), "utf8").toString("base64");
  const expectedPayload = Buffer.from(JSON.stringify(expected), "utf8").toString("base64");
  return execFileSync(pwsh, ["-NoProfile", "-Command", `$x=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${payload}'))|ConvertFrom-Json;$e=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${expectedPayload}'))|ConvertFrom-Json;. '${repo}\\scripts\\lib\\forge-supabase-cli.ps1';Assert-ForgeSupabaseDryRunPlan -Result ([pscustomobject]@{ExitCode=[int]$x.exitCode;StandardOutput=[string]$x.stdout;StandardError=[string]$x.stderr}) -ExpectedMigrationFiles @($e)|ConvertTo-Json -Compress`], { encoding: "utf8" }).trim();
};
const reject = (fixture, pattern) => assert.throws(() => run(fixture), pattern);

test("accepts the captured CLI 2.84.2 five-migration stderr plan", () => {
  assert.deepEqual(JSON.parse(run({})), expected);
});

test("accepts the same uniquely structured plan on stdout", () => {
  assert.deepEqual(JSON.parse(run({ stdout: plan(expected, "•"), stderr: "" })), expected);
});

test("accepts ANSI formatting without treating arbitrary log text as plan evidence", () => {
  const ansi = `\u001b[33mDRY RUN: migrations will *not* be pushed to the database.\u001b[0m\n\u001b[36mWould push these migrations:\u001b[0m\n${expected.map((file) => ` • \u001b[32m${file}\u001b[0m`).join("\n")}\n`;
  assert.deepEqual(JSON.parse(run({ stderr: ansi })), expected);
});

test("rejects missing first, middle, or last migrations", () => {
  for (const index of [0, 2, 4]) reject({ stderr: plan(expected.filter((_, item) => item !== index)) }, /count mismatch|plan mismatch/);
});

test("rejects extra, duplicate, and wrong-order migrations", () => {
  reject({ stderr: plan([...expected, "20261105000000_unexpected.sql"]) }, /count mismatch/);
  reject({ stderr: plan([expected[0], expected[1], expected[1], ...expected.slice(2)]) }, /count mismatch/);
  reject({ stderr: plan([expected[1], expected[0], ...expected.slice(2)]) }, /plan mismatch/);
});

test("rejects malformed, incomplete, absent, and ambiguous plans", () => {
  reject({ stderr: `${header}not-a-plan-line\n` }, /malformed or incomplete/);
  reject({ stderr: `${header} • ${expected[0]}\n • broken.sql\n` }, /count mismatch/);
  reject({ stderr: "migration names in arbitrary logs: " + expected.join(" ") }, /no unique migration plan/);
  reject({ stdout: plan(expected), stderr: plan(expected) }, /no unique migration plan/);
});

test("rejects nonzero CLI exit status before parsing", () => {
  reject({ exitCode: 1 }, /dry run failed \(exit 1\)/);
});
