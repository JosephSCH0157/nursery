import type { HammerCompositionClipV2, HammerCompositionCommand, HammerCompositionV2 } from "./hammerCompositionV2";

export type HammerSourceSyncMethodV1 = "timecode" | "waveform" | "manual";
export type HammerSourceGroupMemberV1 = Readonly<{
  source_media_id: string;
  offset_sec: number;
  sync_method: HammerSourceSyncMethodV1;
  evidence_fingerprint: string;
}>;
export type HammerSourceGroupV1 = Readonly<{
  source_group_id: string;
  primary_source_media_id: string;
  members: readonly HammerSourceGroupMemberV1[];
}>;

export type HammerVisualCompositionV1 = Readonly<{
  layout: "single" | "split_screen" | "picture_in_picture";
  transform: Readonly<{ x: number; y: number; scale: number; rotation_deg: number }>;
  crop: Readonly<{ top: number; right: number; bottom: number; left: number }>;
  color: Readonly<{ exposure: number; contrast: number; saturation: number; temperature: number }>;
  role: "angle" | "broll" | "still" | "reference" | "lower_third" | "logo" | "intro" | "outro";
}>;

export type HammerAngleProposalV1 = Readonly<{
  proposal_id: string;
  composition_id: string;
  composition_revision: number;
  composition_fingerprint: string;
  source_group_id: string;
  clip_id: string;
  proposed_source_media_id: string;
  frame_identity: string;
  explanation: string;
}>;

function finite(value: number, code: string): void {
  if (!Number.isFinite(value)) throw new Error(code);
}

export function createHammerSourceGroupV1(args: {
  sourceGroupId: string;
  primarySourceMediaId: string;
  sources: readonly Readonly<{ source_media_id: string; timecode_sec?: number; waveform_lag_sec?: number; manual_offset_sec?: number; evidence_fingerprint: string }>[];
  method: HammerSourceSyncMethodV1;
}): HammerSourceGroupV1 {
  const primary = args.sources.find((source) => source.source_media_id === args.primarySourceMediaId);
  if (!primary || args.sources.length < 2) throw new Error("source_group_invalid");
  const baseTimecode = primary.timecode_sec ?? 0;
  const members = args.sources.map((source) => {
    const offset = args.method === "timecode" ? (source.timecode_sec ?? Number.NaN) - baseTimecode
      : args.method === "waveform" ? source.waveform_lag_sec ?? Number.NaN
      : source.manual_offset_sec ?? Number.NaN;
    finite(offset, "source_sync_evidence_missing");
    if (!source.evidence_fingerprint) throw new Error("source_sync_evidence_missing");
    return Object.freeze({ source_media_id: source.source_media_id, offset_sec: offset, sync_method: args.method, evidence_fingerprint: source.evidence_fingerprint });
  });
  return Object.freeze({ source_group_id: args.sourceGroupId, primary_source_media_id: args.primarySourceMediaId, members });
}

export function diagnoseHammerSourceGroupDrift(group: HammerSourceGroupV1, measuredOffsets: Readonly<Record<string, number>>, toleranceSec = 0.04): readonly Readonly<{ source_media_id: string; drift_sec: number; status: "aligned" | "drifted" | "unavailable" }>[] {
  return group.members.map((member) => {
    const measured = measuredOffsets[member.source_media_id];
    if (!Number.isFinite(measured)) return Object.freeze({ source_media_id: member.source_media_id, drift_sec: Number.NaN, status: "unavailable" as const });
    const drift = measured! - member.offset_sec;
    return Object.freeze({ source_media_id: member.source_media_id, drift_sec: drift, status: Math.abs(drift) <= toleranceSec ? "aligned" as const : "drifted" as const });
  });
}

export function buildHammerVisualCompositionCommand(clipId: string, visual: HammerVisualCompositionV1): HammerCompositionCommand {
  if (visual.transform.scale <= 0 || Object.values(visual.transform).some((value) => !Number.isFinite(value)) || Object.values(visual.crop).some((value) => !Number.isFinite(value) || value < 0 || value > 1)) throw new Error("visual_composition_invalid");
  return Object.freeze({ type: "set_visual_composition", clip_id: clipId, visual });
}

export function buildHammerVisualClipCommand(clip: HammerCompositionClipV2): HammerCompositionCommand {
  return Object.freeze({ type: "upsert_visual_clip", clip });
}

export function acceptHammerAngleProposal(args: { composition: HammerCompositionV2; proposal: HammerAngleProposalV1; currentFrameIdentity: string }): HammerCompositionCommand {
  const proposal = args.proposal;
  if (proposal.composition_id !== args.composition.composition_id || proposal.composition_revision !== args.composition.revision || proposal.composition_fingerprint !== args.composition.fingerprint) throw new Error("angle_proposal_stale");
  if (proposal.frame_identity !== args.currentFrameIdentity) throw new Error("angle_proposal_wrong_frame");
  const group = args.composition.source_groups.find((candidate) => candidate.source_group_id === proposal.source_group_id);
  if (!group || !group.members.some((member) => member.source_media_id === proposal.proposed_source_media_id)) throw new Error("angle_proposal_source_invalid");
  return Object.freeze({ type: "set_angle", clip_id: proposal.clip_id, source_media_id: proposal.proposed_source_media_id });
}
