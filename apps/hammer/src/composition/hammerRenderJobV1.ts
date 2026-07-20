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
  acknowledged_result_fingerprint: string | null;
  result_artifacts: readonly HammerRenderResultArtifactV1[];
}>;

export type HammerRenderResultArtifactV1 = Readonly<{
  kind: "video_master" | "audio_master" | "caption" | "transcript" | "thumbnail_reference" | "render_manifest";
  asset_id: string;
  fingerprint: string;
}>;

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(",")}}`;
  return JSON.stringify(value);
}

export function hammerRenderJobResultFingerprint(job: HammerRenderJobV1): string {
  const text = stable({
    job_id: job.job_id,
    composition_revision: job.composition_revision,
    composition_fingerprint: job.composition_fingerprint,
    render_plan_version: job.render_plan_version,
    render_plan_fingerprint: job.render_plan_fingerprint,
    renderer_version: job.renderer_version,
    output_profile: job.output_profile,
    result_artifacts: job.result_artifacts,
  });
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function assertSourceFingerprintsMatch(job: HammerRenderJobV1, composition: HammerCompositionV2): void {
  const current = Object.fromEntries(composition.source_media.map((source) => [source.media_id, source.content_fingerprint]));
  const expectedEntries = Object.entries(job.source_fingerprints);
  if (expectedEntries.length !== Object.keys(current).length || expectedEntries.some(([mediaId, fingerprint]) => current[mediaId] !== fingerprint)) throw new Error("render_job_source_mismatch");
}

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
    acknowledged_result_fingerprint: null,
    result_artifacts: [],
  });
}

export function startHammerRenderJob(job: HammerRenderJobV1): HammerRenderJobV1 {
  if (job.status !== "queued") throw new Error("render_job_not_queued");
  return Object.freeze({ ...job, status: "running" });
}

export function cancelHammerRenderJob(job: HammerRenderJobV1): HammerRenderJobV1 {
  if (job.status !== "queued" && job.status !== "running") throw new Error("render_job_not_cancellable");
  return Object.freeze({ ...job, status: "cancelled" });
}

export function failHammerRenderJob(job: HammerRenderJobV1): HammerRenderJobV1 {
  if (job.status !== "queued" && job.status !== "running") throw new Error("render_job_not_failable");
  return Object.freeze({ ...job, status: "failed" });
}

export function retryHammerRenderJob(args: { job: HammerRenderJobV1; retryJobId: string }): HammerRenderJobV1 {
  if (args.job.status !== "failed" && args.job.status !== "cancelled" && args.job.status !== "stale") throw new Error("render_job_not_retryable");
  return Object.freeze({ ...args.job, job_id: args.retryJobId, status: "queued", acknowledged_result_fingerprint: null, result_artifacts: [] });
}

export function resumeHammerRenderJob(job: HammerRenderJobV1): HammerRenderJobV1 {
  if (job.status !== "running") throw new Error("render_job_not_resumable");
  return Object.freeze({ ...job, status: "running" });
}

export function settleHammerRenderJob(args: {
  job: HammerRenderJobV1;
  currentComposition: HammerCompositionV2;
  resultArtifacts: readonly HammerRenderResultArtifactV1[];
}): HammerRenderJobV1 {
  if (args.job.status !== "queued" && args.job.status !== "running") throw new Error("render_job_not_active");
  assertSourceFingerprintsMatch(args.job, args.currentComposition);
  const stale = args.currentComposition.revision !== args.job.composition_revision
    || args.currentComposition.fingerprint !== args.job.composition_fingerprint;
  return Object.freeze({ ...args.job, status: stale ? "stale" : "completed", result_artifacts: args.resultArtifacts });
}

export function acknowledgeHammerRenderJob(job: HammerRenderJobV1): HammerRenderJobV1 {
  if (job.status !== "completed") throw new Error("render_job_not_current_complete");
  const resultFingerprint = hammerRenderJobResultFingerprint(job);
  if (job.acknowledged_result_fingerprint && job.acknowledged_result_fingerprint !== resultFingerprint) throw new Error("render_job_duplicate_acknowledgement");
  return Object.freeze({ ...job, status: "acknowledged", acknowledged_result_fingerprint: resultFingerprint });
}
