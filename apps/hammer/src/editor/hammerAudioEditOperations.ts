import type {
  HammerAudioEditCutOperation,
  HammerPersistedAudioEdit,
  HammerPersistedAudioPolish,
} from "../persistence/hammerPersistenceContract";
import {
  buildNotStartedHammerAudioPolish,
  cloneHammerAudioEdit,
  cloneHammerAudioPolish,
} from "../prep/hammerAudioPolish";
import {
  getEffectiveCutRegions,
  isTimeRangeFullyCoveredByCuts,
} from "./hammerAudioEditPlayback";

const MIN_AUDIO_CUT_DURATION_SEC = 0.0001;

export interface HammerAudioCutSelectionDraft {
  startSec: number | null;
  endSec: number | null;
}

export interface HammerNormalizedAudioCutSelection {
  startSec: number;
  endSec: number;
}

export interface CommitAudioCutSelectionResult {
  audioPolish: HammerPersistedAudioPolish;
  operation: HammerAudioEditCutOperation;
  clearedSelection: HammerAudioCutSelectionDraft;
}

function clampToDuration(timeSec: number, durationSec: number): number {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 0;
  if (!Number.isFinite(timeSec)) return 0;
  return Math.max(0, Math.min(durationSec, timeSec));
}

export function normalizeAudioCutSelection(args: {
  selection: HammerAudioCutSelectionDraft;
  durationSec: number;
}): HammerNormalizedAudioCutSelection | null {
  const { selection, durationSec } = args;
  const draftStartSec = selection.startSec;
  const draftEndSec = selection.endSec;
  if (!Number.isFinite(durationSec) || durationSec <= 0) return null;
  if (draftStartSec == null || draftEndSec == null) return null;
  if (!Number.isFinite(draftStartSec) || !Number.isFinite(draftEndSec)) return null;

  const normalizedStart = clampToDuration(draftStartSec, durationSec);
  const normalizedEnd = clampToDuration(draftEndSec, durationSec);
  const startSec = Math.min(normalizedStart, normalizedEnd);
  const endSec = Math.max(normalizedStart, normalizedEnd);

  if (endSec - startSec <= MIN_AUDIO_CUT_DURATION_SEC) {
    return null;
  }

  return { startSec, endSec };
}

export function createAudioCutOperationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `audio-cut:${crypto.randomUUID()}`;
  }
  return `audio-cut:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`;
}

export function appendAudioCutOperation(args: {
  audioEdit: HammerPersistedAudioEdit | null | undefined;
  selection: HammerNormalizedAudioCutSelection;
  operationId?: string;
}): {
  audioEdit: HammerPersistedAudioEdit;
  operation: HammerAudioEditCutOperation;
} {
  const operation: HammerAudioEditCutOperation = {
    id: args.operationId ?? createAudioCutOperationId(),
    type: "cut",
    start_sec: args.selection.startSec,
    end_sec: args.selection.endSec,
  };
  const existing = cloneHammerAudioEdit(args.audioEdit);
  const nextAudioEdit = cloneHammerAudioEdit({
    version: "v1",
    operations: [...(existing?.operations ?? []), operation],
  });
  return {
    audioEdit: nextAudioEdit ?? { version: "v1", operations: [operation] },
    operation,
  };
}

export function commitAudioCutSelection(args: {
  audioPolish: HammerPersistedAudioPolish | null | undefined;
  selection: HammerAudioCutSelectionDraft;
  durationSec: number;
  operationId?: string;
}): CommitAudioCutSelectionResult | null {
  const normalizedSelection = normalizeAudioCutSelection({
    selection: args.selection,
    durationSec: args.durationSec,
  });
  if (!normalizedSelection) {
    return null;
  }

  const nextAudioPolish = cloneHammerAudioPolish(args.audioPolish) ?? buildNotStartedHammerAudioPolish();
  const existingEffectiveCutRegions = getEffectiveCutRegions(
    nextAudioPolish.audio_edit,
    args.durationSec,
  );
  if (isTimeRangeFullyCoveredByCuts({
    effectiveCutRegions: existingEffectiveCutRegions,
    startSec: normalizedSelection.startSec,
    endSec: normalizedSelection.endSec,
  })) {
    return null;
  }

  const { audioEdit, operation } = appendAudioCutOperation({
    audioEdit: nextAudioPolish.audio_edit,
    selection: normalizedSelection,
    operationId: args.operationId,
  });

  nextAudioPolish.audio_edit = audioEdit;

  return {
    audioPolish: nextAudioPolish,
    operation,
    clearedSelection: {
      startSec: null,
      endSec: null,
    },
  };
}
