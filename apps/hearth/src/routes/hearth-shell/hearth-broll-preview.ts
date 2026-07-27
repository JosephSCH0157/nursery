export function resolveHearthCanonicalBrollPreviewPath(input: {
  previewPath?: string | null;
  thumbnailPath?: string | null;
  assetPath?: string | null;
  video: boolean;
}): string | null {
  const previewPath = input.previewPath?.trim();
  if (previewPath) return previewPath;
  const fallback = (input.video ? input.thumbnailPath : input.assetPath)?.trim();
  return fallback || null;
}
