import type { HammerPreviewMode } from "../../../../packages/contracts/hammer/edit-plan.contract";
import type { HammerLaunchContext } from "../../../../packages/contracts/hammer/launch-context.contract";
import type { MediaRef, WorkspaceMediaMapping } from "../../../../packages/contracts/hammer/media-resolver.contract";
import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";
import type {
  HammerPersistedAudioPolish,
  HammerPersistedEditorSession,
  HammerPersistedSpeakerMap,
  HammerPersistedStructuredTranscript,
  HammerPersistenceSaveRequest,
  HammerPersistenceSnapshot,
  HammerPersistedVisualPlacements,
} from "../persistence/hammerPersistenceContract";
import { cloneHammerDerivedTextLayers } from "../macros/hammerDerivedTranscriptLayers";
import type { HammerTranscriptPrepResponse, HammerTranscriptPrepSegment } from "./hammerPrepApi";

export const DEFAULT_FORGE_NEUTRAL_SPEAKER_LABELS = ["S1", "S2", "S3", "G1", "G2"] as const;
export const HAMMER_RUNTIME_WRITTEN_BY = {
  tool: "hammer",
  tool_version: "forge-v1.2.0/hammer-runtime",
  lane: "forge-managed",
} as const;

export type HammerPrepLifecycleState = "idle" | "preparing" | "prepared" | "prep_failed";
export type HammerPrepStep =
  | "loading_context"
  | "transcribing_audio"
  | "identifying_speaker_turns"
  | "finalizing_transcript"
  | "placing_initial_visuals"
  | "polishing_audio"
  | "ready_for_next_step";

export interface HammerPrepState {
  status: HammerPrepLifecycleState;
  step: HammerPrepStep | null;
  message: string;
  error: string | null;
}

export interface HammerPrepOverlayViewModel {
  visible: boolean;
  blocking: boolean;
  title: string;
  message: string;
  note: string;
  progress_ratio: number;
  step_count: number;
}

export interface HammerPrepOpenDecision {
  action: "prepare" | "reuse" | "blocked";
  state: HammerPrepState;
  reason: string;
}

export interface HammerPrepSource {
  mediaRef: MediaRef;
  workspaceMapping: WorkspaceMediaMapping;
  local_root_abs: string;
  local_relpath: string;
  media_signature: string;
}

export interface HammerPreparedTranscript {
  transcriptId: string;
  preparedAt: string;
  turns: HammerTranscriptSegment[];
  structuredTranscript: HammerPersistedStructuredTranscript;
  speakerMap: HammerPersistedSpeakerMap;
}

const PREP_STEP_ORDER: HammerPrepStep[] = [
  "loading_context",
  "transcribing_audio",
  "identifying_speaker_turns",
  "finalizing_transcript",
  "placing_initial_visuals",
  "polishing_audio",
  "ready_for_next_step",
];

const NEUTRAL_SPEAKER_RE = /^(S|G)\d+$/;
const TRANSCRIBABLE_MEDIA_KINDS = new Set([
  "recording_video",
  "recording_audio",
  "export_video",
  "export_audio",
]);

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
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

function cloneLaunchContext(context: HammerLaunchContext): HammerLaunchContext {
  return {
    ...context,
    transcript: context.transcript.kind === "tongs-stub"
      ? {
        ...context.transcript,
        segments: cloneTranscriptSegments(context.transcript.segments),
      }
      : { ...context.transcript },
    media: context.media.kind === "mapped-local"
      ? {
        ...context.media,
        ref: cloneMediaRef(context.media.ref),
      }
      : context.media.kind === "tongs-stub"
      ? {
        ...context.media,
        ref: cloneMediaRef(context.media.ref),
        workspace_mapping: context.media.workspace_mapping
          ? cloneWorkspaceMapping(context.media.workspace_mapping)
          : undefined,
      }
      : { ...context.media },
  };
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function buildTranscriptId(workpieceId: string, preparedAt: string): string {
  return `hammer_transcript_${workpieceId}_${preparedAt.replace(/[^0-9]/g, "").slice(0, 14)}`;
}

function createTurnId(index: number): string {
  return `turn_${String(index + 1).padStart(3, "0")}`;
}

function createForgeNeutralSpeakerLabel(index: number): string {
  if (index < 3) {
    return `S${index + 1}`;
  }
  return `G${index - 2}`;
}

function resolveLaunchPreviewMode(context: HammerLaunchContext): HammerPreviewMode {
  return context.edit_plan?.preview_mode ?? context.preview_mode ?? "edit-aware";
}

function extractLaunchMediaContext(
  context: HammerLaunchContext,
): { mediaRef: MediaRef; workspaceMapping: WorkspaceMediaMapping | null } | null {
  if (context.media.kind === "dev-tone") {
    return null;
  }

  if (context.media.kind === "mapped-local") {
    return {
      mediaRef: cloneMediaRef(context.media.ref),
      workspaceMapping: context.media.media_root_abs
        ? {
          workspace_id: context.workspace_id,
          local_root_abs: context.media.media_root_abs,
        }
        : null,
    };
  }

  return {
    mediaRef: cloneMediaRef(context.media.ref),
    workspaceMapping: context.media.workspace_mapping
      ? cloneWorkspaceMapping(context.media.workspace_mapping)
      : null,
  };
}

function hasNeutralSpeakerLabelsOnly(segments: HammerTranscriptSegment[]): boolean {
  return segments.every((segment) => NEUTRAL_SPEAKER_RE.test(segment.speaker.trim()));
}

function uniqueSpeakerLabels(segments: HammerTranscriptSegment[]): string[] {
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const segment of segments) {
    const label = segment.speaker.trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }
  return labels;
}

function buildSpeakerMap(segments: HammerTranscriptSegment[]): HammerPersistedSpeakerMap {
  return {
    schema_version: 1,
    default_labels: [...DEFAULT_FORGE_NEUTRAL_SPEAKER_LABELS],
    mappings: uniqueSpeakerLabels(segments).map((speakerLabel) => ({
      speaker_label: speakerLabel,
      display_name: null,
      source: "default" as const,
    })),
  };
}

function normalizePrepSegments(
  segments: HammerTranscriptPrepSegment[],
): Array<{
  start: number;
  end: number;
  text: string;
  rawSpeaker: string;
  lowConfidence: boolean;
}> {
  return segments
    .map((segment, index) => {
      const text = normalizeWhitespace(segment.text);
      if (!text) return null;
      const start = Number(segment.start);
      const end = Number(segment.end);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        return null;
      }
      const rawSpeaker = readString(segment.speaker) ?? `unknown_${index + 1}`;
      const lowConfidence = !readString(segment.speaker)
        || (typeof segment.confidence === "number" && Number.isFinite(segment.confidence) && segment.confidence < 0.6);
      return {
        start,
        end,
        text,
        rawSpeaker,
        lowConfidence,
      };
    })
    .filter((segment): segment is {
      start: number;
      end: number;
      text: string;
      rawSpeaker: string;
      lowConfidence: boolean;
    } => Boolean(segment))
    .sort((left, right) => left.start - right.start);
}

function buildSpeakerTurnsFromPrepSegments(
  segments: HammerTranscriptPrepSegment[],
): { turns: HammerTranscriptSegment[]; rawLabels: string[]; lowConfidenceTurnIds: string[] } {
  const normalizedSegments = normalizePrepSegments(segments);
  const rawSpeakerToNeutral = new Map<string, string>();
  const turns: Array<{
    segment_id: string;
    start_sec: number;
    end_sec: number;
    speaker: string;
    text: string;
    lowConfidence: boolean;
  }> = [];

  for (const segment of normalizedSegments) {
    const speaker = rawSpeakerToNeutral.get(segment.rawSpeaker)
      ?? createForgeNeutralSpeakerLabel(rawSpeakerToNeutral.size);
    if (!rawSpeakerToNeutral.has(segment.rawSpeaker)) {
      rawSpeakerToNeutral.set(segment.rawSpeaker, speaker);
    }

    const previous = turns.at(-1) ?? null;
    if (
      previous
      && previous.speaker === speaker
      && segment.start - previous.end_sec <= 1.2
    ) {
      previous.end_sec = Math.max(previous.end_sec, segment.end);
      previous.text = normalizeWhitespace(`${previous.text} ${segment.text}`);
      previous.lowConfidence = previous.lowConfidence || segment.lowConfidence;
      continue;
    }

    turns.push({
      segment_id: createTurnId(turns.length),
      start_sec: segment.start,
      end_sec: segment.end,
      speaker,
      text: segment.text,
      lowConfidence: segment.lowConfidence,
    });
  }

  return {
    turns: turns.map(({ lowConfidence: _lowConfidence, ...turn }) => turn),
    rawLabels: Array.from(rawSpeakerToNeutral.keys()),
    lowConfidenceTurnIds: turns
      .filter((turn) => turn.lowConfidence)
      .map((turn) => turn.segment_id),
  };
}

export function buildHammerMediaSignature(ref: MediaRef | null | undefined): string {
  if (!ref) return "no-media";
  return [
    ref.media_id,
    ref.kind,
    ref.local_relpath ?? "",
    ref.cloud_uri ?? "",
    typeof ref.byte_size === "number" ? String(ref.byte_size) : "",
    typeof ref.duration_ms === "number" ? String(ref.duration_ms) : "",
    ref.sha256 ?? "",
  ].join("|");
}

export function ensureHammerLaunchSessionId(context: HammerLaunchContext): HammerLaunchContext {
  if (readString(context.session_id)) {
    return cloneLaunchContext(context);
  }

  const next = cloneLaunchContext(context);
  const fallback = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
  next.session_id = `session_${fallback}`;
  return next;
}

export function createHammerPrepState(
  status: HammerPrepLifecycleState,
  step: HammerPrepStep | null,
  error?: string | null,
): HammerPrepState {
  const messages: Record<HammerPrepStep, string> = {
    loading_context: "Preparing your episode…",
    transcribing_audio: "Listening to the recording…",
    identifying_speaker_turns: "Identifying speaker turns…",
    finalizing_transcript: "Finalizing transcript…",
    placing_initial_visuals: "Placing initial visuals…",
    polishing_audio: "Cleaning audio for studio clarity…",
    ready_for_next_step: "Almost ready…",
  };

  return {
    status,
    step,
    message: step ? messages[step] : (status === "prep_failed"
      ? "Hammer could not prepare the transcript."
      : "Hammer is waiting for episode context."),
    error: error ?? null,
  };
}

export function buildHammerPrepOverlayViewModel(state: HammerPrepState): HammerPrepOverlayViewModel {
  const stepIndex = state.step ? PREP_STEP_ORDER.indexOf(state.step) : -1;
  const progressRatio = stepIndex >= 0
    ? (stepIndex + 1) / PREP_STEP_ORDER.length
    : 0;

  return {
    visible: state.status === "preparing",
    blocking: state.status === "preparing",
    title: "Forge Wheel",
    message: state.message,
    note: "Long recordings can take longer. Hammer will stop when the transcript is ready for your direction.",
    progress_ratio: progressRatio,
    step_count: PREP_STEP_ORDER.length,
  };
}

export function resolveHammerPrepSource(context: HammerLaunchContext): HammerPrepSource | null {
  const mediaContext = extractLaunchMediaContext(context);
  if (!mediaContext) return null;
  if (!TRANSCRIBABLE_MEDIA_KINDS.has(mediaContext.mediaRef.kind)) return null;

  const localRelpath = readString(mediaContext.mediaRef.local_relpath);
  const localRootAbs = readString(mediaContext.workspaceMapping?.local_root_abs);
  if (!localRelpath || !localRootAbs || !mediaContext.workspaceMapping) {
    return null;
  }

  return {
    mediaRef: cloneMediaRef(mediaContext.mediaRef),
    workspaceMapping: cloneWorkspaceMapping(mediaContext.workspaceMapping),
    local_root_abs: localRootAbs,
    local_relpath: localRelpath,
    media_signature: buildHammerMediaSignature(mediaContext.mediaRef),
  };
}

export function resolveHammerPrepOpenDecision(
  launchContext: HammerLaunchContext | undefined,
  snapshot: HammerPersistenceSnapshot | null,
): HammerPrepOpenDecision {
  if (!launchContext) {
    return {
      action: "blocked",
      state: createHammerPrepState(
        "prep_failed",
        null,
        "Hammer needs canonical episode media before it can prepare a transcript.",
      ),
      reason: "missing_launch_context",
    };
  }

  if (isReusablePreparedTranscript(launchContext, snapshot)) {
    return {
      action: "reuse",
      state: createHammerPrepState("prepared", "ready_for_next_step"),
      reason: "reuse_valid_transcript",
    };
  }

  if (!resolveHammerPrepSource(launchContext)) {
    return {
      action: "blocked",
      state: createHammerPrepState(
        "prep_failed",
        null,
        "Hammer could not find a local recording pointer for transcript prep.",
      ),
      reason: "missing_local_media",
    };
  }

  return {
    action: "prepare",
    state: createHammerPrepState("preparing", "transcribing_audio"),
    reason: "transcript_missing_or_stale",
  };
}

export function isReusablePreparedTranscript(
  launchContext: HammerLaunchContext,
  snapshot: HammerPersistenceSnapshot | null,
): boolean {
  if (!snapshot?.state || snapshot.state.prep_status !== "prepared") {
    return false;
  }

  const structuredTranscript = snapshot.structured_transcript.data;
  if (!structuredTranscript || !Array.isArray(structuredTranscript.segments) || structuredTranscript.segments.length === 0) {
    return false;
  }

  if (structuredTranscript.structure !== "speaker_turns") {
    return false;
  }

  if (structuredTranscript.diarization.label_scheme !== "forge-neutral-speakers.v1") {
    return false;
  }

  if (!hasNeutralSpeakerLabelsOnly(structuredTranscript.segments)) {
    return false;
  }

  const prepSource = resolveHammerPrepSource(launchContext);
  if (!prepSource) {
    return true;
  }

  if (structuredTranscript.media_signature) {
    return structuredTranscript.media_signature === prepSource.media_signature;
  }

  return structuredTranscript.media_id === prepSource.mediaRef.media_id;
}

export function buildPreparedTranscript(
  launchContext: HammerLaunchContext,
  transcriptPrep: HammerTranscriptPrepResponse,
): HammerPreparedTranscript {
  const preparedAt = new Date().toISOString();
  const prepSource = resolveHammerPrepSource(launchContext);
  const transcriptId = buildTranscriptId(launchContext.workpiece_id, preparedAt);
  const { turns, rawLabels, lowConfidenceTurnIds } = buildSpeakerTurnsFromPrepSegments(transcriptPrep.segments);
  if (turns.length === 0) {
    throw new Error("Hammer transcript prep produced no speaker turns.");
  }

  const structuredTranscript: HammerPersistedStructuredTranscript = {
    schema_version: 1,
    transcript_id: transcriptId,
    media_id: prepSource?.mediaRef.media_id ?? null,
    media_signature: prepSource?.media_signature ?? buildHammerMediaSignature(prepSource?.mediaRef ?? null),
    prepared_at: preparedAt,
    structure: "speaker_turns",
    source_media_ref: prepSource ? cloneMediaRef(prepSource.mediaRef) : null,
    diarization: {
      label_scheme: "forge-neutral-speakers.v1",
      labels: uniqueSpeakerLabels(turns),
      raw_labels: rawLabels,
      version: transcriptPrep.model,
      provider: "openai",
      provider_request_id: transcriptPrep.provider_request_id,
      model: transcriptPrep.model,
    },
    confidence_flags: lowConfidenceTurnIds.map((turnId) => ({
      turn_id: turnId,
      code: "speaker_boundary_low_confidence",
      detail: "Hammer preserved this turn boundary but marked it as low confidence.",
    })),
    segments: cloneTranscriptSegments(turns),
    derived_text_layers: {
      schema_version: 1,
      active_layer_id: null,
      layers: [],
    },
  };

  return {
    transcriptId,
    preparedAt,
    turns,
    structuredTranscript,
    speakerMap: buildSpeakerMap(turns),
  };
}

export function applyPreparedTranscriptToLaunchContext(
  launchContext: HammerLaunchContext,
  preparedTranscript: HammerPreparedTranscript,
): HammerLaunchContext {
  const next = ensureHammerLaunchSessionId(launchContext);
  next.transcript = {
    kind: "tongs-stub",
    transcript_id: preparedTranscript.transcriptId,
    segments: cloneTranscriptSegments(preparedTranscript.turns),
    label: preparedTranscript.transcriptId,
  };
  delete next.edit_plan;
  next.preview_mode = resolveLaunchPreviewMode(next);
  return next;
}

function buildPrepEditorSession(
  launchContext: HammerLaunchContext,
  preparedTranscript?: HammerPreparedTranscript,
): HammerPersistedEditorSession {
  const sessionContext = ensureHammerLaunchSessionId(launchContext);
  const mediaContext = extractLaunchMediaContext(sessionContext);
  const firstTurnId = preparedTranscript?.turns[0]?.segment_id ?? null;

  return {
    schema_version: 1,
    session_id: sessionContext.session_id ?? "session_missing",
    source_mode: sessionContext.source_mode,
    preview_mode: resolveLaunchPreviewMode(sessionContext),
    transcript_source_id: preparedTranscript?.transcriptId
      ?? (sessionContext.transcript.kind === "tongs-stub"
        ? sessionContext.transcript.transcript_id
        : "transcript_pending"),
    selected_segment_id: firstTurnId,
    selected_overlay_row_id: firstTurnId,
    media_ref: mediaContext ? cloneMediaRef(mediaContext.mediaRef) : null,
    workspace_mapping: mediaContext?.workspaceMapping
      ? cloneWorkspaceMapping(mediaContext.workspaceMapping)
      : null,
    media_source_label: mediaContext?.mediaRef.media_id ?? null,
    last_opened_at: new Date().toISOString(),
  };
}

export function buildHammerPrepPersistenceSaveRequest(args: {
  launchContext: HammerLaunchContext;
  status: HammerPrepLifecycleState;
  preparedTranscript?: HammerPreparedTranscript;
  visualPlacements?: HammerPersistedVisualPlacements | null;
  audioPolish?: HammerPersistedAudioPolish | null;
}): HammerPersistenceSaveRequest {
  const { launchContext, status, preparedTranscript, visualPlacements, audioPolish } = args;
  const saveRequest: HammerPersistenceSaveRequest = {
    written_by: { ...HAMMER_RUNTIME_WRITTEN_BY },
    active_session_id: ensureHammerLaunchSessionId(launchContext).session_id ?? null,
    prep_status: status,
    alignment_status: preparedTranscript ? "aligned" : "pending",
    last_opened_at: new Date().toISOString(),
    editor_session: {
      data: buildPrepEditorSession(launchContext, preparedTranscript),
    },
  };

  if (preparedTranscript) {
    saveRequest.structured_transcript = {
      data: preparedTranscript.structuredTranscript,
    };
    saveRequest.speaker_map = {
      data: preparedTranscript.speakerMap,
    };
  }

  if (visualPlacements) {
    saveRequest.visual_placements = {
      data: visualPlacements,
    };
  }

  if (audioPolish) {
    saveRequest.audio_polish = {
      data: audioPolish,
    };
  }

  return saveRequest;
}

export function preserveTranscriptMetadata(
  segments: HammerTranscriptSegment[],
  existingTranscript: HammerPersistedStructuredTranscript | null | undefined,
  mediaRef: MediaRef | null | undefined,
  transcriptId: string,
): HammerPersistedStructuredTranscript {
  const isSameTranscript = existingTranscript?.transcript_id === transcriptId;

  return {
    schema_version: 1,
    transcript_id: transcriptId,
    media_id: mediaRef?.media_id ?? existingTranscript?.media_id ?? null,
    media_signature: isSameTranscript
      ? existingTranscript?.media_signature ?? buildHammerMediaSignature(mediaRef ?? null)
      : buildHammerMediaSignature(mediaRef ?? null),
    prepared_at: isSameTranscript
      ? existingTranscript?.prepared_at ?? new Date().toISOString()
      : new Date().toISOString(),
    structure: "speaker_turns",
    source_media_ref: mediaRef
      ? cloneMediaRef(mediaRef)
      : existingTranscript?.source_media_ref
        ? cloneMediaRef(existingTranscript.source_media_ref)
        : null,
    diarization: {
      label_scheme: "forge-neutral-speakers.v1",
      labels: uniqueSpeakerLabels(segments),
      raw_labels: isSameTranscript ? existingTranscript?.diarization.raw_labels ?? [] : [],
      version: isSameTranscript ? existingTranscript?.diarization.version ?? null : null,
      provider: "openai",
      provider_request_id: isSameTranscript ? existingTranscript?.diarization.provider_request_id ?? null : null,
      model: isSameTranscript ? existingTranscript?.diarization.model ?? null : null,
    },
    confidence_flags: isSameTranscript ? existingTranscript?.confidence_flags ?? [] : [],
    segments: cloneTranscriptSegments(segments),
    derived_text_layers: isSameTranscript
      ? existingTranscript?.derived_text_layers
        ? cloneHammerDerivedTextLayers(existingTranscript.derived_text_layers)
        : {
          schema_version: 1,
          active_layer_id: null,
          layers: [],
        }
      : {
        schema_version: 1,
        active_layer_id: null,
        layers: [],
      },
  };
}
