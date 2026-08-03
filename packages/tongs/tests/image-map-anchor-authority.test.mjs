import test from "node:test";
import assert from "node:assert/strict";
import { markEntriesProvenanceUnknown, repairEntriesAgainstApprovedScript, validateExactAnchorAgainstApprovedScript } from "../dist/image-map-anchor-authority.js";

const entry = (span) => ({ id: "moment-1", anchor: span, script_anchor: { section_id: "s1", paragraph_id: "s1:p1", paragraph_order: 1, sentence_start: 1, sentence_end: 1, char_start: 0, char_end: span.length, span_text: span }, candidate_assets: [{ asset_id: "asset-1" }], selected_asset_id: "asset-1" });

test("legacy maps are explicitly provenance unknown without losing editorial assets", () => {
  const [result] = markEntriesProvenanceUnknown([entry("Keep this")]);
  assert.equal(result.canonical_anchor_assessment.state, "provenance_unknown");
  assert.equal(result.selected_asset_id, "asset-1");
  assert.deepEqual(result.candidate_assets, [{ asset_id: "asset-1" }]);
});

test("repair accepts one exact match and preserves candidates and selection", () => {
  const [result] = repairEntriesAgainstApprovedScript([entry("The orange vanished.")], "# Opening\n\nThe orange vanished. Then the room changed.");
  assert.equal(result.canonical_anchor_assessment.state, "current");
  assert.equal(result.script_anchor.span_text, "The orange vanished.");
  assert.equal(result.selected_asset_id, "asset-1");
});

test("repair deterministically recovers a missing structured anchor from one exact display-anchor match", () => {
  const legacy = { ...entry("It was everywhere."), script_anchor: null };
  const [result] = repairEntriesAgainstApprovedScript([legacy], "Before.\n\nIt was everywhere.\n\nAfter.");
  assert.equal(result.canonical_anchor_assessment.state, "current");
  assert.equal(result.canonical_anchor_assessment.evidence.match_count, 1);
  assert.equal(result.script_anchor.span_text, "It was everywhere.");
  assert.equal(result.selected_asset_id, "asset-1");
  assert.deepEqual(result.candidate_assets, [{ asset_id: "asset-1" }]);
});

test("repair fails closed for duplicate and absent exact text", () => {
  const [duplicate] = repairEntriesAgainstApprovedScript([entry("Same phrase.")], "Same phrase.\n\nSame phrase.");
  const [absent] = repairEntriesAgainstApprovedScript([entry("Missing phrase.")], "Different words.");
  assert.equal(duplicate.canonical_anchor_assessment.state, "unresolved");
  assert.equal(duplicate.canonical_anchor_assessment.reason, "multiple_exact_matches");
  assert.equal(absent.canonical_anchor_assessment.reason, "exact_text_not_found");
});

test("manual resolution accepts only exact immutable-script coordinates and bytes", () => {
  const script = "# Opening\n\nThe orange vanished. Then the room changed.";
  const exact = validateExactAnchorAgainstApprovedScript(script, { paragraph_id: "s1:p1", char_start: 0, char_end: 20, sentence_start: 1, sentence_end: 1, span_text: "The orange vanished." });
  assert.equal(exact?.span_text, "The orange vanished.");
  assert.equal(validateExactAnchorAgainstApprovedScript(script, { paragraph_id: "s1:p1", char_start: 0, char_end: 20, sentence_start: 1, sentence_end: 1, span_text: "the orange vanished." }), null);
});
