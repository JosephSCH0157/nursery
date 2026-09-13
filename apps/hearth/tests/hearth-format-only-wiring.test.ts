import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildHearthFormatOnlyPreview,
  confirmHearthUserEditorialTransition,
  evaluateHearthFormatOnlyPreservation,
} from "../src/lib/hearth-format-only";

const runtimeSource = readFileSync(new URL("../src/hooks/useChatWorkspace.ts", import.meta.url), "utf8");
const surfaceSource = readFileSync(new URL("../src/views/surfaces/ChatSurface.tsx", import.meta.url), "utf8");

test("format-only wording no longer creates competing client-owned turn routing", () => {
  assert.doesNotMatch(runtimeSource, /scriptMutationIntent\.kind === ["']format_only["']/);
  assert.doesNotMatch(runtimeSource, /createPendingFormatOnlyProposal/);
  assert.match(runtimeSource, /turnResult\.decision/);
  assert.match(runtimeSource, /explicitAction/);
});

test("format-only proposal ownership preserves source and requires confirmation after editorial edits", () => {
  const source = "[s1]\nA sentence that should remain editorially unchanged.\n[/s1]";
  const preview = buildHearthFormatOnlyPreview(source);
  assert.equal(preview.source, source);
  assert.equal(preview.preservation.preserved, true);
  assert.equal(evaluateHearthFormatOnlyPreservation(source, preview.formatted).preserved, true);

  const edited = `${preview.formatted}\n[s1]\nA new editorial claim.\n[/s1]`;
  assert.equal(evaluateHearthFormatOnlyPreservation(source, edited).preserved, false);
  let confirmationMessage = "";
  const confirmed = confirmHearthUserEditorialTransition({
    source,
    result: edited,
    action: "apply",
    confirm: (message) => {
      confirmationMessage = message;
      return false;
    },
  });
  assert.equal(confirmed, false);
  assert.match(confirmationMessage, /no longer formatting-only/i);
});

test("proposal UI distinguishes deterministic and user-editorial states", () => {
  assert.match(surfaceSource, /Format-only preview/);
  assert.match(surfaceSource, /User editorial edit/);
  assert.match(surfaceSource, /Reset to format-only version/);
  assert.match(surfaceSource, /Explicit confirmation is required/);
});
