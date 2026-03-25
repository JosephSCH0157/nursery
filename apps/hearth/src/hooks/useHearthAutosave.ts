import { useCallback, useEffect, useRef } from "react";

type AutosaveDraftLike = {
  id: string;
  title: string;
  body: string;
};

type DraftSnapshotLike = {
  title: string;
  body: string;
};

type PendingAiAutosave<TReasonCode extends string> = {
  draftId: string;
  body: string;
  reasonCode: TReasonCode;
};

type AutosavePersistenceArgs<TDraft extends AutosaveDraftLike, TRevisionKind extends string> = {
  draft: TDraft;
  updatedAt: number;
  revision: { kind: TRevisionKind; note?: string } | null;
  quietFailure: boolean;
  saveReason?: string;
};

type UseHearthAutosaveArgs<
  TDraft extends AutosaveDraftLike,
  TReasonCode extends string,
  TRevisionKind extends string,
> = {
  activeDraft: TDraft | null;
  draftSnapshot: DraftSnapshotLike | null;
  isDirty: boolean;
  isBodyComposing: boolean;
  lastAutosaveRevisionAt: number | null;
  autosaveDelayMs: number;
  autosaveMinGapMs: number;
  autosaveRevisionGapMs: number;
  autosaveRevisionKind: TRevisionKind;
  persistAutosaveIO: (args: AutosavePersistenceArgs<TDraft, TRevisionKind>) => Promise<boolean>;
  toAiAutosaveSaveReason: (reasonCode: TReasonCode) => string;
  retryReasonCode: TReasonCode;
  setAiAutosaveWarning: (value: string | null) => void;
  setAiAutosaveStatusAt: (value: number | null) => void;
};

export function useHearthAutosave<
  TDraft extends AutosaveDraftLike,
  TReasonCode extends string,
  TRevisionKind extends string,
>(
  args: UseHearthAutosaveArgs<TDraft, TReasonCode, TRevisionKind>,
): {
  queueAiAutosave: (params: {
    draft: TDraft;
    previousBody: string;
    reasonCode: TReasonCode;
  }) => void;
  onRetryAiAutosave: () => void;
  noteManualSaveSuccess: (savedAt: number) => void;
} {
  const autosaveTimerRef = useRef<number | null>(null);
  const autosaveInFlightRef = useRef(false);
  const autosaveQueuedRef = useRef(false);
  const pendingAiAutosaveRef = useRef<PendingAiAutosave<TReasonCode> | null>(null);
  const lastAutosaveCommitAtRef = useRef(0);
  const activeDraftRef = useRef<TDraft | null>(args.activeDraft);
  const draftSnapshotRef = useRef<DraftSnapshotLike | null>(args.draftSnapshot);
  const isBodyComposingRef = useRef(args.isBodyComposing);
  const lastAutosaveRevisionAtRef = useRef<number | null>(args.lastAutosaveRevisionAt);
  const persistAutosaveIORef = useRef(args.persistAutosaveIO);

  useEffect(() => {
    activeDraftRef.current = args.activeDraft;
  }, [args.activeDraft]);

  useEffect(() => {
    draftSnapshotRef.current = args.draftSnapshot;
  }, [args.draftSnapshot]);

  useEffect(() => {
    isBodyComposingRef.current = args.isBodyComposing;
  }, [args.isBodyComposing]);

  useEffect(() => {
    lastAutosaveRevisionAtRef.current = args.lastAutosaveRevisionAt;
  }, [args.lastAutosaveRevisionAt]);

  useEffect(() => {
    persistAutosaveIORef.current = args.persistAutosaveIO;
  }, [args.persistAutosaveIO]);

  useEffect(() => {
    pendingAiAutosaveRef.current = null;
    args.setAiAutosaveWarning(null);
    args.setAiAutosaveStatusAt(null);
  }, [args.activeDraft?.id, args.setAiAutosaveStatusAt, args.setAiAutosaveWarning]);

  const handleAutosave = useCallback(async () => {
    if (autosaveInFlightRef.current) {
      autosaveQueuedRef.current = true;
      return;
    }

    autosaveInFlightRef.current = true;
    try {
      do {
        autosaveQueuedRef.current = false;

        if (isBodyComposingRef.current) {
          continue;
        }

        const draft = activeDraftRef.current;
        const snapshot = draftSnapshotRef.current;
        if (!draft || !snapshot) {
          continue;
        }

        const titleIsDirty = draft.title !== snapshot.title;
        const bodyIsDirty = draft.body !== snapshot.body;
        const draftIsDirty = titleIsDirty || bodyIsDirty;
        if (!draftIsDirty) {
          const pending = pendingAiAutosaveRef.current;
          if (pending && pending.draftId === draft.id && pending.body === draft.body) {
            pendingAiAutosaveRef.current = null;
          }
          continue;
        }

        const pendingAiAutosave = pendingAiAutosaveRef.current;
        const aiAutosaveForActiveDraft = pendingAiAutosave && pendingAiAutosave.draftId === draft.id
          ? pendingAiAutosave
          : null;
        const aiAutosaveMatchesCurrentBody = Boolean(aiAutosaveForActiveDraft && aiAutosaveForActiveDraft.body === draft.body);
        const isAiAutosave = Boolean(aiAutosaveMatchesCurrentBody && bodyIsDirty);

        if (aiAutosaveForActiveDraft && !aiAutosaveMatchesCurrentBody) {
          pendingAiAutosaveRef.current = null;
        }

        const now = Date.now();
        const aiAutosaveReason = isAiAutosave && aiAutosaveForActiveDraft
          ? args.toAiAutosaveSaveReason(aiAutosaveForActiveDraft.reasonCode)
          : null;
        const shouldAutoRevision = isAiAutosave || !lastAutosaveRevisionAtRef.current
          || now - lastAutosaveRevisionAtRef.current >= args.autosaveRevisionGapMs;

        const saved = await persistAutosaveIORef.current({
          draft,
          updatedAt: now,
          revision: shouldAutoRevision ? {
            kind: args.autosaveRevisionKind,
            note: aiAutosaveReason ?? "Autosave",
          } : null,
          quietFailure: isAiAutosave,
          saveReason: aiAutosaveReason ?? "autosave:typing",
        });

        if (saved) {
          lastAutosaveCommitAtRef.current = now;
          if (isAiAutosave) {
            pendingAiAutosaveRef.current = null;
            args.setAiAutosaveWarning(null);
            args.setAiAutosaveStatusAt(now);
          }
        } else if (isAiAutosave) {
          args.setAiAutosaveWarning("Not saved (offline/permission).");
        }
      } while (autosaveQueuedRef.current);
    } finally {
      autosaveInFlightRef.current = false;
    }
  }, [
    args.autosaveRevisionKind,
    args.autosaveRevisionGapMs,
    args.setAiAutosaveStatusAt,
    args.setAiAutosaveWarning,
    args.toAiAutosaveSaveReason,
  ]);

  useEffect(() => {
    const draft = args.activeDraft;
    if (!draft) return;
    if (!args.isDirty) return;
    if (args.isBodyComposing) return;

    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
    }

    const now = Date.now();
    const remainingGap = Math.max(0, args.autosaveMinGapMs - (now - lastAutosaveCommitAtRef.current));
    const delay = Math.max(args.autosaveDelayMs, remainingGap);
    autosaveTimerRef.current = window.setTimeout(() => {
      void handleAutosave();
    }, delay);

    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, [
    args.activeDraft?.body,
    args.activeDraft?.id,
    args.activeDraft?.title,
    args.autosaveDelayMs,
    args.autosaveMinGapMs,
    args.isBodyComposing,
    args.isDirty,
    handleAutosave,
  ]);

  const queueAiAutosave = useCallback((params: {
    draft: TDraft;
    previousBody: string;
    reasonCode: TReasonCode;
  }) => {
    if (params.draft.body === params.previousBody) return;
    pendingAiAutosaveRef.current = {
      draftId: params.draft.id,
      body: params.draft.body,
      reasonCode: params.reasonCode,
    };
    args.setAiAutosaveWarning(null);
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    void handleAutosave();
  }, [args.setAiAutosaveWarning, handleAutosave]);

  const onRetryAiAutosave = useCallback(() => {
    const active = activeDraftRef.current;
    const snapshot = draftSnapshotRef.current;
    if (!active || !snapshot) return;
    if (active.body === snapshot.body) {
      args.setAiAutosaveWarning(null);
      pendingAiAutosaveRef.current = null;
      return;
    }
    if (!pendingAiAutosaveRef.current || pendingAiAutosaveRef.current.draftId !== active.id) {
      pendingAiAutosaveRef.current = {
        draftId: active.id,
        body: active.body,
        reasonCode: args.retryReasonCode,
      };
    }
    args.setAiAutosaveWarning(null);
    void handleAutosave();
  }, [args.setAiAutosaveWarning, handleAutosave]);

  const noteManualSaveSuccess = useCallback((savedAt: number) => {
    pendingAiAutosaveRef.current = null;
    args.setAiAutosaveWarning(null);
    args.setAiAutosaveStatusAt(savedAt);
  }, [args.setAiAutosaveStatusAt, args.setAiAutosaveWarning]);

  return {
    queueAiAutosave,
    onRetryAiAutosave,
    noteManualSaveSuccess,
  };
}
