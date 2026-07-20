import assert from "node:assert/strict";
import test from "node:test";
import { validateScriptTags } from "@forge/shared/script-tags";
import { buildHearthApprovedScriptReplacement } from "../src/lib/hearth-script-approval";
import { shapeHearthScriptForRecording } from "../src/lib/hearth-recording-ready-script";
import { normalizeHearthAiScriptIngress } from "../src/lib/hearth-script-tag-policy";
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

function assertMaxSpeakerSpokenLines(script: string, maxLines: number): void {
  let activeSpeaker: string | null = null;
  let spokenLineCount = 0;
  for (const rawLine of script.split(/\r?\n/)) {
    const line = rawLine.trim();
    const open = line.match(/^\[(s1|s2|g1|g2)\]$/i)?.[1]?.toLowerCase() ?? null;
    const close = line.match(/^\[\/(s1|s2|g1|g2)\]$/i)?.[1]?.toLowerCase() ?? null;
    if (open) {
      activeSpeaker = open;
      spokenLineCount = 0;
      continue;
    }
    if (close) {
      assert.equal(close, activeSpeaker);
      assert.ok(spokenLineCount <= maxLines, `speaker block exceeded ${maxLines} spoken lines: ${spokenLineCount}`);
      activeSpeaker = null;
      spokenLineCount = 0;
      continue;
    }
    if (activeSpeaker && line && !/^\[(?:beat|pause|reflective pause)\]$/i.test(line)) spokenLineCount += 1;
  }
}

function assertNoCueOnlySpeakerBlocks(script: string): void {
  let block: string[] = [];
  for (const rawLine of script.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (/^\[(?:s1|s2|g1|g2)\]$/i.test(line)) {
      block = [line];
      continue;
    }
    if (block.length > 0) {
      block.push(line);
      if (/^\[\/(?:s1|s2|g1|g2)\]$/i.test(line)) {
        const hasSpoken = block.some((entry) => (
          entry
          && !/^\[\/?(?:s1|s2|g1|g2)\]$/i.test(entry)
          && !/^\[(?:beat|pause|reflective pause)\]$/i.test(entry)
        ));
        assert.equal(hasSpoken, true, `cue-only speaker block found:\n${block.join("\n")}`);
        block = [];
      }
    }
  }
}

function assertNoConsecutivePacingCues(script: string): void {
  let previousWasCue = false;
  for (const rawLine of script.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const isCue = /^\[(?:beat|pause|reflective pause)\]$/i.test(line);
    assert.equal(previousWasCue && isCue, false, `consecutive pacing cues found near ${line}`);
    previousWasCue = isCue;
  }
}

function assertMaxBlankRun(script: string, maxBlankLines: number): void {
  let run = 0;
  for (const line of script.split(/\r?\n/)) {
    if (!line.trim()) {
      run += 1;
      assert.ok(run <= maxBlankLines, `blank-line run exceeded ${maxBlankLines}`);
      continue;
    }
    run = 0;
  }
}

function stripSpeakerTags(script: string): string[] {
  return script
    .split(/\r?\n/)
    .filter((line) => !/^\[\/?(?:s1|s2|g1|g2)\]$/i.test(line.trim()));
}

function countPacingTags(script: string): number {
  return (script.match(/\[(?:beat|pause|reflective pause)\]/gi) ?? []).length;
}

function countSpeakerBlocks(script: string, speaker: "s1" | "s2" | "g1" | "g2" = "s1"): number {
  return (script.match(new RegExp(`\\[${speaker}\\]`, "g")) ?? []).length;
}

test("shapeHearthScriptForRecording turns paragraph walls into Anvil-friendly performance lines", () => {
  const shaped = shapeHearthScriptForRecording("[s1]\nThis is the first big idea that needs to land clearly for the audience. Here is the second point, and it should not hide inside a paragraph wall.\n[/s1]");

  const lines = shaped.split("\n");
  assert.equal(validateScriptTags(shaped).ok, true);
  assert.ok(lines.filter((line) => line.length > 90).length === 0);
  assert.match(shaped, /^\[s1\]$/m);
  assert.match(shaped, /^\[\/s1\]$/m);
  assertMaxSpeakerSpokenLines(shaped, 5);
});

test("shapeHearthScriptForRecording breaks long speaker blobs into short repeat speaker blocks", () => {
  const shaped = shapeHearthScriptForRecording([
    "[s1]",
    "First point lands for the listener. Second point needs breath. Third point cannot stay inside a wall. Fourth point should reopen the speaker block. Fifth point proves the formatter is enforcing structure.",
    "[/s1]",
  ].join("\n"));

  assert.equal(validateScriptTags(shaped).ok, true);
  assertMaxSpeakerSpokenLines(shaped, 5);
  assert.ok((shaped.match(/^\[s1\]$/gm) ?? []).length >= 1);
  assert.ok((shaped.match(/^\[\/s1\]$/gm) ?? []).length >= 1);
});

test("shapeHearthScriptForRecording keeps pause gaps tight for Anvil scroll", () => {
  const shaped = shapeHearthScriptForRecording([
    "[s1]",
    "First line lands.",
    "[pause]",
    "",
    "",
    "",
    "",
    "Second line lands.",
    "[beat]",
    "",
    "",
    "Third line lands.",
    "[/s1]",
  ].join("\n"));

  assert.equal(validateScriptTags(shaped).ok, true);
  assertMaxBlankRun(shaped, 1);

  const displayLines = stripSpeakerTags(shaped);
  const pauseLines = displayLines.filter((line) => /^\[(?:pause|beat|reflective pause)\]$/i.test(line.trim()));
  assert.ok(pauseLines.length <= 2);
});

test("shapeHearthScriptForRecording merges tiny blocks without inventing or dropping cues", () => {
  const noisy = [
    "[s1]",
    "Exactly.",
    "[beat]",
    "[/s1]",
    "",
    "[s1]",
    "That's a bar.",
    "[beat]",
    "[/s1]",
    "",
    "[s1]",
    "Define equity.",
    "[beat]",
    "[/s1]",
    "",
    "[s1]",
    "Not vibes.",
    "[beat]",
    "[/s1]",
    "",
    "[s1]",
    "The actual argument is that policy should focus on outcomes and incentives.",
    "[beat]",
    "[/s1]",
  ].join("\n");

  const shaped = shapeHearthScriptForRecording(noisy);
  assert.equal(validateScriptTags(shaped).ok, true);
  assert.ok(countSpeakerBlocks(shaped, "s1") < countSpeakerBlocks(noisy, "s1"));
  assert.equal(countPacingTags(shaped), countPacingTags(noisy));
  assertMaxBlankRun(shaped, 1);
});

test("shapeHearthScriptForRecording removes width wrapping while preserving canonical tokens", () => {
  const wrapped = [
    "[s1]",
    "Driving through northern Orlando on Orange Blossom Trail used to smell",
    "amazing.",
    "Not “that’s nice” amazing.",
    "Dr. A. J. Rivera measured 15.5 boxes in the U.S. report... then paused.",
    "It landed right on the tip of your tongue, like your brain was",
    "half-convinced you were tasting something.",
    "[reflective pause]",
    "[/s1]",
    "",
    "[s1]",
    "It adapted.",
    "They replanted.",
    "[note]",
    "Keep this exact note — including punctuation.",
    "[/note]",
    "They rebuilt.",
    "[/s1]",
  ].join("\n");

  const shaped = shapeHearthScriptForRecording(wrapped);
  const shapedAgain = shapeHearthScriptForRecording(shaped);
  const orderedCanonicalTokens = (value: string) => (value.match(/\S+/g) ?? [])
    .filter((token) => !/^\[\/?(?:s1|s2|g1|g2)\]$/i.test(token));

  assert.equal(shapedAgain, shaped);
  assert.deepEqual(orderedCanonicalTokens(shaped), orderedCanonicalTokens(wrapped));
  assert.match(shaped, /^Driving through northern Orlando on Orange Blossom Trail used to smell amazing\.$/m);
  assert.match(shaped, /^It landed right on the tip of your tongue, like your brain was half-convinced you were tasting something\.$/m);
  assert.match(shaped, /^Dr\. A\. J\. Rivera measured 15\.5 boxes in the U\.S\. report\.\.\. then paused\.$/m);
  assert.match(shaped, /^Not “that’s nice” amazing\.$/m);
  assert.match(shaped, /^\[reflective pause\]$/m);
  assert.match(shaped, /^Keep this exact note — including punctuation\.$/m);
  assert.match(shaped, /^It adapted\.$/m);
  assert.match(shaped, /^They replanted\.$/m);
  assert.match(shaped, /^They rebuilt\.$/m);

  const differentlyWrapped = wrapped
    .replace(
      "Driving through northern Orlando on Orange Blossom Trail used to smell\namazing.",
      "Driving through northern Orlando on Orange\nBlossom Trail used to smell amazing.",
    )
    .replace(
      "It landed right on the tip of your tongue, like your brain was\nhalf-convinced you were tasting something.",
      "It landed right on the tip of your tongue,\nlike your brain was half-convinced you were tasting something.",
    );
  assert.equal(shapeHearthScriptForRecording(differentlyWrapped), shaped);

  const ingress = normalizeHearthAiScriptIngress(wrapped);
  const approval = buildHearthApprovedScriptReplacement({
    draft: makeDraft(ingress.text),
    evaluateScriptValidation: evaluateHearthScriptValidation,
    buildPersistedValidationMeta: (validation) => ({
      ok: validation.ok,
      issueCount: validation.issues.length,
      issues: validation.issues,
      validatedAt: "2026-07-14T00:00:00.000Z",
      validatorVersion: "test",
    }),
  });
  assert.equal(ingress.text.trimEnd(), shaped);
  assert.equal(approval.scriptText, ingress.text);

  const speakableLines = shaped.split(/\r?\n/).filter((line) => {
    const trimmed = line.trim();
    return Boolean(trimmed) && !/^\[.*\]$/.test(trimmed);
  });
  assert.equal(speakableLines.length, 8);
});

test("shapeHearthScriptForRecording groups rapid-fire short lines for Anvil tracking", () => {
  const shaped = shapeHearthScriptForRecording([
    "[s1]",
    "Alright. Today we’re talking voting rights. And racism. I want to do this without turning it into a two-hour group project. Where everyone leaves mad. And nobody learns anything.",
    "[/s1]",
  ].join("\n"));

  assert.equal(validateScriptTags(shaped).ok, true);
  assertNoCueOnlySpeakerBlocks(shaped);
  assertNoConsecutivePacingCues(shaped);
  assertMaxSpeakerSpokenLines(shaped, 8);
  assert.ok((shaped.match(/^\[s1\]$/gm) ?? []).length <= 3);
});

test("shapeHearthScriptForRecording is idempotent for already paced scripts", () => {
  const input = [
    "[s1]",
    "Alright.",
    "[beat]",
    "",
    "[beat]",
    "[/s1]",
    "",
    "[s1]",
    "[beat]",
    "[/s1]",
    "",
    "[s1]",
    "Today we’re talking voting rights.",
    "[beat]",
    "[beat]",
    "[/s1]",
    "",
    "[s1]",
    "Validation check: All speaker tags are standalone lines with proper closes.",
    "[beat]",
    "[/s1]",
  ].join("\n");

  const shaped = shapeHearthScriptForRecording(input);
  const shapedAgain = shapeHearthScriptForRecording(shaped);

  assert.equal(validateScriptTags(shaped).ok, true);
  assert.equal(shapedAgain, shaped);
  assertNoCueOnlySpeakerBlocks(shaped);
  assertNoConsecutivePacingCues(shaped);
  assert.doesNotMatch(shaped, /Validation check/i);
  assert.doesNotMatch(shaped, /No block exceeds/i);
});

test("shapeHearthScriptForRecording keeps abbreviations and decimals intact", () => {
  const shaped = shapeHearthScriptForRecording([
    "[s1]",
    "The Voting Rights Act is one of the most important laws in U.S. history. The framework comes from Thornburg v. Gingles. Racism 2.0 is not the goal.",
    "[/s1]",
  ].join("\n"));

  assert.equal(validateScriptTags(shaped).ok, true);
  assert.match(shaped, /U\.S\. history/);
  assert.match(shaped, /Thornburg v\. Gingles/);
  assert.match(shaped, /Racism 2\.0/);
  assert.doesNotMatch(shaped, /^U\.$/m);
  assert.doesNotMatch(shaped, /^S\.$/m);
  assert.doesNotMatch(shaped, /^v\.$/m);
  assert.doesNotMatch(shaped, /^0\.$/m);
});

test("shapeHearthScriptForRecording does not strand abbreviations during line wrapping", () => {
  const shaped = shapeHearthScriptForRecording([
    "[s1]",
    "Quick backdrop. The Voting Rights Act of 1965 is one of the most important laws in U.S. history. It worked fast.",
    "[/s1]",
  ].join("\n"));

  assert.equal(validateScriptTags(shaped).ok, true);
  assert.match(shaped, /U\.S\. history/);
  assert.doesNotMatch(shaped, /U\.S\.\n\[beat\]\n\nhistory\./);
  assert.doesNotMatch(shaped, /^history\.$/m);
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
  assert.match(replacement.scriptText, /^\[s1\]$/m);
});
