export type ScriptSourceType =
  | "statute"
  | "case"
  | "article"
  | "book"
  | "video"
  | "podcast"
  | "transcript"
  | "interview"
  | "report"
  | "dataset"
  | "other";

export type ScriptSource = {
  source_id: string;
  title: string;
  type: ScriptSourceType | string;
  url?: string | null;
  author?: string | null;
  publisher?: string | null;
  published_at?: string | null;
  notes?: string | null;
};

export type SourceAnchor =
  | { kind: "token"; token: string }
  | { kind: "range"; start: number; end: number }
  | { kind: "linecol"; startLine: number; startCol: number; endLine: number; endCol: number };

export type WorkpieceSourceRef = {
  source_id: string;
  notes?: string | null;
  attached_to?: SourceAnchor[] | null;
};

export type ScriptSourcesDocument = {
  schema: "forge.script.sources.v1";
  updated_at: string;
  sources: WorkpieceSourceRef[];
};

export type SourceLibraryDocument = {
  schema: "forge.source.library.v1";
  updated_at: string;
  sources: ScriptSource[];
};

export const SCRIPT_SOURCES_SCHEMA = "forge.script.sources.v1";
export const SOURCE_LIBRARY_SCHEMA = "forge.source.library.v1";

export const SCRIPT_SOURCES_PATH = "script/script.sources.json";
export const SOURCE_LIBRARY_INDEX_PATH = "sources/index.json";

export function sourceLibraryEntryPath(sourceId: string): string {
  const trimmed = sourceId.trim();
  return trimmed ? `sources/${trimmed}.json` : "sources/unknown.json";
}
