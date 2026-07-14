import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const runtimeSource = readFileSync(new URL("../src/hooks/useChatWorkspace.ts", import.meta.url), "utf8");
const shellSource = readFileSync(new URL("../src/routes/HearthShell.tsx", import.meta.url), "utf8");
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

test("format-only proposals preserve source state and reclassify edited bodies", () => {
  assert.match(shellSource, /formatSourceBody:\s*sourceBody/);
  assert.match(shellSource, /formatOriginalBody:\s*preview\.formatted/);
  assert.match(shellSource, /proposalOrigin:\s*preservation\.preserved\s*\?\s*"format_only"\s*:\s*"user_editorial"/);
  assert.match(shellSource, /confirmHearthUserEditorialTransition\([\s\S]*window\.confirm/);
});

test("proposal UI distinguishes deterministic and user-editorial states", () => {
  assert.match(surfaceSource, /Format-only preview/);
  assert.match(surfaceSource, /User editorial edit/);
  assert.match(surfaceSource, /Reset to format-only version/);
  assert.match(surfaceSource, /Explicit confirmation is required/);
});
