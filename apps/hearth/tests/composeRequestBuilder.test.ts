import assert from "node:assert/strict";
import test from "node:test";
import { buildComposeScriptRequest } from "../src/lib/build-compose-request";

test("composeRequestBuilder: preserves setup and source", () => {
  const request = buildComposeScriptRequest({
    setup: {
      speakerCount: 2,
      speakers: ["s1", "s2"],
      mode: "outline_by_speaker",
      targetSpeaker: null,
      usesProductionDefault: true,
      isOverrideFromProductionDefault: false,
    },
    sourceText: "source",
    existingDraftText: "draft",
  });
  assert.equal(request.setup.mode, "outline_by_speaker");
  assert.equal(request.sourceText, "source");
  assert.equal(request.existingDraftText, "draft");
});
