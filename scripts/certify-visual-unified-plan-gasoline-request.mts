import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { buildBoundedOpenAiProviderRequest } from "../packages/tongs/src/providers/bounded-provider-request.ts";
import {
  buildUnifiedVisualPlanProviderRequestBody,
  type UnifiedVisualSourceCatalogEntry,
} from "../packages/tongs/src/providers/unified-visual-plan-provider.ts";

const WORKSPACE_ID = "cc5478ff-37be-403e-824c-467fa7da061e";
const WORKPIECE_ID = "21d16d6a-905b-491e-8761-028789612ae5";
const APPROVAL_ID = "be87d40f-516b-4dcf-bd25-094b922cc682";
const APPROVAL_REVISION = 1;
const SCRIPT_HASH = "0d32f3762a1ee766cf43ab52568407123f1ede0d0de1d1a7114819c3cc6dedfe";
const MODEL = "gpt-5.6-luna";
const MAXIMUM_OUTPUT_TOKENS = 6_144;

function readLocalEnvironment(): Record<string, string> {
  const values: Record<string, string> = {};
  const source = readFileSync(resolve("apps/nursery/.env.local"), "utf8");
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2] ?? "";
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[match[1]!] = value;
  }
  return values;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function nonemptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

const localEnvironment = readLocalEnvironment();
const supabaseUrl = process.env.TONGS_SUPABASE_URL ?? localEnvironment.TONGS_SUPABASE_URL;
const serviceRoleKey = process.env.TONGS_SERVICE_ROLE_KEY ?? localEnvironment.TONGS_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) throw new Error("linked Supabase service configuration is unavailable");

const headers = {
  apikey: serviceRoleKey,
  authorization: `Bearer ${serviceRoleKey}`,
  "content-type": "application/json",
};
const approvalResponse = await fetch(
  `${supabaseUrl}/rest/v1/script_approval_revisions?id=eq.${APPROVAL_ID}&select=workspace_id,workpiece_id,approval_revision,script_content_hash,script_text`,
  { headers: { ...headers, "accept-profile": "tongs" } },
);
if (!approvalResponse.ok) throw new Error(`approval read failed (${approvalResponse.status})`);
const approvals = await approvalResponse.json() as unknown[];
const approval = asRecord(approvals[0]);
if (
  !approval
  || approval.workspace_id !== WORKSPACE_ID
  || approval.workpiece_id !== WORKPIECE_ID
  || approval.approval_revision !== APPROVAL_REVISION
  || approval.script_content_hash !== SCRIPT_HASH
) throw new Error("gasoline approval identity mismatch");
const scriptText = nonemptyString(approval.script_text);
if (!scriptText) throw new Error("approved gasoline script is empty");

const sourcesResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/read_workpiece_sources`, {
  method: "POST",
  headers: { ...headers, "content-profile": "tongs", "accept-profile": "tongs" },
  body: JSON.stringify({ p_workspace_id: WORKSPACE_ID, p_workpiece_id: WORKPIECE_ID }),
});
if (!sourcesResponse.ok) throw new Error(`source read failed (${sourcesResponse.status})`);
const sourcesRoot = asRecord(await sourcesResponse.json());
const sourceCatalog: UnifiedVisualSourceCatalogEntry[] = (
  sourcesRoot && Array.isArray(sourcesRoot.links) ? sourcesRoot.links : []
).flatMap((value) => {
  const entry = asRecord(value);
  const linkRevision = asRecord(entry?.link_revision);
  const sourceRevision = asRecord(entry?.source_revision);
  const linkId = nonemptyString(linkRevision?.id);
  const title = nonemptyString(sourceRevision?.title);
  const sourceType = nonemptyString(sourceRevision?.source_type);
  const canonicalUrl = nonemptyString(sourceRevision?.canonical_url);
  if (!linkId || !title || !sourceType || !canonicalUrl) return [];
  const provenance = asRecord(sourceRevision?.provenance_json) ?? {};
  return [{
    source_key: `src_${linkId.replaceAll("-", "")}`,
    title,
    publisher: nonemptyString(sourceRevision?.publisher),
    source_type: sourceType,
    canonical_url: canonicalUrl,
    user_supplied: provenance.user_supplied === true,
  }];
});

const bounded = await buildBoundedOpenAiProviderRequest({
  body: {
    ...buildUnifiedVisualPlanProviderRequestBody({
      scriptText,
      creatorDirection: null,
      generationScope: "full_media_plan",
      sourceCatalog,
      model: MODEL,
    }),
    max_output_tokens: MAXIMUM_OUTPUT_TOKENS,
  },
  model: MODEL,
  maximumOutputTokens: MAXIMUM_OUTPUT_TOKENS,
  maximumAttempts: 1,
  serviceTier: "standard",
});

console.log(JSON.stringify({
  workpiece_id: WORKPIECE_ID,
  approval_id: APPROVAL_ID,
  approval_revision: APPROVAL_REVISION,
  script_hash: SCRIPT_HASH,
  generation_scope: "full_media_plan",
  creator_direction: null,
  source_catalog_entries: sourceCatalog.length,
  model: MODEL,
  output_contract: "forge.unified-visual-plan-provider.v4",
  serialized_body_sha256: bounded.serializedBodySha256,
  serialized_bytes: bounded.serializedBytes,
  tokenizer_revision: bounded.tokenizerRevision,
  tokenizer_input_tokens: bounded.tokenizerInputTokens,
  protocol_overhead_tokens: bounded.protocolOverheadTokens,
  conservative_input_bound: bounded.boundedInputTokens,
  maximum_output_tokens: bounded.maximumOutputTokens,
  maximum_attempts: bounded.maximumAttempts,
}, null, 2));
