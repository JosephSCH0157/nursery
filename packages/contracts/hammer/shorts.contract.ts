export const HAMMER_SHORTS_BASIS_SCHEMA = "HammerShortsBasisLockV1" as const;
export const HAMMER_SHORTS_DISCOVERY_SCHEMA = "HammerShortsDiscoveryRequestV1" as const;
export const HAMMER_SHORTS_AI_PROPOSAL_SCHEMA = "HammerShortsAiProposalV1" as const;
export const HAMMER_SHORT_CANDIDATE_SCHEMA = "HammerShortCandidateV1" as const;

export type HammerShortsGoal = "drive_to_full_episode" | "standalone";
export type HammerShortsDurationPreset = "about_30s" | "about_60s" | "about_90s" | "custom";

export interface HammerShortsBasisLockV1 {
  schema_version: typeof HAMMER_SHORTS_BASIS_SCHEMA;
  workspace_id: string;
  parent_workpiece_id: string;
  canonical_recording_id: string;
  recording_revision_id: string;
  history_epoch_id: string;
  history_head_id: string;
  history_sequence: number;
  editor_state_hash: string;
  transcript_fingerprint: string;
  timeline_fingerprint: string;
  render_assembly_fingerprint: string;
  output_time_map_fingerprint: string;
  basis_fingerprint: string;
  locked_at: string;
  locked_by: string;
}

export interface HammerShortsDiscoveryRequestV1 {
  schema_version: typeof HAMMER_SHORTS_DISCOVERY_SCHEMA;
  basis_lock_id: string;
  basis_fingerprint: string;
  goal: HammerShortsGoal;
  duration_preset: HammerShortsDurationPreset;
  minimum_duration_sec: number;
  maximum_duration_sec: number;
  target_candidate_count: 3 | 4;
  prompt_version: string;
  contract_version: string;
  provider: "openai";
  model: string;
  request_fingerprint: string;
}

export interface HammerShortsAiAnchorProposal {
  proposal_id: string;
  rank: number;
  first_segment_id: string;
  last_segment_id: string;
  rationale: string;
  goal_fit: string;
}

export interface HammerShortsAiProposalV1 {
  schema_version: typeof HAMMER_SHORTS_AI_PROPOSAL_SCHEMA;
  discovery_id: string;
  provider: "openai";
  model: string;
  provider_request_id: string | null;
  prompt_fingerprint: string;
  proposals: HammerShortsAiAnchorProposal[];
}

export interface HammerShortSourceInterval {
  source_start_sec: number;
  source_end_sec: number;
  output_start_sec: number;
  output_end_sec: number;
  segment_ids: string[];
}

export interface HammerShortCandidateV1 {
  schema_version: typeof HAMMER_SHORT_CANDIDATE_SCHEMA;
  candidate_id: string;
  discovery_id: string;
  basis_lock_id: string;
  basis_fingerprint: string;
  proposal_id: string;
  rank: number;
  segment_ids: string[];
  core_output_start_sec: number;
  core_output_end_sec: number;
  duration_sec: number;
  envelope_output_start_sec: number;
  envelope_output_end_sec: number;
  source_intervals: HammerShortSourceInterval[];
  transcript_excerpt: string;
  rationale: string;
  goal_fit: string;
  candidate_fingerprint: string;
}

export type HammerShortsDiscoveryOutcome = "complete" | "partial" | "empty";

export const HAMMER_SHORTS_DURATION_RANGES: Readonly<Record<Exclude<HammerShortsDurationPreset, "custom">, Readonly<{ minimum: number; maximum: number }>>> = Object.freeze({
  about_30s: Object.freeze({ minimum: 20, maximum: 40 }),
  about_60s: Object.freeze({ minimum: 45, maximum: 75 }),
  about_90s: Object.freeze({ minimum: 75, maximum: 105 }),
});
