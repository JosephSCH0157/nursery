export function resolveHearthThumbnailCanonicalPreviewPath(args: {
  candidateAssetPath?: string | null;
  compositeAssetId?: string | null;
  versions: Array<{ asset_id?: string | null; asset_path?: string | null }>;
}): string | null {
  const direct = args.candidateAssetPath?.trim();
  if (direct) return direct;
  if (!args.compositeAssetId) return null;
  return args.versions.find((version) => version.asset_id === args.compositeAssetId)?.asset_path?.trim() || null;
}
