import {
  buildBulletBeatAnchorLabel,
  type EpisodeImageMapEntry,
  type EpisodeMediaMap,
  type EpisodeMediaMapEntry,
  type EpisodePackageV2,
  type EpisodeThumbnailVersion,
} from "./episode-package-v2";
import type { MediaMapGenerationScope } from "./hearth-media-map-conversation";

const MAX_MEDIA_MAP_VISUALS = 18;

function hasReferenceClipEvidenceSource(entry: { source?: string | null }): boolean {
  return typeof entry.source === "string" && entry.source.trim().length > 0;
}

function scoreMediaMapEntry(entry: EpisodeMediaMapEntry, index: number): number {
  let score = 0;
  if (entry.critical) score += 8;
  if (entry.purpose === "emphasis") score += 7;
  if (entry.purpose === "explanation") score += 6;
  if (entry.final_media_kind === "contextual_data_composite") score += 5;
  if (entry.final_media_kind === "b_roll") score += 3;
  if (entry.source.status === "selected" || entry.source.status === "attached") score += 4;
  if (entry.fulfillment_path) score += 3;
  if (entry.beat_anchor?.beat_index === 1 || index === 0) score += 2;
  if (entry.optional) score -= 4;
  return score;
}

function selectMediaMapVisualBeats(entries: EpisodeMediaMapEntry[]): EpisodeMediaMapEntry[] {
  if (entries.length <= MAX_MEDIA_MAP_VISUALS) return entries;
  return entries
    .map((entry, index) => ({ entry, index, score: scoreMediaMapEntry(entry, index) }))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.index - right.index;
    })
    .slice(0, MAX_MEDIA_MAP_VISUALS)
    .sort((left, right) => left.index - right.index)
    .map((candidate) => candidate.entry);
}

export function mapImageEntriesToMediaMapEntries(
  entries: EpisodeImageMapEntry[],
  nowIso: string,
  idPrefix: string,
): EpisodeMediaMapEntry[] {
  return entries.map((entry) => ({
    id: `${idPrefix}${entry.id}`,
    final_media_kind: "image",
    purpose: entry.purpose,
    anchor: {
      mode: entry.anchor_scope === "global"
        ? "section_marker"
        : entry.beat_anchor
          ? "speaker_turn"
          : (entry.placement_hint === "exact_timestamp" ? "absolute_time" : "phrase_match"),
      target: entry.anchor_scope === "global"
        ? (entry.section_intent_note?.trim() || "global:image")
        : entry.beat_anchor
          ? buildBulletBeatAnchorLabel(entry.beat_anchor)
          : (entry.anchor || entry.prompt_basis || entry.description || "image:beat"),
    },
    beat_anchor: entry.beat_anchor ?? null,
    timing: {
      in_offset_sec: 0,
      duration_sec: 6,
    },
    description: entry.description || entry.visual_intent || entry.prompt_basis || "Image map visual beat",
    intent: entry.intent || "visual_support",
    source: {
      status: entry.selected_asset_id ? "selected" : "unresolved",
      asset_id: entry.selected_asset_id ?? null,
    },
    confidence: entry.status === "selected" ? "high" : "medium",
    fulfillment_status: entry.selected_asset_id ? "resolved" : "planned",
    fulfillment_path: entry.selected_asset_id
      ? "image"
      : null,
    optional: entry.visual_priority === "optional",
    critical: entry.visual_priority === "primary",
    stale: false,
    created_at: nowIso,
    updated_at: nowIso,
  }));
}

export function buildMediaMapFromExistingPlans(
  current: EpisodePackageV2,
  scriptVersionId: string | null,
  scope: MediaMapGenerationScope,
): EpisodeMediaMap {
  const nowIso = new Date().toISOString();
  const thumbnailVersionByConceptId = new Map<string, EpisodeThumbnailVersion>();
  for (const version of current.thumbnail.versions) {
    if (!thumbnailVersionByConceptId.has(version.concept_id)) {
      thumbnailVersionByConceptId.set(version.concept_id, version);
    }
  }
  const fromThumbnailPrompts: EpisodeMediaMapEntry[] = current.thumbnail.concepts.map((concept) => {
    const conceptLabel = concept.label.trim();
    const promptText = concept.prompt_text.trim();
    const supportingVersion = thumbnailVersionByConceptId.get(concept.id);
    return {
      id: `mm_thumbnail_${concept.id}`,
      final_media_kind: "image",
      purpose: "emphasis",
      anchor: {
        mode: "section_marker",
        target: conceptLabel ? `thumbnail:${conceptLabel}` : "thumbnail:concept",
      },
      timing: {
        in_offset_sec: 0,
        duration_sec: 6,
      },
      description: promptText || conceptLabel || "Thumbnail concept prompt",
      intent: "thumbnail_concept",
      source: {
        status: supportingVersion?.asset_id ? "selected" : "unresolved",
        asset_id: supportingVersion?.asset_id ?? null,
      },
      confidence: "medium",
      fulfillment_status: supportingVersion?.asset_id ? "resolved" : "planned",
      fulfillment_path: supportingVersion?.asset_id ? "image" : null,
      optional: false,
      critical: true,
      stale: false,
      created_at: nowIso,
      updated_at: nowIso,
    };
  });
  const fromImageMap = mapImageEntriesToMediaMapEntries(current.image_map.entries, nowIso, "mm_imap_");
  const fromBroll: EpisodeMediaMapEntry[] = current.broll_plan.beats.map((beat) => ({
    id: `mm_broll_${beat.id}`,
    final_media_kind: "b_roll",
    purpose: beat.purpose,
    anchor: {
      mode: beat.placement_hint === "exact_timestamp" ? "absolute_time" : "phrase_match",
      target: beat.placement_hint === "exact_timestamp"
        ? String((beat.timestamp_ms ?? 0) / 1000)
        : beat.anchor_text,
    },
    timing: {
      in_offset_sec: 0,
      duration_sec: Math.max(1, (beat.suggested_duration_ms ?? 6000) / 1000),
    },
    description: beat.description,
    intent: beat.motion_intent,
    source: {
      status: beat.selected_asset_id ? "selected" : "unresolved",
      asset_id: beat.selected_asset_id ?? null,
    },
    confidence: "medium",
    fulfillment_status: beat.selected_asset_id ? "resolved" : "planned",
    fulfillment_path: beat.selected_asset_id ? "motion_broll" : null,
    optional: beat.priority === "background",
    critical: beat.priority === "primary",
    stale: false,
    created_at: beat.created_at,
    updated_at: beat.updated_at,
  }));
  const fromReferenceClips: EpisodeMediaMapEntry[] = current.cdc_plan.entries.filter(hasReferenceClipEvidenceSource).map((entry) => ({
    id: `mm_reference_clip_${entry.id}`,
    final_media_kind: "contextual_data_composite",
    purpose: entry.purpose,
    anchor: {
      mode: entry.placement_hint === "exact_timestamp" ? "absolute_time" : "phrase_match",
      target: entry.placement_hint === "exact_timestamp"
        ? String((entry.timestamp_ms ?? 0) / 1000)
        : entry.anchor_text,
    },
    timing: {
      in_offset_sec: 0,
      duration_sec: 6,
    },
    description: entry.description,
    intent: [
      entry.subtype ?? entry.data_type,
      entry.source ? `source:${entry.source}` : null,
      entry.context ? `context:${entry.context}` : null,
      entry.highlight ? `highlight:${entry.highlight}` : null,
    ].filter(Boolean).join(" | "),
    source: {
      status: entry.selected_asset_id ? "selected" : "unresolved",
      asset_id: entry.selected_asset_id ?? null,
    },
    confidence: "medium",
    fulfillment_status: entry.selected_asset_id ? "resolved" : "planned",
    fulfillment_path: entry.selected_asset_id ? "reference_clip" : null,
    optional: false,
    critical: true,
    stale: false,
    created_at: entry.created_at,
    updated_at: entry.updated_at,
  }));
  const includeImages = true;
  const includeBroll = scope === "images_broll" || scope === "full_media_plan";
  const includeReferenceClips = scope === "images_reference_clips" || scope === "full_media_plan";
  const merged = [
    ...(includeImages ? fromThumbnailPrompts : []),
    ...(includeImages ? fromImageMap : []),
    ...(includeBroll ? fromBroll : []),
    ...(includeReferenceClips ? fromReferenceClips : []),
  ];
  const selected = selectMediaMapVisualBeats(merged);
  return {
    id: current.media_map.id || "media-map-v1",
    workpiece_id: current.media_map.workpiece_id,
    script_version_id: scriptVersionId,
    status: "review",
    version: Math.max(1, current.media_map.version + 1),
    entries: selected,
    generated_at: nowIso,
  };
}
