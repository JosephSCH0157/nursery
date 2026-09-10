import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const container = process.env.SUPABASE_DB_CONTAINER || "supabase_db_nursery";
const database = `forge_aggregate_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
const migrations = [
  "20260910120000_tongs_accounting_foundation.sql",
  "20260911120000_tongs_private_pricing_reservations_shadow.sql",
  "20260912120000_tongs_owner_budget_reservations_shadow.sql",
  "20260915120000_tongs_runway_paid_execution_boundary.sql",
  "20260916120000_tongs_runway_owner_pilot_activation.sql",
  "20260917120000_tongs_pricing_customer_interface.sql",
  "20260918120000_tongs_failure_relief_openai_text_shadow.sql",
  "20260919120000_tongs_openai_text_enforcement_foundation.sql",
  "20260920120000_tongs_hearth_chat_paid_execution.sql",
  "20260921120000_tongs_openai_hearth_owner_pilot_control.sql",
  "20260922120000_tongs_openai_hearth_luna_pilot_proposal.sql",
  "20260922130000_tongs_openai_hearth_luna_pilot_control.sql",
  "20260922140000_tongs_openai_hearth_luna_pilot_emergency_halt.sql",
  "20260922150000_tongs_openai_loss_policy_scope_and_preprovider_rearm.sql",
  "20260922160000_tongs_failure_class_corrections_and_luna_retest.sql",
  "20260922170000_tongs_precise_forge_failure_classes.sql",
  "20261001120000_tongs_restricted_beta_financial_policy.sql",
  "20261002120000_tongs_aggregate_paid_execution_connection.sql",
  "20261003120000_tongs_openai_cost_reconciliation_connection.sql",
];

function docker(args, input) {
  return spawnSync("docker", args, { input, encoding: "utf8", maxBuffer: 40 * 1024 * 1024 });
}
function check(result, label) {
  if (result.status !== 0) throw new Error(`${label} failed:\n${result.stderr || result.stdout}`);
}
function psql(sql, label) {
  const result = docker(["exec", "-i", container, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], sql);
  check(result, label);
}

try {
  check(docker(["exec", container, "createdb", "-U", "postgres", database]), "create isolated database");
  const baseline = readFileSync("supabase/tests/billing_isolated_baseline.sql", "utf8")
    .replace(/^create role anon nologin;\r?\n/m, "")
    .replace(/^create role authenticated nologin;\r?\n/m, "")
    .replace(/^create role service_role nologin bypassrls;\r?\n/m, "");
  psql(baseline, "baseline");
  psql("create table if not exists tongs.episodes(id uuid primary key, workspace_id uuid references tongs.workspaces(id));", "domain workpiece compatibility");
  psql('create extension if not exists "uuid-ossp" with schema extensions;', "uuid v5 compatibility");
  for (const migration of migrations) {
    if (migration === "20261001120000_tongs_restricted_beta_financial_policy.sql") {
      psql(`
        insert into tongs.openai_text_provider_rate_revisions(
          id,provider,runtime_model_alias,provider_model_id,revision,input_micros_per_million_tokens,cached_input_micros_per_million_tokens,
          output_micros_per_million_tokens,maximum_context_tokens,maximum_output_tokens,source_url,source_checked_at,content_hash) values
        ('60000000-0000-4000-8000-000000000001','openai','gpt-6-astra','gpt-6-astra',1,10000000,1000000,50000000,1050000,128000,'https://developers.openai.com/api/docs/models/gpt-6-astra','2026-09-09',encode(extensions.digest(convert_to('isolated-astra','utf8'),'sha256'),'hex')),
        ('56000000-0000-4000-8000-000000000001','openai','gpt-5.6-sol','gpt-5.6-sol',1,4000000,400000,20000000,1050000,128000,'https://developers.openai.com/api/docs/models/gpt-5.6-sol','2026-09-09',encode(extensions.digest(convert_to('isolated-sol','utf8'),'sha256'),'hex')),
        ('56000000-0000-4000-8000-000000000002','openai','gpt-5.6-terra','gpt-5.6-terra',1,2000000,200000,12000000,1050000,128000,'https://developers.openai.com/api/docs/models/gpt-5.6-terra','2026-09-09',encode(extensions.digest(convert_to('isolated-terra','utf8'),'sha256'),'hex')),
        ('53500000-0000-4000-8000-000000000002','openai','gpt-5-mini','gpt-5-mini-2025-08-07',1,250000,25000,2000000,400000,128000,'https://developers.openai.com/api/docs/models/gpt-5-mini','2026-09-09',encode(extensions.digest(convert_to('isolated-mini','utf8'),'sha256'),'hex'));
      `, "isolated model-rate compatibility");
    }
    if (migration === "20261003120000_tongs_openai_cost_reconciliation_connection.sql") {
      psql(`
        create table tongs.openai_supplier_expense_reconciliation_adjustments(
          id uuid primary key,
          supplier_expense_id uuid not null references tongs.supplier_expenses(id) on delete restrict,
          reconciliation_batch_id uuid not null references tongs.openai_organization_reconciliation_batches(id) on delete restrict,
          operation_allocation_id uuid not null references tongs.openai_text_operation_cost_allocations(id) on delete restrict,
          source_key text not null unique,
          estimated_amount_micros bigint not null check(estimated_amount_micros>=0),
          confirmed_amount_micros bigint not null check(confirmed_amount_micros>=0),
          adjustment_micros bigint not null,
          currency text not null check(currency ~ '^[A-Z]{3}$'),
          matching_method text not null check(matching_method in ('provider_request_id','documented_allocation')),
          evidence_json jsonb not null default '{}'::jsonb check(jsonb_typeof(evidence_json)='object'),
          created_at timestamptz not null default now(),
          unique(supplier_expense_id,reconciliation_batch_id)
        );
        grant select on tongs.openai_supplier_expense_reconciliation_adjustments to service_role;
      `, "isolated reconciliation adjustment compatibility");
    }
    psql(readFileSync(`supabase/migrations/${migration}`, "utf8"), migration);
  }
  psql(readFileSync("supabase/tests/aggregate_paid_execution_connection.sql", "utf8"), "aggregate admission proof");
  psql(readFileSync("supabase/tests/openai_cost_reconciliation_connection.sql", "utf8"), "OpenAI reconciliation connection proof");
  console.log(JSON.stringify({
    isolated_database: true,
    shared_runway_openai_capacity: "passed",
    cross_user_workspace_contention: "passed",
    rejection_before_provider_contract: "passed",
    expiry_and_window_preserve_obligation: "passed",
    ambiguous_no_resubmit: "passed",
    partial_recovery_retains_capacity: "passed",
    authoritative_reconciliation_idempotency: "passed",
    exact_aggregate_allocation_and_adjustment: "passed",
    revised_and_overlapping_batch_safety: "passed",
    partial_reconciliation_exposure: "passed",
    unmatched_cost_profit_safety: "passed",
    private_operator_data: "passed",
  }));
} finally {
  docker(["exec", container, "dropdb", "-U", "postgres", "--if-exists", database]);
}
