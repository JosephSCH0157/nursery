import { useCallback } from "react";
import type { Draft } from "../domain/draft";
import type { BarStockSpark } from "../lib/barstock-sparks";
import type { HearthChatMessage } from "../lib/hearth-chat-api";

type PersistDraftManual = (args: {
  draft: Draft;
  updatedAt: number;
  createRevision: null;
  saveReason: "manual";
}) => Promise<boolean>;

type UseHearthDraftControllerArgs = {
  activeDraft: Draft | null;
  workpieceId: string | null;
  sparks: BarStockSpark[];
  mode: "sparks" | "episodes" | "ready" | "series" | "focus";
  isMobile: boolean;
  mobileOverlayView: "editor" | "ready" | null;
  draftConflictLocalBody: string | null;
  scriptPanelBodyText: string;
  normalizeUuid: (value: string | null | undefined) => string | null;
  dedupeDraftListById: (input: Draft[]) => Draft[];
  persistDraftManual: PersistDraftManual;
  noteManualSaveSuccess: (timestampMs: number) => void;
  flushChatHistoryNow: (args?: { historyKey?: string | null; draftId?: string | null; messages?: HearthChatMessage[] }) => void;
  refreshDrafts: () => Promise<Draft[]>;
  listDrafts: () => Promise<Draft[]>;
  deleteDraftById: (draftId: string) => Promise<void>;
  getDraftById: (draftId: string) => Promise<Draft | null>;
  selectDraft: (draft: Draft | null, options?: { revisionWorkpieceId?: string | null }) => Promise<void>;
  selectDraftForWorkpiece: (args: {
    workpieceId: string;
    drafts: readonly Draft[];
    sparks: readonly BarStockSpark[];
    preferredDraftId?: string | null;
  }) => Draft | null;
  openWorkpieceInFocus: (targetWorkpieceId: string, options?: {
    drafts?: readonly Draft[];
    preferredDraftId?: string | null;
  }) => Promise<Draft | null>;
  persistSession: (draftId: string | null, uiSelectedTab?: string) => Promise<void>;
  setDraftConflictState: (next: { message: string; localBody: string } | null) => void;
  setError: (next: string | null) => void;
  setScriptPanelCopyMessage: (next: string | null) => void;
  setDrafts: (next: Draft[]) => void;
  setFocusTab: (next: "draft" | "planning" | "sources" | "revisions") => void;
  setMode: (next: "sparks" | "episodes" | "ready" | "series" | "focus") => void;
  setMobileOverlayView: (next: "editor" | "ready" | null) => void;
  writeTextToClipboard: (text: string) => Promise<boolean>;
};

export function useHearthDraftController(args: UseHearthDraftControllerArgs) {
  const onSaveDraft = useCallback(async () => {
    if (!args.activeDraft) return;
    const now = Date.now();
    const saved = await args.persistDraftManual({
      draft: args.activeDraft,
      updatedAt: now,
      createRevision: null,
      saveReason: "manual",
    });
    if (!saved) return;
    args.noteManualSaveSuccess(now);
    args.flushChatHistoryNow({ draftId: args.activeDraft.id });
  }, [args]);

  const onReloadLatestDraftAfterConflict = useCallback(async () => {
    const currentDraftId = args.activeDraft?.id ?? null;
    await args.refreshDrafts();
    if (!currentDraftId) {
      args.setDraftConflictState(null);
      return;
    }
    const latest = await args.getDraftById(currentDraftId);
    if (latest) {
      await args.selectDraft(latest);
    }
    args.setDraftConflictState(null);
  }, [args]);

  const onCopyConflictLocalText = useCallback(async () => {
    const text = args.draftConflictLocalBody?.trim() ?? "";
    if (!text) return false;
    try {
      const copied = await args.writeTextToClipboard(text);
      if (!copied) {
        throw new Error("copy_failed");
      }
      args.setError("Copied your local draft text to clipboard.");
      return true;
    } catch {
      args.setError("Unable to copy local text. Select and copy manually.");
      return false;
    }
  }, [args]);

  const onCopyScriptPanelText = useCallback(async () => {
    const text = args.scriptPanelBodyText;
    if (!text.trim()) return false;
    const copied = await args.writeTextToClipboard(text);
    args.setScriptPanelCopyMessage(copied ? "Copied to clipboard." : "Clipboard write failed.");
    return copied;
  }, [args]);

  const onDeleteDraft = useCallback(async (draft: Draft) => {
    const draftTitle = draft.title.trim() || "Untitled Draft";
    const confirmDelete = window.confirm(`Delete draft buffer "${draftTitle}"? This cannot be undone.`);
    if (!confirmDelete) return;
    args.setError(null);
    try {
      const deletingActiveDraft = args.activeDraft?.id === draft.id;
      await args.deleteDraftById(draft.id);
      const nextDrafts = args.dedupeDraftListById(await args.listDrafts());
      args.setDrafts(nextDrafts);

      if (deletingActiveDraft) {
        const activeWorkpieceId = args.normalizeUuid(args.workpieceId);
        if (activeWorkpieceId) {
          const replacementDraft = args.selectDraftForWorkpiece({
            workpieceId: activeWorkpieceId,
            drafts: nextDrafts,
            sparks: args.sparks,
            preferredDraftId: activeWorkpieceId,
          });
          if (replacementDraft) {
            await args.selectDraft(replacementDraft, { revisionWorkpieceId: activeWorkpieceId });
          } else {
            await args.openWorkpieceInFocus(activeWorkpieceId, {
              drafts: nextDrafts,
              preferredDraftId: activeWorkpieceId,
            });
          }
          if (args.mode === "focus") {
            args.setFocusTab("draft");
          }
          return;
        }

        const replacementDraft = nextDrafts.find((candidate) => !candidate.archived) ?? nextDrafts[0] ?? null;
        if (replacementDraft) {
          await args.selectDraft(replacementDraft);
          if (args.mode === "focus") {
            args.setFocusTab("draft");
          }
          return;
        }

        await args.selectDraft(null);
        await args.persistSession(null, "draft");
        args.setFocusTab("draft");
        args.setMode("episodes");
        if (args.isMobile && args.mobileOverlayView === "editor") {
          args.setMobileOverlayView(null);
        }
      }

      await args.persistSession(args.activeDraft?.id ?? null, "draft");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete draft buffer.";
      args.setError(message);
    }
  }, [args]);

  return {
    onSaveDraft,
    onReloadLatestDraftAfterConflict,
    onCopyConflictLocalText,
    onCopyScriptPanelText,
    onDeleteDraft,
  };
}
