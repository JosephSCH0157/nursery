type HammerBandwidthSurface = "source_desk_preview" | "project_library_preview" | "recording_card_preview" | "unknown";

type HammerFetchStat = {
  fetchCount: number;
  byteCount: number;
  surface: HammerBandwidthSurface;
};

const stats = new Map<string, HammerFetchStat>();

function isDebugEnabled(): boolean {
  const envValue = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.FORGE_BANDWIDTH_DEBUG;
  return envValue === "1" || envValue === "true";
}

export function recordHammerBandwidthFetch(args: {
  assetKey: string;
  surface: HammerBandwidthSurface;
  bytes: number;
}): void {
  const previous = stats.get(args.assetKey) ?? {
    fetchCount: 0,
    byteCount: 0,
    surface: args.surface,
  };
  const next: HammerFetchStat = {
    fetchCount: previous.fetchCount + 1,
    byteCount: previous.byteCount + Math.max(0, args.bytes),
    surface: args.surface,
  };
  stats.set(args.assetKey, next);

  if (next.fetchCount > 1) {
    console.warn("[hammer-bandwidth-dedupe-violation]", {
      asset_key: args.assetKey,
      surface: args.surface,
      fetch_count: next.fetchCount,
      estimated_bytes: next.byteCount,
    });
  } else if (isDebugEnabled()) {
    console.info("[hammer-bandwidth-fetch]", {
      asset_key: args.assetKey,
      surface: args.surface,
      fetch_count: next.fetchCount,
      estimated_bytes: next.byteCount,
    });
  }
}
