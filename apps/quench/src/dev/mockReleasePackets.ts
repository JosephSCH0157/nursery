import type { ResolvedAsset, ResolvedReleaseAssets } from "../core/asset-resolver";
import type {
  PlatformPublishOptions,
  QuenchPlatform,
  ReleasePacket,
} from "../core/release-packet.types";

export interface QuenchMockReleaseCase {
  case_id: string;
  label: string;
  summary: string;
  packet: ReleasePacket;
  resolved_assets: Partial<ResolvedReleaseAssets>;
  default_platforms: QuenchPlatform[];
  default_publish_options: Partial<Record<QuenchPlatform, PlatformPublishOptions>>;
}

type MockCaseDefinition = Omit<QuenchMockReleaseCase, "packet" | "resolved_assets"> & {
  packet: ReleasePacket;
  resolved_assets: Partial<ResolvedReleaseAssets>;
};

const DEFAULT_WORKSPACE_ID = "77777777-7777-4777-8777-777777777777";

const CASE_DEFINITIONS: MockCaseDefinition[] = [
  {
    case_id: "launch-ready",
    label: "Launch Ready",
    summary:
      "Video, audio, thumbnail, and public RSS audio are all resolvable for a real downstream handoff.",
    packet: {
      release_packet_id: "release_packet_launch_ready",
      workspace_id: DEFAULT_WORKSPACE_ID,
      workpiece_id: "88888888-8888-4888-8888-888888888881",
      episode_id: "ep_214",
      title: "Why pipeline seams beat feature piles",
      description:
        "A finished release packet with canonical exports, selected visuals, and metadata ready for downstream publishing tools.",
      tags: ["podcasting", "workflow", "creator systems"],
      thumbnail_asset_id: "thumb_launch_ready",
      video_export_id: "video_launch_ready",
      audio_export_id: "audio_launch_ready",
      shorts: [
        {
          asset_id: "short_launch_ready_01",
          title: "Pipeline seam over feature pile",
          description: "A cutdown short for the strongest editorial point.",
        },
      ],
      asset_source: "cloud",
      rss_ready: true,
      platform_overrides: {
        youtube: {
          title: "Why pipeline seams beat feature piles",
          tags: ["podcasting", "creator tools", "systems"],
          thumbnail_asset_id: "thumb_launch_ready",
        },
        rss: {
          description: "Audio-first description trimmed for feed readers.",
        },
      },
      seo_metadata: {
        canonical_slug: "pipeline-seams-beat-feature-piles",
        keywords: ["podcaster workflow", "editing pipeline", "creator systems"],
        transcript_asset_id: "transcript_launch_ready",
      },
    },
    resolved_assets: {
      video: {
        asset_id: "video_launch_ready",
        kind: "video",
        source: "cloud",
        uri: "supabase://forge/workpieces/88888888-8888-4888-8888-888888888881/exports/main.mp4",
        mime_type: "video/mp4",
        duration_sec: 1842,
        accessible: true,
      },
      audio: {
        asset_id: "audio_launch_ready",
        kind: "audio",
        source: "cloud",
        uri: "supabase://forge/workpieces/88888888-8888-4888-8888-888888888881/exports/main.mp3",
        mime_type: "audio/mpeg",
        duration_sec: 1842,
        public_url: "https://cdn.forge.example/releases/ep_214.mp3",
        accessible: true,
      },
      thumbnail: {
        asset_id: "thumb_launch_ready",
        kind: "thumbnail",
        source: "cloud",
        uri: "supabase://forge/workpieces/88888888-8888-4888-8888-888888888881/assets/thumb.png",
        mime_type: "image/png",
        accessible: true,
      },
      shorts: [
        {
          asset_id: "short_launch_ready_01",
          kind: "short",
          source: "cloud",
          uri: "supabase://forge/workpieces/88888888-8888-4888-8888-888888888881/exports/short_01.mp4",
          mime_type: "video/mp4",
          duration_sec: 34,
          accessible: true,
        },
      ],
    },
    default_platforms: ["youtube", "rss"],
    default_publish_options: {
      youtube: {
        enabled: true,
        mode: "publish",
        visibility: "unlisted",
      },
      rss: {
        enabled: true,
        mode: "publish",
      },
    },
  },
  {
    case_id: "audio-first",
    label: "Audio First",
    summary: "A podcast-first packet that is valid for RSS, but not for video distribution.",
    packet: {
      release_packet_id: "release_packet_audio_first",
      workspace_id: DEFAULT_WORKSPACE_ID,
      workpiece_id: "88888888-8888-4888-8888-888888888882",
      episode_id: "ep_215",
      title: "Audio-first release path",
      description:
        "An audio distribution packet with feed-safe metadata, public audio, and no video export attached yet.",
      tags: ["rss", "podcast", "release"],
      thumbnail_asset_id: "thumb_audio_first",
      video_export_id: null,
      audio_export_id: "audio_audio_first",
      shorts: [],
      asset_source: "local",
      rss_ready: true,
      platform_overrides: {
        rss: {
          title: "Audio-first release path",
        },
      },
      seo_metadata: {
        canonical_slug: "audio-first-release-path",
        keywords: ["rss release", "podcast distribution"],
        transcript_asset_id: "transcript_audio_first",
      },
    },
    resolved_assets: {
      audio: {
        asset_id: "audio_audio_first",
        kind: "audio",
        source: "local",
        uri: "D:\\ForgeMedia\\exports\\ep_215_audio.mp3",
        mime_type: "audio/mpeg",
        duration_sec: 1260,
        public_url: "https://cdn.forge.example/releases/ep_215.mp3",
        accessible: true,
      },
      thumbnail: {
        asset_id: "thumb_audio_first",
        kind: "thumbnail",
        source: "local",
        uri: "D:\\ForgeMedia\\exports\\ep_215_cover.png",
        mime_type: "image/png",
        accessible: true,
      },
      shorts: [],
    },
    default_platforms: ["rss"],
    default_publish_options: {
      rss: {
        enabled: true,
        mode: "schedule",
        scheduled_for: "2026-03-15T14:00:00.000Z",
      },
    },
  },
  {
    case_id: "blocked",
    label: "Blocked",
    summary:
      "Metadata exists, but missing exports and inaccessible assets keep this packet out of a lawful release handoff.",
    packet: {
      release_packet_id: "release_packet_blocked",
      workspace_id: DEFAULT_WORKSPACE_ID,
      workpiece_id: "88888888-8888-4888-8888-888888888883",
      episode_id: "ep_216",
      title: "Blocked release packet",
      description:
        "A packet intentionally missing core assets so the console can show hard readiness failures without pretending it is publishable.",
      tags: [],
      thumbnail_asset_id: "thumb_blocked",
      video_export_id: "video_blocked",
      audio_export_id: null,
      shorts: [],
      asset_source: "cloud",
      rss_ready: false,
      platform_overrides: {
        youtube: {
          title: "Blocked release packet",
          thumbnail_asset_id: "thumb_blocked",
        },
      },
      seo_metadata: {
        canonical_slug: "blocked-release-packet",
        keywords: ["blocked packet"],
        transcript_asset_id: null,
      },
    },
    resolved_assets: {
      video: {
        asset_id: "video_blocked",
        kind: "video",
        source: "cloud",
        uri: "supabase://forge/workpieces/88888888-8888-4888-8888-888888888883/exports/main.mp4",
        mime_type: "video/mp4",
        duration_sec: 1500,
        accessible: false,
      },
      thumbnail: {
        asset_id: "thumb_blocked",
        kind: "thumbnail",
        source: "cloud",
        uri: "supabase://forge/workpieces/88888888-8888-4888-8888-888888888883/assets/thumb.png",
        mime_type: "image/png",
        accessible: false,
      },
      shorts: [],
    },
    default_platforms: ["youtube", "rss"],
    default_publish_options: {
      youtube: {
        enabled: true,
        mode: "publish",
        visibility: "private",
      },
      rss: {
        enabled: true,
        mode: "publish",
      },
    },
  },
];

function cloneResolvedAsset(asset: ResolvedAsset | null | undefined): ResolvedAsset | null {
  if (!asset) return null;
  return { ...asset };
}

function clonePublishOptions(
  options: Partial<Record<QuenchPlatform, PlatformPublishOptions>>,
): Partial<Record<QuenchPlatform, PlatformPublishOptions>> {
  const next: Partial<Record<QuenchPlatform, PlatformPublishOptions>> = {};
  for (const [platform, option] of Object.entries(options) as [QuenchPlatform, PlatformPublishOptions][]) {
    next[platform] = { ...option };
  }
  return next;
}

function cloneReleasePacket(packet: ReleasePacket, workspaceId: string): ReleasePacket {
  return {
    ...packet,
    workspace_id: workspaceId,
    tags: [...packet.tags],
    shorts: packet.shorts.map((item) => ({ ...item })),
    platform_overrides: Object.fromEntries(
      Object.entries(packet.platform_overrides).map(([platform, override]) => [platform, override ? { ...override } : override]),
    ) as ReleasePacket["platform_overrides"],
    seo_metadata: packet.seo_metadata
      ? {
        ...packet.seo_metadata,
        keywords: packet.seo_metadata.keywords ? [...packet.seo_metadata.keywords] : undefined,
      }
      : null,
  };
}

function cloneResolvedAssets(
  assets: Partial<ResolvedReleaseAssets>,
): Partial<ResolvedReleaseAssets> {
  return {
    video: cloneResolvedAsset(assets.video),
    audio: cloneResolvedAsset(assets.audio),
    thumbnail: cloneResolvedAsset(assets.thumbnail),
    shorts: (assets.shorts ?? []).map((asset) => ({ ...asset })),
  };
}

export function listQuenchMockReleaseCases(args?: {
  workspaceId?: string | null;
}): QuenchMockReleaseCase[] {
  const workspaceId = args?.workspaceId?.trim() || DEFAULT_WORKSPACE_ID;
  return CASE_DEFINITIONS.map((entry) => ({
    case_id: entry.case_id,
    label: entry.label,
    summary: entry.summary,
    packet: cloneReleasePacket(entry.packet, workspaceId),
    resolved_assets: cloneResolvedAssets(entry.resolved_assets),
    default_platforms: [...entry.default_platforms],
    default_publish_options: clonePublishOptions(entry.default_publish_options),
  }));
}
