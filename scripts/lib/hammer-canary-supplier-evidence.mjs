import { createHash } from "node:crypto";
import { mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export const EVIDENCE_WINDOW = Object.freeze({
  startIso: "2026-10-07T00:00:00.000Z",
  endIso: "2026-10-08T00:00:00.000Z",
  startTime: 1_791_331_200,
  endTime: 1_791_417_600,
});

export const CANARY_USAGE_ANCHOR = Object.freeze({
  model: "gpt-5.4-mini",
  serviceTier: "standard",
  requestCount: 1,
  inputTokens: 118,
  cachedInputTokens: 0,
  outputTokens: 35,
});

const API_ORIGIN = "https://api.openai.com";
const ALLOWED_PATHS = new Set([
  "/v1/organization/usage/completions",
  "/v1/organization/costs",
]);
const MAX_PAGES = 100;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function fingerprint(value) {
  return typeof value === "string" && value.length > 0
    ? `sha256:${sha256(value).slice(0, 16)}`
    : null;
}

function requiredObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label}_invalid`);
  return value;
}

function integer(value, label) {
  if (!Number.isSafeInteger(value)) throw new Error(`${label}_invalid`);
  return value;
}

function nonNegativeInteger(value, label) {
  const parsed = Number(value ?? 0);
  if (!Number.isSafeInteger(parsed) || parsed < 0)
    throw new Error(`${label}_invalid`);
  return parsed;
}

function appendParameters(url, parameters) {
  for (const [name, rawValue] of Object.entries(parameters)) {
    for (const value of Array.isArray(rawValue) ? rawValue : [rawValue]) {
      url.searchParams.append(name, String(value));
    }
  }
}

function allowlistedResponseHeaders(headers) {
  const result = {};
  for (const name of [
    "date",
    "openai-organization",
    "openai-project",
    "x-request-id",
  ]) {
    const value = headers.get(name);
    if (value) result[name] = value;
  }
  return result;
}

function validatePage(payload, label) {
  requiredObject(payload, label);
  if (!Array.isArray(payload.data)) throw new Error(`${label}_data_invalid`);
  if (typeof payload.has_more !== "boolean")
    throw new Error(`${label}_has_more_invalid`);
  if (
    payload.has_more &&
    (typeof payload.next_page !== "string" || payload.next_page.length === 0)
  ) {
    throw new Error(`${label}_next_page_missing`);
  }
  return payload;
}

export async function fetchReadOnlyPages({
  fetchImpl = fetch,
  adminKey,
  path,
  parameters,
}) {
  if (typeof adminKey !== "string" || adminKey.length === 0) {
    throw new Error("OPENAI_RECONCILIATION_ADMIN_KEY_required");
  }
  if (!ALLOWED_PATHS.has(path))
    throw new Error("openai_evidence_endpoint_not_allowed");

  const pages = [];
  const seenCursors = new Set();
  let cursor = null;

  for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex += 1) {
    const url = new URL(path, API_ORIGIN);
    appendParameters(url, parameters);
    if (cursor) url.searchParams.set("page", cursor);

    const response = await fetchImpl(url, {
      method: "GET",
      headers: {
        authorization: `Bearer ${adminKey}`,
        accept: "application/json",
      },
      redirect: "error",
    });
    if (!response.ok)
      throw new Error(`openai_supplier_evidence_http_${response.status}`);

    const rawBody = await response.text();
    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      throw new Error("openai_supplier_evidence_json_invalid");
    }
    validatePage(payload, `openai_supplier_evidence_page_${pageIndex + 1}`);
    pages.push({
      request: {
        method: "GET",
        url: url.toString(),
      },
      response: {
        status: response.status,
        headers: allowlistedResponseHeaders(response.headers),
        raw_body: rawBody,
      },
    });

    if (!payload.has_more) return pages;
    cursor = payload.next_page;
    if (seenCursors.has(cursor))
      throw new Error("openai_supplier_evidence_pagination_cycle");
    seenCursors.add(cursor);
  }
  throw new Error("openai_supplier_evidence_page_limit_exceeded");
}

export function evidenceQueries(projectId) {
  if (typeof projectId !== "string" || projectId.trim().length === 0) {
    throw new Error("OPENAI_RECONCILIATION_PROJECT_ID_required");
  }
  const projectIds = [projectId.trim()];
  return Object.freeze({
    usage: Object.freeze({
      path: "/v1/organization/usage/completions",
      parameters: Object.freeze({
        start_time: EVIDENCE_WINDOW.startTime,
        end_time: EVIDENCE_WINDOW.endTime,
        bucket_width: "1m",
        limit: 1440,
        project_ids: projectIds,
        group_by: [
          "project_id",
          "api_key_id",
          "model",
          "service_tier",
          "batch",
          "api_source",
        ],
      }),
    }),
    costs: Object.freeze({
      path: "/v1/organization/costs",
      parameters: Object.freeze({
        start_time: EVIDENCE_WINDOW.startTime,
        end_time: EVIDENCE_WINDOW.endTime,
        bucket_width: "1d",
        limit: 1,
        project_ids: projectIds,
        group_by: ["project_id", "api_key_id", "line_item", "api_source"],
      }),
    }),
  });
}

function parsedPages(pages, label) {
  return pages.map((page, index) => {
    const payload = JSON.parse(page.response.raw_body);
    return validatePage(payload, `${label}_${index + 1}`);
  });
}

function flattenResults(pages, label) {
  const rows = [];
  const buckets = [];
  for (const payload of parsedPages(pages, label)) {
    for (const rawBucket of payload.data) {
      const bucket = requiredObject(rawBucket, `${label}_bucket`);
      const startTime = integer(bucket.start_time, `${label}_bucket_start`);
      const endTime = integer(bucket.end_time, `${label}_bucket_end`);
      if (!Array.isArray(bucket.results))
        throw new Error(`${label}_bucket_results_invalid`);
      buckets.push({ startTime, endTime });
      for (const rawResult of bucket.results) {
        rows.push({
          bucket_start_time: startTime,
          bucket_end_time: endTime,
          ...requiredObject(rawResult, `${label}_result`),
        });
      }
    }
  }
  return { rows, buckets };
}

function unique(values) {
  return [
    ...new Set(
      values.filter(
        (value) => value !== null && value !== undefined && value !== "",
      ),
    ),
  ].sort();
}

function summarizeUsage(rows, projectId) {
  const normalized = rows.map((row) => ({
    project_id: row.project_id ?? null,
    api_key_id: row.api_key_id ?? null,
    model: row.model ?? null,
    service_tier: row.service_tier ?? null,
    batch: row.batch ?? null,
    api_source: row.api_source ?? null,
    input_tokens: nonNegativeInteger(row.input_tokens, "usage_input_tokens"),
    cached_input_tokens: nonNegativeInteger(
      row.input_cached_tokens,
      "usage_cached_input_tokens",
    ),
    output_tokens: nonNegativeInteger(row.output_tokens, "usage_output_tokens"),
    request_count: nonNegativeInteger(
      row.num_model_requests,
      "usage_request_count",
    ),
  }));
  const candidates = normalized.filter(
    (row) =>
      row.model === CANARY_USAGE_ANCHOR.model &&
      row.service_tier === CANARY_USAGE_ANCHOR.serviceTier,
  );
  const totals = candidates.reduce(
    (sum, row) => ({
      request_count: sum.request_count + row.request_count,
      input_tokens: sum.input_tokens + row.input_tokens,
      cached_input_tokens: sum.cached_input_tokens + row.cached_input_tokens,
      output_tokens: sum.output_tokens + row.output_tokens,
    }),
    {
      request_count: 0,
      input_tokens: 0,
      cached_input_tokens: 0,
      output_tokens: 0,
    },
  );
  const anchorMatches =
    totals.request_count === CANARY_USAGE_ANCHOR.requestCount &&
    totals.input_tokens === CANARY_USAGE_ANCHOR.inputTokens &&
    totals.cached_input_tokens === CANARY_USAGE_ANCHOR.cachedInputTokens &&
    totals.output_tokens === CANARY_USAGE_ANCHOR.outputTokens;
  return {
    target_totals: totals,
    known_canary_anchor_matches: anchorMatches,
    target_api_key_ids: unique(candidates.map((row) => row.api_key_id)),
    observed_api_key_ids: unique(normalized.map((row) => row.api_key_id)),
    observed_models: unique(normalized.map((row) => row.model)),
    observed_service_tiers: unique(normalized.map((row) => row.service_tier)),
    project_rows_match_requested_project: normalized.every(
      (row) => row.project_id === projectId,
    ),
    unrelated_request_count_in_project:
      normalized.reduce((sum, row) => sum + row.request_count, 0) -
      totals.request_count,
  };
}

function summarizeCosts(rows, projectId, targetApiKeyIds) {
  const normalized = rows.map((row) => {
    const amount = requiredObject(row.amount, "cost_amount");
    const amountValue = Number(amount.value);
    if (!Number.isFinite(amountValue) || amountValue < 0)
      throw new Error("cost_amount_value_invalid");
    return {
      project_id: row.project_id ?? null,
      api_key_id: row.api_key_id ?? null,
      line_item: row.line_item ?? null,
      api_source: row.api_source ?? null,
      amount_value: amountValue,
      currency: String(amount.currency ?? "").toLowerCase(),
      quantity: row.quantity ?? null,
      quantity_unit: row.quantity_unit ?? null,
    };
  });
  if (normalized.some((row) => row.currency !== "usd"))
    throw new Error("cost_currency_unsupported");
  const targetKeySet = new Set(targetApiKeyIds);
  const targetKeyRows = normalized.filter((row) =>
    targetKeySet.has(row.api_key_id),
  );
  return {
    total_usd: normalized.reduce((sum, row) => sum + row.amount_value, 0),
    target_api_key_total_usd: targetKeyRows.reduce(
      (sum, row) => sum + row.amount_value,
      0,
    ),
    row_count: normalized.length,
    target_api_key_row_count: targetKeyRows.length,
    observed_api_key_ids: unique(normalized.map((row) => row.api_key_id)),
    line_items: unique(normalized.map((row) => row.line_item)),
    project_rows_match_requested_project: normalized.every(
      (row) => row.project_id === projectId,
    ),
    model_level_attribution_available: false,
    model_level_attribution_note:
      "The Costs API contract does not expose model or service_tier grouping; line_item text is preserved but is not treated as model authority.",
  };
}

function summarizeBucketCoverage(usageBuckets, costBuckets) {
  const expectedUsage = new Set();
  for (
    let cursor = EVIDENCE_WINDOW.startTime;
    cursor < EVIDENCE_WINDOW.endTime;
    cursor += 60
  ) {
    expectedUsage.add(`${cursor}:${cursor + 60}`);
  }
  const actualUsage = new Set(
    usageBuckets.map((bucket) => `${bucket.startTime}:${bucket.endTime}`),
  );
  const costExact =
    costBuckets.length === 1 &&
    costBuckets[0].startTime === EVIDENCE_WINDOW.startTime &&
    costBuckets[0].endTime === EVIDENCE_WINDOW.endTime;
  return {
    expected_usage_bucket_count: expectedUsage.size,
    observed_usage_bucket_count: actualUsage.size,
    usage_bucket_coverage_complete:
      actualUsage.size === expectedUsage.size &&
      [...expectedUsage].every((key) => actualUsage.has(key)),
    cost_bucket_exact_for_window: costExact,
  };
}

function responseIdentity(pages) {
  const organizations = unique(
    pages.map((page) => page.response.headers["openai-organization"]),
  );
  const projects = unique(
    pages.map((page) => page.response.headers["openai-project"]),
  );
  return { organizations, projects };
}

export function analyzeEvidence({ usagePages, costPages, projectId }) {
  const usage = flattenResults(usagePages, "usage");
  const costs = flattenResults(costPages, "costs");
  const usageSummary = summarizeUsage(usage.rows, projectId);
  const costSummary = summarizeCosts(
    costs.rows,
    projectId,
    usageSummary.target_api_key_ids,
  );
  const bucketCoverage = summarizeBucketCoverage(usage.buckets, costs.buckets);
  const identities = responseIdentity([...usagePages, ...costPages]);
  const collectionComplete =
    bucketCoverage.usage_bucket_coverage_complete &&
    bucketCoverage.cost_bucket_exact_for_window;
  const unrelatedTrafficObserved =
    usageSummary.unrelated_request_count_in_project > 0 ||
    costSummary.target_api_key_row_count !== costSummary.row_count;
  return {
    collection_status: collectionComplete ? "complete" : "incomplete",
    attribution_status: usageSummary.known_canary_anchor_matches
      ? "usage_anchor_matched_cost_requires_aggregate_review"
      : "usage_anchor_not_uniquely_matched",
    window: EVIDENCE_WINDOW,
    organization_identity: {
      response_header_fingerprints: identities.organizations.map(fingerprint),
      credential_scope_only: identities.organizations.length === 0,
    },
    project_identity: {
      requested_project_fingerprint: fingerprint(projectId),
      response_header_fingerprints: identities.projects.map(fingerprint),
    },
    usage: usageSummary,
    costs: {
      ...costSummary,
      unrelated_traffic_sharing_bucket_status: unrelatedTrafficObserved
        ? "observed"
        : "not_observed_but_not_excluded_at_daily_cost_granularity",
      exact_canary_cost_attribution_established: false,
    },
    bucket_completeness: bucketCoverage,
    page_completeness: {
      usage_pages: usagePages.length,
      cost_pages: costPages.length,
      all_page_chains_terminated: true,
    },
  };
}

function redactedSummary(analysis) {
  const apiKeyFingerprints = analysis.usage.target_api_key_ids.map(fingerprint);
  const cost = analysis.costs;
  const usage = analysis.usage;
  return (
    `# Hammer 6C supplier evidence\n\n` +
    `- Window: ${EVIDENCE_WINDOW.startIso} through ${EVIDENCE_WINDOW.endIso} (exclusive)\n` +
    `- Collection status: ${analysis.collection_status}\n` +
    `- Attribution status: ${analysis.attribution_status}\n` +
    `- Organization: ${analysis.organization_identity.response_header_fingerprints.join(", ") || "credential-scoped; response header unavailable"}\n` +
    `- Project: ${analysis.project_identity.requested_project_fingerprint}\n` +
    `- Target API key identities: ${apiKeyFingerprints.join(", ") || "none observed"}\n` +
    `- Target model/service tier: ${CANARY_USAGE_ANCHOR.model} / ${CANARY_USAGE_ANCHOR.serviceTier}\n` +
    `- Target usage: ${usage.target_totals.request_count} request(s), ${usage.target_totals.input_tokens} input, ${usage.target_totals.cached_input_tokens} cached input, ${usage.target_totals.output_tokens} output tokens\n` +
    `- Known canary anchor matched: ${usage.known_canary_anchor_matches}\n` +
    `- Other project request count in the interval: ${usage.unrelated_request_count_in_project}\n` +
    `- Supplier cost rows: ${cost.row_count}; total: ${cost.total_usd.toFixed(12)} USD\n` +
    `- Target-key supplier cost rows: ${cost.target_api_key_row_count}; total: ${cost.target_api_key_total_usd.toFixed(12)} USD\n` +
    `- Cost-bucket unrelated traffic: ${cost.unrelated_traffic_sharing_bucket_status}\n` +
    `- Model-level cost attribution: unavailable from the Costs API contract\n` +
    `- Usage bucket coverage: ${analysis.bucket_completeness.observed_usage_bucket_count}/${analysis.bucket_completeness.expected_usage_bucket_count}\n` +
    `- Cost bucket exactly matches interval: ${analysis.bucket_completeness.cost_bucket_exact_for_window}\n\n` +
    `This collection is evidence only. It performs no reconciliation and makes no accounting decision.\n`
  );
}

function assertSecretAbsent(text, adminKey) {
  if (text.includes(adminKey))
    throw new Error("supplier_evidence_secret_leak_detected");
}

export async function collectEvidence({
  fetchImpl = fetch,
  adminKey,
  projectId,
}) {
  const queries = evidenceQueries(projectId);
  const [usagePages, costPages] = await Promise.all([
    fetchReadOnlyPages({ fetchImpl, adminKey, ...queries.usage }),
    fetchReadOnlyPages({ fetchImpl, adminKey, ...queries.costs }),
  ]);
  const rawEvidence = {
    schema_version: 1,
    source: "OpenAI organization Usage and Costs APIs",
    collected_at: new Date().toISOString(),
    window: EVIDENCE_WINDOW,
    api_contract: {
      usage: { method: "GET", ...queries.usage },
      costs: { method: "GET", ...queries.costs },
      costs_model_attribution: "not_available",
    },
    usage_pages: usagePages,
    cost_pages: costPages,
  };
  const analysis = analyzeEvidence({
    usagePages,
    costPages,
    projectId: projectId.trim(),
  });
  const rawJson = `${JSON.stringify(rawEvidence, null, 2)}\n`;
  const summary = redactedSummary(analysis);
  assertSecretAbsent(rawJson, adminKey);
  assertSecretAbsent(summary, adminKey);
  if (summary.includes(projectId.trim()))
    throw new Error("supplier_evidence_project_id_in_summary");
  return { rawJson, summary, analysis };
}

export async function writeEvidenceArtifacts({
  outputDirectory,
  rawJson,
  summary,
  analysis,
}) {
  if (typeof outputDirectory !== "string" || outputDirectory.length === 0)
    throw new Error("supplier_evidence_output_directory_required");
  const parent = dirname(outputDirectory);
  await mkdir(parent, { recursive: true, mode: 0o700 });
  try {
    const existing = await readdir(outputDirectory);
    if (existing.length > 0)
      throw new Error("supplier_evidence_output_directory_not_empty");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const staging = `${outputDirectory}.staging-${process.pid}-${Date.now()}`;
  await mkdir(staging, { recursive: false, mode: 0o700 });
  try {
    const rawDigest = sha256(rawJson);
    const summaryDigest = sha256(summary);
    const manifest = `${JSON.stringify(
      {
        schema_version: 1,
        evidence_purpose: "hammer_6c_supplier_evidence_only",
        reconciliation_authorized: false,
        analysis,
        files: {
          "raw-openai-evidence.json": { sha256: rawDigest },
          "SUMMARY.md": { sha256: summaryDigest },
        },
      },
      null,
      2,
    )}\n`;
    const manifestDigest = sha256(manifest);
    const checksums = `${rawDigest}  raw-openai-evidence.json\n${summaryDigest}  SUMMARY.md\n${manifestDigest}  evidence-manifest.json\n`;
    await Promise.all([
      writeFile(join(staging, "raw-openai-evidence.json"), rawJson, {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx",
      }),
      writeFile(join(staging, "SUMMARY.md"), summary, {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx",
      }),
      writeFile(join(staging, "evidence-manifest.json"), manifest, {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx",
      }),
      writeFile(join(staging, "SHA256SUMS"), checksums, {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx",
      }),
    ]);
    await rename(staging, outputDirectory);
    return { rawDigest, summaryDigest, manifestDigest };
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}
