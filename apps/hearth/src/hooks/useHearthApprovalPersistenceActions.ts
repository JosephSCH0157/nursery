import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { Draft } from "../domain/draft";
import type { RevisionKind } from "../domain/revision";
import type { HearthChatMessage } from "../lib/hearth-chat-api";
import { commitHearthPrimaryScript } from "../lib/hearth-script-repo";

type PersistDraft = (args: {
  draft: Draft;
  updatedAt: number;
  createRevision: { kind: RevisionKind; note?: string } | null;
  syncSources?: boolean;
  syncSession?: boolean;
  showSavingState?: boolean;
  validateForAnvil?: boolean;
  quietFailure?: boolean;
  saveReason?: string;
}) => Promise<boolean>;

type UseHearthApprovalPersistenceActionsArgs = {
  persistDraft: PersistDraft;
  validatorVersion: string;
  chatHistoryMaxMessages: number;
  flushChatHistoryNow: (args?: { draftId?: string | null; messages?: HearthChatMessage[] }) => void;
  setChatMessages: Dispatch<SetStateAction<HearthChatMessage[]>>;
};

export function useHearthApprovalPersistenceActions(args: UseHearthApprovalPersistenceActionsArgs) {
  const persistApprovedDraft = useCallback(async (params: {
    draft: Draft;
    updatedAt: number;
    approvalNote: string;
  }): Promise<boolean> => (
    args.persistDraft({
      draft: {
        ...params.draft,
        updatedAt: params.updatedAt,
      },
      updatedAt: params.updatedAt,
      createRevision: { kind: "milestone", note: params.approvalNote },
      syncSources: false,
      syncSession: false,
      validateForAnvil: true,
    })
  ), [args]);

  const publishApprovedScript = useCallback(async (params: {
    episodeId: string;
    scriptText: string;
  }): Promise<boolean> => {
    const published = await commitHearthPrimaryScript(params.episodeId, params.scriptText, {
      validatorVersion: args.validatorVersion,
    });
    return published.ok;
  }, [args.validatorVersion]);

  const appendApprovalMarker = useCallback((params: { draftId: string; content: string }) => {
    const markerMessage: HearthChatMessage = { role: "assistant", content: params.content };
    args.setChatMessages((prev) => {
      const next = [...prev, markerMessage].slice(-args.chatHistoryMaxMessages);
      args.flushChatHistoryNow({ draftId: params.draftId, messages: next });
      return next;
    });
  }, [args]);

  return {
    persistApprovedDraft,
    publishApprovedScript,
    appendApprovalMarker,
  };
}
