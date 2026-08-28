import type { HammerPrepSource } from "../prep/hammerPrep";

export type HammerAiTranscriptRegenerationResult = {
  finished_at: string; transcript_source_before: string | null; segment_count_before: number;
  segment_count_after: number | null; placements_refreshed: boolean; placement_count_before: number | null;
  placement_count_after: number | null; uncertain_count_before: number | null; uncertain_count_after: number | null;
};

export type HammerRegenJobTelemetry = {
  jobId: string | null; status: "idle" | "blocked" | "creating" | "queued" | "running" | "completed" | "failed" | "canceled";
  progressPercent: number | null; errorMessage: string | null;
};

export function mapTranscriptSourceLabel(value: string | null): string {
  const labels: Record<string,string>={registered_transcript:"Registered pointer",revision_transcript:"Revision transcript",
    canonical_baseline:"Canonical baseline",prepared_transcript:"AI-prepared transcript",live_noncanonical:"Anvil live ASR (non-canonical)"};
  return value ? labels[value] ?? value : "Unavailable";
}

export function mapIngestFinalStatusLabel(value: string | null): string {
  const labels: Record<string,string>={reused_transcript:"Reused transcript",prepared_transcript:"Prepared transcript",degraded:"Degraded",blocked:"Blocked"};
  return value ? labels[value] ?? value : "—";
}

function inferHammerMediaMimeTypeFromPath(pathValue: string | null | undefined): string | null {
  const normalized=pathValue?.trim().toLowerCase()??"";
  if(normalized.endsWith(".wav"))return "audio/wav"; if(normalized.endsWith(".mp3"))return "audio/mpeg";
  if(normalized.endsWith(".m4a"))return "audio/mp4"; if(normalized.endsWith(".webm"))return "video/webm";
  if(normalized.endsWith(".mp4"))return "video/mp4"; if(normalized.endsWith(".mov"))return "video/quicktime"; return null;
}

export function inferHammerPrepSourceMimeType(prepSource: HammerPrepSource): string | null {
  return inferHammerMediaMimeTypeFromPath(prepSource.canonical_workpiece_path)??inferHammerMediaMimeTypeFromPath(prepSource.local_relpath);
}
