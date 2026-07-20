import { useCallback } from "react";
import { activateEpisodeMediaMapForFulfillment } from "../../lib/hearth-media-map-fulfillment";
import { syncImageMapEntryFromMediaMapEntry } from "../../lib/hearth-media-map-sync";
import { deriveMediaMapPurpose } from "../../lib/hearth-visual-purpose";
import type {
  EpisodeBrollPlan,
  EpisodeContextualDataCompositePlan,
  EpisodeImageMapEntry,
  EpisodeMediaMap,
  EpisodeMediaMapEntry,
  EpisodePackageV2,
  EpisodeReferenceClipPlan,
} from "../../lib/episode-package-v2";
import type { HearthOperationAuthority } from "../../lib/hearth-operation-authority";

type PersistMediaMapResult =
  | { ok: true; episodePackage: EpisodePackageV2 }
  | { ok: false; error: string };

type UseMediaMapEntryActionsArgs = {
  operationAuthority: HearthOperationAuthority;
  episodePackage: EpisodePackageV2 | null;
  workpieceId: string | null;
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
  mediaMapSaveState: "saved" | "editing" | "saving" | "error";
  setIsMediaMapBusy: (next: boolean) => void;
  setMediaMapSaveState: (next: "saved" | "editing" | "saving" | "error") => void;
  setMediaMapSaveError: (next: string | null) => void;
  setMediaMapMessage: (next: string | null) => void;
  setSelectedMediaMapEntryId: (next: string | null) => void;
  persistImageMapEntries: (args: {
    entries: EpisodeImageMapEntry[];
    spokenBeats?: EpisodePackageV2["spoken_beats"] | null;
  }) => Promise<{ ok: true; episodePackage: EpisodePackageV2; metadataUpdatedAt: string | null } | { ok: false; error: string }>;
  persistBrollPlan: (args: {
    plan: EpisodeBrollPlan;
    eventName: string;
    eventPayload: Record<string, unknown>;
    baseEpisodePackage?: EpisodePackageV2;
  }) => Promise<PersistMediaMapResult>;
  persistReferenceClipPlan: (args: {
    plan: EpisodeReferenceClipPlan;
    eventName: string;
    eventPayload: Record<string, unknown>;
    baseEpisodePackage?: EpisodePackageV2;
  }) => Promise<PersistMediaMapResult>;
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

function deriveSuffixFromMediaMapEntryId(id: string): string {
  const trimmed = id.trim();
  if (trimmed.startsWith("mm_imap_")) return trimmed.slice("mm_imap_".length);
  if (trimmed.startsWith("mm_broll_")) return trimmed.slice("mm_broll_".length);
  if (trimmed.startsWith("mm_reference_clip_")) return trimmed.slice("mm_reference_clip_".length);
  if (trimmed.startsWith("mm_thumbnail_")) return trimmed.slice("mm_thumbnail_".length);
  return trimmed.replace(/^mm_/, "");
}

function isThumbnailMediaMapEntry(entry: EpisodeMediaMapEntry): boolean {
  return entry.id.startsWith("mm_thumbnail_") || entry.intent === "thumbnail_concept";
}

export function useMediaMapEntryActions(args: UseMediaMapEntryActionsArgs) {
  const onAddMediaMapEntry = useCallback(async () => {
    if (!args.episodePackage) return;
    if (args.isMediaMapBusy) return;
    const operation = args.operationAuthority.begin("media-map.entry.create");
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
      if (!args.operationAuthority.isCurrent(operation)) return;
      if (!saved.ok) {
        args.setMediaMapSaveError(saved.error);
        args.setMediaMapSaveState("error");
        return;
      }
      args.setSelectedMediaMapEntryId(entry.id);
      args.setMediaMapSaveState("saved");
      args.setMediaMapMessage("Media map entry created.");
    } catch {
      if (!args.operationAuthority.isCurrent(operation)) return;
      args.setMediaMapSaveError("Unable to create visual plan entry.");
      args.setMediaMapSaveState("error");
    } finally {
      if (args.operationAuthority.isCurrent(operation)) args.setIsMediaMapBusy(false);
    }
  }, [args]);

  const onSaveMediaMapEntry = useCallback(async () => {
    if (!args.episodePackage || !args.selectedMediaMapEntry) return;
    if (args.isMediaMapBusy) return;
    const operation = args.operationAuthority.begin("media-map.entry.save");
    const nowIso = new Date().toISOString();
    const nextFinalMediaKind = (
      args.mediaMapTypeDraft === "b_roll"
        ? "b_roll"
        : args.mediaMapTypeDraft === "contextual_data_composite" || args.mediaMapTypeDraft === "reference_clip"
          ? "contextual_data_composite"
          : "image"
    );
    const mediaKindChanged = args.selectedMediaMapEntry.final_media_kind !== nextFinalMediaKind;
    const nextSourceStatus = (
      mediaKindChanged
        ? "unresolved"
        : (args.mediaMapSourceStatusDraft === "selected" || args.mediaMapSourceStatusDraft === "attached"
          ? args.mediaMapSourceStatusDraft
          : "unresolved")
    );
    const nextSourceAssetId = (
      mediaKindChanged
        ? null
        : (args.mediaMapSourceAssetIdDraft.trim() || null)
    );
    const nextFulfillmentStatus = (
      nextSourceStatus === "selected" || nextSourceStatus === "attached"
        ? "resolved"
        : "planned"
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
        status: nextSourceStatus,
        asset_id: nextSourceAssetId,
      },
      confidence: (
        args.mediaMapConfidenceDraft === "high"
        || args.mediaMapConfidenceDraft === "low"
          ? args.mediaMapConfidenceDraft
          : "medium"
      ),
      fulfillment_status: nextFulfillmentStatus,
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
      if (!args.operationAuthority.isCurrent(operation)) return;
      if (!saved.ok) {
        args.setMediaMapSaveError(saved.error);
        args.setMediaMapSaveState("error");
        return;
      }
      args.setMediaMapSaveState("saved");
      args.setMediaMapMessage("Media map entry saved.");
    } catch {
      if (!args.operationAuthority.isCurrent(operation)) return;
      args.setMediaMapSaveError("Unable to save visual plan entry.");
      args.setMediaMapSaveState("error");
    } finally {
      if (args.operationAuthority.isCurrent(operation)) args.setIsMediaMapBusy(false);
    }
  }, [args]);

  const onDeleteMediaMapEntry = useCallback(async () => {
    if (!args.episodePackage || !args.selectedMediaMapEntry) return;
    if (args.isMediaMapBusy) return;
    if (!window.confirm("Delete this visual plan entry?")) return;
    const operation = args.operationAuthority.begin("media-map.entry.delete");
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
      if (!args.operationAuthority.isCurrent(operation)) return;
      if (!saved.ok) {
        args.setMediaMapSaveError(saved.error);
        args.setMediaMapSaveState("error");
        return;
      }
      args.setSelectedMediaMapEntryId(nextEntries[0]?.id ?? null);
      args.setMediaMapSaveState("saved");
      args.setMediaMapMessage("Media map entry removed.");
    } catch {
      if (!args.operationAuthority.isCurrent(operation)) return;
      args.setMediaMapSaveError("Unable to delete visual plan entry.");
      args.setMediaMapSaveState("error");
    } finally {
      if (args.operationAuthority.isCurrent(operation)) args.setIsMediaMapBusy(false);
    }
  }, [args]);

  const onActivateEpisodeMediaMap = useCallback(async () => {
    if (!args.episodePackage) return;
    if (args.isMediaMapBusy) return;
    const normalizedWorkpieceId = args.workpieceId?.trim() ?? "";
    if (!normalizedWorkpieceId) {
      args.setMediaMapSaveError("Select an episode before applying the visual plan.");
      args.setMediaMapSaveState("error");
      return;
    }
    const operation = args.operationAuthority.begin("media-map.activate");
    const nowIso = new Date().toISOString();
    let mapForActivation: EpisodeMediaMap = {
      ...args.episodePackage.media_map,
      script_version_id: args.approvedScriptVersion ? String(args.approvedScriptVersion) : args.episodePackage.media_map.script_version_id,
    };
    let includedPendingEntryEdits = false;
    if (args.mediaMapSaveState === "editing" && args.selectedMediaMapEntry) {
      const nextFinalMediaKind = (
        args.mediaMapTypeDraft === "b_roll"
          ? "b_roll"
          : args.mediaMapTypeDraft === "contextual_data_composite" || args.mediaMapTypeDraft === "reference_clip"
            ? "contextual_data_composite"
            : "image"
      );
      const mediaKindChanged = args.selectedMediaMapEntry.final_media_kind !== nextFinalMediaKind;
      const nextSourceStatus = (
        mediaKindChanged
          ? "unresolved"
          : (args.mediaMapSourceStatusDraft === "selected" || args.mediaMapSourceStatusDraft === "attached"
            ? args.mediaMapSourceStatusDraft
            : "unresolved")
      );
      const nextSourceAssetId = (
        mediaKindChanged
          ? null
          : (args.mediaMapSourceAssetIdDraft.trim() || null)
      );
      const nextFulfillmentStatus = (
        nextSourceStatus === "selected" || nextSourceStatus === "attached"
          ? "resolved"
          : "planned"
      );
      const draftPatchedEntry: EpisodeMediaMapEntry = {
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
          status: nextSourceStatus,
          asset_id: nextSourceAssetId,
        },
        confidence: (
          args.mediaMapConfidenceDraft === "high"
          || args.mediaMapConfidenceDraft === "low"
            ? args.mediaMapConfidenceDraft
            : "medium"
        ),
        fulfillment_status: nextFulfillmentStatus,
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
      mapForActivation = {
        ...mapForActivation,
        status: (
          mapForActivation.status === "activated"
          || mapForActivation.status === "fulfilling"
          || mapForActivation.status === "fulfilled"
        )
          ? "needs_attention"
          : mapForActivation.status,
        version: Math.max(1, mapForActivation.version + 1),
        entries: mapForActivation.entries.map((entry) => (entry.id === args.selectedMediaMapEntry?.id ? draftPatchedEntry : entry)),
        generated_at: nowIso,
      };
      includedPendingEntryEdits = true;
    }
    const activated = activateEpisodeMediaMapForFulfillment(mapForActivation);
    args.setIsMediaMapBusy(true);
    args.setMediaMapSaveState("saving");
    args.setMediaMapSaveError(null);
    try {
      const mediaEntriesForPlans = activated.entries.filter((entry) => !isThumbnailMediaMapEntry(entry));
      const existingImageById = new Map(args.episodePackage.image_map.entries.map((entry) => [entry.id, entry] as const));
      const existingBrollById = new Map(args.episodePackage.broll_plan.beats.map((beat) => [beat.id, beat] as const));
      const existingReferenceById = new Map(args.episodePackage.cdc_plan.entries.map((entry) => [entry.id, entry] as const));
      const syncedImageEntries: EpisodeImageMapEntry[] = mediaEntriesForPlans
        .filter((entry) => entry.final_media_kind === "image")
        .map((entry, index) => {
          const suffix = deriveSuffixFromMediaMapEntryId(entry.id);
          const mappedId = entry.id.startsWith("mm_imap_") ? suffix : `mm_from_media_${suffix}`;
          return syncImageMapEntryFromMediaMapEntry({
            mediaEntry: entry,
            existingEntry: existingImageById.get(mappedId) ?? null,
            entryId: mappedId,
            beatOrder: index + 1,
          });
        });

      const syncedBrollBeats = mediaEntriesForPlans
        .filter((entry) => entry.final_media_kind === "b_roll")
        .map((entry) => {
          const suffix = deriveSuffixFromMediaMapEntryId(entry.id);
          const mappedId = entry.id.startsWith("mm_broll_") ? suffix : `mm_from_media_${suffix}`;
          const existing = existingBrollById.get(mappedId);
          const selectedAssetId = entry.source.status === "selected" || entry.source.status === "attached"
            ? entry.source.asset_id
            : null;
          return {
            id: mappedId,
            workpiece_id: normalizedWorkpieceId,
            anchor_text: entry.anchor.target,
            placement_hint: entry.anchor.mode === "absolute_time" ? "exact_timestamp" : "first_occurrence",
            timestamp_ms: entry.anchor.mode === "absolute_time"
              ? Math.max(0, Math.trunc(Number(entry.anchor.target) * 1000)) || null
              : null,
            purpose: entry.purpose,
            description: entry.description,
            motion_intent: existing?.motion_intent ?? "broll",
            visual_style: existing?.visual_style ?? null,
            priority: existing?.priority ?? (entry.critical ? "primary" : "supporting"),
            keywords: existing?.keywords ?? [],
            mood: existing?.mood ?? null,
            shot_type: existing?.shot_type ?? "mixed",
            motion_suggestion: existing?.motion_suggestion ?? null,
            suggested_duration_ms: Math.max(1000, Math.trunc(entry.timing.duration_sec * 1000)),
            source_type: existing?.source_type ?? (selectedAssetId ? "external" : "planned"),
            asset_category: existing?.asset_category ?? null,
            data_visual_spec: existing?.data_visual_spec ?? null,
            selected_asset_id: selectedAssetId,
            candidate_assets: existing?.candidate_assets ?? [],
            external_request: existing?.external_request ?? null,
            fulfillment_state: selectedAssetId ? "resolved" : "unresolved",
            origin: existing?.origin ?? "hearth",
            created_at: existing?.created_at ?? nowIso,
            updated_at: nowIso,
          } as EpisodeBrollPlan["beats"][number];
        });

      const syncedReferenceEntries: EpisodeContextualDataCompositePlan[] = mediaEntriesForPlans
        .filter((entry) => entry.final_media_kind === "contextual_data_composite")
        .map((entry) => {
          const suffix = deriveSuffixFromMediaMapEntryId(entry.id);
          const mappedId = entry.id.startsWith("mm_reference_clip_") ? suffix : `mm_from_media_${suffix}`;
          const existing = existingReferenceById.get(mappedId);
          const selectedAssetId = entry.source.status === "selected" || entry.source.status === "attached"
            ? entry.source.asset_id
            : null;
          return {
            id: mappedId,
            workpiece_id: normalizedWorkpieceId,
            media_type: "contextual_data_composite",
            anchor_text: entry.anchor.target,
            placement_hint: entry.anchor.mode === "absolute_time" ? "exact_timestamp" : "first_occurrence",
            timestamp_ms: entry.anchor.mode === "absolute_time"
              ? Math.max(0, Math.trunc(Number(entry.anchor.target) * 1000)) || null
              : null,
            purpose: entry.purpose,
            format: existing?.format ?? "still",
            data_type: existing?.data_type ?? "quantitative",
            context_type: existing?.context_type ?? "historical",
            tone: existing?.tone ?? "neutral",
            motion_level: existing?.motion_level ?? "static",
            description: entry.description,
            background_context_description: existing?.background_context_description ?? "",
            foreground_data_description: existing?.foreground_data_description ?? "",
            visual_style: existing?.visual_style ?? null,
            chart_type: existing?.chart_type ?? null,
            title: existing?.title ?? null,
            labels: existing?.labels ?? [],
            values: existing?.values ?? [],
            emphasis_key: existing?.emphasis_key ?? null,
            candidate_assets: existing?.candidate_assets ?? [],
            external_request: existing?.external_request ?? null,
            selected_asset_id: selectedAssetId,
            source_type: existing?.source_type ?? (selectedAssetId ? "external" : "planned"),
            origin: existing?.origin ?? "hearth",
            created_at: existing?.created_at ?? nowIso,
            updated_at: nowIso,
          };
        });

      let syncedEpisodePackage = args.episodePackage;
      const syncedImage = await args.persistImageMapEntries({
        entries: syncedImageEntries,
      });
      if (!args.operationAuthority.isCurrent(operation)) return;
      if (!syncedImage.ok) {
        args.setMediaMapSaveError(syncedImage.error);
        args.setMediaMapSaveState("error");
        return;
      }
      syncedEpisodePackage = syncedImage.episodePackage;

      const syncedBrollPlan: EpisodeBrollPlan = {
        ...syncedEpisodePackage.broll_plan,
        workpiece_id: normalizedWorkpieceId,
        version: Math.max(1, syncedEpisodePackage.broll_plan.version + 1),
        beats: syncedBrollBeats,
        generated_at: nowIso,
      };
      const syncedBroll = await args.persistBrollPlan({
        plan: syncedBrollPlan,
        eventName: "hearth.broll_plan.synced_from_media_map.v1",
        eventPayload: {
          beat_count: syncedBrollBeats.length,
          source: "media_map_activation",
        },
        baseEpisodePackage: syncedEpisodePackage,
      });
      if (!args.operationAuthority.isCurrent(operation)) return;
      if (!syncedBroll.ok) {
        args.setMediaMapSaveError(syncedBroll.error);
        args.setMediaMapSaveState("error");
        return;
      }
      syncedEpisodePackage = syncedBroll.episodePackage;

      const syncedReferencePlan: EpisodeReferenceClipPlan = {
        ...syncedEpisodePackage.cdc_plan,
        workpiece_id: normalizedWorkpieceId,
        version: Math.max(1, syncedEpisodePackage.cdc_plan.version + 1),
        entries: syncedReferenceEntries,
        generated_at: nowIso,
      };
      const syncedReference = await args.persistReferenceClipPlan({
        plan: syncedReferencePlan,
        eventName: "hearth.cdc_plan.synced_from_media_map.v1",
        eventPayload: {
          entry_count: syncedReferenceEntries.length,
          source: "media_map_activation",
        },
        baseEpisodePackage: syncedEpisodePackage,
      });
      if (!args.operationAuthority.isCurrent(operation)) return;
      if (!syncedReference.ok) {
        args.setMediaMapSaveError(syncedReference.error);
        args.setMediaMapSaveState("error");
        return;
      }
      syncedEpisodePackage = syncedReference.episodePackage;

      const saved = await args.persistMediaMap({
        map: activated,
        eventName: "hearth.media_map.activated.v1",
        eventPayload: {
          entry_count: activated.entries.length,
          script_version_id: activated.script_version_id,
          queued_count: activated.entries.filter((entry) => entry.fulfillment_status === "queued").length,
        },
        baseEpisodePackage: syncedEpisodePackage,
      });
      if (!args.operationAuthority.isCurrent(operation)) return;
      if (!saved.ok) {
        args.setMediaMapSaveError(saved.error);
        args.setMediaMapSaveState("error");
        return;
      }
      args.setMediaMapSaveState("saved");
      args.setMediaMapMessage(
        `Media plan activated and synchronized (timeline images: ${syncedImageEntries.length}, B-roll: ${syncedBrollBeats.length}, reference clips: ${syncedReferenceEntries.length})${includedPendingEntryEdits ? " with pending editor changes." : "."}`,
      );
    } catch {
      if (!args.operationAuthority.isCurrent(operation)) return;
      args.setMediaMapSaveError("Unable to apply the Episode Visual Plan.");
      args.setMediaMapSaveState("error");
    } finally {
      if (args.operationAuthority.isCurrent(operation)) args.setIsMediaMapBusy(false);
    }
  }, [args]);

  return {
    onAddMediaMapEntry,
    onSaveMediaMapEntry,
    onDeleteMediaMapEntry,
    onActivateEpisodeMediaMap,
  };
}
