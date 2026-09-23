export type UnifiedVisualSourceCatalogEntry = {
  source_key: string;
  title: string;
  publisher: string | null;
  source_type: string;
  canonical_url: string;
  user_supplied: boolean;
};

export function canonicalizeUnifiedVisualSourceCatalog(
  links: readonly unknown[],
): UnifiedVisualSourceCatalogEntry[] {
  const record = (value: unknown): Record<string, unknown> | null =>
    value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  const text = (value: unknown): string | null =>
    typeof value === "string" && value.trim() ? value.trim() : null;
  return links.flatMap((value): UnifiedVisualSourceCatalogEntry[] => {
    const entry = record(value);
    const linkRevision = record(entry?.link_revision);
    const sourceRevision = record(entry?.source_revision);
    const linkId = text(linkRevision?.id);
    const title = text(sourceRevision?.title);
    const sourceType = text(sourceRevision?.source_type);
    const canonicalUrl = text(sourceRevision?.canonical_url);
    if (!linkId || !title || !sourceType || !canonicalUrl) return [];
    const provenance = record(sourceRevision?.provenance_json) ?? {};
    return [{
      source_key: `src_${linkId.replaceAll("-", "")}`,
      title,
      publisher: text(sourceRevision?.publisher),
      source_type: sourceType,
      canonical_url: canonicalUrl,
      user_supplied: provenance.user_supplied === true,
    }];
  });
}
