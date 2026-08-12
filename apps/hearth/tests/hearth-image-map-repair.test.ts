import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { repairWorkpieceImageMapAuthority } from "../src/lib/hearth-image-map-authority";
import { normalizeWorkpieceImageMapView } from "../src/lib/hearth-image-map-repo";

const workpieceId = "11111111-1111-4111-8111-111111111111";
const workspaceId = "22222222-2222-4222-8222-222222222222";
const revisionId = "33333333-3333-4333-8333-333333333333";
const approvalId = "44444444-4444-4444-8444-444444444444";
const candidateId = "55555555-5555-4555-8555-555555555555";

test("an unresolved automatic repair opens the standard manual passage picker", async () => {
  const [actions, panel] = await Promise.all([
    readFile(new URL("../src/hooks/visuals/useImageMapReanchorActions.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/components/visuals/ImageMapPanel.tsx", import.meta.url), "utf8"),
  ]);
  const failedRepair = actions.slice(actions.indexOf("if (!result.ok)"), actions.indexOf("} else {", actions.indexOf("if (!result.ok)")));
  assert.match(failedRepair, /setIsImageMapReanchorMode\(true\)/);
  assert.match(failedRepair, /setShowScriptPanel\(true\)/);
  assert.match(panel, /aria-label="Choose approved script passage"/);
  assert.match(panel, /onPickReanchor\(paragraph\.paragraphOption\.selection\)/);
  assert.match(panel, /onPickReanchor\(option\.selection\)/);
});

function installBrowserAuthContext() {
  const storage = new Map([["forge_tongs_api_token_v1", "DEV_TOKEN"]]);
  const localStorageLike = {
    getItem: (key: string) => storage.get(key) ?? null,
    key: (index: number) => Array.from(storage.keys())[index] ?? null,
    get length() { return storage.size; },
  };
  Object.defineProperty(globalThis, "window", { value: { localStorage: localStorageLike, location: { search: "" } }, configurable: true });
}

function entry(state: "unresolved" | "current") {
  return {
    id: "moment-01",
    anchor: "It was everywhere.",
    script_anchor: state === "current" ? {
      section_id: "s1", paragraph_id: "s1:p1", paragraph_order: 1,
      sentence_start: 1, sentence_end: 1, char_start: 0, char_end: 18,
      span_text: "It was everywhere.", speaker_block_id: null,
    } : null,
    anchor_scope: "attached",
    purpose: "context",
    description: "Orange groves",
    visual_intent: "Show the historic scale",
    prompt_basis: "Orange groves across Florida",
    intent: "cutaway",
    source_type: "ai",
    origin: "hearth",
    visual_priority: "supporting",
    visual_type: "still_image",
    section_intent_note: null,
    beat_order: 1,
    paragraph_beat_order: 1,
    candidate_assets: [{ asset_id: candidateId, path: "assets/orange.png", source: "upload" }],
    selected_asset_id: candidateId,
    status: "selected",
    canonical_anchor_assessment: {
      state,
      reason: state === "current" ? null : "exact_text_not_found",
      exact_anchor: state === "current" ? {
        section_id: "s1", paragraph_id: "s1:p1", paragraph_order: 1,
        sentence_start: 1, sentence_end: 1, char_start: 0, char_end: 18,
        span_text: "It was everywhere.", speaker_block_id: null,
      } : null,
      evidence: { match_count: state === "current" ? 1 : 0, assessed_contract_version: "forge.image-map-anchor.v1" },
    },
  };
}

function imageMapResponse(state: "unresolved" | "current", revision: number, id: string) {
  return {
    ok: true,
    data: {
      image_map: {
        workpiece_id: workpieceId,
        workspace_id: workspaceId,
        entries: [entry(state)],
        spoken_beats: [],
        authority_source: "canonical",
        image_map_revision_id: id,
        image_map_revision: revision,
        source_script_approval_id: approvalId,
        source_script_approval_revision: 3,
        provenance_state: state === "current" ? "current" : "unresolved",
      },
      asset: null,
    },
  };
}

test("single-moment repair sends exact canonical authority and preserves selection", async () => {
  installBrowserAuthContext();
  const normalizedFixture = normalizeWorkpieceImageMapView(imageMapResponse("current", 8, revisionId));
  assert.equal(normalizedFixture?.entries[0]?.canonical_anchor_assessment?.state, "current", JSON.stringify(normalizedFixture));
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; method: string; body: Record<string, unknown> | null }> = [];
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : null;
    requests.push({ url, method, body });
    if (url.endsWith("/image-map") && method === "GET") return Response.json(imageMapResponse("unresolved", 7, revisionId));
    if (url.endsWith("/script-approval")) return Response.json({ ok: true, data: { current_revision: 3, current_approval: { id: approvalId, approval_revision: 3 } } });
    if (url.endsWith("/image-map/repair")) return Response.json(imageMapResponse("current", 8, "66666666-6666-4666-8666-666666666666"));
    throw new Error(`Unexpected request: ${method} ${url}`);
  }) as typeof fetch;
  try {
    const result = await repairWorkpieceImageMapAuthority({ workpieceId, workspaceId, entryId: "moment-01" });
    assert.equal(result.ok, true, JSON.stringify(result));
    const repair = requests.find((request) => request.url.endsWith("/image-map/repair"));
    assert.deepEqual(repair?.body && {
      workspace_id: repair.body.workspace_id,
      entry_id: repair.body.entry_id,
      expected_current_revision: repair.body.expected_current_revision,
      expected_current_revision_id: repair.body.expected_current_revision_id,
      expected_script_approval_id: repair.body.expected_script_approval_id,
      expected_script_approval_revision: repair.body.expected_script_approval_revision,
    }, {
      workspace_id: workspaceId,
      entry_id: "moment-01",
      expected_current_revision: 7,
      expected_current_revision_id: revisionId,
      expected_script_approval_id: approvalId,
      expected_script_approval_revision: 3,
    });
    assert.match(String(repair?.body?.operation_id), /^forge:image-map:repair:[a-f0-9]{64}$/);
    if (result.ok) {
      assert.equal(result.imageMap.entries[0]?.canonical_anchor_assessment?.state, "current");
      assert.equal(result.imageMap.entries[0]?.selected_asset_id, candidateId);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("stale approved-script concurrency is visible and never becomes optimistic success", async () => {
  installBrowserAuthContext();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    if (url.endsWith("/image-map") && (init?.method ?? "GET") === "GET") return Response.json(imageMapResponse("unresolved", 7, revisionId));
    if (url.endsWith("/script-approval")) return Response.json({ ok: true, data: { current_revision: 3, current_approval: { id: approvalId, approval_revision: 3 } } });
    return Response.json({ ok: false, error: { code: "script_revision_conflict", message: "The approved script changed before this image moment could be repaired." } }, { status: 409 });
  }) as typeof fetch;
  try {
    const result = await repairWorkpieceImageMapAuthority({ workpieceId, workspaceId, entryId: "moment-01" });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "conflict");
      assert.match(result.error ?? "", /approved script changed/i);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
