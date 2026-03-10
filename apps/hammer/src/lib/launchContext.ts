import type { HammerEditInstruction } from "../../../../packages/contracts/hammer/edit-instruction.contract";
import type { HammerEditPlan, HammerPreviewMode } from "../../../../packages/contracts/hammer/edit-plan.contract";
import type {
  HammerInlineJsonTranscriptSource,
  HammerLaunchContext,
  HammerMediaSource,
  HammerTranscriptSource,
} from "../../../../packages/contracts/hammer/launch-context.contract";
import type {
  MediaRef,
  WorkspaceMediaMapping,
} from "../../../../packages/contracts/hammer/media-resolver.contract";
import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";
import { MIN_SEGMENT_DURATION_SEC } from "./transcriptPreview";
import { loadWorkspaceMapping } from "../media/workspaceMapping";
import type { WorkspaceMappingSource } from "../media/workspaceMapping";

const DEFAULT_PREVIEW_MODE: HammerPreviewMode = "edit-aware";
const DEFAULT_INLINE_TRANSCRIPT_LABEL = "inline:transcript_json";
const UNKNOWN_SPEAKER = "UNK";

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length ? normalized : null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

function normalizeTranscriptSegment(input: unknown, index: number): HammerTranscriptSegment | null {
  const row = readRecord(input);
  if (!row) return null;

  const startSec = readNumber(row.start_sec);
  if (startSec == null || startSec < 0) return null;
  const rawEndSec = readNumber(row.end_sec);
  const endSec = rawEndSec == null || rawEndSec <= startSec
    ? startSec + MIN_SEGMENT_DURATION_SEC
    : rawEndSec;

  const text = readString(row.text);
  if (!text) return null;

  const speaker = readString(row.speaker) ?? UNKNOWN_SPEAKER;
  const segmentId = readString(row.segment_id) ?? `seg_${index + 1}`;

  return {
    segment_id: segmentId,
    start_sec: startSec,
    end_sec: endSec,
    speaker,
    text,
  };
}

function cloneEditInstructions(instructions: HammerEditInstruction[]): HammerEditInstruction[] {
  return instructions.map((instruction) => ({ ...instruction }));
}

function cloneEditPlan(plan: HammerEditPlan): HammerEditPlan {
  return {
    ...plan,
    instructions: cloneEditInstructions(plan.instructions),
  };
}

function cloneMediaRef(ref: MediaRef): MediaRef {
  return { ...ref };
}

function cloneWorkspaceMapping(mapping: WorkspaceMediaMapping): WorkspaceMediaMapping {
  return { ...mapping };
}

function cloneTranscriptSegments(segments: HammerTranscriptSegment[]): HammerTranscriptSegment[] {
  return segments.map((segment) => ({ ...segment }));
}

function readInstruction(input: unknown): HammerEditInstruction | null {
  const row = readRecord(input);
  if (!row) return null;

  const instructionId = readString(row.instruction_id);
  const segmentId = readString(row.segment_id);
  const type = readString(row.type);
  const createdAt = readString(row.created_at);
  if (!instructionId || !segmentId || !type || !createdAt) return null;

  switch (type) {
    case "delete":
      return {
        instruction_id: instructionId,
        segment_id: segmentId,
        type,
        created_at: createdAt,
      };
    case "mute":
      return {
        instruction_id: instructionId,
        segment_id: segmentId,
        type,
        created_at: createdAt,
      };
    case "trim": {
      const trimStartSec = readNumber(row.trim_start_sec);
      const trimEndSec = readNumber(row.trim_end_sec);
      return {
        instruction_id: instructionId,
        segment_id: segmentId,
        type,
        trim_start_sec: trimStartSec ?? undefined,
        trim_end_sec: trimEndSec ?? undefined,
        created_at: createdAt,
      };
    }
    case "split": {
      const splitAtSec = readNumber(row.split_at_sec);
      if (splitAtSec == null) return null;
      return {
        instruction_id: instructionId,
        segment_id: segmentId,
        type,
        split_at_sec: splitAtSec,
        created_at: createdAt,
      };
    }
    case "merge": {
      const mergeWithSegmentId = readString(row.merge_with_segment_id);
      if (!mergeWithSegmentId) return null;
      return {
        instruction_id: instructionId,
        segment_id: segmentId,
        type,
        merge_with_segment_id: mergeWithSegmentId,
        created_at: createdAt,
      };
    }
    default:
      return null;
  }
}

function getTranscriptSourceLabel(source: HammerTranscriptSource): string {
  if (source.kind === "fixture") {
    return `fixture:${source.fixture_id}`;
  }
  if (source.kind === "inline-json") {
    return readString(source.label) ?? DEFAULT_INLINE_TRANSCRIPT_LABEL;
  }
  return readString(source.label) ?? `tongs:${source.transcript_id}`;
}

function getMediaSourceLabel(source: HammerMediaSource): string {
  if (source.kind === "dev-tone") {
    return `dev-tone:${source.media_id}`;
  }
  if (source.kind === "mapped-local") {
    return readString(source.label) ?? `mapped:${source.ref.media_id}`;
  }
  return readString(source.label) ?? `tongs:${source.ref.media_id}`;
}

function parseInlineTranscriptSource(
  source: HammerInlineJsonTranscriptSource,
  getFixtureSegments: (fixtureId: string) => HammerTranscriptSegment[],
  defaultFixtureId: string,
): ResolvedHammerTranscript {
  let parsed: HammerTranscriptSegment[];
  try {
    parsed = parseTranscriptSegmentsJson(source.transcript_json);
  } catch (error) {
    const fallbackFixtureId = source.fallback_fixture_id ?? defaultFixtureId;
    return {
      kind: "fixture",
      source_label: `fixture:${fallbackFixtureId}`,
      segments: cloneTranscriptSegments(getFixtureSegments(fallbackFixtureId)),
      error: toErrorMessage(error, "Failed to parse transcript_json. Falling back to fixture."),
    };
  }

  if (parsed.length > 0) {
    return {
      kind: source.kind,
      source_label: getTranscriptSourceLabel(source),
      segments: parsed,
      error: null,
    };
  }

  const fallbackFixtureId = source.fallback_fixture_id ?? defaultFixtureId;
  return {
    kind: "fixture",
    source_label: `fixture:${fallbackFixtureId}`,
    segments: cloneTranscriptSegments(getFixtureSegments(fallbackFixtureId)),
    error: "transcript_json did not contain valid segments. Falling back to fixture.",
  };
}

function resolveTranscriptSource(
  source: HammerTranscriptSource,
  getFixtureSegments: (fixtureId: string) => HammerTranscriptSegment[],
  defaultFixtureId: string,
): ResolvedHammerTranscript {
  if (source.kind === "fixture") {
    return {
      kind: source.kind,
      source_label: getTranscriptSourceLabel(source),
      segments: cloneTranscriptSegments(getFixtureSegments(source.fixture_id)),
      error: null,
    };
  }

  if (source.kind === "inline-json") {
    return parseInlineTranscriptSource(source, getFixtureSegments, defaultFixtureId);
  }

  return {
    kind: source.kind,
    source_label: getTranscriptSourceLabel(source),
    segments: cloneTranscriptSegments(source.segments),
    error: source.segments.length > 0
      ? null
      : "Tongs launch context did not include transcript segments.",
  };
}

function resolveMediaSource(
  context: HammerLaunchContext,
): ResolvedHammerMedia {
  if (context.media.kind === "dev-tone") {
    return {
      kind: context.media.kind,
      media_ref: null,
      workspace_mapping: null,
      requires_resolution: false,
      source_label: getMediaSourceLabel(context.media),
    };
  }

  if (context.media.kind === "mapped-local") {
    return {
      kind: context.media.kind,
      media_ref: cloneMediaRef(context.media.ref),
      workspace_mapping: context.media.media_root_abs
        ? {
          workspace_id: context.workspace_id,
          local_root_abs: context.media.media_root_abs,
        }
        : null,
      requires_resolution: true,
      source_label: getMediaSourceLabel(context.media),
    };
  }

  return {
    kind: context.media.kind,
    media_ref: cloneMediaRef(context.media.ref),
    workspace_mapping: context.media.workspace_mapping
      ? cloneWorkspaceMapping(context.media.workspace_mapping)
      : null,
    requires_resolution: true,
    source_label: getMediaSourceLabel(context.media),
  };
}

export interface ResolvedHammerTranscript {
  kind: HammerTranscriptSource["kind"];
  source_label: string;
  segments: HammerTranscriptSegment[];
  error: string | null;
}

export interface ResolvedHammerMedia {
  kind: HammerMediaSource["kind"];
  media_ref: MediaRef | null;
  workspace_mapping: WorkspaceMediaMapping | null;
  requires_resolution: boolean;
  source_label: string;
}

export interface ResolvedHammerLaunchContext {
  launch_context: HammerLaunchContext;
  transcript: ResolvedHammerTranscript;
  media: ResolvedHammerMedia;
  initial_edit_plan: HammerEditPlan | null;
  initial_preview_mode: HammerPreviewMode;
  initial_session_id: string | null;
}

export interface HammerLaunchResolverDeps {
  getFixtureSegments: (fixtureId: string) => HammerTranscriptSegment[];
  defaultFixtureId?: string;
}

export function parseTranscriptSegmentsJson(raw: string): HammerTranscriptSegment[] {
  const tryParse = (source: string): unknown => JSON.parse(source);
  let parsed: unknown;
  try {
    parsed = tryParse(raw);
  } catch {
    parsed = tryParse(decodeURIComponent(raw));
  }

  const parsedRecord = readRecord(parsed);
  const maybeSegments = Array.isArray(parsed)
    ? parsed
    : (parsedRecord && Array.isArray(parsedRecord.segments) ? parsedRecord.segments : null);
  if (!maybeSegments) return [];

  return maybeSegments
    .map((row, index) => normalizeTranscriptSegment(row, index))
    .filter((row): row is HammerTranscriptSegment => Boolean(row))
    .sort((a, b) => a.start_sec - b.start_sec);
}

export function parseHammerEditPlanJson(
  raw: string,
): { plan: HammerEditPlan | null; error: string | null } {
  if (!raw.trim()) {
    return {
      plan: null,
      error: "Edit plan JSON is empty.",
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      plan: null,
      error: toErrorMessage(error, "Failed to parse edit plan JSON."),
    };
  }

  const record = readRecord(parsed);
  if (!record) {
    return {
      plan: null,
      error: "Edit plan must be a JSON object.",
    };
  }

  const editPlanId = readString(record.edit_plan_id);
  const version = readString(record.version);
  const createdAt = readString(record.created_at);
  const updatedAt = readString(record.updated_at);
  const sourceTranscriptId = readString(record.source_transcript_id);
  const previewMode = readString(record.preview_mode);
  const toolVersion = readString(record.tool_version);
  const workspaceId = readString(record.workspace_id);
  const workpieceId = readString(record.workpiece_id);
  const sessionId = readString(record.session_id);
  const instructionsInput = Array.isArray(record.instructions) ? record.instructions : null;

  if (!editPlanId || !version || !createdAt || !updatedAt || !sourceTranscriptId || !instructionsInput) {
    return {
      plan: null,
      error: "Edit plan is missing one or more required fields.",
    };
  }

  if (previewMode && previewMode !== "raw" && previewMode !== "edit-aware") {
    return {
      plan: null,
      error: `Unsupported preview_mode: ${previewMode}.`,
    };
  }

  const instructions: HammerEditInstruction[] = [];
  for (const input of instructionsInput) {
    const instruction = readInstruction(input);
    if (!instruction) {
      return {
        plan: null,
        error: "Edit plan contains an invalid instruction.",
      };
    }
    instructions.push(instruction);
  }

  return {
    plan: {
      edit_plan_id: editPlanId,
      version,
      created_at: createdAt,
      updated_at: updatedAt,
      source_transcript_id: sourceTranscriptId,
      preview_mode: previewMode as HammerPreviewMode | undefined,
      tool_version: toolVersion ?? undefined,
      workspace_id: workspaceId ?? undefined,
      workpiece_id: workpieceId ?? undefined,
      session_id: sessionId ?? undefined,
      instructions,
    },
    error: null,
  };
}

export function resolveHammerLaunchContext(
  context: HammerLaunchContext,
  deps: HammerLaunchResolverDeps,
): ResolvedHammerLaunchContext {
  const defaultFixtureId = deps.defaultFixtureId ?? "podcast_a";
  const transcript = resolveTranscriptSource(context.transcript, deps.getFixtureSegments, defaultFixtureId);
  const initialEditPlan = context.edit_plan ? cloneEditPlan(context.edit_plan) : null;
  const initialPreviewMode = context.preview_mode
    ?? initialEditPlan?.preview_mode
    ?? DEFAULT_PREVIEW_MODE;

  return {
    launch_context: {
      ...context,
      transcript: { ...context.transcript },
      media: { ...context.media },
      edit_plan: initialEditPlan ?? undefined,
    },
    transcript,
    media: resolveMediaSource(context),
    initial_edit_plan: initialEditPlan,
    initial_preview_mode: initialPreviewMode,
    initial_session_id: context.session_id ?? initialEditPlan?.session_id ?? null,
  };
}

export async function loadHammerLaunchWorkspaceMapping(
  resolvedContext: ResolvedHammerLaunchContext,
  source?: WorkspaceMappingSource,
): Promise<WorkspaceMediaMapping | null> {
  if (!resolvedContext.media.requires_resolution) {
    return null;
  }

  if (resolvedContext.media.workspace_mapping) {
    return cloneWorkspaceMapping(resolvedContext.media.workspace_mapping);
  }

  return loadWorkspaceMapping(resolvedContext.launch_context.workspace_id, source);
}
