import assert from "node:assert/strict";
import test from "node:test";
import { validateScriptTags } from "@forge/shared/script-tags";
import { buildHearthApprovedScriptReplacement } from "../src/lib/hearth-script-approval";
import { shapeHearthScriptForRecording } from "../src/lib/hearth-recording-ready-script";
import { evaluateHearthScriptValidation } from "../src/lib/hearth-script-tag-policy";
import type { Draft } from "../src/domain/draft";

function makeDraft(body: string): Draft {
  return {
    id: "draft-1",
    title: "Draft",
    body,
    createdAt: 1,
    updatedAt: 1,
    revisionCount: 0,
    lastRevisionAt: undefined,
    archived: false,
  };
}

function assertMaxSpeakerContentLines(script: string, maxLines: number): void {
  let activeSpeaker: string | null = null;
  let contentLineCount = 0;
  for (const rawLine of script.split(/\r?\n/)) {
    const line = rawLine.trim();
    const open = line.match(/^\[(s1|s2|g1|g2)\]$/i)?.[1]?.toLowerCase() ?? null;
    const close = line.match(/^\[\/(s1|s2|g1|g2)\]$/i)?.[1]?.toLowerCase() ?? null;
    if (open) {
      activeSpeaker = open;
      contentLineCount = 0;
      continue;
    }
    if (close) {
      assert.equal(close, activeSpeaker);
      assert.ok(contentLineCount <= maxLines, `speaker block exceeded ${maxLines} content lines: ${contentLineCount}`);
      activeSpeaker = null;
      contentLineCount = 0;
      continue;
    }
    if (activeSpeaker && line) contentLineCount += 1;
  }
}

test("shapeHearthScriptForRecording turns paragraph walls into Anvil-friendly performance lines", () => {
  const shaped = shapeHearthScriptForRecording("[s1]\nThis is the first big idea that needs to land clearly for the audience. Here is the second point, and it should not hide inside a paragraph wall.\n[/s1]");

  const lines = shaped.split("\n");
  assert.equal(validateScriptTags(shaped).ok, true);
  assert.ok(lines.includes("[beat]") || lines.includes("[pause]"));
  assert.ok(lines.some((line) => line.trim() === ""));
  assert.ok(lines.filter((line) => line.length > 90).length === 0);
  assert.match(shaped, /^\[s1\]$/m);
  assert.match(shaped, /^\[\/s1\]$/m);
  assertMaxSpeakerContentLines(shaped, 3);
});

test("shapeHearthScriptForRecording breaks long speaker blobs into short repeat speaker blocks", () => {
  const shaped = shapeHearthScriptForRecording([
    "[s1]",
    "First point lands for the listener. Second point needs breath. Third point cannot stay inside a wall. Fourth point should reopen the speaker block. Fifth point proves the formatter is enforcing structure.",
    "[/s1]",
  ].join("\n"));

  assert.equal(validateScriptTags(shaped).ok, true);
  assertMaxSpeakerContentLines(shaped, 3);
  assert.ok((shaped.match(/^\[s1\]$/gm) ?? []).length >= 2);
  assert.ok((shaped.match(/^\[\/s1\]$/gm) ?? []).length >= 2);
  assert.ok(shaped.split(/\r?\n/).some((line) => line.trim() === ""));
});

test("shapeHearthScriptForRecording preserves notes and canonical speaker tags", () => {
  const shaped = shapeHearthScriptForRecording([
    "[s1]",
    "Joe lands the opener.",
    "[note]",
    "Hidden producer note should not become a spoken cue.",
    "[/note]",
    "[/s1]",
    "",
    "[s2]",
    "Brad answers with the second point.",
    "[/s2]",
  ].join("\n"));

  assert.equal(validateScriptTags(shaped).ok, true);
  assert.match(shaped, /^\[note\]$/m);
  assert.match(shaped, /^\[\/note\]$/m);
  assert.match(shaped, /^\[s1\]$/m);
  assert.match(shaped, /^\[s2\]$/m);
});

test("buildHearthApprovedScriptReplacement makes the script panel and Tongs handoff text identical", () => {
  const stalePanelText = "[s1]\nOld stale script.\n[/s1]";
  const approvedDraft = makeDraft("[s1]\nNew approved rewrite lands the real point.\n[/s1]");

  const replacement = buildHearthApprovedScriptReplacement({
    draft: approvedDraft,
    evaluateScriptValidation: evaluateHearthScriptValidation,
    buildPersistedValidationMeta: (validation) => ({
      ok: validation.ok,
      issueCount: validation.issues.length,
      issues: validation.issues,
      validatedAt: "2026-05-02T00:00:00.000Z",
      validatorVersion: "test",
    }),
  });

  assert.notEqual(replacement.scriptText, stalePanelText);
  assert.equal(replacement.draft.body, replacement.scriptText);
  assert.equal(replacement.validation.ok, true);
  assert.match(replacement.scriptText, /New approved rewrite/);
  assert.match(replacement.scriptText, /\[(?:beat|pause|reflective pause)\]/);
});
