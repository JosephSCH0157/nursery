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

test("format-only routing returns before AI dispatch and credit enforcement", () => {
  const formatBranch = runtimeSource.indexOf('scriptMutationIntent.kind === "format_only"');
  const localProposal = runtimeSource.indexOf("createPendingFormatOnlyProposal", formatBranch);
  const creditCheck = runtimeSource.indexOf("aiTokenBalance", localProposal);
  const aiDispatch = runtimeSource.indexOf("requestHearthChatReply(requestMessages", localProposal);

  assert.ok(formatBranch >= 0);
  assert.ok(localProposal > formatBranch);
  assert.ok(creditCheck > localProposal);
  assert.ok(aiDispatch > creditCheck);
  assert.match(runtimeSource.slice(localProposal, creditCheck), /return;/);
  assert.match(runtimeSource.slice(localProposal, creditCheck), /ai_called:\s*false/);
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
