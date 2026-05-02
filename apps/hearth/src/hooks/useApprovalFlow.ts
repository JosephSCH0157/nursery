import { useCallback, useState } from "react";
import type { Draft } from "../domain/draft";
import type { Revision } from "../domain/revision";
import type { ScriptValidationResult } from "@forge/shared/script-tags";
import type { MirrorApprovedScriptResult } from "../lib/hearth-script-mirror";
import { buildHearthApprovedScriptReplacement } from "../lib/hearth-script-approval";

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
  activeDraft: Draft | null;
  workpieceId: string | null | undefined;
  workspaceId: string | null;
  revisions: Revision[];
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
  nextApprovedScriptVersion: (revisions: Revision[]) => number;
  persistApprovedDraft: (args: {
    draft: Draft;
    updatedAt: number;
    approvalNote: string;
  }) => Promise<boolean>;
  publishApprovedScript: (args: { episodeId: string; scriptText: string }) => Promise<boolean>;
  mirrorApprovedScript: (args: {
    workspaceId: string | null;
    workpieceId: string;
    scriptText: string;
  }) => Promise<MirrorApprovedScriptResult>;
  graduateLinkedSpark: (episodeId: string) => Promise<string | null> | string | null;
  setScriptApprovalState: (next: ScriptApprovalStateLike) => void;
  writeScriptApprovalState: (episodeId: string, next: ScriptApprovalStateLike) => void;
  updateStyleProfileFromReadyCheckpoint: (args: {
    workspaceId: string | null;
    scriptText: string;
  }) => Promise<StyleUpdateResult>;
  appendApprovalMarker: (args: { draftId: string; content: string }) => void;
  refreshReadyScripts: () => Promise<void> | void;
};

function mirrorStatusLine(result: MirrorApprovedScriptResult): string {
  if (result.ok) {
    return `saved_to_local_mirror: ok (${result.relativePath})`;
  }
  return `saved_to_local_mirror: failed (${result.message})`;
}

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

    const scopedRevisions = args.revisions.filter((revision) => revision.draftId === approvalDraft.id);
    const nextVersion = args.nextApprovedScriptVersion(scopedRevisions);
    const approvalNote = `script_version_approved:v${nextVersion}`;
    args.clearScriptValidation();
    args.setError(null);
    args.setChatError(null);
    args.setAiRuntimeWarning(null);
    args.setApprovalPersistenceStatus(null);
    setIsApprovingScript(true);
    try {
      const now = Date.now();
      const saved = await args.persistApprovedDraft({
        draft: approvedReplacement.draft,
        updatedAt: now,
        approvalNote,
      });
      if (!saved) return false;

      const published = await args.publishApprovedScript({
        episodeId,
        scriptText: normalizedText,
      });
      if (!published) {
        args.setError("Failed to publish approved script to Tongs. Try approving again.");
        return false;
      }

      const mirror = await args.mirrorApprovedScript({
        workspaceId: args.workspaceId,
        workpieceId: episodeId,
        scriptText: normalizedText,
      });
      const graduatedSparkId = await args.graduateLinkedSpark(episodeId);
      if (mirror.ok) {
        args.setApprovalPersistenceStatus({
          cloud: "ok",
          local: "ok",
          localPath: mirror.relativePath,
        });
        try {
          console.log("[hearth-approve] saved to cloud and local mirror", {
            workpieceId: episodeId,
            graduatedSparkId,
            localRelativePath: mirror.relativePath,
            mirrorWorkspaceId: mirror.workspaceId,
            vaultKey: mirror.vaultKey,
          });
        } catch {
          // ignore logging failures
        }
      } else {
        args.setApprovalPersistenceStatus({
          cloud: "ok",
          local: "failed",
          localMessage: mirror.message,
        });
        args.setAiRuntimeWarning(`Saved to cloud. Local mirror failed: ${mirror.message}`);
        try {
          console.warn("[hearth-approve] local mirror failed", {
            workpieceId: episodeId,
            graduatedSparkId,
            mirrorWorkspaceId: mirror.workspaceId,
            reason: mirror.reason,
            message: mirror.message,
          });
        } catch {
          // ignore logging failures
        }
      }

      const approvedAt = Date.now();
      const nextState: ScriptApprovalStateLike = {
        hasApprovedScript: true,
        approvedScriptVersion: nextVersion,
        approvedAt,
      };
      args.setScriptApprovalState(nextState);
      args.writeScriptApprovalState(episodeId, nextState);

      let styleAlignmentMarker: string | null = null;
      const styleUpdate = await args.updateStyleProfileFromReadyCheckpoint({
        workspaceId: args.workspaceId,
        scriptText: normalizedText,
      });
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

      const markerLines = [
        `🔥 Script Version ${nextVersion} Approved`,
        `script_version: ${nextVersion}`,
        `timestamp: ${new Date(approvedAt).toISOString()}`,
        "saved_to_cloud: ok",
        mirrorStatusLine(mirror),
        graduatedSparkId ? `spark_status: graduated (${graduatedSparkId})` : "spark_status: no_linked_spark",
        ...(styleAlignmentMarker ? [styleAlignmentMarker] : []),
        "Production Mode available",
      ];
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
