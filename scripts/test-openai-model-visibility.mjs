import assert from "node:assert/strict";
import test from "node:test";
import { verifyAndRecordOpenAiModelVisibility } from "./lib/openai-model-visibility.mjs";

test("catalog-driven visibility check records sanitized project-bound evidence without generation", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).includes("model_catalog_revisions")) return Response.json([{ id: "29000000-0000-4000-8000-000000000001", revision: 1 }]);
    if (String(url).includes("model_catalog_entries")) return Response.json([{ id: "29000000-0000-4000-8000-000000000101", provider_model_id: "gpt-test", lifecycle_state: "candidate" }]);
    if (String(url).includes("api.openai.com/v1/models/")) return Response.json({ id: "gpt-test", owned_by: "openai" });
    if (String(url).includes("record_openai_text_model_visibility")) return Response.json({ replay: false });
    throw new Error(`unexpected request ${url}`);
  };
  const result = await verifyAndRecordOpenAiModelVisibility({ fetchImpl, openAiKey: "not-logged", openAiProjectId: "proj_test", supabaseUrl: "http://db.test", serviceRoleKey: "not-logged", checkedAt: new Date("2026-09-09T12:00:00Z"), invocationId: "run-1" });
  assert.equal(result.ok, true);
  assert.equal(result.observations[0].generation_or_billable_request_made, false);
  const modelCall = calls.find((call) => call.url.includes("api.openai.com"));
  assert.equal(modelCall.init.method, "GET");
  const recorded = JSON.parse(calls.find((call) => call.url.includes("record_openai_text_model_visibility")).init.body);
  assert.equal(recorded.p_provider_model_id, "gpt-test");
  assert.equal(recorded.p_sanitized_evidence_json.generation_or_billable_request_made, false);
  assert.equal(JSON.stringify(recorded).includes("not-logged"), false);
});

test("project identity is required before evidence can be persisted", async () => {
  await assert.rejects(verifyAndRecordOpenAiModelVisibility({ openAiKey: "key", supabaseUrl: "http://db.test", serviceRoleKey: "role" }), /OPENAI_MODEL_EVIDENCE_PROJECT_ID_required/);
});
