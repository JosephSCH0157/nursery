import type { HammerEditorialAuthorityGraph } from "../../../../packages/contracts/hammer/editorial-authority.contract";
import type { MediaRef } from "../../../../packages/contracts/hammer/media-resolver.contract";
import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";
import type { HammerMediaBackboneRuntimeSummary } from "../media/hammerMediaBackbone";
import { executeDialogueAudioRenderWithBackend, type HammerDialogueRenderExecutionResult } from "./hammerAudioProcessingBackend";
import type { HammerRenderAssemblyResult } from "./hammerRenderAssembly";
import type { HammerStudioRackState } from "./hammerStudioRack";

async function sha256Json(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function buildSegments(segments: HammerTranscriptSegment[], renderAssembly: HammerRenderAssemblyResult) {
  const ducks = renderAssembly.export_timeline.audio_layers.filter((layer) => layer.kind === "duck_region");
  return segments.flatMap((segment) => {
    const boundaries = new Set([segment.start_sec, segment.end_sec]);
    for (const duck of ducks) {
      if (duck.end_sec <= segment.start_sec || duck.start_sec >= segment.end_sec) continue;
      boundaries.add(Math.max(segment.start_sec, duck.start_sec));
      boundaries.add(Math.min(segment.end_sec, duck.end_sec));
    }
    const sorted = [...boundaries].sort((left, right) => left - right);
    return sorted.slice(0, -1).map((start, index) => {
      const end = sorted[index + 1]!;
      const duckDb = ducks.reduce((total, duck) => start < duck.end_sec && end > duck.start_sec ? total + Number(duck.meta?.duck_gain_db ?? 0) : total, 0);
      return { segment_id: `${segment.segment_id}:${index}`, start_sec: start, end_sec: end, is_disabled: segment.is_disabled, gain_db: Number(segment.gain_db ?? 0) + duckDb };
    });
  });
}

export async function executeHammerFinalAudioRender(args: {
  workspaceId: string; workpieceId: string; recordingRevisionId: string; timelineRevision: string | null;
  mediaRef: MediaRef; preferredPlayback: { kind: "raw" | "polished" | "none"; local_relpath: string | null; workpiece_path: string | null; mime_type: string | null };
  playbackLocalRootAbs: string | null; transcriptSegments: HammerTranscriptSegment[]; studioRack: HammerStudioRackState;
  canonicalGraph: HammerEditorialAuthorityGraph | null; renderAssembly: HammerRenderAssemblyResult; runtimeSummary: HammerMediaBackboneRuntimeSummary;
}): Promise<HammerDialogueRenderExecutionResult> {
  const compositionRevision = Math.max(1, args.canonicalGraph?.graph_version ?? 1);
  const compositionFingerprint = await sha256Json({ recording_revision_id: args.recordingRevisionId, timeline_revision: args.timelineRevision, transcript_segments: args.transcriptSegments, studio_rack: args.studioRack, editorial_authority: args.canonicalGraph, render_assembly: args.renderAssembly.export_timeline });
  const renderPlanFingerprint = await sha256Json({ composition_fingerprint: compositionFingerprint, timeline_segments: buildSegments(args.transcriptSegments, args.renderAssembly), rack: args.studioRack, audio_layers: args.renderAssembly.export_timeline.audio_layers });
  const renderJobId = `hammer-audio:${renderPlanFingerprint}`;
  const operationFingerprint = await sha256Json({ render_job_id: renderJobId, composition_fingerprint: compositionFingerprint, render_plan_fingerprint: renderPlanFingerprint });
  const masterOperation = args.canonicalGraph?.operations.find((candidate) => candidate.lifecycle === "active" && candidate.instruction.type === "podcast_master_pass");
  const polished = args.preferredPlayback.kind === "polished";
  return executeDialogueAudioRenderWithBackend({
    workspaceId: args.workspaceId, workpieceId: args.workpieceId, mediaKind: args.mediaRef.kind,
    timelineSegments: buildSegments(args.transcriptSegments, args.renderAssembly), rackState: args.studioRack,
    localRootAbs: args.playbackLocalRootAbs, localRelpath: polished ? (args.preferredPlayback.local_relpath ?? args.mediaRef.local_relpath ?? null) : (args.mediaRef.local_relpath ?? null),
    canonicalWorkpiecePath: polished ? args.preferredPlayback.workpiece_path : args.mediaRef.local_relpath,
    mimeType: polished ? args.preferredPlayback.mime_type : null, runtimeSummary: args.runtimeSummary, renderPurpose: "final",
    finalAudioIdentity: { recording_revision_id: args.recordingRevisionId, composition_revision: compositionRevision, composition_fingerprint: compositionFingerprint, render_job_id: renderJobId, render_plan_fingerprint: renderPlanFingerprint, operation_fingerprint: operationFingerprint, renderer_version: "forge-v1.2.0/hammer-final-audio.v1", output_profile_id: "hammer-audio-master-wav-v1" },
    podcastMaster: masterOperation?.instruction.type === "podcast_master_pass" ? { noise_cleanup: masterOperation.instruction.noise_cleanup, normalization_lufs: masterOperation.instruction.normalization_lufs, compression_amount: masterOperation.instruction.compression_amount, limiter_ceiling_dbtp: masterOperation.instruction.limiter_ceiling_dbtp } : null,
  });
}
