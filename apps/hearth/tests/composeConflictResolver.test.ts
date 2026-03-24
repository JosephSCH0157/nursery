import assert from "node:assert/strict";
import test from "node:test";
import { resolveComposeConflicts } from "../src/lib/compose-conflicts";
import type { ProductionDefaults } from "../src/domain/compose";

const defaults: ProductionDefaults = {
  defaultSpeakerCount: 2,
  defaultSpeakers: ["s1", "s2"],
  defaultMode: "outline_by_speaker",
  defaultTargetSpeaker: null,
  assumeStandardUnlessOverridden: true,
};

test("composeConflictResolver: no conflicts for standard defaults", () => {
  const result = resolveComposeConflicts({
    defaults,
    userRequestedCustomize: false,
    isSpecialEpisode: false,
    importedImpliedSpeakers: ["s1", "s2"],
  });
  assert.equal(result.shouldPrompt, false);
});

test("composeConflictResolver: prompts for missing target in single-speaker mode", () => {
  const result = resolveComposeConflicts({
    defaults: { ...defaults, defaultMode: "full_script_single_speaker", defaultTargetSpeaker: null },
    userRequestedCustomize: false,
    isSpecialEpisode: false,
    importedImpliedSpeakers: null,
  });
  assert.equal(result.shouldPrompt, true);
  assert.equal(result.reasons.includes("missing_target_speaker"), true);
});
