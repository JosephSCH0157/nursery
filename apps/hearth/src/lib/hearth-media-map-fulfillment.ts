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

export function approveEpisodeMediaMap(map: EpisodeMediaMap): EpisodeMediaMap {
  const nowIso = new Date().toISOString();
  return {
    ...map,
    status: "approved",
    version: Math.max(1, map.version + 1),
    entries: map.entries.map((entry) => ({
      ...entry,
      fulfillment_status: entry.fulfillment_status === "resolved" ? "resolved" : "approved",
      updated_at: nowIso,
    })),
    generated_at: nowIso,
  };
}

export function distributeEpisodeMediaMapForFulfillment(map: EpisodeMediaMap): EpisodeMediaMap {
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

  const unresolvedCount = routedEntries.filter((entry) => entry.fulfillment_status !== "resolved").length;
  return {
    ...map,
    status: unresolvedCount > 0 ? "fulfilling" : "fulfilled",
    version: Math.max(1, map.version + 1),
    entries: routedEntries,
    generated_at: nowIso,
  };
}
