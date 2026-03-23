export function normalizeWorkpieceRelativePath(workpieceId: string, rawPath: string): string {
  const withoutLeadingSlash = rawPath.replace(/^\/+/, "");
  const workpiecePrefix = `workpieces/${workpieceId}/`;
  if (withoutLeadingSlash.startsWith(workpiecePrefix)) {
    return withoutLeadingSlash.slice(workpiecePrefix.length);
  }
  return withoutLeadingSlash;
}