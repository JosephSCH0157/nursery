import { useEffect, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";
import type {
  HammerPassId,
  HammerPassStatusMap,
  HammerPersistedAudioPolish,
  HammerPersistedVisualPreviewSettings,
} from "../persistence/hammerPersistenceContract";
import type { HammerVisualTimelineState } from "../visuals/model/hammerVisualTypes";
import { cloneHammerAudioEdit, cloneHammerAudioPolish } from "../prep/hammerAudioPolish";
import { deriveHydratedPassStatus } from "./hammerPassSelectors";
import { resolveSelectedSegmentId } from "./hammerWorkspaceTranscript";
import { resolveEditorModeFromPass, resolveInitialPassId, type HammerEditorMode } from "./hammerWorkspaceShellCore";
import { resolveSelectionFromTranscript, type HammerLinkedSelection } from "./hammerLinkedSelection";
import { loadHammerWorkspaceWorkpieceLabel } from "../app/hammerRuntimeData";

type WorkpieceLabelSetter = Dispatch<SetStateAction<string | null>>;
export type HammerWorkpieceLabelHydrationAuthority = object;

const workpieceLabelAuthorityBySetter = new WeakMap<WorkpieceLabelSetter, HammerWorkpieceLabelHydrationAuthority>();
const workpieceLabelSetterByAuthority = new WeakMap<HammerWorkpieceLabelHydrationAuthority, WorkpieceLabelSetter>();

export type HammerWorkpieceLabelHydrationState = {
  canonicalWorkpieceLabel: string | null;
  hydrationAuthority: HammerWorkpieceLabelHydrationAuthority;
};

export function useHammerWorkspaceShellWorkpieceLabelState(): HammerWorkpieceLabelHydrationState {
  const [canonicalWorkpieceLabel, setCanonicalWorkpieceLabel] = useState<string | null>(null);
  let hydrationAuthority = workpieceLabelAuthorityBySetter.get(setCanonicalWorkpieceLabel);
  if (!hydrationAuthority) {
    hydrationAuthority = {};
    workpieceLabelAuthorityBySetter.set(setCanonicalWorkpieceLabel, hydrationAuthority);
    workpieceLabelSetterByAuthority.set(hydrationAuthority, setCanonicalWorkpieceLabel);
  }
  return { canonicalWorkpieceLabel, hydrationAuthority };
}

export type HammerWorkpieceLabelLoader = (workspaceId: string, workpieceId: string) => Promise<string | null>;

export function beginHammerWorkspaceWorkpieceLabelHydration(args: {
  workspaceId: string;
  workpieceId: string;
  setCanonicalWorkpieceLabel: WorkpieceLabelSetter;
  loadLabel?: HammerWorkpieceLabelLoader;
}): () => void {
  const { workspaceId, workpieceId, setCanonicalWorkpieceLabel, loadLabel = loadHammerWorkspaceWorkpieceLabel } = args;
  let active = true;
  setCanonicalWorkpieceLabel(null);
  void loadLabel(workspaceId, workpieceId)
    .then((label) => {
      if (!active) return;
      setCanonicalWorkpieceLabel(label?.trim() || null);
    })
    .catch(() => {
      if (!active) return;
      setCanonicalWorkpieceLabel(null);
    });
  return () => {
    active = false;
  };
}

export function useHammerWorkspaceShellWorkpieceLabelHydration(args: {
  workspaceId: string;
  workpieceId: string;
  hydrationAuthority: HammerWorkpieceLabelHydrationAuthority;
}): void {
  const { workspaceId, workpieceId, hydrationAuthority } = args;
  useEffect(() => {
    const setCanonicalWorkpieceLabel = workpieceLabelSetterByAuthority.get(hydrationAuthority);
    if (!setCanonicalWorkpieceLabel) return undefined;
    return beginHammerWorkspaceWorkpieceLabelHydration({
      workspaceId,
      workpieceId,
      setCanonicalWorkpieceLabel,
    });
  }, [workspaceId, workpieceId, hydrationAuthority]);
}

type ApplyLinkedSelectionState = (args: {
  selection: HammerLinkedSelection | null;
  origin: "system";
  clearTranscriptTextRange: true;
}) => void;

export type UseHammerWorkspaceShellHydrationArgs = {
  workspaceId: string;
  workpieceId: string;
  initialCurrentPass?: HammerPassId;
  initialSelectedSegmentId?: string | null;
  initialVisualPreviewSettings?: HammerPersistedVisualPreviewSettings | null;
  incomingAudioPolish?: HammerPersistedAudioPolish | null;
  transcriptSegments: HammerTranscriptSegment[];
  visualTimelineClips: HammerVisualTimelineState["clips"];
  applyLinkedSelectionStateRef: MutableRefObject<ApplyLinkedSelectionState | null>;
  setCurrentPass: Dispatch<SetStateAction<HammerPassId>>;
  setPassStatus: Dispatch<SetStateAction<HammerPassStatusMap>>;
  setEditorMode: Dispatch<SetStateAction<HammerEditorMode>>;
  editableAudioPolish: HammerPersistedAudioPolish | null;
  setEditableAudioPolish: Dispatch<SetStateAction<HammerPersistedAudioPolish | null>>;
  resetSilenceEditing: () => void;
  applyVisualPreviewSettings: (settings: HammerPersistedVisualPreviewSettings) => void;
};

export type UseHammerWorkspaceShellHydrationResult = {
  audioPolishHasLocalEditsRef: MutableRefObject<boolean>;
  editableAudioPolishRef: MutableRefObject<HammerPersistedAudioPolish | null>;
};

export function useHammerWorkspaceShellHydration(
  args: UseHammerWorkspaceShellHydrationArgs,
): UseHammerWorkspaceShellHydrationResult {
  const {
    workspaceId,
    workpieceId,
    initialCurrentPass,
    initialSelectedSegmentId,
    initialVisualPreviewSettings,
    incomingAudioPolish,
    transcriptSegments,
    visualTimelineClips,
    applyLinkedSelectionStateRef,
    setCurrentPass,
    setPassStatus,
    setEditorMode,
    editableAudioPolish,
    setEditableAudioPolish,
    resetSilenceEditing,
    applyVisualPreviewSettings,
  } = args;
  const hydratedInitialEditorStateRef = useRef<string | null>(null);
  const hydratedVisualPreviewSettingsRef = useRef<string | null>(null);
  const audioPolishHasLocalEditsRef = useRef(false);
  const editableAudioPolishRef = useRef<HammerPersistedAudioPolish | null>(
    cloneHammerAudioPolish(incomingAudioPolish),
  );

  useEffect(() => {
    audioPolishHasLocalEditsRef.current = false;
    editableAudioPolishRef.current = null;
    setEditableAudioPolish(null);
    resetSilenceEditing();
  }, [
    workpieceId,
    setEditableAudioPolish,
    resetSilenceEditing,
  ]);

  useEffect(() => {
    setEditableAudioPolish((current) => {
      if (!incomingAudioPolish) {
        const next = audioPolishHasLocalEditsRef.current ? current : null;
        editableAudioPolishRef.current = next;
        return next;
      }
      const incoming = cloneHammerAudioPolish(incomingAudioPolish);
      if (!incoming) {
        const next = audioPolishHasLocalEditsRef.current ? current : null;
        editableAudioPolishRef.current = next;
        return next;
      }
      if (!audioPolishHasLocalEditsRef.current) {
        editableAudioPolishRef.current = incoming;
        return incoming;
      }
      const next = {
        ...incoming,
        audio_edit: cloneHammerAudioEdit(current?.audio_edit ?? null) ?? cloneHammerAudioEdit(incoming.audio_edit),
      };
      editableAudioPolishRef.current = next;
      return next;
    });
  }, [incomingAudioPolish, setEditableAudioPolish]);

  useEffect(() => {
    editableAudioPolishRef.current = editableAudioPolish;
  }, [editableAudioPolish]);

  useEffect(() => {
    const hydrationKey = `${workspaceId}:${workpieceId}`;
    if (hydratedInitialEditorStateRef.current === hydrationKey) return;
    hydratedInitialEditorStateRef.current = hydrationKey;
    const nextInitialPass = resolveInitialPassId(initialCurrentPass);
    const nextSelectedSegmentId = resolveSelectedSegmentId(transcriptSegments, initialSelectedSegmentId ?? null);
    setCurrentPass(nextInitialPass);
    setPassStatus(deriveHydratedPassStatus(nextInitialPass));
    setEditorMode(resolveEditorModeFromPass(nextInitialPass));
    applyLinkedSelectionStateRef.current?.({
      selection: resolveSelectionFromTranscript({
        transcriptSegments: transcriptSegments,
        visualItems: visualTimelineClips.map((clip) => ({
          id: clip.clip_id,
          anchorSegmentId: clip.anchor_hint.anchor_segment_id
            ?? clip.anchor_hint.matched_segment_ids[0]
            ?? nextSelectedSegmentId,
          startSec: clip.start_sec,
          endSec: clip.end_sec,
        })),
        anchorSegmentId: nextSelectedSegmentId,
        focusSegmentId: nextSelectedSegmentId,
      }),
      origin: "system",
      clearTranscriptTextRange: true,
    });
  }, [
    workspaceId,
    workpieceId,
    initialCurrentPass,
    initialSelectedSegmentId,
    transcriptSegments,
    visualTimelineClips,
    applyLinkedSelectionStateRef,
    setCurrentPass,
    setPassStatus,
    setEditorMode,
  ]);

  useEffect(() => {
    hydratedVisualPreviewSettingsRef.current = null;
  }, [workpieceId]);

  useEffect(() => {
    if (initialVisualPreviewSettings == null) return;
    if (hydratedVisualPreviewSettingsRef.current === workpieceId) return;
    hydratedVisualPreviewSettingsRef.current = workpieceId;
    applyVisualPreviewSettings(initialVisualPreviewSettings);
  }, [initialVisualPreviewSettings, workpieceId, applyVisualPreviewSettings]);

  return { audioPolishHasLocalEditsRef, editableAudioPolishRef };
}
