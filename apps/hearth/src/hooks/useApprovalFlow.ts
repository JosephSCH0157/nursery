import { useCallback, useState } from "react";
import type { Draft } from "../domain/draft";
import type { Revision } from "../domain/revision";
import type { ScriptValidationResult } from "@forge/shared/script-tags";
import type { MirrorApprovedScriptResult } from "../lib/hearth-script-mirror";
import type { HearthCanonicalRevisionsResult } from "../storage/hearth-store";
import type { HearthOperationAuthority } from "../lib/hearth-operation-authority";

type ScriptApprovalStateLike = {
  hasApprovedScript: boolean;
  approvedScriptVersion: number | null;
  approvedAt: number | null;
};

type ApprovalPersistenceStatusLike = {
  cloud: "ok";
  local: "ok" | "failed";
  localPath?: string;
  localMessage?: string;
};

type StyleUpdateResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  status?: string | number;
  error?: unknown;
  profile?: {
    scriptsAnalyzedCount: number;
  };
};

type UseApprovalFlowArgs = {
  operationAuthority: HearthOperationAuthority;
  activeDraft: Draft | null;
  workpieceId: string | null | undefined;
  workspaceId: string | null;
  isSaving: boolean;
  isAiProcessing: boolean;
  setError: (value: string | null) => void;
  setChatError: (value: string | null) => void;
  setAiRuntimeWarning: (value: string | null) => void;
  setApprovalPersistenceStatus: (value: ApprovalPersistenceStatusLike | null) => void;
  setScriptValidationGateResult: (validation: ScriptValidationResult) => void;
  clearScriptValidation: () => void;
  evaluateScriptValidation: (rawText: string) => {
    normalizedText: string;
    validation: ScriptValidationResult;
  };
  buildValidationReport: (validation: ScriptValidationResult) => string;
  buildPersistedValidationMeta: (validation: ScriptValidationResult) => Draft["scriptValidationMeta"];
  nextApprovedScriptVersion: (revisions: readonly Revision[]) => number;
  persistApprovedDraft: (args: {
    draft: Draft;
    updatedAt: number;
  }) => Promise<boolean>;
  publishApprovedScript: (args: { episodeId: string; scriptText: string }) => Promise<boolean>;
  readCanonicalApprovalRevisions: (args: {
    episodeId: string;
    draftId: string;
  }) => Promise<HearthCanonicalRevisionsResult>;
  commitCanonicalApprovalRevision: (args: {
    episodeId: string;
    draft: Draft;
    approvalNote: string;
  }) => Promise<{ ok: true; approvedAt: number } | { ok: false }>;
  mirrorApprovedScript: (args: {
    workspaceId: string | null;
    workpieceId: string;
    scriptText: string;
  }) => Promise<MirrorApprovedScriptResult>;
  graduateLinkedSpark: (episodeId: string) => Promise<string | null> | string | null;
  setScriptApprovalState: (next: ScriptApprovalStateLike) => void;
  writeScriptApprovalRecoveryEvidence: (episodeId: string, next: ScriptApprovalStateLike) => void;
  updateStyleProfileFromReadyCheckpoint: (args: {
    workspaceId: string | null;
    scriptText: string;
  }) => Promise<StyleUpdateResult>;
  appendApprovalMarker: (args: { draftId: string; content: string }) => void;
  refreshReadyScripts: () => Promise<void> | void;
};

export function useApprovalFlow(args: UseApprovalFlowArgs): {
  isApprovingScript: boolean;
  onApproveScript: (options?: { draftOverride?: Draft }) => Promise<boolean>;
} {
  const [isApprovingScript, setIsApprovingScript] = useState(false);

  const onApproveScript = useCallback(async (options?: { draftOverride?: Draft }) => {
    if (isApprovingScript || args.isSaving || args.isAiProcessing) return false;
    const approvalDraft = options?.draftOverride ?? args.activeDraft;
    if (!approvalDraft) return false;
    const episodeId = args.workpieceId?.trim();
    if (!episodeId) {
      args.setChatError("Select an Episode or Spark to start.");
      return false;
    }
    if (!approvalDraft.body.trim()) {
      args.setError("Script body is empty. Add script content before approval.");
      return false;
    }

    const { buildHearthApprovedScriptReplacement } = await import("../lib/hearth-script-approval");
    const approvedReplacement = buildHearthApprovedScriptReplacement({
      draft: approvalDraft,
      evaluateScriptValidation: args.evaluateScriptValidation,
      buildPersistedValidationMeta: args.buildPersistedValidationMeta,
    });
    const { scriptText: normalizedText, validation } = approvedReplacement;
    if (!validation.ok) {
      args.setScriptValidationGateResult(validation);
      args.setError(`Script tags must be valid before approval.\nFix the issues below to continue.\n\n${args.buildValidationReport(validation)}`);
      return false;
    }

    args.clearScriptValidation();
    args.setError(null);
    args.setChatError(null);
    args.setAiRuntimeWarning(null);
    args.setApprovalPersistenceStatus(null);
    const operation = args.operationAuthority.begin("ap");
    setIsApprovingScript(true);
    try {
      const { commitCanonicalScriptApproval } = await import("../lib/hearth-approval-commit");
      const approvalCommit = await commitCanonicalScriptApproval({
        episodeId,
        draft: approvedReplacement.draft,
        readCanonicalRevisions: args.readCanonicalApprovalRevisions,
        nextApprovedVersion: args.nextApprovedScriptVersion,
        persistDraft: (input) => args.persistApprovedDraft(input),
        publishScript: args.publishApprovedScript,
        commitApprovalRevision: args.commitCanonicalApprovalRevision,
      });
      if (!args.operationAuthority.isCurrent(operation)) return false;
      if (!approvalCommit.ok) {
        const message = approvalCommit.stage === "canonical_read"
          ? "Approval is unavailable because canonical Tongs revision history could not be verified."
          : approvalCommit.stage === "script_publish"
            ? "Failed to publish approved script to Tongs. Try approving again."
            : approvalCommit.stage === "approval_commit"
              ? "Script saved, but Tongs did not acknowledge canonical approval. Try approving again."
              : "Tongs did not acknowledge the draft save. Approval was not committed.";
        args.setError(message);
        return false;
      }

      const approvedAt = approvalCommit.approvedAt;
      const nextVersion = approvalCommit.version;
      if (!args.workspaceId) {
        args.setError("Canonical script approval requires an active workspace.");
        return false;
      }
      const { commitPublishedScriptApprovalAuthority } = await import("../lib/hearth-script-approval-authority");
      const authorityCommit = await commitPublishedScriptApprovalAuthority({
        workpieceId: episodeId,
        workspaceId: args.workspaceId,
        creatorVersion: nextVersion,
      });
      if (!args.operationAuthority.isCurrent(operation)) return false;
      if (!authorityCommit.ok) {
        args.setError(authorityCommit.error);
        return false;
      }
      const nextState: ScriptApprovalStateLike = {
        hasApprovedScript: true,
        approvedScriptVersion: nextVersion,
        approvedAt,
      };
      args.setScriptApprovalState(nextState);
      args.writeScriptApprovalRecoveryEvidence(episodeId, nextState);

      // A local mirror is a production-independent convenience sink. Canonical
      // approval settles before this best-effort job starts and never awaits it.
      args.setApprovalPersistenceStatus({ cloud: "ok", local: "failed", localMessage: "Local mirror sync pending." });
      void args.mirrorApprovedScript({
        workspaceId: args.workspaceId,
        workpieceId: episodeId,
        scriptText: normalizedText,
      }).then((mirror) => {
        if (mirror.ok) {
          args.setApprovalPersistenceStatus({ cloud: "ok", local: "ok", localPath: mirror.relativePath });
          return;
        }
        args.setApprovalPersistenceStatus({ cloud: "ok", local: "failed", localMessage: mirror.message });
      }).catch((error: unknown) => {
        args.setApprovalPersistenceStatus({
          cloud: "ok",
          local: "failed",
          localMessage: error instanceof Error ? error.message : "Local mirror sync failed.",
        });
      });
      const graduatedSparkId = await args.graduateLinkedSpark(episodeId);
      if (!args.operationAuthority.isCurrent(operation)) return false;

      let styleAlignmentMarker: string | null = null;
      const styleUpdate = await args.updateStyleProfileFromReadyCheckpoint({
        workspaceId: args.workspaceId,
        scriptText: normalizedText,
      });
      if (!args.operationAuthority.isCurrent(operation)) return false;
      if (styleUpdate.ok) {
        if (!styleUpdate.skipped) {
          const scriptsCount = styleUpdate.profile?.scriptsAnalyzedCount ?? 0;
          styleAlignmentMarker = `style_alignment: updated (scripts_analyzed: ${scriptsCount})`;
        } else if (styleUpdate.reason === "paused") {
          styleAlignmentMarker = "style_alignment: paused";
        }
      } else {
        try {
          console.warn("[hearth-style] style profile update skipped after approval", {
            status: styleUpdate.status,
            error: styleUpdate.error,
          });
        } catch {
          // ignore logging failures
        }
      }

      const { buildApprovalMarkerLines } = await import("../lib/hearth-approval-marker");
      const markerLines = buildApprovalMarkerLines({
        version: nextVersion,
        approvedAt,
        graduatedSparkId,
        styleAlignmentMarker,
      });
      args.appendApprovalMarker({
        draftId: approvalDraft.id,
        content: markerLines.join("\n"),
      });
      void args.refreshReadyScripts();
      return true;
    } finally {
      setIsApprovingScript(false);
    }
  }, [args, isApprovingScript]);

  return {
    isApprovingScript,
    onApproveScript,
  };
}
