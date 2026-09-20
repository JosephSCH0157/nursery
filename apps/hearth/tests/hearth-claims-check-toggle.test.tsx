import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import HearthDraftScriptHeader from "../src/views/modes/HearthDraftScriptHeader";
import type { HearthPreflightAuthority } from "../src/lib/hearth-research-preflight-authority";

type Props = ComponentProps<typeof HearthDraftScriptHeader>;
const no = () => {};
const draft = { id: "draft-one", title: "Fixture", body: "A script", createdAt: 1, updatedAt: 1 };
const authority = {
  id: "check-one", findings: [], reviewed: false, stale: false, staleReasons: [],
} as unknown as HearthPreflightAuthority;

test("Check claims toggles its saved panel without deleting review state", async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "http://localhost" });
  const saved = new Map<string, PropertyDescriptor | undefined>();
  for (const [name, value] of Object.entries({
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  let checks = 0;
  const props: Props = {
    isScriptWorkspaceTab: true, workpieceId: "workpiece-one", activeDraft: draft,
    formatUpdatedAt: () => "now", activeUserDisplayName: "Creator", resolveDraftEditorName: () => "Creator",
    composeModeLabel: "Manual", completionBadgeLabel: "Working", scriptCompletionReasons: [],
    onDraftTitleChange: no, onCreateDraft: no, onSaveDraft: no, isSaving: false,
    onDeleteDraft: no, openRevisionModal: no, openRevisionPanel: no,
    onApproveScript: no, onReviewForRecording: () => { checks++; },
    onCompletePreflightReview: no, onHandlePreflightFinding: no,
    preflightAuthority: authority, preflightError: null, isReviewingPreflight: false,
    onMarkReady: no, isMarkingReady: false, hasScript: true, isAiProcessing: false,
    isApprovingScript: false, approvalBlocked: false, activeTonePreset: "plain",
    onChangeTonePreset: no, tonePresetOptions: [], statusText: "", wordCount: 2, charCount: 8,
    aiAutosaveWarning: null, onRetryAiAutosave: no, editingPeersCount: 0, viewingPeersCount: 0,
    activeEditorName: "", activeViewerName: "", error: null, draftConflictState: null,
    onReloadLatestDraftAfterConflict: no, onCopyConflictLocalText: async () => true,
    acknowledgeCopy: no, isCopyAcknowledged: () => false, onDismissDraftConflict: no,
    displayedValidation: null, validationIssueCount: 0, buildValidationReport: () => "",
    onJumpToValidationIssue: no, onFixScriptFormattingNoAi: no, onAskAiRepairScript: no,
    aiEpisodeReady: false, aiCreditsDepleted: false, ownerChatBlocked: false,
    isRepairingScript: false, onDismissValidation: no, showManualDraft: false,
    onToggleShowManualDraft: no, showScriptPanel: false, onToggleShowScriptPanel: no,
    hasApprovedScript: false, approvedScriptVersion: null, productionScriptStatus: "Working Draft",
    isVisualScriptMode: false, onToggleVisualScriptMode: no,
  };
  const root = createRoot(dom.window.document.getElementById("root")!);
  const checkButton = () => Array.from(dom.window.document.querySelectorAll("button"))
    .find((button) => button.textContent?.toLowerCase().includes("claims check")
      || button.textContent?.toLowerCase().includes("check claims"))!;
  const panel = () => dom.window.document.querySelector('[aria-label="Optional script check"]');
  const clickCheck = async () => {
    await act(async () => { checkButton().dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); });
  };
  try {
    await act(async () => { root.render(createElement(HearthDraftScriptHeader, props)); });
    assert.equal(panel(), null, "a saved check starts hidden");
    assert.equal(checkButton().getAttribute("aria-expanded"), "false");

    await clickCheck();
    assert.equal(checks, 1);
    await act(async () => { await import("../src/views/modes/HearthPreflightPanel"); });
    assert.ok(panel(), "turning on runs and shows the check");
    assert.equal(checkButton().textContent, "Hide claims check");
    assert.equal(checkButton().getAttribute("aria-expanded"), "true");

    await clickCheck();
    assert.equal(checks, 1, "turning off does not rerun or delete the check");
    assert.equal(panel(), null);
    assert.equal(checkButton().textContent, "Check claims (optional)");

    await clickCheck();
    assert.equal(checks, 2, "turning on again refreshes the check");
    assert.ok(panel());

    await act(async () => {
      root.render(createElement(HearthDraftScriptHeader, {
        ...props, workpieceId: "workpiece-two", activeDraft: { ...draft, id: "draft-two" },
      }));
    });
    assert.equal(panel(), null, "a different script starts with the check off");
    assert.equal(checkButton().getAttribute("aria-expanded"), "false");
  } finally {
    await act(async () => { root.unmount(); });
    dom.window.close();
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});
