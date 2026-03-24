export function buildSourceDeskPreviewFetchKey(paths: readonly string[]): string {
  const unique = new Set<string>();
  for (const value of paths) {
    const normalized = typeof value === "string" ? value.trim() : "";
    if (!normalized) continue;
    unique.add(normalized);
  }
  return [...unique].sort((left, right) => left.localeCompare(right)).join("\n");
}
