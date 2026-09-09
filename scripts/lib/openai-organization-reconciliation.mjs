import { createHash } from "node:crypto";

function requiredObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label}_invalid`);
  return value;
}

function nonNegativeInteger(value, label) {
  const number = Number(value ?? 0);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error(`${label}_invalid`);
  return number;
}

function usdToMicros(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error("openai_cost_amount_invalid");
  return Math.round(number * 1_000_000);
}

function stableHash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function uuidFromHash(hash) {
  const value = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
  return value;
}

export async function fetchOpenAiOrganizationPages({ fetchImpl = fetch, adminKey, path, parameters }) {
  if (!adminKey) throw new Error("OPENAI_RECONCILIATION_ADMIN_KEY_required");
  const pages = [];
  let page = null;
  do {
    const url = new URL(`https://api.openai.com/v1${path}`);
    for (const [key, raw] of Object.entries(parameters)) {
      for (const value of Array.isArray(raw) ? raw : [raw]) url.searchParams.append(key, String(value));
    }
    if (page) url.searchParams.set("page", page);
    const response = await fetchImpl(url, { headers: { authorization: `Bearer ${adminKey}`, "content-type": "application/json" } });
    if (!response.ok) throw new Error(`openai_organization_api_${response.status}`);
    const payload = requiredObject(await response.json(), "openai_organization_page");
    if (!Array.isArray(payload.data)) throw new Error("openai_organization_page_data_invalid");
    pages.push(payload);
    page = payload.has_more === true && typeof payload.next_page === "string" && payload.next_page ? payload.next_page : null;
  } while (page);
  return pages;
}

export function normalizeOpenAiOrganizationEvidence({ costsPages, usagePages, periodStart, periodEnd }) {
  const costBuckets = [];
  const usageBuckets = [];
  for (const page of costsPages) {
    for (const bucket of page.data) {
      for (const result of bucket.results ?? []) {
        const amount = requiredObject(result.amount, "openai_cost_amount");
        if (String(amount.currency ?? "").toLowerCase() !== "usd") throw new Error("openai_cost_currency_unsupported");
        const identity = [bucket.start_time, bucket.end_time, result.project_id ?? "", result.api_key_id ?? "", result.line_item ?? ""];
        costBuckets.push({
          bucket_key: stableHash(identity),
          project_id: result.project_id ?? null,
          api_key_id: result.api_key_id ?? null,
          line_item: result.line_item ?? null,
          amount_micros: usdToMicros(amount.value),
          evidence: { start_time: bucket.start_time, end_time: bucket.end_time, quantity: result.quantity ?? null, quantity_unit: result.quantity_unit ?? null },
        });
      }
    }
  }
  for (const page of usagePages) {
    for (const bucket of page.data) {
      for (const result of bucket.results ?? []) {
        const identity = [bucket.start_time, bucket.end_time, result.model ?? "", result.project_id ?? "", result.api_key_id ?? ""];
        usageBuckets.push({
          bucket_key: stableHash(identity),
          model: result.model ?? null,
          project_id: result.project_id ?? null,
          api_key_id: result.api_key_id ?? null,
          input_tokens: nonNegativeInteger(result.input_tokens, "openai_input_tokens"),
          cached_input_tokens: nonNegativeInteger(result.input_cached_tokens, "openai_cached_input_tokens"),
          output_tokens: nonNegativeInteger(result.output_tokens, "openai_output_tokens"),
          request_count: nonNegativeInteger(result.num_model_requests, "openai_request_count"),
          evidence: { start_time: bucket.start_time, end_time: bucket.end_time, service_tier: result.service_tier ?? null },
        });
      }
    }
  }
  costBuckets.sort((left, right) => left.bucket_key.localeCompare(right.bucket_key));
  usageBuckets.sort((left, right) => left.bucket_key.localeCompare(right.bucket_key));
  const totalCostMicros = costBuckets.reduce((sum, bucket) => sum + bucket.amount_micros, 0);
  if (!Number.isSafeInteger(totalCostMicros)) throw new Error("openai_cost_total_overflow");
  const evidenceHash = stableHash({ periodStart, periodEnd, costBuckets, usageBuckets });
  return {
    batchId: uuidFromHash(evidenceHash),
    sourceKey: `openai-costs:${periodStart}:${periodEnd}:${evidenceHash}`,
    totalCostMicros,
    costBuckets,
    usageBuckets,
    rawEvidence: {
      source: "OpenAI organization Costs and completions Usage APIs",
      evidence_hash: evidenceHash,
      cost_page_count: costsPages.length,
      usage_page_count: usagePages.length,
      operation_allocation_status: "unresolved",
    },
  };
}

export async function collectOpenAiOrganizationEvidence({ fetchImpl = fetch, adminKey, periodStart, periodEnd, projectId }) {
  if (!Number.isSafeInteger(periodStart) || !Number.isSafeInteger(periodEnd) || periodEnd <= periodStart) {
    throw new Error("openai_reconciliation_period_invalid");
  }
  if (periodEnd - periodStart > 31 * 24 * 60 * 60) throw new Error("openai_reconciliation_period_exceeds_31_days");
  if (typeof projectId !== "string" || !projectId.trim()) throw new Error("OPENAI_RECONCILIATION_PROJECT_ID_required");
  const projectIds = [projectId.trim()];
  const [costsPages, usagePages] = await Promise.all([
    fetchOpenAiOrganizationPages({
      fetchImpl, adminKey, path: "/organization/costs",
      parameters: { start_time: periodStart, end_time: periodEnd, bucket_width: "1d", limit: 31, project_ids: projectIds, group_by: ["project_id", "line_item", "api_key_id"] },
    }),
    fetchOpenAiOrganizationPages({
      fetchImpl, adminKey, path: "/organization/usage/completions",
      parameters: { start_time: periodStart, end_time: periodEnd, bucket_width: "1d", limit: 31, project_ids: projectIds, group_by: ["project_id", "api_key_id", "model"] },
    }),
  ]);
  const evidence = normalizeOpenAiOrganizationEvidence({ costsPages, usagePages, periodStart, periodEnd });
  evidence.rawEvidence.project_scope = [projectId.trim()];
  return evidence;
}

export async function recordOpenAiOrganizationEvidence({ fetchImpl = fetch, supabaseUrl, serviceRoleKey, evidence, periodStart, periodEnd }) {
  if (!supabaseUrl || !serviceRoleKey) throw new Error("supabase_service_credentials_required");
  const response = await fetchImpl(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/record_openai_organization_reconciliation`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
      "content-profile": "tongs",
      "accept-profile": "tongs",
    },
    body: JSON.stringify({
      p_batch_id: evidence.batchId,
      p_source_key: evidence.sourceKey,
      p_period_start: new Date(periodStart * 1000).toISOString(),
      p_period_end: new Date(periodEnd * 1000).toISOString(),
      p_currency: "USD",
      p_total_cost_micros: evidence.totalCostMicros,
      p_source_kind: "organization_costs_api",
      p_evidence_status: "confirmed",
      p_cost_buckets: evidence.costBuckets,
      p_usage_buckets: evidence.usageBuckets,
      p_raw_evidence_json: evidence.rawEvidence,
    }),
  });
  if (!response.ok) throw new Error(`supabase_openai_reconciliation_${response.status}:${await response.text()}`);
  return response.json();
}
