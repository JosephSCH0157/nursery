import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  normalizeOpenAiOrganizationEvidence,
  recordOpenAiOrganizationEvidence,
} from "./openai-organization-reconciliation.mjs";

export const EXACT_TARGET = Object.freeze({
  projectRef: "wtvdjndyxegudufrompx",
  operationPrefix: "hammer-owner-canary-20261007-0002",
  supplierExpenseId: "406396bd-df0b-426a-9b19-b812914770c5",
  reservationId: "2163fc54-baff-4b6d-a3d7-f1f0e8ff1174",
  startTime: 1_791_331_200,
  endTime: 1_791_417_600,
  startIso: "2026-10-07T00:00:00.000Z",
  endIso: "2026-10-08T00:00:00.000Z",
  runtimeModel: "gpt-5.4-mini",
  providerSnapshot: "gpt-5.4-mini-2026-03-17",
  serviceTier: "incentivized-tier",
  requestCount: 1,
  inputTokens: 118,
  cachedInputTokens: 0,
  outputTokens: 35,
  estimatedMicros: 246,
  actualMicros: 0,
  retainedExposureMicros: 249,
  projectFingerprint: "sha256:d5bcc0c36601d3ce",
  apiKeyFingerprint: "sha256:9016c72ec08c4a63",
  organizationFingerprint: "sha256:b98a6129ed057d9d",
});

export const EXPECTED_ARTIFACT_DIGESTS = Object.freeze({
  "raw-openai-evidence.json": "c03db89e5c24b3b22fbe5c21fce2eaa02afea58984fad54045b4ccaa5d388e72",
  "SUMMARY.md": "25db8d3dc74d0870d23e52430d7ef046a8beb7989171aa74be471837eba8008f",
  "evidence-manifest.json": "c456dea394a3c5c1aab692e2722d5aab43a21483bd8f241ff8ddd35ebdc579cd",
  SHA256SUMS: "a719ba519a4f499204fc216da0da1f6f084cbef573ba14fb0a58f55eb70a6938",
});

const EXPECTED_COST_LINES = new Map([
  [`${EXACT_TARGET.providerSnapshot}, input`, EXACT_TARGET.inputTokens],
  [`${EXACT_TARGET.providerSnapshot}, cached input`, EXACT_TARGET.cachedInputTokens],
  [`${EXACT_TARGET.providerSnapshot}, output`, EXACT_TARGET.outputTokens],
]);

function fail(code) {
  throw new Error(`hammer_6c_exact_target_${code}`);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function fingerprint(value) {
  return `sha256:${sha256(value).slice(0, 16)}`;
}

function object(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  return value;
}

function integer(value, code) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) fail(code);
  return parsed;
}

function parseJson(value, code) {
  try {
    return JSON.parse(value);
  } catch {
    fail(code);
  }
}

function parseChecksums(value) {
  const entries = new Map();
  for (const line of value.trim().split(/\r?\n/)) {
    const match = line.match(/^([a-f0-9]{64})  ([A-Za-z0-9._-]+)$/);
    if (!match || entries.has(match[2])) fail("checksums_invalid");
    entries.set(match[2], match[1]);
  }
  return entries;
}

function parseProviderPages(pages, kind) {
  if (!Array.isArray(pages) || pages.length !== 1) fail(`${kind}_page_count`);
  const page = object(pages[0], `${kind}_page_invalid`);
  if (page.request?.method !== "GET") fail(`${kind}_request_not_get`);
  const url = new URL(page.request?.url ?? "invalid:");
  const expectedPath = kind === "usage" ? "/v1/organization/usage/completions" : "/v1/organization/costs";
  if (url.protocol !== "https:" || url.hostname !== "api.openai.com" || url.pathname !== expectedPath) {
    fail(`${kind}_request_target`);
  }
  if (
    url.searchParams.get("start_time") !== String(EXACT_TARGET.startTime) ||
    url.searchParams.get("end_time") !== String(EXACT_TARGET.endTime)
  ) fail(`${kind}_request_window`);
  if (page.response?.status !== 200) fail(`${kind}_response_status`);
  const payload = object(parseJson(page.response?.raw_body, `${kind}_response_json`), `${kind}_response_invalid`);
  if (!Array.isArray(payload.data) || payload.has_more !== false || payload.next_page) fail(`${kind}_response_incomplete`);
  return { page, payload, url };
}

function validateMinuteCoverage(buckets) {
  if (buckets.length !== 1_440) fail("usage_bucket_count");
  const observed = new Set();
  for (const bucket of buckets) {
    const start = integer(bucket.start_time, "usage_bucket_start");
    const end = integer(bucket.end_time, "usage_bucket_end");
    if (end !== start + 60 || start < EXACT_TARGET.startTime || end > EXACT_TARGET.endTime) fail("usage_bucket_bounds");
    if (observed.has(start)) fail("usage_bucket_duplicate");
    observed.add(start);
  }
  for (let cursor = EXACT_TARGET.startTime; cursor < EXACT_TARGET.endTime; cursor += 60) {
    if (!observed.has(cursor)) fail("usage_bucket_missing");
  }
}

export function validateRawEvidence(rawEvidence) {
  const raw = object(rawEvidence, "raw_invalid");
  const window = object(raw.window, "window_invalid");
  if (
    window.startTime !== EXACT_TARGET.startTime || window.endTime !== EXACT_TARGET.endTime ||
    window.startIso !== EXACT_TARGET.startIso || window.endIso !== EXACT_TARGET.endIso
  ) fail("window_mismatch");

  const usage = parseProviderPages(raw.usage_pages, "usage");
  const costs = parseProviderPages(raw.cost_pages, "costs");
  validateMinuteCoverage(usage.payload.data);
  if (
    costs.payload.data.length !== 1 ||
    costs.payload.data[0].start_time !== EXACT_TARGET.startTime ||
    costs.payload.data[0].end_time !== EXACT_TARGET.endTime
  ) fail("cost_bucket_window");

  const usageRows = usage.payload.data.flatMap((bucket) =>
    (Array.isArray(bucket.results) ? bucket.results : fail("usage_results_invalid"))
      .map((row) => ({ bucket, row: object(row, "usage_row_invalid") })),
  );
  if (usageRows.length !== 1) fail("usage_candidate_count");
  const usageRow = usageRows[0].row;
  if (
    usageRow.model !== EXACT_TARGET.providerSnapshot ||
    usageRow.service_tier !== EXACT_TARGET.serviceTier ||
    integer(usageRow.num_model_requests, "usage_request_count") !== EXACT_TARGET.requestCount ||
    integer(usageRow.input_tokens, "usage_input_tokens") !== EXACT_TARGET.inputTokens ||
    integer(usageRow.input_cached_tokens, "usage_cached_tokens") !== EXACT_TARGET.cachedInputTokens ||
    integer(usageRow.output_tokens, "usage_output_tokens") !== EXACT_TARGET.outputTokens
  ) fail("usage_anchor_mismatch");
  if (typeof usageRow.project_id !== "string" || fingerprint(usageRow.project_id) !== EXACT_TARGET.projectFingerprint) fail("project_identity");
  if (typeof usageRow.api_key_id !== "string" || fingerprint(usageRow.api_key_id) !== EXACT_TARGET.apiKeyFingerprint) fail("api_key_identity");

  const headers = usage.page.response?.headers ?? {};
  if (fingerprint(headers["openai-project"] ?? "") !== EXACT_TARGET.projectFingerprint) fail("project_header_identity");
  if (fingerprint(headers["openai-organization"] ?? "") !== EXACT_TARGET.organizationFingerprint) fail("organization_identity");
  for (const requestUrl of [usage.url, costs.url]) {
    const projectIds = requestUrl.searchParams.getAll("project_ids");
    if (projectIds.length !== 1 || fingerprint(projectIds[0]) !== EXACT_TARGET.projectFingerprint) fail("project_filter_identity");
  }

  const costResults = costs.payload.data[0].results;
  if (!Array.isArray(costResults) || costResults.length !== EXPECTED_COST_LINES.size) fail("cost_row_count");
  const seenLines = new Set();
  for (const rowValue of costResults) {
    const row = object(rowValue, "cost_row_invalid");
    if (row.project_id !== usageRow.project_id || row.api_key_id !== usageRow.api_key_id) fail("cost_identity_mismatch");
    if (!EXPECTED_COST_LINES.has(row.line_item) || seenLines.has(row.line_item)) fail("cost_line_item");
    seenLines.add(row.line_item);
    if (Number(row.amount?.value) !== 0 || String(row.amount?.currency).toLowerCase() !== "usd") fail("cost_amount");
    if (integer(row.quantity, "cost_quantity") !== EXPECTED_COST_LINES.get(row.line_item) || row.quantity_unit !== "tokens") fail("cost_quantity_mismatch");
  }

  const dailyUsagePages = [{
    data: [{
      start_time: EXACT_TARGET.startTime,
      end_time: EXACT_TARGET.endTime,
      results: [usageRow],
    }],
    has_more: false,
    next_page: null,
  }];
  return {
    costsPages: [costs.payload],
    dailyUsagePages,
    projectFingerprint: EXACT_TARGET.projectFingerprint,
    apiKeyFingerprint: EXACT_TARGET.apiKeyFingerprint,
    organizationFingerprint: EXACT_TARGET.organizationFingerprint,
  };
}

export async function loadExactTargetEvidence({ evidenceDirectory }) {
  const directory = resolve(evidenceDirectory);
  const names = ["raw-openai-evidence.json", "SUMMARY.md", "evidence-manifest.json", "SHA256SUMS"];
  const contents = Object.fromEntries(await Promise.all(names.map(async (name) => [name, await readFile(join(directory, name), "utf8")])));
  for (const name of names) {
    if (sha256(contents[name]) !== EXPECTED_ARTIFACT_DIGESTS[name]) fail(`${name}_digest`);
  }
  const checksums = parseChecksums(contents.SHA256SUMS);
  for (const name of names.filter((name) => name !== "SHA256SUMS")) {
    if (checksums.get(name) !== sha256(contents[name])) fail(`${name}_checksum`);
  }
  if (checksums.size !== 3) fail("checksums_file_set");

  const manifest = object(parseJson(contents["evidence-manifest.json"], "manifest_json"), "manifest_invalid");
  if (manifest.schema_version !== 1 || manifest.evidence_purpose !== "hammer_6c_supplier_evidence_only") fail("manifest_contract");
  if (manifest.reconciliation_authorized !== false || manifest.analysis?.collection_status !== "complete") fail("manifest_scope");
  for (const name of ["raw-openai-evidence.json", "SUMMARY.md"]) {
    if (manifest.files?.[name]?.sha256 !== sha256(contents[name])) fail("manifest_file_digest");
  }
  const validated = validateRawEvidence(parseJson(contents["raw-openai-evidence.json"], "raw_json"));
  const evidence = normalizeOpenAiOrganizationEvidence({
    costsPages: validated.costsPages,
    usagePages: validated.dailyUsagePages,
    periodStart: EXACT_TARGET.startTime,
    periodEnd: EXACT_TARGET.endTime,
  });
  if (evidence.totalCostMicros !== EXACT_TARGET.actualMicros || evidence.costBuckets.length !== 3 || evidence.usageBuckets.length !== 1) fail("normalized_evidence_shape");
  const usage = evidence.usageBuckets[0];
  if (usage.evidence?.service_tier !== EXACT_TARGET.serviceTier) fail("service_tier_not_preserved");
  evidence.rawEvidence = {
    ...evidence.rawEvidence,
    exact_target: {
      operation_id: EXACT_TARGET.operationPrefix,
      supplier_expense_id: EXACT_TARGET.supplierExpenseId,
      evidence_run_id: "38582959657",
      raw_evidence_sha256: EXPECTED_ARTIFACT_DIGESTS["raw-openai-evidence.json"],
      manifest_sha256: EXPECTED_ARTIFACT_DIGESTS["evidence-manifest.json"],
      project_fingerprint: validated.projectFingerprint,
      api_key_fingerprint: validated.apiKeyFingerprint,
      organization_fingerprint: validated.organizationFingerprint,
      provider_snapshot_model: EXACT_TARGET.providerSnapshot,
      provider_service_tier: EXACT_TARGET.serviceTier,
      minute_usage_coverage_complete: true,
      daily_projection_rule: "sum one complete supplier minute series into its containing Costs day without changing usage totals",
    },
  };
  return { evidence, manifest, digests: EXPECTED_ARTIFACT_DIGESTS };
}

export function connectedPreflightSql(evidence) {
  if (evidence.batchId !== "d7a8ef3e-9722-45d2-8451-a97d87898535") fail("batch_identity_changed");
  const sourceKey = evidence.sourceKey.replaceAll("'", "''");
  return `with candidates as (
    select e.id expense_id,e.reservation_id,u.input_units,u.output_units,
      case when (u.evidence_json->>'cached_input_units')~'^[0-9]+$' then (u.evidence_json->>'cached_input_units')::bigint else 0 end cached_input_units,
      u.provider_request_id
    from tongs.supplier_expenses e
    join tongs.openai_text_funding_bindings b on b.reservation_id=e.reservation_id and b.credential_funding='forge'
      and tongs._openai_reconciliation_runtime_model_matches_snapshot(b.model,'${EXACT_TARGET.providerSnapshot}')
    join tongs.openai_text_usage_evidence u on u.reservation_id=e.reservation_id
      and u.provider_request_id=e.provider_reference and u.provider_reported
    join tongs.funding_reservations r on r.id=e.reservation_id
    where e.provider='openai' and e.provider_reference is not null
      and tongs._aggregate_funding_class(r)<>'test_customer'
      and u.recorded_at>=to_timestamp(${EXACT_TARGET.startTime}) and u.recorded_at<to_timestamp(${EXACT_TARGET.endTime})
  ), target as (
    select e.*,b.route_code,b.model runtime_model,b.credential_funding,r.operation_id,r.reserved_customer_charge_micros,
      u.input_units,u.output_units,case when (u.evidence_json->>'cached_input_units')~'^[0-9]+$' then (u.evidence_json->>'cached_input_units')::bigint else 0 end cached_input_units,
      u.provider_reported,u.result_validated,u.canonical_persistence_confirmed,u.recorded_at
    from tongs.supplier_expenses e join tongs.openai_text_funding_bindings b on b.reservation_id=e.reservation_id
    join tongs.funding_reservations r on r.id=e.reservation_id
    join tongs.openai_text_usage_evidence u on u.reservation_id=e.reservation_id and u.provider_request_id=e.provider_reference
    where e.id='${EXACT_TARGET.supplierExpenseId}'::uuid
  ) select jsonb_build_object(
    'migration_count',(select count(*) from supabase_migrations.schema_migrations where version='20261014205219'),
    'batch_id_count',(select count(*) from tongs.openai_organization_reconciliation_batches where id='${evidence.batchId}'::uuid),
    'source_key_count',(select count(*) from tongs.openai_organization_reconciliation_batches where source_key='${sourceKey}'),
    'candidate_count',(select count(*) from candidates),
    'candidate_expense_ids',(select coalesce(jsonb_agg(expense_id order by expense_id),'[]'::jsonb) from candidates),
    'candidate_reservation_ids',(select coalesce(jsonb_agg(reservation_id order by reservation_id),'[]'::jsonb) from candidates),
    'candidate_input_tokens',(select coalesce(sum(input_units),0) from candidates),
    'candidate_cached_input_tokens',(select coalesce(sum(cached_input_units),0) from candidates),
    'candidate_output_tokens',(select coalesce(sum(output_units),0) from candidates),
    'candidate_request_count',(select count(distinct provider_request_id) from candidates),
    'target',(select to_jsonb(target) - 'provider_reference' - 'evidence_json' from target),
    'verified_zero_support',tongs._openai_text_verified_zero_supporting_cost('${EXACT_TARGET.reservationId}'::uuid),
    'owner_consumption_count',(select count(*) from tongs.owner_operating_budget_consumptions where reservation_id='${EXACT_TARGET.reservationId}'::uuid),
    'owner_consumption_micros',(select coalesce(sum(expense_amount_micros),0) from tongs.owner_operating_budget_consumptions where reservation_id='${EXACT_TARGET.reservationId}'::uuid),
    'owner_expense_journal_micros',(select coalesce(sum(entry.amount_micros),0) from tongs.owner_operating_budget_consumptions consumption join tongs.accounting_journal_entries entry on entry.event_id=consumption.journal_event_id where consumption.reservation_id='${EXACT_TARGET.reservationId}'::uuid and entry.account_code='owner_research_qa_expense'),
    'cash_clearing_journal_micros',(select coalesce(sum(entry.amount_micros),0) from tongs.owner_operating_budget_consumptions consumption join tongs.accounting_journal_entries entry on entry.event_id=consumption.journal_event_id where consumption.reservation_id='${EXACT_TARGET.reservationId}'::uuid and entry.account_code='forge_cash_clearing'),
    'customer_charge_micros',(select coalesce(sum(customer_charge_micros),0) from tongs.funding_reservation_events where reservation_id='${EXACT_TARGET.reservationId}'::uuid),
    'latest_exposure_micros',(select event.remaining_exposure_micros from tongs.paid_operation_aggregate_bindings binding join lateral(select remaining_exposure_micros from tongs.restricted_beta_exposure_events where hold_id=binding.hold_id order by sequence desc limit 1) event on true where binding.reservation_id='${EXACT_TARGET.reservationId}'::uuid),
    'existing_allocations',(select count(*) from tongs.openai_text_operation_cost_allocations where reservation_id='${EXACT_TARGET.reservationId}'::uuid),
    'existing_supplier_adjustments',(select count(*) from tongs.openai_supplier_expense_reconciliation_adjustments where supplier_expense_id='${EXACT_TARGET.supplierExpenseId}'::uuid),
    'existing_obligation_settlements',(select count(*) from tongs.openai_supplier_expense_obligation_settlement_events where supplier_expense_id='${EXACT_TARGET.supplierExpenseId}'::uuid),
    'existing_budget_adjustments',(select count(*) from tongs.owner_operating_budget_reconciliation_adjustments where supplier_expense_id='${EXACT_TARGET.supplierExpenseId}'::uuid)
  );`;
}

export function validateConnectedPreflight(row, evidence) {
  const state = object(row, "connected_preflight_invalid");
  const target = object(state.target, "connected_target_missing");
  const exactArray = (value, expected) => Array.isArray(value) && value.length === 1 && value[0] === expected;
  if (Number(state.migration_count) !== 1) fail("migration_state");
  if (Number(state.batch_id_count) !== 0 || Number(state.source_key_count) !== 0) fail("reconciliation_already_recorded");
  if (
    Number(state.candidate_count) !== 1 ||
    !exactArray(state.candidate_expense_ids, EXACT_TARGET.supplierExpenseId) ||
    !exactArray(state.candidate_reservation_ids, EXACT_TARGET.reservationId) ||
    Number(state.candidate_input_tokens) !== EXACT_TARGET.inputTokens ||
    Number(state.candidate_cached_input_tokens) !== EXACT_TARGET.cachedInputTokens ||
    Number(state.candidate_output_tokens) !== EXACT_TARGET.outputTokens ||
    Number(state.candidate_request_count) !== EXACT_TARGET.requestCount
  ) fail("candidate_set_changed");
  if (
    target.id !== EXACT_TARGET.supplierExpenseId || target.reservation_id !== EXACT_TARGET.reservationId ||
    target.route_code !== "hammer.transcript_cleanup" || target.runtime_model !== EXACT_TARGET.runtimeModel ||
    target.credential_funding !== "forge" || !String(target.operation_id).startsWith(`${EXACT_TARGET.operationPrefix}:`) ||
    Number(target.amount_micros) !== EXACT_TARGET.estimatedMicros || target.evidence_status !== "estimated" || target.obligation_status !== "open" ||
    Number(target.reserved_customer_charge_micros) !== 0 || Number(target.input_units) !== EXACT_TARGET.inputTokens ||
    Number(target.cached_input_units) !== EXACT_TARGET.cachedInputTokens || Number(target.output_units) !== EXACT_TARGET.outputTokens ||
    target.provider_reported !== true || target.result_validated !== true || target.canonical_persistence_confirmed !== true
  ) fail("target_financial_state_changed");
  const recordedAt = Date.parse(target.recorded_at);
  if (recordedAt < EXACT_TARGET.startTime * 1000 || recordedAt >= EXACT_TARGET.endTime * 1000) fail("target_usage_window");
  if (
    state.verified_zero_support !== true || Number(state.owner_consumption_count) !== 1 ||
    Number(state.owner_consumption_micros) !== EXACT_TARGET.estimatedMicros ||
    Number(state.owner_expense_journal_micros) !== EXACT_TARGET.estimatedMicros ||
    Number(state.cash_clearing_journal_micros) !== -EXACT_TARGET.estimatedMicros ||
    Number(state.customer_charge_micros) !== 0 || Number(state.latest_exposure_micros) !== EXACT_TARGET.retainedExposureMicros
  ) fail("financial_precondition_changed");
  if (
    Number(state.existing_allocations) !== 0 || Number(state.existing_supplier_adjustments) !== 0 ||
    Number(state.existing_obligation_settlements) !== 0 || Number(state.existing_budget_adjustments) !== 0
  ) fail("target_already_reconciled");
  if (evidence.totalCostMicros !== 0) fail("supplier_total_changed");
  return true;
}

export async function executeExactTargetReconciliation({ evidence, fetchImpl = fetch, supabaseUrl, serviceRoleKey, authorization }) {
  const expectedAuthorization = `owner-authorized:${evidence.batchId}:${EXACT_TARGET.supplierExpenseId}`;
  if (authorization !== expectedAuthorization) fail("write_not_authorized");
  return recordOpenAiOrganizationEvidence({
    fetchImpl,
    supabaseUrl,
    serviceRoleKey,
    evidence,
    periodStart: EXACT_TARGET.startTime,
    periodEnd: EXACT_TARGET.endTime,
  });
}
