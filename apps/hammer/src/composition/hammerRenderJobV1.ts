import type { HammerCompositionV2 } from "./hammerCompositionV2";
import type { HammerRenderPlanV1 } from "./hammerRenderPlanV1";

export type HammerRenderOutputProfile = Readonly<{
  profile_id: string;
  container: "mp4" | "mov" | "wav";
  video_codec: string | null;
  audio_codec: string;
  width: number | null;
  height: number | null;
  frame_rate: number | null;
  loudness_lufs: number | null;
}>;

export type HammerRenderJobV1 = Readonly<{
  schema_version: 1;
  job_id: string;
  workspace_id: string;
  workpiece_id: string;
  recording_revision_id: string;
  composition_revision: number;
  composition_fingerprint: string;
  source_fingerprints: Readonly<Record<string, string>>;
  render_plan_version: HammerRenderPlanV1["compiler_version"];
  render_plan_fingerprint: string;
  renderer_version: string;
  output_profile: HammerRenderOutputProfile;
  status: "queued" | "running" | "completed" | "failed" | "cancelled" | "stale" | "acknowledged";
  result_artifacts: readonly Readonly<{ kind: "video_master" | "audio_master" | "caption" | "transcript" | "render_manifest"; asset_id: string; fingerprint: string }>[];
}>;

export function createHammerRenderJob(args: {
  jobId: string;
  composition: HammerCompositionV2;
  plan: HammerRenderPlanV1;
  rendererVersion: string;
  outputProfile: HammerRenderOutputProfile;
}): HammerRenderJobV1 {
  if (args.plan.composition_fingerprint !== args.composition.fingerprint) throw new Error("render_plan_stale");
  return Object.freeze({
    schema_version: 1,
    job_id: args.jobId,
    workspace_id: args.composition.workspace_id,
    workpiece_id: args.composition.workpiece_id,
    recording_revision_id: args.composition.recording_revision_id,
    composition_revision: args.composition.revision,
    composition_fingerprint: args.composition.fingerprint,
    source_fingerprints: args.plan.source_fingerprints,
    render_plan_version: args.plan.compiler_version,
    render_plan_fingerprint: args.plan.fingerprint,
    renderer_version: args.rendererVersion,
    output_profile: args.outputProfile,
    status: "queued",
    result_artifacts: [],
  });
}

export function settleHammerRenderJob(args: {
  job: HammerRenderJobV1;
  currentComposition: HammerCompositionV2;
  resultArtifacts: HammerRenderJobV1["result_artifacts"];
}): HammerRenderJobV1 {
  const stale = args.currentComposition.revision !== args.job.composition_revision
    || args.currentComposition.fingerprint !== args.job.composition_fingerprint;
  return Object.freeze({ ...args.job, status: stale ? "stale" : "completed", result_artifacts: args.resultArtifacts });
}

export function acknowledgeHammerRenderJob(job: HammerRenderJobV1): HammerRenderJobV1 {
  if (job.status !== "completed") throw new Error("render_job_not_current_complete");
  return Object.freeze({ ...job, status: "acknowledged" });
}
