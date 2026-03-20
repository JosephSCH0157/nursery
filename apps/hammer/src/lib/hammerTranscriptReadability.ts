import type { TranscriptOverlayRow } from "./transcriptPreview";

// Canonical transcript truth in Hammer:
// - machine / chunked transcript rows remain the timing and anchor truth
// - readable transcript groups are a presentation projection for editors
// - cleanup and readability do not mutate timing truth in this slice

export type HammerReadableTranscriptGroup = {
  group_id: string;
  speaker: string;
  start_sec: number;
  end_sec: number;
  row_ids: string[];
  anchor_segment_ids: string[];
  source_segment_ids: string[];
  row_count: number;
  text: string;
  contains_structural_rows: boolean;
};

const MAX_GROUP_GAP_SEC = 1.2;

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function rowText(row: TranscriptOverlayRow): string {
  return normalizeText(row.blocks.map((block) => block.text).join(" "));
}

function canAppendRowToGroup(current: HammerReadableTranscriptGroup, row: TranscriptOverlayRow): boolean {
  if (current.speaker !== row.speaker) return false;
  if (current.contains_structural_rows) return false;
  if (row.structure !== "base") return false;
  if ((row.start_sec - current.end_sec) > MAX_GROUP_GAP_SEC) return false;
  return true;
}

export function buildHammerReadableTranscriptGroups(
  rows: TranscriptOverlayRow[],
): HammerReadableTranscriptGroup[] {
  const groups: HammerReadableTranscriptGroup[] = [];

  for (const row of rows) {
    const text = rowText(row);
    const previous = groups.at(-1) ?? null;
    if (previous && canAppendRowToGroup(previous, row)) {
      previous.end_sec = Math.max(previous.end_sec, row.end_sec);
      previous.row_ids.push(row.row_id);
      previous.anchor_segment_ids.push(row.anchor_segment_id);
      previous.source_segment_ids.push(...row.source_segment_ids);
      previous.row_count += 1;
      previous.text = normalizeText(`${previous.text} ${text}`);
      continue;
    }

    groups.push({
      group_id: `group:${row.row_id}`,
      speaker: row.speaker,
      start_sec: row.start_sec,
      end_sec: row.end_sec,
      row_ids: [row.row_id],
      anchor_segment_ids: [row.anchor_segment_id],
      source_segment_ids: [...row.source_segment_ids],
      row_count: 1,
      text,
      contains_structural_rows: row.structure !== "base",
    });
  }

  return groups.map((group) => ({
    ...group,
    anchor_segment_ids: uniqueStrings(group.anchor_segment_ids),
    source_segment_ids: uniqueStrings(group.source_segment_ids),
  }));
}

export function findHammerReadableTranscriptGroupByRowId(
  groups: HammerReadableTranscriptGroup[],
  rowId: string | null | undefined,
): HammerReadableTranscriptGroup | null {
  if (!rowId) return null;
  return groups.find((group) => group.row_ids.includes(rowId)) ?? null;
}
