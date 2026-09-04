import {
  HAMMER_QUENCH_CANONICAL_READINESS_REASON_CODES,
  type HammerQuenchCanonicalReadinessReasonCode,
} from "./quench-readiness-taxonomy.contract";

export const HAMMER_RELEASE_COMMIT_CONTRACT_VERSION = "forge.hammer-release-commit.v1" as const;

export const HAMMER_RELEASE_PROFILES = ["audio_episode", "video_episode"] as const;
export type HammerReleaseProfile = (typeof HAMMER_RELEASE_PROFILES)[number];

export const HAMMER_RELEASE_MEMBER_KINDS = [
  "manifest",
  "transcript",
  "captions_srt",
  "captions_vtt",
  "visual_authority",
  "final_audio_master",
  "final_video_master",
] as const;
export type HammerReleaseMemberKind = (typeof HAMMER_RELEASE_MEMBER_KINDS)[number];

export type HammerReleaseMemberRequirement = "required" | "optional" | "forbidden";

export type HammerReleaseProfileMemberRequirement = Readonly<{
  integrity: HammerReleaseMemberRequirement;
  quench_review: HammerReleaseMemberRequirement;
  publication: HammerReleaseMemberRequirement;
}>;

export type HammerReleaseProfileRequirements = Readonly<Record<
  HammerReleaseMemberKind,
  HammerReleaseProfileMemberRequirement
>>;

const REQUIRED: HammerReleaseMemberRequirement = "required";
const OPTIONAL: HammerReleaseMemberRequirement = "optional";
const FORBIDDEN: HammerReleaseMemberRequirement = "forbidden";

/**
 * Canonical member policy. Tongs, not a client, applies this table while
 * certifying a release and while evaluating publication authority.
 */
export const HAMMER_RELEASE_PROFILE_REQUIREMENTS: Readonly<Record<
  HammerReleaseProfile,
  HammerReleaseProfileRequirements
>> = Object.freeze({
  audio_episode: Object.freeze({
    manifest: Object.freeze({ integrity: REQUIRED, quench_review: REQUIRED, publication: REQUIRED }),
    transcript: Object.freeze({ integrity: REQUIRED, quench_review: REQUIRED, publication: REQUIRED }),
    captions_srt: Object.freeze({ integrity: OPTIONAL, quench_review: OPTIONAL, publication: OPTIONAL }),
    captions_vtt: Object.freeze({ integrity: OPTIONAL, quench_review: OPTIONAL, publication: OPTIONAL }),
    visual_authority: Object.freeze({ integrity: OPTIONAL, quench_review: OPTIONAL, publication: OPTIONAL }),
    final_audio_master: Object.freeze({ integrity: REQUIRED, quench_review: REQUIRED, publication: REQUIRED }),
    final_video_master: Object.freeze({ integrity: FORBIDDEN, quench_review: FORBIDDEN, publication: FORBIDDEN }),
  }),
  video_episode: Object.freeze({
    manifest: Object.freeze({ integrity: REQUIRED, quench_review: REQUIRED, publication: REQUIRED }),
    transcript: Object.freeze({ integrity: REQUIRED, quench_review: REQUIRED, publication: REQUIRED }),
    captions_srt: Object.freeze({ integrity: OPTIONAL, quench_review: OPTIONAL, publication: REQUIRED }),
    captions_vtt: Object.freeze({ integrity: OPTIONAL, quench_review: OPTIONAL, publication: OPTIONAL }),
    visual_authority: Object.freeze({ integrity: REQUIRED, quench_review: REQUIRED, publication: REQUIRED }),
    final_audio_master: Object.freeze({ integrity: REQUIRED, quench_review: REQUIRED, publication: REQUIRED }),
    final_video_master: Object.freeze({ integrity: REQUIRED, quench_review: REQUIRED, publication: REQUIRED }),
  }),
});

export const HAMMER_RELEASE_REASON_DISPOSITIONS = [
  "prevents_certification",
  "permits_needs_review",
  "publication_only",
] as const;
export type HammerReleaseReasonDisposition = (typeof HAMMER_RELEASE_REASON_DISPOSITIONS)[number];

/**
 * Canonical classification for the existing Hammer -> Quench reason vocabulary.
 * New codes must be added deliberately; unknown codes fail closed.
 */
export const HAMMER_RELEASE_REASON_CLASSIFICATION: Readonly<Record<
  HammerQuenchCanonicalReadinessReasonCode,
  HammerReleaseReasonDisposition
>> = Object.freeze({
  export_posture_unavailable: "prevents_certification",
  export_posture_degraded: "permits_needs_review",
  operation_unavailable: "prevents_certification",
  operation_degraded: "permits_needs_review",
  unresolved_broll_intent: "prevents_certification",
  broll_timeline_clip_without_operation: "prevents_certification",
  broll_operation_without_timeline_clip: "prevents_certification",
  broll_duplicate_operation_projection: "prevents_certification",
  broll_wrong_operation_type: "prevents_certification",
  broll_unresolved_operation_has_clip: "prevents_certification",
  broll_asset_binding_mismatch: "prevents_certification",
  broll_timing_mismatch: "prevents_certification",
  broll_anchor_mismatch: "prevents_certification",
  broll_stale_projection: "prevents_certification",
  broll_linked_duck_divergence: "prevents_certification",
  bound_attention_video: "permits_needs_review",
  bound_attention_audio: "permits_needs_review",
  podcast_master_unavailable: "prevents_certification",
  podcast_master_degraded: "permits_needs_review",
  podcast_master_export_only: "permits_needs_review",
  artifact_transcript_missing: "prevents_certification",
  artifact_transcript_stale: "prevents_certification",
  artifact_transcript_failed: "prevents_certification",
  artifact_subtitles_srt_missing: "permits_needs_review",
  artifact_subtitles_srt_stale: "permits_needs_review",
  artifact_subtitles_vtt_missing: "permits_needs_review",
  artifact_subtitles_vtt_stale: "permits_needs_review",
  artifact_visuals_missing: "permits_needs_review",
  artifact_visuals_stale: "prevents_certification",
  artifact_audio_missing: "prevents_certification",
  artifact_audio_stale: "prevents_certification",
  artifact_audio_failed: "prevents_certification",
  artifact_audio_unsupported: "prevents_certification",
  artifact_audio_requires_future_ffmpeg: "prevents_certification",
  packet_workpiece_id_missing: "prevents_certification",
  packet_kind_invalid: "prevents_certification",
  packet_editorial_truth_missing: "prevents_certification",
  packet_timeline_snapshot_missing: "prevents_certification",
  packet_final_audio_master_missing: "prevents_certification",
  exact_audio_receipt_missing: "prevents_certification",
  exact_audio_receipt_fingerprint_mismatch: "prevents_certification",
  exact_audio_dsp_identity_mismatch: "prevents_certification",
  exact_audio_render_identity_mismatch: "prevents_certification",
  exact_audio_algorithm_obsolete: "prevents_certification",
  exact_audio_operation_incomplete: "prevents_certification",
  exact_audio_operation_order_invalid: "prevents_certification",
  exact_audio_loudness_evidence_missing: "prevents_certification",
  exact_audio_loudness_out_of_tolerance: "prevents_certification",
  exact_audio_true_peak_exceeded: "prevents_certification",
  exact_audio_output_identity_mismatch: "prevents_certification",
  handoff_blocked: "prevents_certification",
  handoff_needs_review: "permits_needs_review",
  quench_audio_reference_unresolved: "prevents_certification",
  quench_transcript_missing: "prevents_certification",
  quench_captions_missing: "permits_needs_review",
  quench_visuals_missing: "permits_needs_review",
  quench_visuals_invalid: "prevents_certification",
});

export type HammerReleaseReasonEvaluation = Readonly<{
  certification_allowed: boolean;
  editorial_status: "ready" | "needs_review" | "blocked";
  publication_allowed_by_reasons: boolean;
  preventing_codes: readonly string[];
  review_codes: readonly string[];
  publication_only_codes: readonly string[];
  unknown_codes: readonly string[];
}>;

/**
 * User confirmation acknowledges review posture only. It is intentionally not
 * an input: confirmation can never downgrade an integrity failure.
 */
export function evaluateHammerReleaseReasonCodes(
  codes: readonly string[],
): HammerReleaseReasonEvaluation {
  const preventingCodes: string[] = [];
  const reviewCodes: string[] = [];
  const publicationOnlyCodes: string[] = [];
  const unknownCodes: string[] = [];

  for (const code of [...new Set(codes)]) {
    const disposition = (
      HAMMER_RELEASE_REASON_CLASSIFICATION as Readonly<Record<string, HammerReleaseReasonDisposition | undefined>>
    )[code];
    if (disposition === "prevents_certification") preventingCodes.push(code);
    else if (disposition === "permits_needs_review") reviewCodes.push(code);
    else if (disposition === "publication_only") publicationOnlyCodes.push(code);
    else unknownCodes.push(code);
  }

  const certificationAllowed = preventingCodes.length === 0 && unknownCodes.length === 0;
  const editorialStatus = certificationAllowed
    ? reviewCodes.length > 0 ? "needs_review" : "ready"
    : "blocked";

  return Object.freeze({
    certification_allowed: certificationAllowed,
    editorial_status: editorialStatus,
    publication_allowed_by_reasons: certificationAllowed
      && reviewCodes.length === 0
      && publicationOnlyCodes.length === 0,
    preventing_codes: Object.freeze(preventingCodes),
    review_codes: Object.freeze(reviewCodes),
    publication_only_codes: Object.freeze(publicationOnlyCodes),
    unknown_codes: Object.freeze(unknownCodes),
  });
}

export function assertHammerReleaseContractTablesComplete(): true {
  for (const profile of HAMMER_RELEASE_PROFILES) {
    for (const member of HAMMER_RELEASE_MEMBER_KINDS) {
      if (!HAMMER_RELEASE_PROFILE_REQUIREMENTS[profile][member]) {
        throw new Error(`Missing release member policy for ${profile}/${member}.`);
      }
    }
  }
  for (const code of HAMMER_QUENCH_CANONICAL_READINESS_REASON_CODES) {
    if (!HAMMER_RELEASE_REASON_CLASSIFICATION[code]) {
      throw new Error(`Missing release reason classification for ${code}.`);
    }
  }
  return true;
}
