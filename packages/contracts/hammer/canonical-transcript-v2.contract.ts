export type HammerCertifiedTranscriptionProvider = "assemblyai" | "deepgram";

export interface HammerCanonicalRecordingIdentityV2 {
  workspace_id: string;
  workpiece_id: string;
  canonical_recording_id: string;
  recording_revision_id: string;
  media_signature: string;
  media_sha256: string;
  media_bytes: number;
  duration_ms: number;
}

export interface HammerCanonicalTranscriptProviderEvidenceV2 {
  provider: HammerCertifiedTranscriptionProvider;
  model: string;
  model_version: string;
  diarization_model_version: string;
  provider_request_id: string;
  response_sha256: string;
  submitted_at: string;
  completed_at: string;
  reported_audio_duration_ms: number;
}

export interface HammerCanonicalTranscriptSpeakerV2 {
  speaker_id: string;
  provider_label: string;
  display_name: string | null;
}

export interface HammerCanonicalTranscriptWordV2 {
  word_id: string;
  text: string;
  start_ms: number;
  end_ms: number;
  speaker_id: string;
  confidence: number;
}

export interface HammerCanonicalTranscriptSegmentV2 {
  segment_id: string;
  text: string;
  start_ms: number;
  end_ms: number;
  speaker_id: string;
  confidence: number;
  word_ids: string[];
}

/**
 * Provider-neutral transcript truth for a single, complete recording request.
 * This is additive to Hammer's persisted v1 transcript and is not yet a storage
 * or execution activation contract.
 */
export interface HammerCanonicalTranscriptV2 {
  schema_version: 2;
  transcript_id: string;
  structure: "speaker_turns_with_words";
  prepared_at: string;
  recording: HammerCanonicalRecordingIdentityV2;
  provider: HammerCanonicalTranscriptProviderEvidenceV2;
  speakers: HammerCanonicalTranscriptSpeakerV2[];
  words: HammerCanonicalTranscriptWordV2[];
  segments: HammerCanonicalTranscriptSegmentV2[];
}
