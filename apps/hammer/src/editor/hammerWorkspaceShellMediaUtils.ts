import type { HammerEditPlan, HammerPreviewMode } from "../../../../packages/contracts/hammer/edit-plan.contract";
import type { HammerLaunchContext } from "../../../../packages/contracts/hammer/launch-context.contract";
import type { MediaRef, WorkspaceMediaMapping } from "../../../../packages/contracts/hammer/media-resolver.contract";
import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";
import type { HammerPersistedStructuredTranscript } from "../persistence/hammerPersistenceContract";

export type HammerSourceAssetKind = "image" | "broll" | "reference_clip" | "audio" | "other";
export type HammerMediaMapSuggestionType = "broll" | "reference_clip";

const NUMERIC_SIGNAL_RE = /\b(\d+([.,]\d+)?%?|\d{4}|increase|decrease|up|down|trend|timeline|year|month|week|compared|versus|vs\.?)\b/i;
const MOTION_SIGNAL_RE = /\b(move|moving|walk|walking|run|running|drive|driving|enter|entering|exit|transition|story|journey|reveal|show|follow)\b/i;

export function appendUniquePaths(
  target: string[],
  candidates: Array<string | null | undefined>,
): string[] {
  const seen = new Set(target);
  for (const candidate of candidates) {
    const next = typeof candidate === "string" ? candidate.trim() : "";
    if (!next || seen.has(next)) continue;
    seen.add(next);
    target.push(next);
  }
  return target;
}

export function readTranscriptSegments(
  launchContext: HammerLaunchContext,
  structuredTranscript: HammerPersistedStructuredTranscript | null,
): HammerTranscriptSegment[] {
  if (structuredTranscript?.segments?.length) {
    return structuredTranscript.segments.map((segment) => ({ ...segment }));
  }
  if (launchContext.transcript.kind === "tongs-stub") {
    return launchContext.transcript.segments.map((segment) => ({ ...segment }));
  }
  return [];
}

export function resolveMediaRef(launchContext: HammerLaunchContext): MediaRef | null {
  if (launchContext.media.kind === "mapped-local" || launchContext.media.kind === "tongs-stub") {
    return { ...launchContext.media.ref };
  }
  return null;
}

export function resolveWorkspaceMapping(launchContext: HammerLaunchContext): WorkspaceMediaMapping | null {
  if (launchContext.media.kind === "tongs-stub") {
    return launchContext.media.workspace_mapping ? { ...launchContext.media.workspace_mapping } : null;
  }
  return null;
}

export function createFallbackEditPlan(
  launchContext: HammerLaunchContext,
  transcriptSourceId: string,
  previewMode: HammerPreviewMode,
): HammerEditPlan {
  const now = new Date().toISOString();
  const sessionId = launchContext.session_id ?? `${launchContext.workpiece_id}:session`;
  return {
    edit_plan_id: `${launchContext.workpiece_id}:plan`,
    version: "1",
    created_at: now,
    updated_at: now,
    source_transcript_id: transcriptSourceId,
    instructions: [],
    preview_mode: previewMode,
    workspace_id: launchContext.workspace_id,
    workpiece_id: launchContext.workpiece_id,
    session_id: sessionId,
  };
}

export function deriveAssetKind(args: {
  visualMode: string | null;
  assetPath: string | null;
}): HammerSourceAssetKind {
  const mode = (args.visualMode ?? "").toLowerCase();
  const path = (args.assetPath ?? "").toLowerCase();
  if (mode.includes("reference_clip") || mode.includes("contextual_data_composite") || mode.includes("cdc")) {
    return "reference_clip";
  }
  if (mode.includes("broll") || path.includes("broll")) return "broll";
  if (mode.includes("image")) return "image";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg") || path.endsWith(".png") || path.endsWith(".webp") || path.endsWith(".gif")) {
    return "image";
  }
  if (path.endsWith(".mp4") || path.endsWith(".mov") || path.endsWith(".m4v") || path.endsWith(".webm")) {
    return "broll";
  }
  if (path.endsWith(".wav") || path.endsWith(".mp3") || path.endsWith(".aac") || path.endsWith(".m4a")) {
    return "audio";
  }
  return "other";
}

export function inferPlaybackMimeTypeFromPath(args: {
  path: string;
  kind: MediaRef["kind"];
}): string {
  const normalized = args.path.toLowerCase();
  if (normalized.endsWith(".mp4")) return "video/mp4";
  if (normalized.endsWith(".m4v")) return "video/x-m4v";
  if (normalized.endsWith(".mov")) return "video/quicktime";
  if (normalized.endsWith(".webm")) return "video/webm";
  if (normalized.endsWith(".mp3")) return "audio/mpeg";
  if (normalized.endsWith(".wav")) return "audio/wav";
  if (normalized.endsWith(".aac")) return "audio/aac";
  if (normalized.endsWith(".m4a")) return "audio/mp4";

  if (args.kind === "recording_audio" || args.kind === "export_audio" || args.kind === "asset_audio") {
    return "audio/mpeg";
  }
  if (args.kind === "recording_video" || args.kind === "export_video" || args.kind === "asset_broll") {
    return "video/mp4";
  }
  return "application/octet-stream";
}

export function resolveMediaMapSuggestionType(text: string): {
  type: HammerMediaMapSuggestionType;
  reason: string;
} {
  if (NUMERIC_SIGNAL_RE.test(text)) {
    return { type: "reference_clip", reason: "numbers detected" };
  }
  if (MOTION_SIGNAL_RE.test(text)) {
    return { type: "broll", reason: "motion detected" };
  }
  return { type: "broll", reason: "story context detected" };
}

export function formatBytes(bytes: number | null): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return "size unknown";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isSourceDeskAuthMessage(message: string | null): boolean {
  if (!message) return false;
  return /(auth|session|token|sign[ -]?in|unauthorized|forbidden)/i.test(message);
}

export function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}
