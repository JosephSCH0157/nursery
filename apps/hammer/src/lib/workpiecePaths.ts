export function normalizeWorkpieceRelativePath(workpieceId: string, rawPath: string): string {
  const workpiecePrefix = `workpieces/${workpieceId}/`;
  let normalized = rawPath.replace(/^\/+/, "");
  while (normalized.startsWith(workpiecePrefix)) {
    normalized = normalized.slice(workpiecePrefix.length);
  }
  return normalized;
}