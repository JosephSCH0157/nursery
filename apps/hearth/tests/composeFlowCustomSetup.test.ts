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

test("composeFlowCustomSetup: guest/special episode prompts customization", () => {
  const result = resolveComposeConflicts({
    defaults,
    userRequestedCustomize: false,
    isSpecialEpisode: true,
    importedImpliedSpeakers: ["s1", "s2", "g1"],
  });
  assert.equal(result.shouldPrompt, true);
});
