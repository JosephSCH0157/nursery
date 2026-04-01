import assert from "node:assert/strict";
import test from "node:test";
import {
  insertVoiceTranscriptIntoScript,
  normalizeVoiceTranscript,
} from "../src/lib/hearth-script-dictation";

test("hearthScriptDictation: normalizes transcript whitespace", () => {
  assert.equal(
    normalizeVoiceTranscript("  Hello \n\n there   general   Kenobi "),
    "Hello there general Kenobi",
  );
});

test("hearthScriptDictation: appends a spoken transcript with paragraph spacing at the end", () => {
  const result = insertVoiceTranscriptIntoScript({
    body: "[s1]\nDraft intro goes here.\n[/s1]",
    transcript: "This is the next spoken beat.",
  });

  assert.equal(
    result.body,
    "[s1]\nDraft intro goes here.\n[/s1]\n\nThis is the next spoken beat.",
  );
  assert.equal(result.cursorPosition, result.body.length);
});

test("hearthScriptDictation: inserts at the current cursor without crushing adjacent text", () => {
  const result = insertVoiceTranscriptIntoScript({
    body: "Opening line. Closing line.",
    transcript: "Inserted thought.",
    cursorPosition: "Opening line.".length,
  });

  assert.equal(
    result.body,
    "Opening line. Inserted thought. Closing line.",
  );
});
