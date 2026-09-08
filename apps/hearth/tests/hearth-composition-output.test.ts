import assert from "node:assert/strict";
import test from "node:test";
import {
  detectHearthCompositionRequest,
  hasSubstantiveHearthOutline,
  hasSubstantiveHearthScript,
  validateHearthCompositionArtifact,
} from "../src/lib/hearth-composition-output";

test("hearthCompositionOutput: recognizes the Church Street outline requests from creator text", () => {
  assert.equal(detectHearthCompositionRequest("show me a first draft of bullet points only"), "outline");
  assert.equal(detectHearthCompositionRequest("Let's keep this loose with a bullet outline."), "outline");
});

test("hearthCompositionOutput: rejects announcement-only outline replies", () => {
  for (const assistantText of [
    "Here's a clean first-draft bullet set…",
    "Here's a loose bullet outline…",
  ]) {
    const result = validateHearthCompositionArtifact({
      requestText: "show me a first draft of bullet points only",
      assistantText,
      ops: [],
    });
    assert.equal(result.ok, false, assistantText);
    assert.equal(result.kind, "outline");
    assert.match(result.error ?? "", /No outline was created/i);
  }
});

test("hearthCompositionOutput: accepts substantive outline content in chat or a set_outline op", () => {
  assert.equal(hasSubstantiveHearthOutline("- Establish the street's original purpose."), true);
  assert.equal(validateHearthCompositionArtifact({
    requestText: "Give me bullet points only.",
    assistantText: "- Establish the street's original purpose.",
    ops: [],
  }).ok, true);
  assert.equal(validateHearthCompositionArtifact({
    requestText: "Give me a loose outline.",
    assistantText: "Here's the outline:",
    ops: [{ op: "set_outline", value: "Hook: Open on Church Street before the redesign." }],
  }).ok, true);
});

test("hearthCompositionOutput: Compose and full-script requests require substantive script operations", () => {
  const composeRequest = "Compose script using canonical Anvil tags only.\nMode: outline by speaker.";
  assert.equal(detectHearthCompositionRequest(composeRequest), "compose");
  assert.equal(validateHearthCompositionArtifact({
    requestText: composeRequest,
    assistantText: "Here's the composed draft.",
    ops: [],
  }).ok, false);

  const script = "[s1]\nChurch Street begins with a promise the city has made before.\n[/s1]";
  assert.equal(hasSubstantiveHearthScript(script), true);
  assert.equal(validateHearthCompositionArtifact({
    requestText: "Write the full script.",
    assistantText: "I drafted it.",
    ops: [{ op: "set_body", value: script }],
  }).ok, true);
});
