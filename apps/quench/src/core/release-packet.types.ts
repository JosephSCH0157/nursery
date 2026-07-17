export type AssetSourceMode = "local" | "cloud" | "external_url";

export type QuenchPlatform = "youtube" | "rumble" | "spotify" | "rss";

export type ReleaseMode = "publish" | "schedule" | "premiere";

export type ReleaseAssetKind = "video" | "audio" | "thumbnail" | "short";

export interface ReleasePacketSeoMetadata {
  canonical_slug?: string;
  keywords?: string[];
  transcript_asset_id?: string | null;
}

export interface ReleasePacketShort {
  asset_id: string;
  title: string;
  description?: string;
}

export interface PlatformMetadataOverride {
  title?: string;
  description?: string;
  tags?: string[];
  thumbnail_asset_id?: string | null;
}

export interface ReleaseBrandProvenance { binding_id: string; binding_revision: number; profile_revision_id: string | null; profile_content_hash: string | null; asset_revision_ids: string[] }

export interface ReleasePacket {
  release_packet_id: string;
  workspace_id: string;
  workpiece_id: string;
  episode_id: string;
  title: string;
  description: string;
  tags: string[];
  thumbnail_asset_id: string | null;
  video_export_id: string | null;
  audio_export_id: string | null;
  shorts: ReleasePacketShort[];
  asset_source: AssetSourceMode;
  rss_ready: boolean;
  platform_overrides: Partial<Record<QuenchPlatform, PlatformMetadataOverride>>;
  seo_metadata?: ReleasePacketSeoMetadata | null;
  brand_provenance?: ReleaseBrandProvenance | null;
}

export interface PlatformPublishOptions {
  enabled: boolean;
  mode: ReleaseMode;
  scheduled_for?: string;
  visibility?: "private" | "unlisted" | "public";
  title_override?: string;
  description_override?: string;
}

export interface ShortsStrategy {
  enabled: boolean;
  cadence: "daily" | "twice_daily" | "custom";
  interval_hours?: number;
}

export interface ReleaseDecisionSet {
  platforms: Partial<Record<QuenchPlatform, PlatformPublishOptions>>;
  shorts_strategy?: ShortsStrategy;
}

export function isBlank(value: string | null | undefined): boolean {
  return !value || value.trim().length === 0;
}
