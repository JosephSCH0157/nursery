type HearthBandwidthSurface = "thumbnail_preview" | "image_map_candidate_preview" | "unknown";

type HearthFetchStat = {
  fetchCount: number;
  byteCount: number;
  surface: HearthBandwidthSurface;
};

const stats = new Map<string, HearthFetchStat>();

function isDebugEnabled(): boolean {
  const envValue = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.FORGE_BANDWIDTH_DEBUG;
  return envValue === "1" || envValue === "true";
}

export function recordHearthBandwidthFetch(args: {
  assetKey: string;
  surface: HearthBandwidthSurface;
  bytes: number;
}): void {
  const previous = stats.get(args.assetKey) ?? {
    fetchCount: 0,
    byteCount: 0,
    surface: args.surface,
  };
  const next: HearthFetchStat = {
    fetchCount: previous.fetchCount + 1,
    byteCount: previous.byteCount + Math.max(0, args.bytes),
    surface: args.surface,
  };
  stats.set(args.assetKey, next);

  if (next.fetchCount > 1) {
    console.warn("[hearth-bandwidth-dedupe-violation]", {
      asset_key: args.assetKey,
      surface: args.surface,
      fetch_count: next.fetchCount,
      estimated_bytes: next.byteCount,
    });
  } else if (isDebugEnabled()) {
    console.info("[hearth-bandwidth-fetch]", {
      asset_key: args.assetKey,
      surface: args.surface,
      fetch_count: next.fetchCount,
      estimated_bytes: next.byteCount,
    });
  }
}
