import { createHash, randomUUID } from "node:crypto";

const cleanBase = (value) => String(value || "").replace(/\/$/, "");
const sha256 = (value) => createHash("sha256").update(String(value)).digest("hex");

async function responseJson(response) {
  try { return await response.json(); } catch { return null; }
}

export async function readDraftCatalog({ fetchImpl = fetch, supabaseUrl, serviceRoleKey }) {
  if (!supabaseUrl || !serviceRoleKey) throw new Error("supabase_service_credentials_required");
  const headers = { apikey: serviceRoleKey, authorization: `Bearer ${serviceRoleKey}`, "accept-profile": "tongs" };
  const revisionsResponse = await fetchImpl(`${cleanBase(supabaseUrl)}/rest/v1/openai_text_model_catalog_revisions?select=id,revision&lifecycle_state=in.(draft,active)&order=lifecycle_state.asc,revision.desc&limit=1`, { headers });
  if (!revisionsResponse.ok) throw new Error(`model_catalog_read_${revisionsResponse.status}`);
  const revisions = await revisionsResponse.json();
  const catalog = Array.isArray(revisions) ? revisions[0] : null;
  if (!catalog?.id) throw new Error("model_catalog_unavailable");
  const entriesResponse = await fetchImpl(`${cleanBase(supabaseUrl)}/rest/v1/openai_text_model_catalog_entries?select=id,provider_model_id,lifecycle_state&catalog_revision_id=eq.${encodeURIComponent(catalog.id)}&lifecycle_state=eq.candidate&order=quality_rank.desc`, { headers });
  if (!entriesResponse.ok) throw new Error(`model_catalog_entries_read_${entriesResponse.status}`);
  const entries = await entriesResponse.json();
  if (!Array.isArray(entries) || entries.length === 0) throw new Error("model_catalog_candidates_unavailable");
  return { ...catalog, entries };
}

export async function verifyAndRecordOpenAiModelVisibility({
  fetchImpl = fetch, openAiKey, openAiProjectId, supabaseUrl, serviceRoleKey, checkedAt = new Date(), invocationId = randomUUID(),
}) {
  if (!openAiKey) throw new Error("OPENAI_MODEL_EVIDENCE_API_KEY_required");
  if (!openAiProjectId) throw new Error("OPENAI_MODEL_EVIDENCE_PROJECT_ID_required_for_project_bound_evidence");
  const catalog = await readDraftCatalog({ fetchImpl, supabaseUrl, serviceRoleKey });
  const projectFingerprint = sha256(`openai-project:${openAiProjectId}`);
  const observations = [];
  for (const entry of catalog.entries) {
    const modelId = String(entry.provider_model_id);
    const response = await fetchImpl(`https://api.openai.com/v1/models/${encodeURIComponent(modelId)}`, {
      method: "GET",
      headers: { authorization: `Bearer ${openAiKey}`, "openai-project": openAiProjectId },
    });
    const body = response.ok ? await responseJson(response) : (await response.arrayBuffer(), null);
    const returnedId = typeof body?.id === "string" ? body.id : null;
    const owner = typeof body?.owned_by === "string" ? body.owned_by : null;
    const visible = response.status === 200 && returnedId === modelId;
    const observation = {
      model: modelId, visible, http_status: response.status, checked_at: checkedAt.toISOString(),
      project_fingerprint: projectFingerprint, check_kind: "model_visibility_only",
      api_parameter_compatibility: "not_tested", fixture_compatibility: "separate_catalog_evidence",
      generation_compatibility: "not_tested", generation_or_billable_request_made: false,
    };
    const recordResponse = await fetchImpl(`${cleanBase(supabaseUrl)}/rest/v1/rpc/record_openai_text_model_visibility`, {
      method: "POST",
      headers: { apikey: serviceRoleKey, authorization: `Bearer ${serviceRoleKey}`, "content-type": "application/json", "content-profile": "tongs", "accept-profile": "tongs" },
      body: JSON.stringify({
        p_id: randomUUID(), p_source_key: `openai-model-visibility:${catalog.id}:${invocationId}:${modelId}`,
        p_catalog_revision_id: catalog.id, p_catalog_entry_id: entry.id,
        p_provider_project_fingerprint: projectFingerprint, p_provider_model_id: modelId,
        p_checked_at: checkedAt.toISOString(), p_http_status: response.status, p_visible: visible,
        p_returned_model_id: returnedId, p_provider_owner_label: owner,
        p_sanitized_evidence_json: { endpoint: "GET /v1/models/{model}", generation_or_billable_request_made: false },
      }),
    });
    if (!recordResponse.ok) throw new Error(`model_visibility_record_${recordResponse.status}`);
    observations.push(observation);
  }
  return { ok: observations.every((item) => item.visible), catalog_revision_id: catalog.id, catalog_revision: catalog.revision, checked_at: checkedAt.toISOString(), project_fingerprint: projectFingerprint, observations };
}
