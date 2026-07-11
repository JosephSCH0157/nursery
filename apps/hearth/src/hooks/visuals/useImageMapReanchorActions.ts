import { useCallback } from "react";
import {
  buildExactScriptAnchorFromSelection,
  reanchorImageMapEntry,
  resolveNearestParagraphSelection,
  type ImageMapScriptSelection,
} from "../../lib/hearth-image-map-beats";
import type { EpisodeImageMapEntry, EpisodePackageV2 } from "../../lib/episode-package-v2";
import type { HearthOperationAuthority } from "../../lib/hearth-operation-authority";

type PersistImageMapEntriesResult =
  | { ok: true; episodePackage: EpisodePackageV2; metadataUpdatedAt: string | null }
  | { ok: false; error: string };

type UseImageMapReanchorActionsArgs = {
  operationAuthority: HearthOperationAuthority;
  episodePackage: EpisodePackageV2 | null;
  selectedImageMapEntry: EpisodeImageMapEntry | null;
  imageMapReanchorDisabledReason: string | null;
  isImageMapReanchorSaving: boolean;
  canonicalImageMapScriptState: {
    status: "idle" | "loading" | "ready" | "error";
    text: string | null;
  };
  persistImageMapEntries: (args: {
    entries: EpisodeImageMapEntry[];
    spokenBeats?: EpisodePackageV2["spoken_beats"] | null;
  }) => Promise<PersistImageMapEntriesResult>;
  setMode: (next: "sparks" | "episodes" | "ready" | "series" | "focus") => void;
  setShowManualDraft: (next: boolean) => void;
  setShowScriptPanel: (next: boolean) => void;
  setImageMapReanchorError: (next: string | null) => void;
  setImageMapCandidateError: (next: string | null) => void;
  setImageMapCandidateSelectionError: (next: string | null) => void;
  setIsImageMapReanchorMode: (next: boolean) => void;
  setIsImageMapReanchorSaving: (next: boolean) => void;
  setImageMapSaveState: (next: "saved" | "editing" | "saving" | "error" | "offline") => void;
  setImageMapSaveError: (next: string | null) => void;
  setImageMapExportMessage: (next: string | null) => void;
};

export function useImageMapReanchorActions(args: UseImageMapReanchorActionsArgs) {
  const onStartImageMapReanchor = useCallback(() => {
    if (args.imageMapReanchorDisabledReason) {
      args.setImageMapReanchorError(args.imageMapReanchorDisabledReason);
      return;
    }
    if (args.selectedImageMapEntry?.beat_anchor) {
      args.setImageMapReanchorError("Beat-anchored bullet visuals do not need exact-text repair in Hearth. Refine placement later from the transcript.");
      return;
    }
    args.setMode("focus");
    args.setShowManualDraft(false);
    args.setShowScriptPanel(true);
    args.setImageMapReanchorError(null);
    args.setImageMapCandidateError(null);
    args.setIsImageMapReanchorMode(true);
  }, [args]);

  const onCancelImageMapReanchor = useCallback(() => {
    if (args.isImageMapReanchorSaving) return;
    args.setIsImageMapReanchorMode(false);
    args.setImageMapReanchorError(null);
  }, [args]);

  const onPickImageMapReanchor = useCallback(async (selection: ImageMapScriptSelection) => {
    if (!args.episodePackage || !args.selectedImageMapEntry) return;
    if (args.imageMapReanchorDisabledReason) {
      args.setImageMapReanchorError(args.imageMapReanchorDisabledReason);
      return;
    }
    if (args.canonicalImageMapScriptState.status !== "ready" || !args.canonicalImageMapScriptState.text) {
      args.setImageMapReanchorError("Current canonical script is not ready to re-anchor yet.");
      return;
    }

    const nextAnchor = buildExactScriptAnchorFromSelection(args.canonicalImageMapScriptState.text, selection);
    if (!nextAnchor) {
      args.setImageMapReanchorError("Unable to build an exact anchor from that script selection.");
      return;
    }

    const nextEntry = reanchorImageMapEntry(args.selectedImageMapEntry, args.canonicalImageMapScriptState.text, selection);
    if (!nextEntry) {
      args.setImageMapReanchorError("Unable to re-anchor this visual beat.");
      return;
    }
    const operation = args.operationAuthority.begin("image-map.reanchor");

    args.setIsImageMapReanchorSaving(true);
    args.setImageMapSaveState("saving");
    args.setImageMapSaveError(null);
    args.setImageMapReanchorError(null);
    try {
      const saved = await args.persistImageMapEntries({
        entries: args.episodePackage.image_map.entries.map((entry) => (
          entry.id === args.selectedImageMapEntry?.id
            ? {
                ...nextEntry,
                anchor_scope: "attached",
                script_anchor: nextAnchor,
                beat_anchor: null,
              }
            : entry
        )),
      });
      if (!args.operationAuthority.isCurrent(operation)) return;
      if (!saved.ok) {
        args.setImageMapSaveState("error");
        args.setImageMapSaveError(saved.error);
        args.setImageMapReanchorError(saved.error);
        return;
      }
      args.setImageMapSaveState("saved");
      args.setImageMapCandidateError(null);
      args.setImageMapCandidateSelectionError(null);
      args.setImageMapExportMessage("Visual beat re-anchored to the current canonical script.");
      args.setIsImageMapReanchorMode(false);
    } catch (error) {
      if (!args.operationAuthority.isCurrent(operation)) return;
      const message = error instanceof Error ? error.message : "Unable to re-anchor this visual beat.";
      args.setImageMapSaveState("error");
      args.setImageMapSaveError(message);
      args.setImageMapReanchorError(message);
    } finally {
      if (args.operationAuthority.isCurrent(operation)) args.setIsImageMapReanchorSaving(false);
    }
  }, [args]);

  const onRepairImageMapNearestParagraph = useCallback(async () => {
    if (!args.episodePackage || !args.selectedImageMapEntry) return;
    if (args.canonicalImageMapScriptState.status !== "ready" || !args.canonicalImageMapScriptState.text) {
      args.setImageMapReanchorError("Current canonical script is not ready to repair anchors.");
      return;
    }
    const selection = resolveNearestParagraphSelection(
      args.canonicalImageMapScriptState.text,
      args.selectedImageMapEntry.script_anchor,
    );
    if (!selection) {
      args.setImageMapReanchorError("No deterministic nearest paragraph repair target is available.");
      return;
    }
    await onPickImageMapReanchor(selection);
  }, [args, onPickImageMapReanchor]);

  const onConvertImageMapToGlobalVisual = useCallback(async () => {
    if (!args.episodePackage || !args.selectedImageMapEntry) return;
    const operation = args.operationAuthority.begin("image-map.anchor.globalize");
    args.setImageMapSaveState("saving");
    args.setImageMapSaveError(null);
    args.setImageMapReanchorError(null);
    const saved = await args.persistImageMapEntries({
      entries: args.episodePackage.image_map.entries.map((entry) => (
        entry.id === args.selectedImageMapEntry?.id
          ? {
              ...entry,
              anchor_scope: "global",
              script_anchor: null,
              beat_anchor: null,
              status: "draft",
            }
          : entry
      )),
    });
    if (!args.operationAuthority.isCurrent(operation)) return;
    if (!saved.ok) {
      args.setImageMapSaveState("error");
      args.setImageMapSaveError(saved.error);
      return;
    }
    args.setImageMapSaveState("saved");
    args.setImageMapExportMessage("Visual anchor converted to global intent.");
  }, [args]);

  const onLeaveImageMapOrphaned = useCallback(async () => {
    if (!args.episodePackage || !args.selectedImageMapEntry) return;
    const operation = args.operationAuthority.begin("image-map.anchor.orphan");
    args.setImageMapSaveState("saving");
    args.setImageMapSaveError(null);
    args.setImageMapReanchorError(null);
    const saved = await args.persistImageMapEntries({
      entries: args.episodePackage.image_map.entries.map((entry) => (
        entry.id === args.selectedImageMapEntry?.id
          ? {
              ...entry,
              anchor_scope: "orphaned",
              script_anchor: null,
              beat_anchor: null,
              status: "draft",
            }
          : entry
      )),
    });
    if (!args.operationAuthority.isCurrent(operation)) return;
    if (!saved.ok) {
      args.setImageMapSaveState("error");
      args.setImageMapSaveError(saved.error);
      return;
    }
    args.setImageMapSaveState("saved");
    args.setImageMapExportMessage("Visual anchor left orphaned for manual review.");
  }, [args]);

  return {
    onStartImageMapReanchor,
    onCancelImageMapReanchor,
    onPickImageMapReanchor,
    onRepairImageMapNearestParagraph,
    onConvertImageMapToGlobalVisual,
    onLeaveImageMapOrphaned,
  };
}
