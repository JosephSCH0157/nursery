import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { Draft } from "../domain/draft";
import { createRevision, type Revision, type RevisionKind } from "../domain/revision";
import type { HearthChatMessage } from "../lib/hearth-chat-api";
import { commitHearthPrimaryScript } from "../lib/hearth-script-repo";
import {
  isCanonicalHearthRevisionSave,
  type HearthCanonicalRevisionsResult,
  type HearthRevisionSaveAcknowledgement,
} from "../storage/hearth-store";

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
  readCanonicalRevisions: (workpieceId: string, draftId?: string | null) => Promise<HearthCanonicalRevisionsResult>;
  saveRevision: (workpieceId: string, revision: Revision) => Promise<HearthRevisionSaveAcknowledgement>;
  refreshRevisions: (workpieceId: string, draftId?: string | null) => Promise<Revision[]>;
};

export function useHearthApprovalPersistenceActions(args: UseHearthApprovalPersistenceActionsArgs) {
  const persistApprovedDraft = useCallback(async (params: {
    draft: Draft;
    updatedAt: number;
  }): Promise<boolean> => (
    args.persistDraft({
      draft: {
        ...params.draft,
        updatedAt: params.updatedAt,
      },
      updatedAt: params.updatedAt,
      createRevision: null,
      syncSources: false,
      syncSession: false,
      validateForAnvil: true,
    })
  ), [args]);

  const readCanonicalApprovalRevisions = useCallback((params: {
    episodeId: string;
    draftId: string;
  }) => args.readCanonicalRevisions(params.episodeId, params.draftId), [args]);

  const commitCanonicalApprovalRevision = useCallback(async (params: {
    episodeId: string;
    draft: Draft;
    approvalNote: string;
  }): Promise<{ ok: true; approvedAt: number } | { ok: false }> => {
    const revision = createRevision({
      draftId: params.draft.id,
      title: params.draft.title,
      body: params.draft.body,
      kind: "milestone",
      note: params.approvalNote,
    });
    const acknowledgement = await args.saveRevision(params.episodeId, revision);
    if (!isCanonicalHearthRevisionSave(acknowledgement)) return { ok: false };
    await args.refreshRevisions(params.episodeId, params.draft.id);
    return { ok: true, approvedAt: revision.createdAt };
  }, [args]);

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
    readCanonicalApprovalRevisions,
    commitCanonicalApprovalRevision,
    publishApprovedScript,
    appendApprovalMarker,
  };
}
