import type {
  AssetSourceMode,
  ReleaseAssetKind,
  ReleasePacket,
} from "./release-packet.types";

export interface ResolvedAsset {
  asset_id: string;
  kind: ReleaseAssetKind;
  source: AssetSourceMode;
  uri: string;
  mime_type?: string;
  duration_sec?: number;
  public_url?: string;
  accessible: boolean;
}

export interface ResolvedReleaseAssets {
  video: ResolvedAsset | null;
  audio: ResolvedAsset | null;
  thumbnail: ResolvedAsset | null;
  shorts: ResolvedAsset[];
}

export interface AssetResolver {
  resolveVideo(packet: ReleasePacket): Promise<ResolvedAsset | null>;
  resolveAudio(packet: ReleasePacket): Promise<ResolvedAsset | null>;
  resolveThumbnail(packet: ReleasePacket): Promise<ResolvedAsset | null>;
  resolveShorts(packet: ReleasePacket): Promise<ResolvedAsset[]>;
}

export async function resolveReleaseAssets(
  packet: ReleasePacket,
  resolver: AssetResolver,
): Promise<ResolvedReleaseAssets> {
  const [video, audio, thumbnail, shorts] = await Promise.all([
    resolver.resolveVideo(packet),
    resolver.resolveAudio(packet),
    resolver.resolveThumbnail(packet),
    resolver.resolveShorts(packet),
  ]);

  return {
    video,
    audio,
    thumbnail,
    shorts,
  };
}

export class StaticAssetResolver implements AssetResolver {
  private readonly assets: Partial<ResolvedReleaseAssets>;

  constructor(assets: Partial<ResolvedReleaseAssets>) {
    this.assets = assets;
  }

  resolveVideo(_packet: ReleasePacket): Promise<ResolvedAsset | null> {
    return Promise.resolve(this.assets.video ?? null);
  }

  resolveAudio(_packet: ReleasePacket): Promise<ResolvedAsset | null> {
    return Promise.resolve(this.assets.audio ?? null);
  }

  resolveThumbnail(_packet: ReleasePacket): Promise<ResolvedAsset | null> {
    return Promise.resolve(this.assets.thumbnail ?? null);
  }

  resolveShorts(_packet: ReleasePacket): Promise<ResolvedAsset[]> {
    return Promise.resolve(this.assets.shorts ?? []);
  }
}
