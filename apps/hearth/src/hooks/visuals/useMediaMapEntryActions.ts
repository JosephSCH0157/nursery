import { useCallback } from "react";
import { activateEpisodeMediaMapForFulfillment } from "../../lib/hearth-media-map-fulfillment";
import { deriveMediaMapPurpose } from "../../lib/hearth-visual-purpose";
import type { EpisodeMediaMap, EpisodeMediaMapEntry, EpisodePackageV2 } from "../../lib/episode-package-v2";

type PersistMediaMapResult =
  | { ok: true; episodePackage: EpisodePackageV2 }
  | { ok: false; error: string };

type UseMediaMapEntryActionsArgs = {
  episodePackage: EpisodePackageV2 | null;
  selectedMediaMapEntry: EpisodeMediaMapEntry | null;
  approvedScriptVersion: number | null;
  isMediaMapBusy: boolean;
  mediaMapTypeDraft: string;
  mediaMapAnchorModeDraft: string;
  mediaMapAnchorTargetDraft: string;
  mediaMapInOffsetDraft: string;
  mediaMapDurationDraft: string;
  mediaMapDescriptionDraft: string;
  mediaMapIntentDraft: string;
  mediaMapSourceStatusDraft: string;
  mediaMapSourceAssetIdDraft: string;
  mediaMapConfidenceDraft: string;
  mediaMapOptionalDraft: boolean;
  mediaMapCriticalDraft: boolean;
  setIsMediaMapBusy: (next: boolean) => void;
  setMediaMapSaveState: (next: "saved" | "editing" | "saving" | "error") => void;
  setMediaMapSaveError: (next: string | null) => void;
  setMediaMapMessage: (next: string | null) => void;
  setSelectedMediaMapEntryId: (next: string | null) => void;
  persistMediaMap: (args: {
    map: EpisodeMediaMap;
    eventName: string;
    eventPayload: Record<string, unknown>;
    baseEpisodePackage?: EpisodePackageV2;
  }) => Promise<PersistMediaMapResult>;
};

function createMediaMapEntryId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `mm_${crypto.randomUUID()}`;
  }
  return `mm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeMediaMapNumber(text: string, fallback: number): number {
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, parsed);
}

export function useMediaMapEntryActions(args: UseMediaMapEntryActionsArgs) {
  const onAddMediaMapEntry = useCallback(async () => {
    if (!args.episodePackage) return;
    if (args.isMediaMapBusy) return;
    const nowIso = new Date().toISOString();
    const entry: EpisodeMediaMapEntry = {
      id: createMediaMapEntryId(),
      final_media_kind: "image",
      purpose: "coverage",
      anchor: {
        mode: "phrase_match",
        target: "",
      },
      timing: {
        in_offset_sec: 0,
        duration_sec: 6,
      },
      description: "",
      intent: "establish_context",
      source: {
        status: "unresolved",
        asset_id: null,
      },
      confidence: "medium",
      fulfillment_status: "planned",
      fulfillment_path: null,
      optional: false,
      critical: false,
      stale: false,
      created_at: nowIso,
      updated_at: nowIso,
    };
    const nextMap: EpisodeMediaMap = {
      ...args.episodePackage.media_map,
      script_version_id: args.approvedScriptVersion ? String(args.approvedScriptVersion) : args.episodePackage.media_map.script_version_id,
      status: "draft",
      version: Math.max(1, args.episodePackage.media_map.version + 1),
      entries: [...args.episodePackage.media_map.entries, entry],
      generated_at: nowIso,
    };
    args.setIsMediaMapBusy(true);
    args.setMediaMapSaveState("saving");
    args.setMediaMapSaveError(null);
    try {
      const saved = await args.persistMediaMap({
        map: nextMap,
        eventName: "hearth.media_map.entry_created.v1",
        eventPayload: { entry_id: entry.id },
      });
      if (!saved.ok) {
        args.setMediaMapSaveError(saved.error);
        args.setMediaMapSaveState("error");
        return;
      }
      args.setSelectedMediaMapEntryId(entry.id);
      args.setMediaMapSaveState("saved");
      args.setMediaMapMessage("Media map entry created.");
    } catch {
      args.setMediaMapSaveError("Unable to create media map entry.");
      args.setMediaMapSaveState("error");
    } finally {
      args.setIsMediaMapBusy(false);
    }
  }, [args]);

  const onSaveMediaMapEntry = useCallback(async () => {
    if (!args.episodePackage || !args.selectedMediaMapEntry) return;
    if (args.isMediaMapBusy) return;
    const nowIso = new Date().toISOString();
    const nextFinalMediaKind = (
      args.mediaMapTypeDraft === "b_roll" || args.mediaMapTypeDraft === "contextual_data_composite"
        ? args.mediaMapTypeDraft
        : "image"
    );
    const nextEntry: EpisodeMediaMapEntry = {
      ...args.selectedMediaMapEntry,
      final_media_kind: nextFinalMediaKind,
      purpose: deriveMediaMapPurpose({
        finalMediaKind: nextFinalMediaKind,
        intent: args.mediaMapIntentDraft.trim(),
        description: args.mediaMapDescriptionDraft.trim(),
        anchorTarget: args.mediaMapAnchorTargetDraft.trim(),
      }),
      anchor: {
        mode: (
          args.mediaMapAnchorModeDraft === "line_anchor"
          || args.mediaMapAnchorModeDraft === "phrase_match"
          || args.mediaMapAnchorModeDraft === "speaker_turn"
          || args.mediaMapAnchorModeDraft === "section_marker"
          || args.mediaMapAnchorModeDraft === "absolute_time"
            ? args.mediaMapAnchorModeDraft
            : "phrase_match"
        ),
        target: args.mediaMapAnchorTargetDraft.trim(),
      },
      timing: {
        in_offset_sec: normalizeMediaMapNumber(args.mediaMapInOffsetDraft, args.selectedMediaMapEntry.timing.in_offset_sec),
        duration_sec: normalizeMediaMapNumber(args.mediaMapDurationDraft, args.selectedMediaMapEntry.timing.duration_sec),
      },
      description: args.mediaMapDescriptionDraft.trim(),
      intent: args.mediaMapIntentDraft.trim(),
      source: {
        status: (
          args.mediaMapSourceStatusDraft === "selected"
          || args.mediaMapSourceStatusDraft === "attached"
            ? args.mediaMapSourceStatusDraft
            : "unresolved"
        ),
        asset_id: args.mediaMapSourceAssetIdDraft.trim() || null,
      },
      confidence: (
        args.mediaMapConfidenceDraft === "high"
        || args.mediaMapConfidenceDraft === "low"
          ? args.mediaMapConfidenceDraft
          : "medium"
      ),
      fulfillment_status: (
        args.mediaMapSourceStatusDraft === "selected" || args.mediaMapSourceStatusDraft === "attached"
          ? "resolved"
          : args.selectedMediaMapEntry.fulfillment_status
      ),
      fulfillment_path: (
        nextFinalMediaKind === "b_roll"
          ? "motion_broll"
          : nextFinalMediaKind === "contextual_data_composite"
            ? "reference_clip"
            : "image"
      ),
      optional: args.mediaMapOptionalDraft,
      critical: args.mediaMapCriticalDraft,
      stale: false,
      updated_at: nowIso,
    };
    const nextMap: EpisodeMediaMap = {
      ...args.episodePackage.media_map,
      script_version_id: args.approvedScriptVersion ? String(args.approvedScriptVersion) : args.episodePackage.media_map.script_version_id,
      status: (
        args.episodePackage.media_map.status === "activated"
        || args.episodePackage.media_map.status === "fulfilling"
        || args.episodePackage.media_map.status === "fulfilled"
      )
        ? "needs_attention"
        : args.episodePackage.media_map.status,
      version: Math.max(1, args.episodePackage.media_map.version + 1),
      entries: args.episodePackage.media_map.entries.map((entry) => (entry.id === args.selectedMediaMapEntry?.id ? nextEntry : entry)),
      generated_at: nowIso,
    };
    args.setIsMediaMapBusy(true);
    args.setMediaMapSaveState("saving");
    args.setMediaMapSaveError(null);
    try {
      const saved = await args.persistMediaMap({
        map: nextMap,
        eventName: "hearth.media_map.entry_updated.v1",
        eventPayload: { entry_id: args.selectedMediaMapEntry.id },
      });
      if (!saved.ok) {
        args.setMediaMapSaveError(saved.error);
        args.setMediaMapSaveState("error");
        return;
      }
      args.setMediaMapSaveState("saved");
      args.setMediaMapMessage("Media map entry saved.");
    } catch {
      args.setMediaMapSaveError("Unable to save media map entry.");
      args.setMediaMapSaveState("error");
    } finally {
      args.setIsMediaMapBusy(false);
    }
  }, [args]);

  const onDeleteMediaMapEntry = useCallback(async () => {
    if (!args.episodePackage || !args.selectedMediaMapEntry) return;
    if (args.isMediaMapBusy) return;
    if (!window.confirm("Delete this media map entry?")) return;
    const nextEntries = args.episodePackage.media_map.entries.filter((entry) => entry.id !== args.selectedMediaMapEntry?.id);
    const nextMap: EpisodeMediaMap = {
      ...args.episodePackage.media_map,
      status: (
        args.episodePackage.media_map.status === "activated"
        || args.episodePackage.media_map.status === "fulfilling"
        || args.episodePackage.media_map.status === "fulfilled"
      )
        ? "needs_attention"
        : args.episodePackage.media_map.status,
      version: Math.max(1, args.episodePackage.media_map.version + 1),
      entries: nextEntries,
      generated_at: new Date().toISOString(),
    };
    args.setIsMediaMapBusy(true);
    args.setMediaMapSaveState("saving");
    args.setMediaMapSaveError(null);
    try {
      const saved = await args.persistMediaMap({
        map: nextMap,
        eventName: "hearth.media_map.entry_deleted.v1",
        eventPayload: { entry_id: args.selectedMediaMapEntry.id },
      });
      if (!saved.ok) {
        args.setMediaMapSaveError(saved.error);
        args.setMediaMapSaveState("error");
        return;
      }
      args.setSelectedMediaMapEntryId(nextEntries[0]?.id ?? null);
      args.setMediaMapSaveState("saved");
      args.setMediaMapMessage("Media map entry removed.");
    } catch {
      args.setMediaMapSaveError("Unable to delete media map entry.");
      args.setMediaMapSaveState("error");
    } finally {
      args.setIsMediaMapBusy(false);
    }
  }, [args]);

  const onActivateEpisodeMediaMap = useCallback(async () => {
    if (!args.episodePackage) return;
    if (args.isMediaMapBusy) return;
    const activated = activateEpisodeMediaMapForFulfillment({
      ...args.episodePackage.media_map,
      script_version_id: args.approvedScriptVersion ? String(args.approvedScriptVersion) : args.episodePackage.media_map.script_version_id,
    });
    args.setIsMediaMapBusy(true);
    args.setMediaMapSaveState("saving");
    args.setMediaMapSaveError(null);
    try {
      const saved = await args.persistMediaMap({
        map: activated,
        eventName: "hearth.media_map.activated.v1",
        eventPayload: {
          entry_count: activated.entries.length,
          script_version_id: activated.script_version_id,
          queued_count: activated.entries.filter((entry) => entry.fulfillment_status === "queued").length,
        },
      });
      if (!saved.ok) {
        args.setMediaMapSaveError(saved.error);
        args.setMediaMapSaveState("error");
        return;
      }
      args.setMediaMapSaveState("saved");
      args.setMediaMapMessage("Media plan activated. Beats routed to image, motion B-roll, and Reference Clip fulfillment paths.");
    } catch {
      args.setMediaMapSaveError("Unable to activate Episode Media Map.");
      args.setMediaMapSaveState("error");
    } finally {
      args.setIsMediaMapBusy(false);
    }
  }, [args]);

  return {
    onAddMediaMapEntry,
    onSaveMediaMapEntry,
    onDeleteMediaMapEntry,
    onActivateEpisodeMediaMap,
  };
}
