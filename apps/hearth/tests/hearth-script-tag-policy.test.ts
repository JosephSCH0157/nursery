import assert from "node:assert/strict";
import test from "node:test";
import { evaluateHearthScriptValidation, normalizeHearthAiScriptIngress } from "../src/lib/hearth-script-tag-policy";

function assertMaxSpeakerSpokenLines(script: string, maxLines: number): void {
  let insideSpeaker = false;
  let count = 0;
  for (const line of script.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (/^\[(?:s1|s2|g1|g2)\]$/i.test(trimmed)) {
      insideSpeaker = true;
      count = 0;
      continue;
    }
    if (/^\[\/(?:s1|s2|g1|g2)\]$/i.test(trimmed)) {
      assert.ok(count <= maxLines, `speaker block had ${count} spoken lines:\n${script}`);
      insideSpeaker = false;
      count = 0;
      continue;
    }
    if (insideSpeaker && trimmed && !/^\[(?:beat|pause|reflective pause)\]$/i.test(trimmed)) count += 1;
  }
}

test("hearthScriptTagPolicy: plain text without tags is acceptable", () => {
  const result = evaluateHearthScriptValidation("Narration without any speaker tags.");

  assert.equal(result.tagMode, "absent");
  assert.equal(result.validation.ok, true);
  assert.equal(result.validation.issues.length, 0);
});

test("hearthScriptTagPolicy: bracketed editorial notes do not trigger tag mode", () => {
  const result = evaluateHearthScriptValidation([
    "Open with the headline.",
    "[applause]",
    "[pause]",
    "[music fades]",
    "[quote]",
  ].join("\n"));

  assert.equal(result.tagMode, "absent");
  assert.equal(result.validation.ok, true);
  assert.equal(result.validation.issues.length, 0);
});

test("hearthScriptTagPolicy: incorrect tags still surface validation errors", () => {
  const result = evaluateHearthScriptValidation("[speaker1]\nHello\n[/speaker1]\n");

  assert.equal(result.tagMode, "present");
  assert.equal(result.validation.ok, false);
  assert.equal(result.validation.issues.some((issue) => issue.code === "INVALID_SPEAKER_TAG"), true);
});

test("hearthScriptTagPolicy: AI ingress normalization repairs inline speaker tags", () => {
  const ingress = normalizeHearthAiScriptIngress("[S1] Hello from AI [/S1]");
  assert.equal(ingress.validation.ok, true);
  assert.equal(ingress.text.includes("[s1]"), true);
  assert.equal(ingress.text.includes("[/s1]"), true);
});

test("hearthScriptTagPolicy: AI ingress fallback wraps unrepairable speaker structure", () => {
  const ingress = normalizeHearthAiScriptIngress("[s1]\nOne\n[s2]\nTwo\n[/s1]\n");
  assert.equal(ingress.validation.ok, true);
  assert.equal(ingress.fallbackApplied, true);
  assert.equal(ingress.text.includes("[s1]"), true);
  assert.equal(ingress.text.includes("[/s1]"), true);
});

test("hearthScriptTagPolicy: AI ingress shapes blob scripts into Anvil-ready speaker blocks", () => {
  const ingress = normalizeHearthAiScriptIngress([
    "[s1]",
    "Alright. I want to talk about voting rights. And I want to talk about racism. Here is the thesis. If we actually want to end racism, we have to stop governing through race. Not stop noticing reality. Not stop enforcing fairness. But stop using race as the steering wheel for public policy.",
    "[/s1]",
  ].join("\n"));

  assert.equal(ingress.validation.ok, true);
  assert.match(ingress.text, /\[(?:pause|beat|reflective pause)\]/);
  assert.ok((ingress.text.match(/\[s1\]/g) ?? []).length >= 1);
  assert.equal(ingress.text.split(/\r?\n/).some((line) => line.trim() === ""), true);
  assertMaxSpeakerSpokenLines(ingress.text, 5);
});
