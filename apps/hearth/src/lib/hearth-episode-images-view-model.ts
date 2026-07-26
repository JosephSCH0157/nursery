import type { EpisodeImageMapEntry } from "./episode-package-v2";

export type EpisodeImageCreatorStatus = "current" | "not_started" | "creating_options" | "options_ready" | "selected" | "needs_attention" | "complete";

export type EpisodeImagesQueueItem = {
  id: string;
  number: number;
  scriptMoment: string;
  suggestedImage: string;
  status: EpisodeImageCreatorStatus;
  selectedAssetId: string | null;
  selectedAssetPath: string | null;
};

export type EpisodeImagesWorkspaceViewModel = {
  progress: { ready: number; total: number; label: string };
  items: EpisodeImagesQueueItem[];
  activeItem: EpisodeImagesQueueItem | null;
  nextUnresolvedId: string | null;
  stageComplete: boolean;
};

function compact(value: string, fallback: string, limit = 92): string {
  const text = value.replace(/\s+/g, " ").trim() || fallback;
  return text.length <= limit ? text : `${text.slice(0, limit - 1).trimEnd()}…`;
}

export function firstUnresolvedEpisodeImageId(entries: EpisodeImageMapEntry[]): string | null {
  return entries.find((entry) => !entry.selected_asset_id)?.id ?? null;
}

export function nextUnresolvedEpisodeImageId(entries: EpisodeImageMapEntry[], completedId: string): string | null {
  if (!entries.length) return null;
  const start = Math.max(0, entries.findIndex((entry) => entry.id === completedId));
  for (let offset = 1; offset <= entries.length; offset += 1) {
    const entry = entries[(start + offset) % entries.length];
    if (entry && !entry.selected_asset_id) return entry.id;
  }
  return null;
}

export function buildEpisodeImagesWorkspaceViewModel(args: {
  entries: EpisodeImageMapEntry[];
  activeEntryId: string | null;
  creatingOptions?: boolean;
  needsAttentionEntryId?: string | null;
}): EpisodeImagesWorkspaceViewModel {
  const ready = args.entries.filter((entry) => Boolean(entry.selected_asset_id)).length;
  const fallbackActiveId = firstUnresolvedEpisodeImageId(args.entries) ?? args.entries[0]?.id ?? null;
  const activeId = args.activeEntryId && args.entries.some((entry) => entry.id === args.activeEntryId)
    ? args.activeEntryId
    : fallbackActiveId;
  const items = args.entries.map((entry, index): EpisodeImagesQueueItem => {
    const selected = entry.selected_asset_id
      ? entry.candidate_assets.find((asset) => asset.asset_id === entry.selected_asset_id) ?? null
      : null;
    let status: EpisodeImageCreatorStatus = entry.selected_asset_id ? "complete" : entry.candidate_assets.length ? "options_ready" : "not_started";
    if (entry.id === args.needsAttentionEntryId) status = "needs_attention";
    else if (entry.id === activeId && args.creatingOptions) status = "creating_options";
    else if (entry.id === activeId && !entry.selected_asset_id && !entry.candidate_assets.length) status = "current";
    else if (entry.id === activeId && entry.selected_asset_id) status = "selected";
    return {
      id: entry.id,
      number: index + 1,
      scriptMoment: compact(entry.anchor || entry.script_anchor?.span_text || "Planned script moment", "Planned script moment", 68),
      suggestedImage: compact(entry.description || entry.visual_intent || entry.prompt_basis, "Add an image direction", 110),
      status,
      selectedAssetId: entry.selected_asset_id,
      selectedAssetPath: selected?.path ?? null,
    };
  });
  const total = items.length;
  return {
    progress: { ready, total, label: total > 0 && ready === total ? "Episode images complete" : `${ready} of ${total} ready` },
    items,
    activeItem: items.find((item) => item.id === activeId) ?? null,
    nextUnresolvedId: firstUnresolvedEpisodeImageId(args.entries),
    stageComplete: total > 0 && ready === total,
  };
}

export function episodeImageStatusLabel(status: EpisodeImageCreatorStatus): string {
  return ({ current: "Current", not_started: "Not started", creating_options: "Creating options", options_ready: "Options ready", selected: "Selected", needs_attention: "Needs attention", complete: "Complete" })[status];
}
