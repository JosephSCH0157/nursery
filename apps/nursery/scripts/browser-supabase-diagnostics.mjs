import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// This is an allowlisted summary, NOT a redactor. Never print raw CLI lines:
// startup output may contain keys, SQL literals, credentials, or auth state.
export function summarizeSupabaseStartup(log, migrationNames) {
  const clean = log.replace(/\u001b\[[0-9;]*[A-Za-z]/g, "");
  const allowed = new Set(migrationNames.filter((name) => /^\d{14}_[a-z0-9_]+\.sql$/.test(name)));
  const applied = [...clean.matchAll(/^Applying migration ([^\r\n]+?)\.\.\.\s*$/gm)]
    .map((match) => match[1]).filter((name) => allowed.has(name));
  const signatures = [
    ["sql_syntax_error", /syntax error at or near/i],
    ["sql_missing_relation", /relation [^\r\n]* does not exist/i],
    ["sql_missing_column", /column [^\r\n]* does not exist/i],
    ["sql_missing_function", /function [^\r\n]* does not exist/i],
    ["sql_already_exists", /already exists/i],
    ["permission_denied", /permission denied/i],
    ["connection_refused", /connection refused/i],
    ["connection_reset", /connection reset|ECONNRESET/i],
    ["timeout", /timed out|timeout/i],
    ["container_unhealthy", /unhealthy|health check failed/i],
    ["port_in_use", /port is already allocated|address already in use/i],
    ["image_pull_failed", /pull access denied|manifest unknown|failed to pull/i],
    ["registry_rate_limit", /toomanyrequests|pull rate limit/i],
    ["no_disk_space", /no space left on device/i],
    ["out_of_memory", /out of memory|OOMKilled/i],
  ];
  return {
    diagnosticRevision: 1,
    lastReportedMigration: applied.at(-1) ?? null,
    // A migration being reported does not prove it completed successfully.
    sqlStates: [...new Set([...clean.matchAll(/\bSQLSTATE[ :]+([0-9A-Z]{5})\b/g)].map((match) => match[1]))].slice(0, 16),
    statementNumbers: [...new Set([...clean.matchAll(/\bAt statement:\s*(\d{1,6})\b/g)].map((match) => Number(match[1])))].slice(0, 16),
    errorCategories: signatures.filter(([, pattern]) => pattern.test(clean)).map(([name]) => name),
    rawOutputWithheld: true,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const log = readFileSync(process.argv[2], "utf8");
    const migrations = readdirSync(process.argv[3]);
    console.log(JSON.stringify(summarizeSupabaseStartup(log, migrations)));
  } catch {
    // Even filesystem error messages may contain private paths. Do not echo them.
    console.log(JSON.stringify({ diagnosticRevision: 1, diagnosticUnavailable: true, rawOutputWithheld: true }));
  }
}
