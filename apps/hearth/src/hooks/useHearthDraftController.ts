import { useCallback } from "react";
import type { Draft } from "../domain/draft";
import type { HearthChatMessage } from "../lib/hearth-chat-api";

type PersistDraftManual = (args: {
  draft: Draft;
  updatedAt: number;
  createRevision: null;
  saveReason: "manual";
}) => Promise<boolean>;

type UseHearthDraftControllerArgs = {
  activeDraft: Draft | null;
  draftConflictLocalBody: string | null;
  scriptPanelBodyText: string;
  persistDraftManual: PersistDraftManual;
  noteManualSaveSuccess: (timestampMs: number) => void;
  flushChatHistoryNow: (args?: { historyKey?: string | null; draftId?: string | null; messages?: HearthChatMessage[] }) => void;
  refreshDrafts: () => Promise<Draft[]>;
  getDraftById: (draftId: string) => Promise<Draft | null>;
  selectDraft: (draft: Draft) => Promise<void>;
  setDraftConflictState: (next: { message: string; localBody: string } | null) => void;
  setError: (next: string | null) => void;
  setScriptPanelCopyMessage: (next: string | null) => void;
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
    if (!text) return;
    try {
      const copied = await args.writeTextToClipboard(text);
      if (!copied) {
        throw new Error("copy_failed");
      }
      args.setError("Copied your local draft text to clipboard.");
    } catch {
      args.setError("Unable to copy local text. Select and copy manually.");
    }
  }, [args]);

  const onCopyScriptPanelText = useCallback(async () => {
    const text = args.scriptPanelBodyText;
    if (!text.trim()) return;
    const copied = await args.writeTextToClipboard(text);
    args.setScriptPanelCopyMessage(copied ? "Copied to clipboard." : "Clipboard write failed.");
  }, [args]);

  return {
    onSaveDraft,
    onReloadLatestDraftAfterConflict,
    onCopyConflictLocalText,
    onCopyScriptPanelText,
  };
}
