function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export function normalizeWorkpieceRelativePath(workpieceId: string, rawPath: string | null | undefined): string | null {
  const path = readString(rawPath);
  if (!path) return null;
  const workpiecePrefix = `workpieces/${workpieceId}/`;
  let normalized = path.replace(/^\/+/, "");
  while (normalized.startsWith(workpiecePrefix)) {
    normalized = normalized.slice(workpiecePrefix.length);
  }
  return normalized;
}