import assert from "node:assert/strict";
import test from "node:test";
import { normalizeScriptTags, validateScriptTags } from "@forge/shared/script-tags";
import { validateComposeContent } from "../src/lib/compose-content-validation";

test("composeContentValidation: complete outline mode yields approval_ready badge", () => {
  const script = normalizeScriptTags("[s1]\n- Point one\n[/s1]\n[s2]\n- Point two\n[/s2]\n");
  const tagValidation = validateScriptTags(script);
  const result = validateComposeContent({
    setup: {
      speakerCount: 2,
      speakers: ["s1", "s2"],
      mode: "outline_by_speaker",
      targetSpeaker: null,
      usesProductionDefault: true,
      isOverrideFromProductionDefault: false,
    },
    scriptText: script,
    tagValidation,
  });
  assert.equal(result.badge, "approval_ready");
  assert.equal(result.ok, true);
});

test("composeContentValidation: incomplete outline mode stays outline_draft", () => {
  const script = normalizeScriptTags("[s1]\n- Point one\n[/s1]\n");
  const tagValidation = validateScriptTags(script);
  const result = validateComposeContent({
    setup: {
      speakerCount: 2,
      speakers: ["s1", "s2"],
      mode: "outline_by_speaker",
      targetSpeaker: null,
      usesProductionDefault: true,
      isOverrideFromProductionDefault: false,
    },
    scriptText: script,
    tagValidation,
  });
  assert.equal(result.badge, "outline_draft");
  assert.equal(result.ok, false);
});

test("composeContentValidation: full-all mode requires prose for all speakers", () => {
  const script = normalizeScriptTags("[s1]\nHello\n[/s1]\n[s2]\n- Bullet only\n[/s2]\n");
  const tagValidation = validateScriptTags(script);
  const result = validateComposeContent({
    setup: {
      speakerCount: 2,
      speakers: ["s1", "s2"],
      mode: "full_script_all_speakers",
      targetSpeaker: null,
      usesProductionDefault: false,
      isOverrideFromProductionDefault: true,
    },
    scriptText: script,
    tagValidation,
  });
  assert.equal(result.ok, false);
});
