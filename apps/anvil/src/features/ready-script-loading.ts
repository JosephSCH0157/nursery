export type ReadyScriptLoadEntry = {
  workpieceId: string;
  path: string;
  primaryPath: string;
  scriptPaths: string[];
};

export function hasUsableReadyScriptContent(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function buildReadyScriptPathCandidates(entry: ReadyScriptLoadEntry): string[] {
  const candidates = [entry.path, entry.primaryPath, ...entry.scriptPaths];
  const out: string[] = [];
  for (const candidate of candidates) {
    const path = String(candidate || '').trim();
    if (!path || out.includes(path)) continue;
    out.push(path);
  }
  return out;
}

export async function readReadyScriptRecordContent(
  entry: ReadyScriptLoadEntry,
  readText: (workpieceId: string, path: string) => Promise<string | null>,
): Promise<string | null> {
  for (const path of buildReadyScriptPathCandidates(entry)) {
    const text = await readText(entry.workpieceId, path);
    if (hasUsableReadyScriptContent(text)) {
      return text;
    }
  }
  return null;
}
