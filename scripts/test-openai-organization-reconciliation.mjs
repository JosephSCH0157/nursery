import test from "node:test";
import assert from "node:assert/strict";
import { collectOpenAiOrganizationEvidence, normalizeOpenAiOrganizationEvidence, recordOpenAiOrganizationEvidence } from "./lib/openai-organization-reconciliation.mjs";

const costsPage = {
  data: [{ start_time: 100, end_time: 200, results: [
    { amount: { value: 0.010668, currency: "usd" }, project_id: "proj", api_key_id: "key", line_item: "gpt-5.3-chat-latest, input_tokens", quantity: 2000, quantity_unit: "tokens" },
  ] }], has_more: false, next_page: null,
};
const usagePage = {
  data: [{ start_time: 100, end_time: 200, results: [
    { model: "gpt-5.3-chat-latest", project_id: "proj", api_key_id: "key", input_tokens: 2000, input_cached_tokens: 0, output_tokens: 512, num_model_requests: 1 },
  ] }], has_more: false, next_page: null,
};

test("normalizes authoritative aggregate cost separately from token usage evidence", () => {
  const result = normalizeOpenAiOrganizationEvidence({ costsPages: [costsPage], usagePages: [usagePage], periodStart: 100, periodEnd: 200 });
  assert.equal(result.totalCostMicros, 10668);
  assert.equal(result.costBuckets[0].amount_micros, 10668);
  assert.equal(result.usageBuckets[0].output_tokens, 512);
  assert.equal(result.rawEvidence.operation_allocation_status, "unresolved");
});

test("fetches Costs and Usage with their exact grouping dimensions", async () => {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(String(url));
    return { ok: true, async json() { return String(url).includes("/costs") ? costsPage : usagePage; } };
  };
  const result = await collectOpenAiOrganizationEvidence({ fetchImpl, adminKey: "admin-test", projectId: "proj", periodStart: 100, periodEnd: 200 });
  assert.equal(result.totalCostMicros, 10668);
  assert.ok(urls.some((url) => url.includes("%2Forganization%2Fcosts") === false && url.includes("/organization/costs")));
  assert.ok(urls.every((url) => url.includes("group_by=")));
  assert.ok(urls.every((url) => url.includes("project_ids=proj")));
  assert.deepEqual(result.rawEvidence.project_scope, ["proj"]);
});

test("rejects unscoped or overly broad historical collection", async () => {
  await assert.rejects(collectOpenAiOrganizationEvidence({ adminKey: "admin-test", periodStart: 100, periodEnd: 200 }), /OPENAI_RECONCILIATION_PROJECT_ID_required/);
  await assert.rejects(collectOpenAiOrganizationEvidence({ adminKey: "admin-test", projectId: "proj", periodStart: 100, periodEnd: 100 + 32 * 86400 }), /exceeds_31_days/);
});

test("records through the tongs profile without exposing the service credential", async () => {
  let request;
  const fetchImpl = async (url, init) => {
    request = { url, init };
    return { ok: true, async json() { return { replay: false }; } };
  };
  const evidence = normalizeOpenAiOrganizationEvidence({ costsPages: [costsPage], usagePages: [usagePage], periodStart: 100, periodEnd: 200 });
  await recordOpenAiOrganizationEvidence({ fetchImpl, supabaseUrl: "https://project.supabase.co", serviceRoleKey: "secret-test-role", evidence, periodStart: 100, periodEnd: 200 });
  assert.equal(request.init.headers["content-profile"], "tongs");
  assert.equal(request.init.headers["accept-profile"], "tongs");
  assert.equal(request.url, "https://project.supabase.co/rest/v1/rpc/record_openai_organization_reconciliation");
  assert.equal(JSON.stringify(JSON.parse(request.init.body)).includes("secret-test-role"), false);
});
