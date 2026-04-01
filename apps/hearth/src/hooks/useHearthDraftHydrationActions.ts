import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { createDraft, type Draft } from "../domain/draft";
import type { HearthWorkpieceSummary } from "../lib/hearth-workpieces";
import type { BarStockSpark } from "../lib/barstock-sparks";
import {
  choosePreferredHydratedDraft,
  draftHasUsableScriptBody,
  hydrateDraftBodyFromCanonicalScript,
} from "../lib/hearth-draft-hydration";
import { readHearthPrimaryScript } from "../lib/hearth-script-repo";

type UseHearthDraftHydrationActionsArgs = {
  hearthUser: { userId: string | null; displayName: string };
  sparks: BarStockSpark[];
  store: {
    listWorkpieceDrafts: (workpieceId: string) => Promise<Draft[]>;
    saveDraft: (draft: Draft, options?: { reason?: string }) => Promise<void>;
  };
  draftsRef: MutableRefObject<Draft[]>;
  workpieceSummariesRef: MutableRefObject<HearthWorkpieceSummary[]>;
  setDrafts: Dispatch<SetStateAction<Draft[]>>;
  setAiRuntimeWarning: (next: string | null) => void;
  refreshDrafts: () => Promise<Draft[]>;
  normalizeUuid: (value: string | null | undefined) => string | null;
  dedupeDraftListById: (input: Draft[]) => Draft[];
  selectDraftForWorkpiece: (args: {
    workpieceId: string;
    drafts: readonly Draft[];
    sparks: readonly BarStockSpark[];
    preferredDraftId?: string | null;
  }) => Draft | null;
  parseDraftConflictError: (error: unknown) => { message: string; localBody: string } | null;
  buildDraftAttribution: (user: { userId: string | null; displayName: string }) => {
    userId: string | null;
    displayName: string | null;
  };
  parseIsoTimestamp: (value: string | null | undefined) => number | undefined;
  readTrimmedString: (value: unknown) => string | null;
  isLegacyDraftScriptPlaceholder: (value: string | null | undefined) => boolean;
  safeScriptStarter: string;
};

export function useHearthDraftHydrationActions(args: UseHearthDraftHydrationActionsArgs) {
  const hydrateOrCreateDraftBufferForWorkpiece = useCallback(async (
    targetWorkpieceId: string,
    options?: {
      drafts?: readonly Draft[];
      workpieces?: readonly HearthWorkpieceSummary[];
      preferredDraftId?: string | null;
      seed?: { title?: string; body?: string };
    },
  ): Promise<Draft | null> => {
    const normalizedWorkpieceId = args.normalizeUuid(targetWorkpieceId);
    if (!normalizedWorkpieceId) return null;

    const availableDrafts = options?.drafts ?? args.draftsRef.current;
    const existingDraft = args.selectDraftForWorkpiece({
      workpieceId: normalizedWorkpieceId,
      drafts: availableDrafts,
      sparks: args.sparks,
      preferredDraftId: options?.preferredDraftId ?? null,
    });
    let selectedDraft = existingDraft;

    if (!draftHasUsableScriptBody(selectedDraft)) {
      const canonicalDrafts = args.dedupeDraftListById(await args.store.listWorkpieceDrafts(normalizedWorkpieceId));
      if (canonicalDrafts.length > 0) {
        const mergedDrafts = args.dedupeDraftListById([...availableDrafts, ...canonicalDrafts]);
        args.draftsRef.current = mergedDrafts;
        args.setDrafts(mergedDrafts);
        const canonicalDraft = args.selectDraftForWorkpiece({
          workpieceId: normalizedWorkpieceId,
          drafts: mergedDrafts,
          sparks: args.sparks,
          preferredDraftId: options?.preferredDraftId ?? null,
        }) ?? (
          options?.preferredDraftId
            ? mergedDrafts.find((draft) => draft.id === options.preferredDraftId) ?? null
            : null
        ) ?? canonicalDrafts
          .slice()
          .sort((a, b) => b.updatedAt - a.updatedAt)[0]
          ?? null;
        selectedDraft = choosePreferredHydratedDraft([selectedDraft, canonicalDraft]);
      }
    }

    if (draftHasUsableScriptBody(selectedDraft)) {
      return selectedDraft;
    }

    const availableWorkpieces = options?.workpieces ?? args.workpieceSummariesRef.current;
    const workpieceSummary = availableWorkpieces.find((entry) => entry.workpieceId === normalizedWorkpieceId) ?? null;
    const scriptRead = await readHearthPrimaryScript(normalizedWorkpieceId);
    if (!scriptRead.ok) {
      args.setAiRuntimeWarning("Opened Episode, but Hearth could not load the canonical script snapshot.");
    }
    const canonicalScriptData = scriptRead.ok ? scriptRead.data : null;
    const canonicalScriptText = args.isLegacyDraftScriptPlaceholder(canonicalScriptData?.text)
      ? ""
      : args.readTrimmedString(canonicalScriptData?.text);

    if (selectedDraft && canonicalScriptText) {
      const repairedDraft = hydrateDraftBodyFromCanonicalScript({
        draft: selectedDraft,
        scriptText: canonicalScriptData?.text ?? canonicalScriptText,
        updatedAt: args.parseIsoTimestamp(canonicalScriptData?.updatedAt) ?? Date.now(),
        updatedBy: args.buildDraftAttribution(args.hearthUser),
      });

      try {
        await args.store.saveDraft(repairedDraft, { reason: "hydrate_workpiece" });
        const nextDrafts = args.dedupeDraftListById([repairedDraft, ...args.draftsRef.current]);
        args.draftsRef.current = nextDrafts;
        args.setDrafts(nextDrafts);
        return repairedDraft;
      } catch (err) {
        if (!args.parseDraftConflictError(err)) {
          throw err;
        }
        const latestDrafts = await args.refreshDrafts();
        const latestDraft = args.selectDraftForWorkpiece({
          workpieceId: normalizedWorkpieceId,
          drafts: latestDrafts,
          sparks: args.sparks,
          preferredDraftId: options?.preferredDraftId ?? null,
        });
        return choosePreferredHydratedDraft([latestDraft, repairedDraft]);
      }
    }

    const seedBody = options?.seed?.body ?? "";
    const body = seedBody.trim() && !args.isLegacyDraftScriptPlaceholder(seedBody)
      ? seedBody
      : canonicalScriptText
        ? (canonicalScriptData?.text ?? canonicalScriptText)
        : args.safeScriptStarter;
    const title = workpieceSummary?.title
      ?? args.readTrimmedString(options?.seed?.title)
      ?? `Episode ${normalizedWorkpieceId.slice(0, 8)}`;
    const updatedAt = scriptRead.ok
      ? args.parseIsoTimestamp(scriptRead.data.updatedAt) ?? Date.now()
      : Date.now();
    const attribution = args.buildDraftAttribution(args.hearthUser);
    const draft: Draft = {
      ...createDraft({ title, body }),
      id: normalizedWorkpieceId,
      title,
      body,
      createdAt: updatedAt,
      updatedAt,
      archived: false,
      pinned: false,
      createdBy: attribution,
      updatedBy: attribution,
    };

    try {
      await args.store.saveDraft(draft, { reason: "hydrate_workpiece" });
    } catch (err) {
      if (!args.parseDraftConflictError(err)) {
        throw err;
      }
    }

    const latestDrafts = await args.refreshDrafts();
    return args.selectDraftForWorkpiece({
      workpieceId: normalizedWorkpieceId,
      drafts: latestDrafts,
      sparks: args.sparks,
      preferredDraftId: options?.preferredDraftId ?? normalizedWorkpieceId,
    });
  }, [args]);

  return {
    hydrateOrCreateDraftBufferForWorkpiece,
  };
}
