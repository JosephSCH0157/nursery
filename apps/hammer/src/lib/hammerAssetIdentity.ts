function hashString(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function readTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeHammerAssetIdentitySource(
  value: string | null | undefined,
): string | null {
  const trimmed = readTrimmedString(value);
  if (!trimmed) return null;

  // Identity normalization contract (must remain stable across versions):
  // trim -> slash normalize -> remove leading "./" -> collapse duplicate slashes -> lowercase -> strip query/hash.
  const withoutQuery = trimmed.split(/[?#]/, 1)[0] ?? trimmed;
  const slashNormalized = withoutQuery.replace(/\\/g, "/");
  const withoutDotPrefix = slashNormalized.replace(/^\.\/+/, "");
  const collapsed = withoutDotPrefix.replace(/\/{2,}/g, "/").replace(/^\/+/, "");
  const normalized = collapsed.toLowerCase();
  return normalized || null;
}

export function deriveStableHammerAssetIdFromPath(path: string): string {
  const normalized = normalizeHammerAssetIdentitySource(path) ?? path.trim().toLowerCase();
  return `asset_${hashString(normalized)}`;
}

