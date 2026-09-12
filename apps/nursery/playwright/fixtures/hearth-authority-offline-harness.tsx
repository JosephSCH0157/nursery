import { useState } from "react";
import { createRoot } from "react-dom/client";
import HearthDraftScriptHeader from "../../../hearth/src/views/modes/HearthDraftScriptHeader";
import type { HearthPreflightAuthority } from "../../../hearth/src/lib/hearth-research-preflight-authority";
import "../../../hearth/src/routes/HearthShell.css";

const noop = () => undefined;
const draft = {
  id: "offline-draft",
  title: "Offline authority exercise",
  body: "[s1]\nA deterministic script with a creator-supplied claim.\n[/s1]\n",
  createdAt: Date.now(),
  updatedAt: Date.now(),
};
const initialAuthority: HearthPreflightAuthority = {
  id: "offline-preflight",
  revision: 1,
  sourceFileRevision: 1,
  scriptHash: "a".repeat(64),
  researchArtifactId: "offline-research",
  researchArtifactHash: "b".repeat(64),
  report: {
    schema: "forge.hearth.editorial-preflight.v1",
    checkerContractVersion: "forge.hearth.editorial-preflight.deterministic.v1",
    usedPaidAi: false,
    findings: [],
    summary: { blockers: 0, warnings: 1, notes: 0 },
  },
  findings: [{
    id: "creator-claim-unverified-1",
    code: "creator_claim_unverified",
    severity: "warning",
    category: "provenance",
    message: "A creator-supplied claim remains unverified in the canonical evidence snapshot.",
    excerpt: "A deterministic script with a creator-supplied claim.",
    latestAction: null,
  }],
  reviewed: false,
  stale: false,
  staleReasons: [],
};

export function Harness() {
  const [authority, setAuthority] = useState(initialAuthority);
  const [approved, setApproved] = useState(false);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("Paid AI unavailable. Deterministic review remains available.");
  return (
    <main className="hs-shell" data-offline-authority-harness>
      <p role="status">{status}</p>
      <HearthDraftScriptHeader
        isScriptWorkspaceTab
        activeDraft={draft}
        formatUpdatedAt={() => "now"}
        activeUserDisplayName="Offline creator"
        resolveDraftEditorName={() => "Offline creator"}
        composeModeLabel="Conversation"
        completionBadgeLabel="Draft"
        scriptCompletionReasons={[]}
        onDraftTitleChange={noop}
        onCreateDraft={noop}
        onSaveDraft={noop}
        isSaving={false}
        onDeleteDraft={noop}
        openRevisionModal={noop}
        openRevisionPanel={noop}
        onApproveScript={() => { setApproved(true); setStatus("Script approved. Ready remains a separate action."); }}
        onReviewForRecording={noop}
        onCompletePreflightReview={() => {
          if (authority.findings.every((finding) => finding.latestAction || finding.severity === "note")) {
            setAuthority((current) => ({ ...current, reviewed: true }));
            setStatus("Deterministic producer review completed without AI.");
          }
        }}
        onHandlePreflightFinding={(findingId, action) => setAuthority((current) => ({ ...current, findings: current.findings.map((finding) => finding.id === findingId ? { ...finding, latestAction: action } : finding) }))}
        preflightAuthority={authority}
        preflightError={null}
        isReviewingPreflight={false}
        onMarkReady={() => { setReady(true); setStatus("Ready published by an explicit creator action."); }}
        isMarkingReady={false}
        hasScript
        isAiProcessing={false}
        isApprovingScript={false}
        approvalBlocked={false}
        activeTonePreset=""
        onChangeTonePreset={noop}
        tonePresetOptions={[]}
        statusText={ready ? "Ready" : approved ? "Approved, not Ready" : "Not approved"}
        wordCount={8}
        charCount={draft.body.length}
        aiAutosaveWarning={null}
        onRetryAiAutosave={noop}
        editingPeersCount={0}
        viewingPeersCount={0}
        activeEditorName=""
        activeViewerName=""
        error={null}
        draftConflictState={null}
        onReloadLatestDraftAfterConflict={noop}
        onCopyConflictLocalText={async () => false}
        acknowledgeCopy={noop}
        isCopyAcknowledged={() => false}
        onDismissDraftConflict={noop}
        displayedValidation={null}
        validationIssueCount={0}
        buildValidationReport={() => ""}
        onJumpToValidationIssue={noop}
        onFixScriptFormattingNoAi={noop}
        onAskAiRepairScript={() => { throw new Error("Provider execution is forbidden in the offline authority harness."); }}
        aiEpisodeReady={false}
        aiCreditsDepleted
        isRepairingScript={false}
        onDismissValidation={noop}
        showManualDraft={false}
        onToggleShowManualDraft={noop}
        showScriptPanel={false}
        onToggleShowScriptPanel={noop}
        hasApprovedScript={approved}
        approvedScriptVersion={approved ? 1 : null}
        productionScriptStatus={approved ? "Approved for Production" : "Working Draft"}
        isVisualScriptMode={false}
        onToggleVisualScriptMode={noop}
      />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
