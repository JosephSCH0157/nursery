import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

import {
  EXACT_TARGET,
  connectedPreflightSql,
  executeExactTargetReconciliation,
  loadExactTargetEvidence,
  validateConnectedPreflight,
} from "./lib/hammer-6c-exact-target-reconciliation.mjs";

const root = resolve(import.meta.dirname, "..");
const defaultEvidenceDirectory = resolve(root, ".git/forge-private-evidence/hammer-6c-supplier-evidence-run-38582959657");
const execute = process.argv.includes("--execute");
const evidenceArgument = process.argv.indexOf("--evidence-dir");
const evidenceDirectory = evidenceArgument >= 0 ? resolve(process.argv[evidenceArgument + 1] ?? "") : defaultEvidenceDirectory;

function linkedQuery(sql) {
  const command = process.platform === "win32"
    ? resolve(
        root,
        "node_modules/.pnpm",
        readdirSync(resolve(root, "node_modules/.pnpm")).find((name) => /^supabase@[^_]+$/.test(name)) ?? "supabase-not-installed",
        "node_modules/supabase/bin/supabase.exe",
      )
    : resolve(root, "node_modules/.bin/supabase");
  const result = spawnSync(command, ["db", "query", "--linked", "--output", "json", sql], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.status !== 0) throw new Error(`hammer_6c_exact_target_connected_preflight_failed:${result.error?.message || result.stderr || result.stdout}`);
  const parsed = JSON.parse(result.stdout);
  if (!Array.isArray(parsed.rows) || parsed.rows.length !== 1) throw new Error("hammer_6c_exact_target_connected_preflight_shape");
  return parsed.rows[0].jsonb_build_object ?? parsed.rows[0];
}

const linkedProject = readFileSync(resolve(root, "supabase/.temp/project-ref"), "utf8").trim();
if (linkedProject !== EXACT_TARGET.projectRef) throw new Error("hammer_6c_exact_target_linked_project_mismatch");

const { evidence, digests } = await loadExactTargetEvidence({ evidenceDirectory });
const connectedState = linkedQuery(connectedPreflightSql(evidence));
validateConnectedPreflight(connectedState, evidence);

const safeResult = {
  ok: true,
  mode: execute ? "execute" : "dry_run",
  linked_project: linkedProject,
  target_operation: EXACT_TARGET.operationPrefix,
  supplier_expense_id: EXACT_TARGET.supplierExpenseId,
  reservation_id: EXACT_TARGET.reservationId,
  evidence_sha256: digests["raw-openai-evidence.json"],
  batch_id: evidence.batchId,
  source_key: evidence.sourceKey,
  window: { start: EXACT_TARGET.startIso, end_exclusive: EXACT_TARGET.endIso },
  provider_snapshot_model: EXACT_TARGET.providerSnapshot,
  provider_service_tier: EXACT_TARGET.serviceTier,
  usage: { requests: 1, input_tokens: 118, cached_input_tokens: 0, output_tokens: 35 },
  supplier_actual_micros: 0,
  candidate_count: 1,
  expected_effects: {
    supplier_adjustment_micros: -246,
    owner_budget_adjustment_micros: -246,
    owner_expense_journal_micros: -246,
    cash_clearing_journal_micros: 246,
    aggregate_exposure_release_micros: 249,
    customer_charge_micros: 0,
  },
};

if (!execute) {
  process.stdout.write(`${JSON.stringify(safeResult, null, 2)}\n`);
} else {
  const result = await executeExactTargetReconciliation({
    evidence,
    supabaseUrl: process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: process.env.HAMMER_6C_EXACT_TARGET_WRITE_AUTHORIZATION,
  });
  process.stdout.write(`${JSON.stringify({ ...safeResult, result }, null, 2)}\n`);
}
