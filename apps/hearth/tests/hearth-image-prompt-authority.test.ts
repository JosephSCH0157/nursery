import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../src/", import.meta.url);
const authority = readFileSync(new URL("lib/hearth-image-prompt-authority.ts", root), "utf8");
const hook = readFileSync(new URL("hooks/visuals/useImagePromptAuthority.ts", root), "utf8");
const panel = readFileSync(new URL("components/visuals/ImageMapPanel.tsx", root), "utf8");
const candidates = readFileSync(new URL("hooks/visuals/useImageMapCandidateActions.ts", root), "utf8");
const repository = readFileSync(new URL("lib/hearth-image-map-repo.ts", root), "utf8");

test("Hearth reserves deterministic interpretation and trusts only matching canonical readback", () => {
  assert.match(authority, /forge:image-prompt:interpret:\$\{fingerprint\}/);
  assert.match(authority, /expected_prompt_revision_id: expectedId/);
  assert.match(authority, /prompt_readback_mismatch/);
  assert.match(hook, /status: "pending", stage: "pending"/);
  assert.doesNotMatch(authority, /localStorage/);
});

test("a failed first interpretation reads back as no prompt and remains retryable", () => {
  assert.match(authority, /body\.data\.prompt_revision === null/);
  assert.match(authority, /sequenceRevision === 0/);
  assert.match(authority, /current_prompt_revision_id === null/);
  assert.match(authority, /return \{ ok: true, data: null \}/);
});

test("Image Direction, AI brief, and canonical final prompt are separate creator concepts", () => {
  assert.match(panel, />Image direction</);
  assert.match(panel, />AI visual brief</);
  assert.match(panel, />Final image prompt</);
  assert.match(panel, /Save prompt as new revision/);
  assert.match(panel, /Copy canonical prompt/);
  assert.match(panel, /canonicalPrompt\.finalPrompt/);
  assert.doesNotMatch(panel.slice(panel.indexOf("if (!manualOnly)"), panel.indexOf("let primaryActionButton")), /buildTimelineImagePromptPack\(/);
});

test("generation is pinned to the exact current creator-visible prompt revision", () => {
  assert.match(candidates, /canonicalPromptRevision\.imageMomentId !== args\.selectedImageMapEntry\.id/);
  assert.match(candidates, /promptRevisionId: args\.canonicalPromptRevision!\.id/);
  assert.match(candidates, /promptContentHash: args\.canonicalPromptRevision!\.contentHash/);
  assert.match(repository, /prompt_revision_id: args\.promptRevisionId/);
  assert.match(repository, /prompt_content_hash: args\.promptContentHash/);
  assert.match(panel, /Generate from the exact canonical final prompt revision shown above/);
});

test("image generation acknowledges the click before preparatory network work", () => {
  assert.ok(candidates.indexOf("args.setIsImageMapCandidateGenerating(true)") < candidates.indexOf("await args.readCanonicalScriptForImageMapGeneration()"));
  assert.match(panel, /aria-busy=\{candidateGenerateBusy\}/);
  assert.match(panel, /Generating image…/);
  assert.match(panel, /Request received\./);
  assert.match(panel, /aria-live="polite"/);
});

test("creator-uploaded images carry normalized frame dimensions into canonical registration", () => {
  assert.match(repository, /width: Number\.isInteger\(Number\(args\.preparationEvidence\?\.target_width\)\)/);
  assert.match(repository, /height: Number\.isInteger\(Number\(args\.preparationEvidence\?\.target_height\)\)/);
});

test("creator edits append with expected revision and stale or mismatched readback cannot look successful", () => {
  assert.match(authority, /expected_prompt_revision_id: args\.current\.id/);
  assert.match(authority, /expected_prompt_revision: args\.current\.revision/);
  assert.match(authority, /forge:image-prompt:edit:\$\{fingerprint\}/);
  assert.match(authority, /readback\.data\.revision\.finalPrompt !== args\.finalPrompt/);
  assert.match(panel, /the existing creator prompt remains preserved/);
});
