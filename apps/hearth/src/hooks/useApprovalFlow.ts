import { useCallback, useRef, useState } from "react";
import type { Draft } from "../domain/draft";
import type { Revision } from "../domain/revision";
import type { ScriptValidationResult } from "@forge/shared/script-tags";
import type { MirrorApprovedScriptResult } from "../lib/hearth-script-mirror";
import type { HearthCanonicalRevisionsResult } from "../storage/hearth-store";
import type { HearthOperationAuthority } from "../lib/hearth-operation-authority";
import type { HearthPreflightAuthority } from "../lib/hearth-research-preflight-authority";

type ScriptApprovalStateLike = { hasApprovedScript: boolean; approvedScriptVersion: number | null; approvedAt: number | null };
type ApprovalPersistenceStatusLike = { cloud: "ok"; local: "ok" | "failed"; localPath?: string; localMessage?: string };
type StyleUpdateResult = { ok: boolean; skipped?: boolean; reason?: string; status?: string | number; error?: unknown; profile?: { scriptsAnalyzedCount: number } };

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
  evaluateScriptValidation: (rawText: string) => { normalizedText: string; validation: ScriptValidationResult };
  buildValidationReport: (validation: ScriptValidationResult) => string;
  buildPersistedValidationMeta: (validation: ScriptValidationResult) => Draft["scriptValidationMeta"];
  nextApprovedScriptVersion: (revisions: readonly Revision[]) => number;
  persistApprovedDraft: (args: { draft: Draft; updatedAt: number }) => Promise<boolean>;
  publishApprovedScript: (args: { episodeId: string; scriptText: string }) => Promise<boolean>;
  readCanonicalApprovalRevisions: (args: { episodeId: string; draftId: string }) => Promise<HearthCanonicalRevisionsResult>;
  commitCanonicalApprovalRevision: (args: { episodeId: string; draft: Draft; approvalNote: string }) => Promise<{ ok: true; approvedAt: number } | { ok: false }>;
  mirrorApprovedScript: (args: { workspaceId: string | null; workpieceId: string; scriptText: string }) => Promise<MirrorApprovedScriptResult>;
  graduateLinkedSpark: (episodeId: string) => Promise<string | null> | string | null;
  setScriptApprovalState: (next: ScriptApprovalStateLike) => void;
  writeScriptApprovalRecoveryEvidence: (episodeId: string, next: ScriptApprovalStateLike) => void;
  updateStyleProfileFromReadyCheckpoint: (args: { workspaceId: string | null; scriptText: string }) => Promise<StyleUpdateResult>;
  appendApprovalMarker: (args: { draftId: string; content: string }) => void;
  refreshReadyScripts: () => Promise<void> | void;
  preflight: HearthPreflightAuthority | null;
  approvedScriptVersion: number | null;
  approvedAt: number | null;
};

export function useApprovalFlow(args: UseApprovalFlowArgs): {
  isApprovingScript: boolean;
  isMarkingReady: boolean;
  onApproveScript: (options?: { draftOverride?: Draft }) => Promise<boolean>;
  onMarkReady: () => Promise<boolean>;
} {
  const [isApprovingScript, setIsApprovingScript] = useState(false);
  const [isMarkingReady, setIsMarkingReady] = useState(false);
  const latestArgs = useRef(args);
  latestArgs.current = args;

  const onApproveScript = useCallback(async (options?: { draftOverride?: Draft }) => {
    if (isApprovingScript || args.isSaving || args.isAiProcessing) return false;
    const approvalDraft = options?.draftOverride ?? args.activeDraft;
    if (!approvalDraft) return false;
    const episodeId = args.workpieceId?.trim();
    if (!episodeId) { args.setChatError("Select an Episode or Spark to start."); return false; }
    if (!approvalDraft.body.trim()) { args.setError("Script body is empty. Add script content before approval."); return false; }
    if (!args.preflight || args.preflight.stale || !args.preflight.reviewed) {
      args.setError("Review this exact working draft for recording and complete its findings before approval.");
      return false;
    }

    const operation = args.operationAuthority.begin("ap");
    const { buildHearthApprovedScriptReplacement, canonicalHearthApprovalText } = await import("../lib/hearth-script-approval");
    if (!args.operationAuthority.isCurrent(operation)) return false;
    const approvedReplacement = buildHearthApprovedScriptReplacement({
      draft: approvalDraft,
      evaluateScriptValidation: args.evaluateScriptValidation,
      buildPersistedValidationMeta: args.buildPersistedValidationMeta,
    });
    const { scriptText: normalizedText, validation } = approvedReplacement;
    const isApprovalCurrent = () => {
      const current = latestArgs.current;
      return args.operationAuthority.isCurrent(operation)
        && current.workspaceId === args.workspaceId
        && current.workpieceId === args.workpieceId
        && current.activeDraft?.id === approvalDraft.id
        && canonicalHearthApprovalText(current.activeDraft.body) === normalizedText
        && current.preflight?.id === args.preflight?.id
        && current.preflight?.sourceFileRevision === args.preflight?.sourceFileRevision
        && current.preflight?.scriptHash === args.preflight?.scriptHash
        && current.preflight?.reviewed === true && !current.preflight.stale;
    };
    if (!isApprovalCurrent()) return false;
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
    setIsApprovingScript(true);
    try {
      const canonical = await args.readCanonicalApprovalRevisions({ episodeId, draftId: approvalDraft.id });
      if (!canonical.ok || !isApprovalCurrent()) {
        args.setError("Approval is unavailable because canonical Tongs revision history could not be verified.");
        return false;
      }
      const nextVersion = args.nextApprovedScriptVersion(canonical.revisions);
      if (!args.workspaceId) { args.setError("Canonical script approval requires an active workspace."); return false; }
      const { commitPublishedScriptApprovalAuthority } = await import("../lib/hearth-script-approval-authority");
      const authorityCommit = await commitPublishedScriptApprovalAuthority({
        workpieceId: episodeId,
        workspaceId: args.workspaceId,
        creatorVersion: nextVersion,
        scriptText: normalizedText,
        preflightReportId: args.preflight.id,
        reviewedBasis: { sourceFileRevision: args.preflight.sourceFileRevision, scriptHash: args.preflight.scriptHash },
        isCurrent: isApprovalCurrent,
      });
      if (!isApprovalCurrent()) return false;
      if (!authorityCommit.ok) { args.setError(authorityCommit.error); return false; }

      const approvedAt = Date.now();
      const nextState: ScriptApprovalStateLike = { hasApprovedScript: true, approvedScriptVersion: nextVersion, approvedAt };
      args.setScriptApprovalState(nextState);
      args.writeScriptApprovalRecoveryEvidence(episodeId, nextState);

      const draftSaved = await args.persistApprovedDraft({ draft: approvedReplacement.draft, updatedAt: approvedAt });
      if (!draftSaved) args.setApprovalPersistenceStatus({ cloud: "ok", local: "failed", localMessage: "Approval is canonical, but the draft buffer marker did not save." });
      const milestone = await args.commitCanonicalApprovalRevision({ episodeId, draft: approvedReplacement.draft, approvalNote: `script_version_approved:v${nextVersion}` });
      if (!milestone.ok) args.setApprovalPersistenceStatus({ cloud: "ok", local: "failed", localMessage: "Approval is canonical, but revision history did not update." });

      args.setApprovalPersistenceStatus({ cloud: "ok", local: "failed", localMessage: "Local mirror sync pending." });
      void args.mirrorApprovedScript({ workspaceId: args.workspaceId, workpieceId: episodeId, scriptText: normalizedText }).then((mirror) => {
        if (mirror.ok) args.setApprovalPersistenceStatus({ cloud: "ok", local: "ok", localPath: mirror.relativePath });
        else args.setApprovalPersistenceStatus({ cloud: "ok", local: "failed", localMessage: mirror.message });
      }).catch((error: unknown) => args.setApprovalPersistenceStatus({ cloud: "ok", local: "failed", localMessage: error instanceof Error ? error.message : "Local mirror sync failed." }));
      return true;
    } finally { setIsApprovingScript(false); }
  }, [args, isApprovingScript]);

  const onMarkReady = useCallback(async () => {
    if (isMarkingReady || args.isSaving || args.isAiProcessing) return false;
    const episodeId = args.workpieceId?.trim();
    if (!episodeId || !args.workspaceId || !args.activeDraft || !args.preflight || args.preflight.stale || !args.preflight.reviewed) {
      args.setError("Ready requires the current approved script and its completed producer review.");
      return false;
    }
    setIsMarkingReady(true);
    try {
      const { markApprovedScriptReady, readPublishedScriptApprovalAuthority } = await import("../lib/hearth-script-approval-authority");
      const authority = await readPublishedScriptApprovalAuthority(episodeId);
      if (!authority || authority.contentHash !== args.preflight.scriptHash) {
        args.setError("The current approval does not match the reviewed script bytes. Review and approve the current draft again.");
        return false;
      }
      const ready = await markApprovedScriptReady({ workpieceId: episodeId, workspaceId: args.workspaceId, authority, preflightReportId: args.preflight.id });
      if (!ready.ok) { args.setError(ready.error); return false; }
      const graduatedSparkId = await args.graduateLinkedSpark(episodeId);
      const styleUpdate = await args.updateStyleProfileFromReadyCheckpoint({ workspaceId: args.workspaceId, scriptText: args.activeDraft.body });
      const styleAlignmentMarker = styleUpdate.ok && !styleUpdate.skipped
        ? `style_alignment: updated (scripts_analyzed: ${styleUpdate.profile?.scriptsAnalyzedCount ?? 0})`
        : styleUpdate.ok && styleUpdate.reason === "paused" ? "style_alignment: paused" : null;
      const { buildApprovalMarkerLines } = await import("../lib/hearth-approval-marker");
      args.appendApprovalMarker({ draftId: args.activeDraft.id, content: buildApprovalMarkerLines({ version: args.approvedScriptVersion ?? 1, approvedAt: args.approvedAt ?? Date.now(), graduatedSparkId, styleAlignmentMarker }).join("\n") });
      await args.refreshReadyScripts();
      return true;
    } finally { setIsMarkingReady(false); }
  }, [args, isMarkingReady]);

  return { isApprovingScript, isMarkingReady, onApproveScript, onMarkReady };
}
