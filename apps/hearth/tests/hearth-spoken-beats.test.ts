import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveSpokenBeatsFromBulletScript,
  generateImageMapEntriesFromBulletScript,
  isBulletOutlineScript,
} from "../src/lib/hearth-spoken-beats";

test("hearthSpokenBeats: detects outline-by-speaker bullet scripts", () => {
  const script = [
    "[s1]",
    "- Crowd estimates vary widely.",
    "- Police response changed after dark.",
    "[/s1]",
  ].join("\n");

  assert.equal(isBulletOutlineScript(script), true);
  assert.equal(isBulletOutlineScript("[s1]\nThis is full prose.\n[/s1]"), false);
});

test("hearthSpokenBeats: preserves beat ids across light bullet edits", () => {
  const original = deriveSpokenBeatsFromBulletScript([
    "[s1]",
    "- Police response changed after dark.",
    "- Permit timeline got skipped.",
    "[/s1]",
  ].join("\n"));

  const revised = deriveSpokenBeatsFromBulletScript([
    "[s1]",
    "- Police response shifted after dark.",
    "- Permit timeline was skipped in coverage.",
    "[/s1]",
  ].join("\n"), original);

  assert.equal(revised.length, 2);
  assert.equal(revised[0]?.id, original[0]?.id);
  assert.equal(revised[1]?.id, original[1]?.id);
  assert.equal(revised[0]?.speaker_order, 1);
  assert.equal(revised[1]?.speaker_order, 2);
});

test("hearthSpokenBeats: bullet image-map generation emits beat anchors instead of text anchors", () => {
  const generated = generateImageMapEntriesFromBulletScript({
    scriptText: [
      "[s1]",
      "- Crowd estimates vary widely.",
      "- Police response changed after dark.",
      "[/s1]",
      "",
      "[s2]",
      "- Media framing skipped the permit timeline.",
      "[/s2]",
    ].join("\n"),
  });

  assert.equal(generated.spokenBeats.length, 3);
  assert.equal(generated.entries.length, 3);
  assert.ok(generated.entries.every((entry) => entry.beat_anchor?.mode === "bullet_beat"));
  assert.ok(generated.entries.every((entry) => entry.script_anchor == null));
  assert.deepEqual(
    generated.spokenBeats.map((beat) => beat.order),
    [1, 2, 3],
  );
  assert.deepEqual(
    generated.spokenBeats.map((beat) => beat.speaker_order),
    [1, 2, 1],
  );
});
