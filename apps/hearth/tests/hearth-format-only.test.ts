import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildHearthFormatOnlyPreview,
  confirmHearthUserEditorialTransition,
  evaluateHearthFormatOnlyPreservation,
} from "../src/lib/hearth-format-only";

const FLORIDA_ORANGES_SOURCE_FIXTURE = readFileSync(
  new URL("./fixtures/florida-oranges-width-wrapped.txt", import.meta.url),
  "utf8",
);

test("format-only Florida fixture removes width wrapping without changing protected content", () => {
  const preview = buildHearthFormatOnlyPreview(FLORIDA_ORANGES_SOURCE_FIXTURE);

  assert.equal(preview.preservation.preserved, true);
  assert.deepEqual(preview.preservation.changes, []);
  assert.equal(buildHearthFormatOnlyPreview(preview.formatted).formatted, preview.formatted);
  assert.match(preview.formatted, /used to smell amazing\./);
  assert.match(preview.formatted, /was already producing/);
  assert.match(preview.formatted, /futures literally became/);
  assert.match(preview.formatted, /\[reflective pause\][\s\S]*\[reflective pause\]/);
});

test("format-only preservation allows whitespace and redundant same-speaker wrappers", () => {
  const source = "[s1]\nOne complete sentence.\n[/s1]\n\n[s1]\nSecond sentence.\n[/s1]";
  const result = "[s1]\nOne   complete sentence.\nSecond sentence.\n[/s1]";

  assert.deepEqual(evaluateHearthFormatOnlyPreservation(source, result), {
    preserved: true,
    changes: [],
  });
});

test("format-only preservation rejects Florida rewrite regressions", () => {
  const cases: Array<[string, string]> = [
    ["was already producing", "already produced"],
    ["literally became", "became"],
    ["industry or a branding\nexercise.", "industry. Or a branding exercise."],
    ["destinations.", "destinations!"],
    ["[reflective pause]", "[pause]"],
  ];

  for (const [before, after] of cases) {
    const changed = FLORIDA_ORANGES_SOURCE_FIXTURE.replace(before, after);
    const result = evaluateHearthFormatOnlyPreservation(FLORIDA_ORANGES_SOURCE_FIXTURE, changed);
    assert.equal(result.preserved, false, `${before} -> ${after}`);
    assert.ok(result.changes.length > 0);
  }
});

test("format-only preservation reports speaker, note, cue, and punctuation changes", () => {
  const source = "[s1]\nHello, world.\n[note]\nKeep exact.\n[/note]\n[pause]\n[/s1]";
  const changed = "[s2]\nHello world!\n[note]\nKeep altered.\n[/note]\n[beat]\n[/s2]";
  const result = evaluateHearthFormatOnlyPreservation(source, changed);

  assert.equal(result.preserved, false);
  assert.ok(result.changes.includes("speaker_identity"));
  assert.ok(result.changes.includes("notes"));
  assert.ok(result.changes.includes("cues"));
  assert.ok(result.changes.includes("punctuation"));
  assert.ok(result.changes.includes("sentence_boundaries"));
});

test("cancelled user-editorial confirmation leaves the transition blocked", () => {
  let confirmationMessage = "";
  const accepted = confirmHearthUserEditorialTransition({
    source: "[s1]\nOriginal words.\n[/s1]",
    result: "[s1]\nChanged words.\n[/s1]",
    action: "apply",
    confirm: (message) => {
      confirmationMessage = message;
      return false;
    },
  });

  assert.equal(accepted, false);
  assert.match(confirmationMessage, /no longer formatting-only/i);
  assert.match(confirmationMessage, /words/i);
});
