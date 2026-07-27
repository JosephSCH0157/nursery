export function resolveHearthCanonicalImagePreviewPath(input: {
  canonicalAssetPath?: string | null;
  canonicalCompositePath?: string | null;
}): string | null {
  const assetPath = input.canonicalAssetPath?.trim();
  if (assetPath) return assetPath;
  const compositePath = input.canonicalCompositePath?.trim();
  return compositePath || null;
}
