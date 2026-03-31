import { useCallback } from "react";
import {
  addImageMapEntry,
  removeImageMapEntry,
  type EpisodeImageMapEntry,
  type EpisodePackageV2,
} from "../../lib/episode-package-v2";
import { DEFAULT_HEARTH_VISUAL_STYLE, normalizeHearthVisualStyle } from "../../lib/hearth-visual-styles";
import {
  hasStructuredImageMapAnchor,
  resolveImageMapEntryAnchorScope,
} from "../../lib/hearth-image-map-anchor";

type PersistImageMapEntriesResult =
  | { ok: true; episodePackage: EpisodePackageV2; metadataUpdatedAt: string | null }
  | { ok: false; error: string };

type UseImageMapEntryCrudActionsArgs = {
  episodePackage: EpisodePackageV2 | null;
  selectedImageMapEntry: EpisodeImageMapEntry | null;
  selectedImageMapEntryId: string | null;
  persistImageMapEntries: (args: {
    entries: EpisodeImageMapEntry[];
    spokenBeats?: EpisodePackageV2["spoken_beats"] | null;
  }) => Promise<PersistImageMapEntriesResult>;
  setSelectedImageMapEntryId: (next: string | null) => void;
  setImageMapSaveState: (next: "saved" | "editing" | "saving" | "error" | "offline") => void;
  setImageMapSaveError: (next: string | null) => void;
};

export function useImageMapEntryCrudActions(args: UseImageMapEntryCrudActionsArgs) {
  const onCreateImageMapEntry = useCallback(async () => {
    if (!args.episodePackage) return;
    const nextAnchor = `manual:p${args.episodePackage.image_map.entries.length + 1}`;
    const nextEpisodePackage = addImageMapEntry(args.episodePackage, {
      anchor: nextAnchor,
      purpose: "coverage",
      description: "",
      visual_intent: "",
      prompt_basis: "",
      anchor_scope: "orphaned",
      style_preset: DEFAULT_HEARTH_VISUAL_STYLE,
      intent: "cutaway",
      source_type: "stock",
      visual_priority: "supporting",
      visual_type: "still_image",
      section_intent_note: null,
      beat_order: args.episodePackage.image_map.entries.length + 1,
      paragraph_beat_order: 1,
      candidate_assets: [],
      selected_asset_id: null,
      status: "draft",
      placement_hint: null,
    });
    const newEntry = nextEpisodePackage.image_map.entries[nextEpisodePackage.image_map.entries.length - 1] ?? null;
    if (!newEntry) {
      args.setImageMapSaveState("error");
      args.setImageMapSaveError("Unable to create entry in current episode.");
      return;
    }

    args.setImageMapSaveState("saving");
    args.setImageMapSaveError(null);
    const saved = await args.persistImageMapEntries({
      entries: nextEpisodePackage.image_map.entries,
    });
    if (!saved.ok) {
      args.setImageMapSaveState("error");
      args.setImageMapSaveError(saved.error);
      return;
    }
    args.setSelectedImageMapEntryId(newEntry.id);
    args.setImageMapSaveState("saved");
  }, [args]);

  const onDuplicateImageMapEntry = useCallback(async () => {
    if (!args.episodePackage || !args.selectedImageMapEntry) return;
    const nextEpisodePackage = addImageMapEntry(args.episodePackage, {
      anchor: args.selectedImageMapEntry.anchor,
      script_anchor: args.selectedImageMapEntry.script_anchor,
      beat_anchor: args.selectedImageMapEntry.beat_anchor,
      anchor_scope: resolveImageMapEntryAnchorScope(args.selectedImageMapEntry),
      purpose: args.selectedImageMapEntry.purpose,
      description: args.selectedImageMapEntry.description,
      visual_intent: args.selectedImageMapEntry.visual_intent,
      prompt_basis: args.selectedImageMapEntry.prompt_basis,
      style_preset: normalizeHearthVisualStyle(args.selectedImageMapEntry.style_preset),
      intent: args.selectedImageMapEntry.intent,
      source_type: args.selectedImageMapEntry.source_type,
      visual_priority: args.selectedImageMapEntry.visual_priority ?? "supporting",
      visual_type: args.selectedImageMapEntry.visual_type ?? "still_image",
      section_intent_note: args.selectedImageMapEntry.section_intent_note ?? null,
      beat_order: args.selectedImageMapEntry.beat_order,
      paragraph_beat_order: args.selectedImageMapEntry.paragraph_beat_order,
      candidate_assets: [],
      selected_asset_id: null,
      status: hasStructuredImageMapAnchor(args.selectedImageMapEntry) ? "mapped" : "draft",
      placement_hint: args.selectedImageMapEntry.placement_hint ?? null,
    });
    const duplicated = nextEpisodePackage.image_map.entries[nextEpisodePackage.image_map.entries.length - 1] ?? null;
    if (!duplicated) {
      args.setImageMapSaveState("error");
      args.setImageMapSaveError("Unable to duplicate entry.");
      return;
    }

    args.setImageMapSaveState("saving");
    args.setImageMapSaveError(null);
    const saved = await args.persistImageMapEntries({
      entries: nextEpisodePackage.image_map.entries,
    });
    if (!saved.ok) {
      args.setImageMapSaveState("error");
      args.setImageMapSaveError(saved.error);
      return;
    }
    args.setSelectedImageMapEntryId(duplicated.id);
    args.setImageMapSaveState("saved");
  }, [args]);

  const onDeleteImageMapEntry = useCallback(async () => {
    if (!args.episodePackage || !args.selectedImageMapEntryId) return;
    const confirmed = window.confirm("Delete this image map entry?");
    if (!confirmed) return;

    const nextEpisodePackage = removeImageMapEntry(args.episodePackage, args.selectedImageMapEntryId);
    args.setImageMapSaveState("saving");
    args.setImageMapSaveError(null);
    const saved = await args.persistImageMapEntries({
      entries: nextEpisodePackage.image_map.entries,
    });
    if (!saved.ok) {
      args.setImageMapSaveState("error");
      args.setImageMapSaveError(saved.error);
      return;
    }
    args.setSelectedImageMapEntryId(saved.episodePackage.image_map.entries[0]?.id ?? null);
    args.setImageMapSaveState("saved");
  }, [args]);

  return {
    onCreateImageMapEntry,
    onDuplicateImageMapEntry,
    onDeleteImageMapEntry,
  };
}
