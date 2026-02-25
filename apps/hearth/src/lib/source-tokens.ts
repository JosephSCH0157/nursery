export type SourceToken = {
  token: string;
  sourceId: string;
  normalized: string;
  index: number;
};

const SOURCE_TOKEN_RE = /\[(src_[a-z0-9][a-z0-9:_-]*)\]/gi;

export function normalizeSourceId(value: string): string {
  return value.trim().toLowerCase();
}

export function parseSourceTokens(input: string | null | undefined): SourceToken[] {
  const text = input ?? "";
  if (!text) return [];

  const out: SourceToken[] = [];
  SOURCE_TOKEN_RE.lastIndex = 0;

  let match: RegExpExecArray | null = null;
  while ((match = SOURCE_TOKEN_RE.exec(text)) !== null) {
    const token = match[0];
    const sourceId = match[1];
    out.push({
      token,
      sourceId,
      normalized: normalizeSourceId(sourceId),
      index: match.index ?? 0,
    });
  }

  return out;
}
