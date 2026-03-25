import type {
  EpisodeMediaMap,
  EpisodeMediaMapBeatFulfillmentStatus,
  EpisodeMediaMapEntry,
  EpisodeMediaMapFulfillmentPath,
} from "./episode-package-v2";

function resolveFulfillmentPath(kind: EpisodeMediaMapEntry["final_media_kind"]): EpisodeMediaMapFulfillmentPath {
  if (kind === "image") return "image";
  if (kind === "b_roll") return "motion_broll";
  return "cdc";
}

function resolveBeatStatusForQueue(entry: EpisodeMediaMapEntry): EpisodeMediaMapBeatFulfillmentStatus {
  if (entry.source.status === "selected" || entry.source.status === "attached") {
    return "resolved";
  }
  if (!entry.source.asset_id) {
    return "queued";
  }
  return "approved";
}

export function activateEpisodeMediaMapForFulfillment(map: EpisodeMediaMap): EpisodeMediaMap {
  const nowIso = new Date().toISOString();
  const routedEntries = map.entries.map((entry) => {
    const fulfillmentPath = resolveFulfillmentPath(entry.final_media_kind);
    const nextStatus = resolveBeatStatusForQueue(entry);
    return {
      ...entry,
      fulfillment_path: fulfillmentPath,
      fulfillment_status: nextStatus,
      updated_at: nowIso,
    };
  });

  return {
    ...map,
    status: "activated",
    version: Math.max(1, map.version + 1),
    entries: routedEntries,
    generated_at: nowIso,
  };
}
