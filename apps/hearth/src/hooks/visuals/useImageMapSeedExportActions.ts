import { useCallback } from "react";
import { isBulletOutlineScript } from "../../lib/hearth-spoken-beats";
import { resolveImageMapEntriesForMediaMapBootstrap } from "../../lib/hearth-media-map-bootstrap";
import { buildVisualScriptIntentExportDocument } from "../../lib/hearth-visual-script-intent-export";
import type { HearthOperationAuthority } from "../../lib/hearth-operation-authority";
import type {
  EpisodeImageMapAnchorScope,
  EpisodeImageMapEntry,
  EpisodeImageMapVisualPriority,
  EpisodeImageMapVisualType,
  EpisodePackageV2,
} from "../../lib/episode-package-v2";

type CanonicalScriptResult =
  | {
      ok: true;
      text: string;
      source: "approved_script";
      includesUnsavedLocalEdits: boolean;
    }
  | {
      ok: false;
      message: string;
    };

type PersistImageMapEntriesResult =
  | { ok: true; episodePackage: EpisodePackageV2; metadataUpdatedAt: string | null }
  | { ok: false; error: string };

type UseImageMapSeedExportActionsArgs = {
  operationAuthority: HearthOperationAuthority;
  workpieceId: string | null;
  episodePackage: EpisodePackageV2 | null;
  selectedImageMapEntryId: string | null;
  effectiveComposeSetupMode:
    | "outline_by_speaker"
    | "full_script_single_speaker"
    | "full_script_multi_speaker"
    | "full_script_all_speakers"
    | null;
  imageMapSaveState: "saved" | "editing" | "saving" | "error" | "offline";
  imageMapAnchorDraft: string;
  imageMapDescriptionDraft: string;
  imageMapStyleDraft: string;
  imageMapIntentDraft: string;
  imageMapSourceTypeDraft: string;
  imageMapAnchorScopeDraft: EpisodeImageMapAnchorScope;
  imageMapVisualPriorityDraft: EpisodeImageMapVisualPriority;
  imageMapVisualTypeDraft: EpisodeImageMapVisualType;
  imageMapSectionIntentNoteDraft: string;
  imageMapPlacementHintDraft: string;
  normalizeVisualStyle: (value: string | null | undefined) => EpisodeImageMapEntry["style_preset"];
  readCanonicalScriptForImageMapGeneration: () => Promise<CanonicalScriptResult>;
  persistImageMapEntries: (args: {
    entries: EpisodeImageMapEntry[];
    spokenBeats?: EpisodePackageV2["spoken_beats"] | null;
  }) => Promise<PersistImageMapEntriesResult>;
  writeTextToClipboard: (value: string) => Promise<boolean>;
  setImageMapSaveState: (next: "saved" | "editing" | "saving" | "error" | "offline") => void;
  setImageMapSaveError: (next: string | null) => void;
  setSelectedImageMapEntryId: (next: string | null) => void;
  setImageMapExportMessage: (next: string | null) => void;
};

export function useImageMapSeedExportActions(args: UseImageMapSeedExportActionsArgs) {
  const resolveImageMapEntriesForExport = useCallback((): EpisodeImageMapEntry[] => {
    if (!args.episodePackage) return [];
    if (!args.selectedImageMapEntryId) return args.episodePackage.image_map.entries;
    const selected = args.episodePackage.image_map.entries.find((entry) => entry.id === args.selectedImageMapEntryId);
    if (!selected) return args.episodePackage.image_map.entries;
    if (args.imageMapSaveState !== "editing" && args.imageMapSaveState !== "saving") {
      return args.episodePackage.image_map.entries;
    }

    const nextAnchor = args.imageMapAnchorDraft.trim();
    if (!nextAnchor) return args.episodePackage.image_map.entries;
    return args.episodePackage.image_map.entries.map((entry) => {
      if (entry.id !== args.selectedImageMapEntryId) return entry;
      return {
        ...entry,
        anchor: nextAnchor,
        description: args.imageMapDescriptionDraft,
        visual_intent: args.imageMapDescriptionDraft,
        prompt_basis: args.imageMapDescriptionDraft,
        style_preset: args.normalizeVisualStyle(args.imageMapStyleDraft),
        intent: args.imageMapIntentDraft.trim().toLowerCase(),
        source_type: args.imageMapSourceTypeDraft.trim().toLowerCase(),
        anchor_scope: args.imageMapAnchorScopeDraft,
        visual_priority: args.imageMapVisualPriorityDraft,
        visual_type: args.imageMapVisualTypeDraft,
        section_intent_note: args.imageMapSectionIntentNoteDraft.trim() || null,
        placement_hint: args.imageMapPlacementHintDraft.trim() || null,
      };
    });
  }, [args]);

  const onSeedImageMapFromScript = useCallback(async () => {
    if (!args.episodePackage) return;
    if (args.episodePackage.image_map.entries.length > 0) {
      const confirmed = window.confirm(
        "Generate a new image map from the canonical script? This replaces the current visual beats.",
      );
      if (!confirmed) return;
    }
    const operation = args.operationAuthority.begin("image-map.seed");
    const canonicalScript = await args.readCanonicalScriptForImageMapGeneration();
    if (!args.operationAuthority.isCurrent(operation)) return;
    if (!canonicalScript.ok) {
      args.setImageMapExportMessage(canonicalScript.message);
      return;
    }

    const generatedPlan = resolveImageMapEntriesForMediaMapBootstrap({
      currentEntries: [],
      currentSpokenBeats: args.episodePackage.spoken_beats,
      scriptText: canonicalScript.text,
      preferBeatAnchors: args.effectiveComposeSetupMode === "outline_by_speaker" || isBulletOutlineScript(canonicalScript.text),
    });
    if (generatedPlan.entries.length === 0) {
      args.setImageMapExportMessage("No visually meaningful beats found in the canonical script.");
      return;
    }

    args.setImageMapSaveState("saving");
    args.setImageMapSaveError(null);
    const saved = await args.persistImageMapEntries({
      entries: generatedPlan.entries,
      spokenBeats: generatedPlan.spokenBeats,
    });
    if (!args.operationAuthority.isCurrent(operation)) return;
    if (!saved.ok) {
      args.setImageMapSaveState("error");
      args.setImageMapSaveError(saved.error);
      return;
    }
    args.setSelectedImageMapEntryId(saved.episodePackage.image_map.entries[0]?.id ?? null);
    args.setImageMapSaveState("saved");
    const sourceLabel = "approved script";
    const note = canonicalScript.includesUnsavedLocalEdits ? " Save the draft first to include unsaved local edits." : "";
    args.setImageMapExportMessage(`${generatedPlan.anchorMode === "bullet_beat" ? `Generated ${generatedPlan.entries.length} beat-anchored visual plans` : `Generated ${generatedPlan.entries.length} visual beats`} from the canonical ${sourceLabel}.${note}`);
  }, [args]);

  const onCopyImageMapExportJson = useCallback(async () => {
    const entries = resolveImageMapEntriesForExport();
    const payload = buildVisualScriptIntentExportDocument(args.workpieceId?.trim() ?? null, entries);
    const text = JSON.stringify(payload, null, 2);
    const copied = await args.writeTextToClipboard(text);
    args.setImageMapExportMessage(copied ? "Visual script intent JSON copied." : "Clipboard write failed.");
    return copied;
  }, [args, resolveImageMapEntriesForExport]);

  const onDownloadImageMapExportJson = useCallback(() => {
    const entries = resolveImageMapEntriesForExport();
    const payload = buildVisualScriptIntentExportDocument(args.workpieceId?.trim() ?? null, entries);
    const text = JSON.stringify(payload, null, 2);
    const blob = new Blob([text], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const suffix = (args.workpieceId?.slice(0, 8) ?? "episode").toLowerCase();
    anchor.href = url;
    anchor.download = `visual-script-intent-${suffix}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    args.setImageMapExportMessage("Visual script intent JSON downloaded.");
  }, [args, resolveImageMapEntriesForExport]);

  return {
    onSeedImageMapFromScript,
    onCopyImageMapExportJson,
    onDownloadImageMapExportJson,
  };
}
