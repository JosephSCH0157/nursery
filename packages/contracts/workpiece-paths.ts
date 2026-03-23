function readNonEmptyString(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeWorkpieceRelativePath(workpieceId: string, rawPath: string): string {
  const workpiecePrefix = `workpieces/${workpieceId}/`;
  let normalized = rawPath.replace(/^\/+/, "");
  while (normalized.startsWith(workpiecePrefix)) {
    normalized = normalized.slice(workpiecePrefix.length);
  }
  return normalized;
}

export function normalizeWorkpieceRelativePathOrNull(
  workpieceId: string,
  rawPath: string | null | undefined,
): string | null {
  const path = readNonEmptyString(rawPath);
  if (!path) return null;
  return normalizeWorkpieceRelativePath(workpieceId, path);
}
