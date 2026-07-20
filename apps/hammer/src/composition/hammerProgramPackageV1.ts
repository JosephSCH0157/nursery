import { hammerStableFingerprint, type HammerCompositionCommand, type HammerCompositionV2 } from "./hammerCompositionV2";
import type { HammerRenderOperationV1, HammerRenderPlanV1 } from "./hammerRenderPlanV1";

export type HammerProgramPackageV1 = Readonly<{
  intro_clip_id: string;
  outro_clip_id: string;
  thumbnail_asset_id: string;
  reference_asset_ids: readonly string[];
}>;

export type HammerProgramPackageAssemblyProofV1 = Readonly<{
  schema_version: 1;
  composition_id: string;
  composition_revision: number;
  composition_fingerprint: string;
  render_plan_fingerprint: string;
  sequence: readonly ["intro", "program", "outro"];
  boundaries: Readonly<{ intro_start_sec: number; program_start_sec: number; outro_start_sec: number; end_sec: number }>;
  includes: Readonly<{
    music: boolean;
    graphics: boolean;
    captions: boolean;
    final_audio_treatment: boolean;
    transitions: boolean;
    thumbnail: boolean;
    references: boolean;
    multicamera: boolean;
  }>;
  package_fingerprint: string;
}>;

function finite(value: number): boolean {
  return Number.isFinite(value);
}

function packageOperation(plan: HammerRenderPlanV1, operationId: string | null, code: string): HammerRenderOperationV1 {
  const operation = operationId ? plan.operations.find((candidate) => candidate.operation_id === operationId) : null;
  if (!operation) throw new Error(code);
  return operation;
}

function packageVideoOperations(plan: HammerRenderPlanV1, role: "intro" | "program" | "outro"): readonly HammerRenderOperationV1[] {
  return plan.operations.filter((operation) => operation.kind === "video" && operation.package_role === role);
}

function assertTouches(leftEnd: number, rightStart: number, code: string): void {
  if (!finite(leftEnd) || !finite(rightStart) || Math.abs(leftEnd - rightStart) > 0.000001) throw new Error(code);
}

export function buildHammerProgramPackageCommand(packageConfig: HammerProgramPackageV1): HammerCompositionCommand {
  if (!packageConfig.intro_clip_id || !packageConfig.outro_clip_id || !packageConfig.thumbnail_asset_id) throw new Error("program_package_incomplete");
  return Object.freeze({
    type: "set_packaging",
    intro_clip_id: packageConfig.intro_clip_id,
    outro_clip_id: packageConfig.outro_clip_id,
    thumbnail_asset_id: packageConfig.thumbnail_asset_id,
    reference_asset_ids: packageConfig.reference_asset_ids,
  });
}

export function proveHammerFullProgramPackageAssemblyV1(args: {
  composition: HammerCompositionV2;
  plan: HammerRenderPlanV1;
}): HammerProgramPackageAssemblyProofV1 {
  if (args.plan.composition_fingerprint !== args.composition.fingerprint) throw new Error("program_package_plan_stale");
  if (!args.composition.packaging.thumbnail_asset_id) throw new Error("program_package_thumbnail_missing");
  const intro = packageOperation(args.plan, args.plan.packaging.intro_operation_id, "program_package_intro_missing");
  const outro = packageOperation(args.plan, args.plan.packaging.outro_operation_id, "program_package_outro_missing");
  const programVideo = packageVideoOperations(args.plan, "program");
  if (programVideo.length === 0) throw new Error("program_package_program_missing");
  const programStart = Math.min(...programVideo.map((operation) => operation.start_sec));
  const programEnd = Math.max(...programVideo.map((operation) => operation.end_sec));
  assertTouches(intro.end_sec, programStart, "program_package_intro_boundary_gap");
  assertTouches(programEnd, outro.start_sec, "program_package_outro_boundary_gap");
  const includes = Object.freeze({
    music: args.plan.operations.some((operation) => operation.kind === "audio" && operation.track_role === "music"),
    graphics: args.plan.operations.some((operation) => operation.kind === "graphic"),
    captions: args.plan.operations.some((operation) => operation.kind === "caption"),
    final_audio_treatment: args.plan.operations.some((operation) => operation.kind === "audio_treatment"),
    transitions: args.plan.operations.some((operation) => operation.kind === "transition"),
    thumbnail: Boolean(args.plan.packaging.thumbnail_asset_id),
    references: args.plan.packaging.reference_asset_ids.length > 0,
    multicamera: args.plan.operations.some((operation) => operation.kind === "video" && operation.source_group_id),
  });
  const missing = Object.entries(includes).find(([, present]) => !present)?.[0];
  if (missing) throw new Error(`program_package_${missing}_missing`);
  const draft = {
    schema_version: 1 as const,
    composition_id: args.composition.composition_id,
    composition_revision: args.composition.revision,
    composition_fingerprint: args.composition.fingerprint,
    render_plan_fingerprint: args.plan.fingerprint,
    sequence: ["intro", "program", "outro"] as const,
    boundaries: Object.freeze({ intro_start_sec: intro.start_sec, program_start_sec: programStart, outro_start_sec: outro.start_sec, end_sec: outro.end_sec }),
    includes,
  };
  return Object.freeze({ ...draft, package_fingerprint: hammerStableFingerprint(draft) });
}
