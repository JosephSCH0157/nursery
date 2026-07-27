export function resolveHearthCanonicalReferenceClipPreviewPath(input: {
  previewPath?: string | null;
  thumbnailPath?: string | null;
  assetPath?: string | null;
  video: boolean;
}): string | null {
  const preview = input.previewPath?.trim();
  if (preview) return preview;
  const fallback = (input.video ? input.thumbnailPath : input.assetPath)?.trim();
  return fallback || null;
}
