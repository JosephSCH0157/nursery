import type { Draft } from "../../domain/draft";
import type { ScriptValidationResult, ScriptValidationIssue } from "@forge/shared/script-tags";
import type { HearthPreflightAuthority } from "../../lib/hearth-research-preflight-authority";
import { lazy, Suspense } from "react";

const HearthPreflightPanel = lazy(() => import("./HearthPreflightPanel"));

type ToneOption = {
  value: string;
  label: string;
};

type DraftConflictStateLike = {
  message: string;
} | null;

type HearthDraftScriptHeaderProps = {
  isScriptWorkspaceTab: boolean;
  activeDraft: Draft | null;
  formatUpdatedAt: (value: number | undefined) => string;
  activeUserDisplayName: string;
  resolveDraftEditorName: (draft: Draft) => string;
  composeModeLabel: string;
  completionBadgeLabel: string;
  scriptCompletionReasons: string[];
  onDraftTitleChange: (value: string) => void;
  onCreateDraft: () => void | Promise<void>;
  onSaveDraft: () => void | Promise<void>;
  isSaving: boolean;
  onDeleteDraft: (draft: Draft) => void | Promise<void>;
  openRevisionModal: () => void;
  openRevisionPanel: () => void;
  onApproveScript: () => void | Promise<unknown>;
  onReviewForRecording: () => void | Promise<unknown>;
  onCompletePreflightReview: () => void | Promise<unknown>;
  onHandlePreflightFinding: (findingId: string, action: "acknowledge" | "resolve") => void | Promise<unknown>;
  preflightAuthority: HearthPreflightAuthority | null;
  preflightError: string | null;
  isReviewingPreflight: boolean;
  onMarkReady: () => void | Promise<unknown>;
  isMarkingReady: boolean;
  hasScript: boolean;
  isAiProcessing: boolean;
  isApprovingScript: boolean;
  approvalBlocked: boolean;
  activeTonePreset: string;
  onChangeTonePreset: (value: string) => void;
  tonePresetOptions: readonly ToneOption[];
  statusText: string;
  wordCount: number;
  charCount: number;
  aiAutosaveWarning: string | null;
  onRetryAiAutosave: () => void;
  editingPeersCount: number;
  viewingPeersCount: number;
  activeEditorName: string;
  activeViewerName: string;
  error: string | null;
  draftConflictState: DraftConflictStateLike;
  onReloadLatestDraftAfterConflict: () => void | Promise<void>;
  onCopyConflictLocalText: () => Promise<boolean>;
  acknowledgeCopy: (id: string) => void;
  isCopyAcknowledged: (id: string) => boolean;
  onDismissDraftConflict: () => void;
  displayedValidation: ScriptValidationResult | null;
  validationIssueCount: number;
  buildValidationReport: (result: ScriptValidationResult) => string;
  onJumpToValidationIssue: (issue: ScriptValidationIssue) => void;
  onFixScriptFormattingNoAi: () => void | Promise<void>;
  onAskAiRepairScript: () => void | Promise<void>;
  aiEpisodeReady: boolean;
  aiCreditsDepleted: boolean;
  ownerChatBlocked: boolean;
  isRepairingScript: boolean;
  onDismissValidation: () => void;
  showManualDraft: boolean;
  onToggleShowManualDraft: () => void;
  showScriptPanel: boolean;
  onToggleShowScriptPanel: () => void;
  hasApprovedScript: boolean;
  approvedScriptVersion: string | number | null;
  productionScriptStatus: "Working Draft" | "Approved for Production" | "Draft Changed Since Approval";
  isVisualScriptMode: boolean;
  onToggleVisualScriptMode: () => void;
};

export default function HearthDraftScriptHeader({
  isScriptWorkspaceTab,
  activeDraft,
  formatUpdatedAt,
  activeUserDisplayName,
  resolveDraftEditorName,
  composeModeLabel,
  completionBadgeLabel,
  scriptCompletionReasons,
  onDraftTitleChange,
  onCreateDraft,
  onSaveDraft,
  isSaving,
  onDeleteDraft,
  openRevisionModal,
  openRevisionPanel,
  onApproveScript,
  onReviewForRecording,
  onCompletePreflightReview,
  onHandlePreflightFinding,
  preflightAuthority,
  preflightError,
  isReviewingPreflight,
  onMarkReady,
  isMarkingReady,
  hasScript,
  isAiProcessing,
  isApprovingScript,
  approvalBlocked,
  activeTonePreset,
  onChangeTonePreset,
  tonePresetOptions,
  statusText,
  wordCount,
  charCount,
  aiAutosaveWarning,
  onRetryAiAutosave,
  editingPeersCount,
  viewingPeersCount,
  activeEditorName,
  activeViewerName,
  error,
  draftConflictState,
  onReloadLatestDraftAfterConflict,
  onCopyConflictLocalText,
  acknowledgeCopy,
  isCopyAcknowledged,
  onDismissDraftConflict,
  displayedValidation,
  validationIssueCount,
  buildValidationReport,
  onJumpToValidationIssue,
  onFixScriptFormattingNoAi,
  onAskAiRepairScript,
  aiEpisodeReady,
  aiCreditsDepleted,
  ownerChatBlocked,
  isRepairingScript,
  onDismissValidation,
  showManualDraft,
  onToggleShowManualDraft,
  showScriptPanel,
  onToggleShowScriptPanel,
  hasApprovedScript,
  approvedScriptVersion,
  productionScriptStatus,
  isVisualScriptMode,
  onToggleVisualScriptMode,
}: HearthDraftScriptHeaderProps) {
  if (!isScriptWorkspaceTab) return null;

  return (
    <>
      <header className="hs-draft-header hs-draft-header-chat-first">
        <div className="hs-draft-title-wrap">
          <div className="hs-draft-title">Project</div>
          <div className="hs-draft-updated">
            Last updated {formatUpdatedAt(activeDraft?.updatedAt)}
          </div>
          <div className="hs-draft-updated">
            Editing as {activeUserDisplayName} · Last edited by {activeDraft ? resolveDraftEditorName(activeDraft) : "Unknown"}
          </div>
          <div className="hs-draft-updated">
            Mode: {composeModeLabel} · Badge: {completionBadgeLabel}
            {scriptCompletionReasons.length > 0 ? ` · ${scriptCompletionReasons.join(" ")}` : ""}
          </div>
        </div>
        <label className="hs-project-title">
          <span className="hs-field-label">Project title</span>
          <input
            type="text"
            value={activeDraft?.title ?? ""}
            placeholder="Project title"
            onChange={(event) => onDraftTitleChange(event.target.value)}
            disabled={!activeDraft}
          />
        </label>
      </header>

      <div className="hs-toolbar">
        <button onClick={() => void onCreateDraft()}>New Draft</button>
        <button onClick={() => void onSaveDraft()} disabled={!activeDraft || isSaving}>
          {isSaving ? "Saving..." : "Save draft"}
        </button>
        <button onClick={() => activeDraft && void onDeleteDraft(activeDraft)} disabled={!activeDraft || isSaving}>
          Delete Draft Buffer
        </button>
        <button onClick={openRevisionModal} disabled={!activeDraft || isSaving}>
          Create Revision
        </button>
        <button onClick={openRevisionPanel} disabled={!activeDraft}>
          Revisions
        </button>
        <button
          type="button"
          onClick={() => void onReviewForRecording()}
          disabled={!activeDraft || !hasScript || isSaving || isAiProcessing || isReviewingPreflight}
        >
          {isReviewingPreflight ? "Checking..." : "Check claims (optional)"}
        </button>
        <button
          type="button"
          onClick={() => void onApproveScript()}
          disabled={!activeDraft || !hasScript || isSaving || isAiProcessing || isApprovingScript || approvalBlocked}
        >
          {isApprovingScript ? "Approving..." : "Approve Script"}
        </button>
        <button
          type="button"
          onClick={() => void onMarkReady()}
          disabled={!hasApprovedScript || isMarkingReady}
        >
          {isMarkingReady ? "Marking Ready..." : "Mark Ready"}
        </button>
        <label className="hs-tone-control">
          <span>Tone</span>
          <select
            value={activeTonePreset}
            onChange={(event) => onChangeTonePreset(event.target.value)}
            disabled={!activeDraft}
          >
            {tonePresetOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <span className="hs-status-text">{statusText}</span>
        <span className="hs-status-text" data-script-authority-status>{productionScriptStatus}</span>
        <span className="hs-count-text">{wordCount} words · {charCount} chars</span>
        {aiAutosaveWarning ? (
          <span className="hs-autosave-warning" role="status" aria-live="polite">
            {aiAutosaveWarning}
            <button type="button" onClick={onRetryAiAutosave}>
              Retry
            </button>
            <button type="button" onClick={() => void onSaveDraft()}>
              Save now
            </button>
          </span>
        ) : null}
      </div>

      {editingPeersCount > 0 ? (
        <div className="hs-error-text-small">{activeEditorName} is editing this right now.</div>
      ) : viewingPeersCount > 0 ? (
        <div className="hs-muted-text-subtle">Viewed by {activeViewerName} (active)</div>
      ) : null}

      {error ? (
        <div className="hs-error-text">{error}</div>
      ) : null}

      {preflightAuthority ? (
        <Suspense fallback={<div className="hs-muted-text-subtle">Loading optional script check…</div>}>
          <HearthPreflightPanel authority={preflightAuthority} onComplete={onCompletePreflightReview} onFinding={onHandlePreflightFinding} />
        </Suspense>
      ) : null}
      {preflightError ? <div className="hs-error-text">{preflightError}</div> : null}

      {draftConflictState ? (
        <section className="hs-script-validation" aria-label="Draft conflict">
          <div className="hs-script-validation-title">Draft changed elsewhere</div>
          <div className="hs-script-validation-subtitle">{draftConflictState.message}</div>
          <div className="hs-script-validation-actions">
            <button type="button" onClick={() => void onReloadLatestDraftAfterConflict()}>
              Reload latest
            </button>
            <button
              type="button"
              className={isCopyAcknowledged("draft-conflict.local") ? "hs-copy-ack" : undefined}
              onClick={() => {
                void onCopyConflictLocalText().then((copied) => {
                  if (copied) acknowledgeCopy("draft-conflict.local");
                });
              }}
            >
              Copy my local text
            </button>
            <button type="button" onClick={onDismissDraftConflict}>
              Dismiss
            </button>
          </div>
        </section>
      ) : null}

      {displayedValidation && !displayedValidation.ok ? (
        <section className="hs-script-validation" aria-label="Anvil tag validation">
          <div className="hs-script-validation-title">Tag Validation</div>
          <div className="hs-script-validation-subtitle">
            Script tags must be valid before approval.
            Fix the issues below to continue.
          </div>
          <div className="hs-script-validation-subtitle">{validationIssueCount} errors</div>
          <pre className="hs-script-validation-report">{buildValidationReport(displayedValidation)}</pre>
          <ul className="hs-script-validation-issues">
            {displayedValidation.issues.map((issue, index) => (
              <li key={`${issue.code}-${issue.line}-${issue.column}-${index}`}>
                <button
                  type="button"
                  onClick={() => onJumpToValidationIssue(issue)}
                  className="hs-script-validation-jump"
                >
                  line {issue.line}: {issue.message}
                </button>
              </li>
            ))}
          </ul>
          <div className="hs-script-validation-actions">
            <button
              type="button"
              onClick={() => void onFixScriptFormattingNoAi()}
              disabled={!activeDraft || isSaving || isRepairingScript}
            >
              Fix Tag Structure
            </button>
            <button
              type="button"
              onClick={() => void onAskAiRepairScript()}
              disabled={!activeDraft || !aiEpisodeReady || aiCreditsDepleted || ownerChatBlocked || isAiProcessing || isRepairingScript}
            >
              {isRepairingScript ? "Repairing..." : "Ask AI to repair"}
            </button>
            <button
              type="button"
              onClick={onDismissValidation}
              disabled={isRepairingScript}
            >
              Dismiss
            </button>
          </div>
        </section>
      ) : null}

      <div className="hs-chat-stage-controls">
        <div className="hs-manual-draft-controls">
          <button
            type="button"
            onClick={onToggleShowManualDraft}
            disabled={!activeDraft}
          >
            {showManualDraft ? "Hide Manual Draft" : "Manual Draft (no AI)"}
          </button>
          {hasScript ? (
            <button
              type="button"
              onClick={onToggleShowScriptPanel}
              disabled={!activeDraft}
            >
              {showScriptPanel ? "Hide Script panel" : "Script panel"}
            </button>
          ) : null}
          {hasApprovedScript && approvedScriptVersion ? (
            <button
              type="button"
              onClick={onToggleVisualScriptMode}
            >
              {isVisualScriptMode ? "Exit Visual Mode" : "Visual Mode"}
            </button>
          ) : null}
        </div>
        <div className="hs-field-label-muted">Write without AI (just a text editor)</div>
      </div>
    </>
  );
}
