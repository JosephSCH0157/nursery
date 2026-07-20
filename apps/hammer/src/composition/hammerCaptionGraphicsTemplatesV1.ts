import type { HammerCompositionClipV2, HammerCompositionCommand } from "./hammerCompositionV2";

export type HammerCaptionSafeAreaV1 = Readonly<{
  left: number;
  top: number;
  right: number;
  bottom: number;
}>;

export type HammerCaptionCueV1 = Readonly<{
  cue_id: string;
  segment_ids: readonly string[];
  speaker_label: string | null;
  start_sec: number;
  end_sec: number;
  text: string;
  max_chars_per_line: number;
  max_lines: number;
  reading_speed_cps: number;
  safe_area: HammerCaptionSafeAreaV1;
}>;

export type HammerCaptionArtifactV1 = Readonly<{
  schema_version: 1;
  artifact_id: string;
  based_on_transcript_id: string;
  style_preset_id: string;
  template_version: string;
  output_modes: readonly ("burn_in" | "sidecar")[];
  cues: readonly HammerCaptionCueV1[];
  fingerprint: string;
}>;

export type HammerCaptionRebuildDecisionV1 =
  | Readonly<{ kind: "invalidate"; reason: "transcript_changed" }>
  | Readonly<{ kind: "rebuild"; artifact: HammerCaptionArtifactV1 }>
  | Readonly<{ kind: "preserve_explicit"; artifact: HammerCaptionArtifactV1; reason: string }>;

export type HammerGraphicTemplateKindV1 = "lower_third" | "chapter_card" | "quote_card" | "statistic_card" | "brand_package";

export type HammerBoundedKeyframeV1 = Readonly<{
  property: "x" | "y" | "scale" | "opacity";
  at_sec: number;
  value: number;
  min: number;
  max: number;
}>;

export type HammerGraphicTemplateV1 = Readonly<{
  template_id: string;
  template_version: string;
  kind: HammerGraphicTemplateKindV1;
  style_preset_id: string;
  safe_area: HammerCaptionSafeAreaV1;
  keyframes: readonly HammerBoundedKeyframeV1[];
}>;

export type HammerTranscriptSegmentForCaptionsV1 = Readonly<{
  segment_id: string;
  speaker: string | null;
  text: string;
  start_sec: number;
  end_sec: number;
}>;

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(",")}}`;
  return JSON.stringify(value);
}

function fingerprint(value: unknown): string {
  const text = stable(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function assertSafeArea(area: HammerCaptionSafeAreaV1): void {
  if ([area.left, area.top, area.right, area.bottom].some((value) => !Number.isFinite(value) || value < 0 || value > 1)) throw new Error("caption_safe_area_invalid");
  if (area.left >= area.right || area.top >= area.bottom) throw new Error("caption_safe_area_invalid");
}

export function validateHammerCaptionArtifactV1(artifact: HammerCaptionArtifactV1): void {
  if (artifact.schema_version !== 1 || !artifact.artifact_id || !artifact.based_on_transcript_id || artifact.output_modes.length === 0) throw new Error("caption_artifact_invalid");
  for (const cue of artifact.cues) {
    if (!cue.cue_id || cue.segment_ids.length === 0 || cue.end_sec <= cue.start_sec || cue.max_chars_per_line <= 0 || cue.max_lines <= 0) throw new Error("caption_cue_invalid");
    if (cue.reading_speed_cps > 22) throw new Error("caption_reading_speed_invalid");
    assertSafeArea(cue.safe_area);
    const lines = cue.text.split(/\r?\n/);
    if (lines.length > cue.max_lines || lines.some((line) => line.length > cue.max_chars_per_line)) throw new Error("caption_line_limit_invalid");
  }
  const { fingerprint: storedFingerprint, ...draft } = artifact;
  if (fingerprint(draft) !== storedFingerprint) throw new Error("caption_artifact_fingerprint_mismatch");
}

export function signHammerCaptionArtifactV1(artifact: Omit<HammerCaptionArtifactV1, "fingerprint">): HammerCaptionArtifactV1 {
  const signed = Object.freeze({ ...artifact, fingerprint: fingerprint(artifact) });
  validateHammerCaptionArtifactV1(signed);
  return signed;
}

export function buildHammerCaptionArtifactFromTranscriptV1(args: {
  artifactId: string;
  transcriptId: string;
  stylePresetId: string;
  templateVersion: string;
  segments: readonly HammerTranscriptSegmentForCaptionsV1[];
  safeArea?: HammerCaptionSafeAreaV1;
  maxCharsPerLine?: number;
  maxLines?: number;
  outputModes?: readonly ("burn_in" | "sidecar")[];
}): HammerCaptionArtifactV1 {
  const safeArea = args.safeArea ?? Object.freeze({ left: 0.08, top: 0.72, right: 0.92, bottom: 0.94 });
  assertSafeArea(safeArea);
  const cues = args.segments.map((segment) => {
    const duration = segment.end_sec - segment.start_sec;
    if (!segment.segment_id || duration <= 0) throw new Error("caption_segment_invalid");
    const readingSpeed = segment.text.length / duration;
    return Object.freeze({
      cue_id: `cue:${segment.segment_id}`,
      segment_ids: [segment.segment_id],
      speaker_label: segment.speaker,
      start_sec: segment.start_sec,
      end_sec: segment.end_sec,
      text: segment.text,
      max_chars_per_line: args.maxCharsPerLine ?? 42,
      max_lines: args.maxLines ?? 2,
      reading_speed_cps: readingSpeed,
      safe_area: safeArea,
    });
  });
  const draft = {
    schema_version: 1 as const,
    artifact_id: args.artifactId,
    based_on_transcript_id: args.transcriptId,
    style_preset_id: args.stylePresetId,
    template_version: args.templateVersion,
    output_modes: args.outputModes ?? ["burn_in", "sidecar"] as const,
    cues,
  };
  return signHammerCaptionArtifactV1(draft);
}

export function reconcileHammerCaptionArtifactAfterTranscriptChangeV1(args: {
  current: HammerCaptionArtifactV1;
  action: "invalidate" | "rebuild" | "preserve_explicit";
  rebuilt?: HammerCaptionArtifactV1;
  preserveReason?: string;
}): HammerCaptionRebuildDecisionV1 {
  if (args.action === "invalidate") return Object.freeze({ kind: "invalidate", reason: "transcript_changed" });
  if (args.action === "rebuild" && args.rebuilt) {
    validateHammerCaptionArtifactV1(args.rebuilt);
    return Object.freeze({ kind: "rebuild", artifact: args.rebuilt });
  }
  if (args.action === "preserve_explicit" && args.preserveReason?.trim()) return Object.freeze({ kind: "preserve_explicit", artifact: args.current, reason: args.preserveReason });
  throw new Error("caption_rebuild_decision_invalid");
}

export function buildHammerCaptionArtifactCommand(artifact: HammerCaptionArtifactV1): HammerCompositionCommand {
  validateHammerCaptionArtifactV1(artifact);
  return Object.freeze({ type: "set_caption_artifact_v1", artifact });
}

export function buildHammerCaptionCueEditCommand(cueId: string, correctedText: string): HammerCompositionCommand {
  if (!cueId || !correctedText.trim()) throw new Error("caption_edit_invalid");
  return Object.freeze({ type: "edit_caption_cue", cue_id: cueId, corrected_text: correctedText });
}

export function validateHammerGraphicTemplateV1(template: HammerGraphicTemplateV1): void {
  if (!template.template_id || !template.template_version || !template.style_preset_id) throw new Error("graphic_template_invalid");
  assertSafeArea(template.safe_area);
  for (const keyframe of template.keyframes) {
    if (!Number.isFinite(keyframe.at_sec) || keyframe.at_sec < 0 || keyframe.min > keyframe.max || keyframe.value < keyframe.min || keyframe.value > keyframe.max) throw new Error("graphic_keyframe_out_of_bounds");
  }
}

export function buildHammerGraphicTemplateCommand(clip: HammerCompositionClipV2, template: HammerGraphicTemplateV1): HammerCompositionCommand {
  validateHammerGraphicTemplateV1(template);
  return Object.freeze({ type: "upsert_graphic_template", clip, template });
}
