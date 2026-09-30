import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveHearthAiActionAvailability } from "../src/lib/hearth-ai-admission";

const chatSurfaceSource = readFileSync(
  new URL("../src/views/surfaces/ChatSurface.tsx", import.meta.url),
  "utf8",
);
const chatApiSource = readFileSync(
  new URL("../src/lib/hearth-chat-api.ts", import.meta.url),
  "utf8",
);
const standaloneSource = readFileSync(
  new URL("../../nursery/src/routes/HearthStandalone.tsx", import.meta.url),
  "utf8",
);
const runtimeStatusSource = readFileSync(
  new URL("../src/lib/ai-runtime-status.ts", import.meta.url),
  "utf8",
);
const scriptRepairSource = readFileSync(
  new URL("../src/hooks/useHearthScriptRepairActions.ts", import.meta.url),
  "utf8",
);
const scriptHeaderSource = readFileSync(
  new URL("../src/views/modes/HearthDraftScriptHeader.tsx", import.meta.url),
  "utf8",
);
const shellSource = readFileSync(
  new URL("../src/routes/HearthShell.tsx", import.meta.url),
  "utf8",
);
const aiControlsSource = readFileSync(
  new URL("../../nursery/src/components/hearth/AiControlsPanel.tsx", import.meta.url),
  "utf8",
);
const chatRuntimeSource = readFileSync(
  new URL("../src/hooks/useChatWorkspace.ts", import.meta.url),
  "utf8",
);

test("an authoritative admission failure hides artifact actions and blocks another AI submission", () => {
  const availability = resolveHearthAiActionAvailability("admission_failure");
  assert.equal(availability.showArtifactActions, false);
  assert.equal(availability.allowAiSubmission, false);
});

test("provider and model-output failures do not masquerade as account admission failures", () => {
  assert.deepEqual(resolveHearthAiActionAvailability("provider_failure"), {
    showArtifactActions: true,
    allowAiSubmission: true,
  });
  assert.deepEqual(resolveHearthAiActionAvailability(null), {
    showArtifactActions: true,
    allowAiSubmission: true,
  });
});

test("ChatSurface does not leave generation controls or submission enabled after admission failure", () => {
  assert.match(chatSurfaceSource, /!props\.aiAdmissionBlocked \? <div className="hs-ai-format-row"/);
  assert.match(chatSurfaceSource, /!props\.aiAdmissionBlocked \? <div className="hs-ai-shortcut-row"/);
  assert.match(chatSurfaceSource, /!deterministicCommand && \(props\.aiCreditsDepleted \|\| props\.aiAdmissionBlocked \|\| ownerChatBlocked\)/);
  assert.match(chatSurfaceSource, /parseHearthDeterministicCommand\(props\.chatDraft\)/);
});

test("ChatSurface blocks owner AI while exact deterministic commands remain available", () => {
  assert.match(chatSurfaceSource, /if \(ownerChatBlocked && !deterministicCommand\) return;/);
  assert.match(chatSurfaceSource, /!deterministicCommand && \(props\.aiCreditsDepleted \|\| props\.aiAdmissionBlocked \|\| ownerChatBlocked\)/);
  assert.doesNotMatch(chatSurfaceSource, /disabled=\{[^}]*ownerChatBlocked[^}]*\}\s*\/?>\s*\{props\.sttTarget/);
  assert.match(chatSurfaceSource, /Hearth couldn’t verify private owner AI availability[\s\S]*onRetryOwnerChatCapability/);
});

test("credits success cannot bypass workspace-scoped runtime readiness", () => {
  const statusFunction = chatApiSource.slice(chatApiSource.indexOf("export async function fetchHearthAiStatus"));
  assert.match(statusFunction, /query\.set\("workspace_id", normalizedWorkspaceId\)/);
  assert.match(statusFunction, /fetch\(`\$\{HEARTH_AI_ROUTES\.chatStatus\}/);
  assert.doesNotMatch(statusFunction, /if \(credits\.ok\) \{\s*return credits;/);
});

test("the header separates execution readiness from credits and cloud connectivity", () => {
  assert.match(standaloneSource, /AI: Checking/);
  assert.match(standaloneSource, /AI: Unavailable/);
  assert.match(standaloneSource, /AI: Status unknown/);
  assert.match(standaloneSource, /AI Credits:/);
  assert.match(standaloneSource, /Funding: Forge-funded/);
  assert.match(standaloneSource, /useForgeCloudStatus/);
  assert.doesNotMatch(runtimeStatusSource, /localStorage/);
});

test("owner funding presentation is server-derived and not a selectable payer", () => {
  assert.match(aiControlsSource, /ownerFundingStatus === "active"/);
  assert.match(aiControlsSource, /Forge-funded owner execution/);
  assert.match(aiControlsSource, /ownerFundingStatus === "active"[\s\S]*?<strong>Forge-funded owner execution<\/strong>[\s\S]*?: \([\s\S]*?<select/);
  assert.match(shellSource, /isHearthAiCreditAdmissionDepleted\(\{[\s\S]*ownerFundingStatus/);
  assert.match(shellSource, /canGenerateConcepts: !customerAiCreditsDepleted/);
  assert.match(shellSource, /setOwnerFundingStatus\(status\.runtime\.ownerFundingStatus \?\? "unknown"\)/);
  assert.match(chatRuntimeSource, /isHearthAiCreditAdmissionDepleted\(\{[\s\S]*ownerFundingStatus: args\.ownerFundingStatus/);
});

test("STT retains its independent customer-credit gate", () => {
  assert.match(chatRuntimeSource, /if \(lane === "forge" && args\.aiTokenBalance != null && args\.aiTokenBalance <= 0\) \{\s*args\.setSttError\("No AI credits remaining\."\)/);
});

test("owner readiness also guards the direct AI script-repair path", () => {
  assert.match(scriptRepairSource, /args\.ownerChatCapability\.status === "unavailable"/);
  assert.match(scriptRepairSource, /args\.ownerChatCapability\.status === "unknown"/);
  assert.match(scriptHeaderSource, /aiCreditsDepleted \|\| ownerChatBlocked \|\| isAiProcessing/);
});
