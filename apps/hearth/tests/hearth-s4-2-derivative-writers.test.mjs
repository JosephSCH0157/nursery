import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (relative) => readFileSync(new URL(`../src/${relative}`, import.meta.url), "utf8");

test("new B-roll and Reference Clip package writes consume exact production-script basis", () => {
  const source = read("hooks/visuals/useVisualsPersistence.ts");
  assert.match(source, /readTongsProductionScriptDerivativeBasis\(workspace, episodeId\)/);
  assert.match(source, /broll_plan:[\s\S]*script_derivative_basis: derivativeBasis/);
  assert.match(source, /cdc_plan:[\s\S]*script_derivative_basis: derivativeBasis/);
  assert.doesNotMatch(source, /readTongsCanonicalApprovedScript/);
});

test("manual URLs and positional stock results cannot manufacture production asset identity", () => {
  const broll = read("hooks/visuals/useBrollBridgeActions.ts");
  const reference = read("hooks/visuals/useReferenceClipBridgeActions.ts");
  const actionability = read("lib/hearth-visual-actionability.ts");
  assert.doesNotMatch(broll, /createManualResultCandidate/);
  assert.doesNotMatch(reference, /createManualResultCandidate/);
  assert.doesNotMatch(actionability, /broll-manual-result|reference-manual-result/);
  assert.doesNotMatch(broll, /selected_asset_id:\s*stockCandidates\[0\]/);
  assert.match(broll, /"result_unregistered"/);
  assert.match(reference, /"result_unregistered"/);
});

test("Tongs replaces Image Map client request IDs before canonical persistence", () => {
  const source = readFileSync(new URL("../../../packages/tongs/src/workpiece-commit-api.ts", import.meta.url), "utf8");
  assert.match(source, /canonicalAssetIdsByClientRequestId/);
  assert.match(source, /const assetId = randomUuid\(\)/);
  assert.match(source, /client_request_id: candidate\.asset_id/);
  assert.match(source, /entries: authoritativeEntries/);
  assert.doesNotMatch(source, /const assetId = normalizeUuid\(candidate\.asset_id, "candidate_asset_id"\)/);
});

test("Image Map production selection consumes Tongs readiness instead of URL or local inference", () => {
  const source = read("lib/hearth-image-map-repo.ts");
  assert.match(source, /assets\/\$\{encodeURIComponent\(args\.candidateAssetId\)\}\/resolve-authority/);
  assert.match(source, /authority\?\.state !== "ready"/);
  assert.match(source, /required_asset_kind: "image_map_candidate_image"/);
});

test("legacy generic B-roll upload cannot return its client request ID as canonical authority", () => {
  const source = read("lib/hearth-broll-plan-repo.ts");
  assert.match(source, /Tongs did not issue canonical asset authority/);
  assert.doesNotMatch(source, /ok: true,\s*candidateAsset: ingestedCandidate/);
});
