import type {
  HammerCanonicalRecordingIdentityV2,
  HammerCanonicalTranscriptSegmentV2,
  HammerCanonicalTranscriptV2,
  HammerCanonicalTranscriptWordV2,
  HammerCertifiedTranscriptionProvider,
} from "@forge/contracts/hammer/canonical-transcript-v2.contract";
import type { HammerTranscriptSegment } from "@forge/contracts/hammer/transcript.contract";
import type { HammerPersistedSpeakerMap } from "../persistence/hammerPersistenceContract";

type UnknownRecord = Record<string, unknown>;

export type HammerTranscriptAdapterContext = {
  transcriptId: string;
  recording: HammerCanonicalRecordingIdentityV2;
  provider: HammerCertifiedTranscriptionProvider;
  model: string;
  modelVersion: string;
  diarizationModelVersion: string;
  providerRequestId: string;
  responseSha256: string;
  submittedAt: string;
  completedAt: string;
};

export class HammerTranscriptEvidenceError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "HammerTranscriptEvidenceError";
    this.code = code;
  }
}

function record(value: unknown, field: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HammerTranscriptEvidenceError("invalid_object", `${field} must be an object.`);
  }
  return value as UnknownRecord;
}

function array(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new HammerTranscriptEvidenceError("missing_collection", `${field} must be a non-empty array.`);
  }
  return value;
}

function string(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new HammerTranscriptEvidenceError("invalid_string", `${field} must be a non-empty string.`);
  }
  return value.trim();
}

function number(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new HammerTranscriptEvidenceError("invalid_number", `${field} must be finite.`);
  }
  return value;
}

function confidence(value: unknown, field: string): number {
  const parsed = number(value, field);
  if (parsed < 0 || parsed > 1) {
    throw new HammerTranscriptEvidenceError("invalid_confidence", `${field} must be between zero and one.`);
  }
  return parsed;
}

function milliseconds(value: unknown, field: string, unit: "ms" | "seconds"): number {
  const parsed = number(value, field);
  const result = unit === "seconds" ? Math.round(parsed * 1000) : Math.round(parsed);
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new HammerTranscriptEvidenceError("invalid_timestamp", `${field} must be a non-negative timestamp.`);
  }
  return result;
}

function assertSha256(value: string, field: string): void {
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new HammerTranscriptEvidenceError("invalid_hash", `${field} must be a lowercase SHA-256 digest.`);
  }
}

function assertIso(value: string, field: string): void {
  if (!Number.isFinite(Date.parse(value))) {
    throw new HammerTranscriptEvidenceError("invalid_timestamp", `${field} must be an ISO timestamp.`);
  }
}

function assertRecordingIdentity(recording: HammerCanonicalRecordingIdentityV2): void {
  for (const [field, value] of Object.entries({
    workspace_id: recording.workspace_id,
    workpiece_id: recording.workpiece_id,
    canonical_recording_id: recording.canonical_recording_id,
    recording_revision_id: recording.recording_revision_id,
    media_signature: recording.media_signature,
  })) string(value, `recording.${field}`);
  assertSha256(recording.media_sha256, "recording.media_sha256");
  if (!Number.isSafeInteger(recording.media_bytes) || recording.media_bytes <= 0) {
    throw new HammerTranscriptEvidenceError("invalid_media_size", "recording.media_bytes must be a positive safe integer.");
  }
  if (!Number.isSafeInteger(recording.duration_ms) || recording.duration_ms <= 0) {
    throw new HammerTranscriptEvidenceError("invalid_media_duration", "recording.duration_ms must be a positive safe integer.");
  }
}

type NormalizedTurn = {
  providerLabel: string;
  text: string;
  startMs: number;
  endMs: number;
  confidence: number;
  words: Array<{ text: string; startMs: number; endMs: number; confidence: number; providerLabel: string }>;
};

function buildCanonicalTranscript(
  context: HammerTranscriptAdapterContext,
  reportedDurationMs: number,
  turns: NormalizedTurn[],
): HammerCanonicalTranscriptV2 {
  if (context.providerRequestId !== string(context.providerRequestId, "provider_request_id")) {
    throw new HammerTranscriptEvidenceError("provider_request_mismatch", "Provider request identity changed during adaptation.");
  }
  assertRecordingIdentity(context.recording);
  assertSha256(context.responseSha256, "provider.response_sha256");
  assertIso(context.submittedAt, "provider.submitted_at");
  assertIso(context.completedAt, "provider.completed_at");
  if (Date.parse(context.completedAt) < Date.parse(context.submittedAt)) {
    throw new HammerTranscriptEvidenceError("invalid_provider_timing", "Provider completion predates submission.");
  }
  const durationDelta = Math.abs(reportedDurationMs - context.recording.duration_ms);
  if (durationDelta > 1000) {
    throw new HammerTranscriptEvidenceError("media_duration_mismatch", "Provider duration does not match the canonical recording.");
  }

  const speakerIds = new Map<string, string>();
  const words: HammerCanonicalTranscriptWordV2[] = [];
  const segments: HammerCanonicalTranscriptSegmentV2[] = [];
  let previousWordStart = -1;

  const speakerId = (providerLabel: string): string => {
    const existing = speakerIds.get(providerLabel);
    if (existing) return existing;
    const next = `speaker_${String(speakerIds.size + 1).padStart(2, "0")}`;
    speakerIds.set(providerLabel, next);
    return next;
  };

  turns.forEach((turn, turnIndex) => {
    if (!turn.text || turn.endMs <= turn.startMs || turn.endMs > context.recording.duration_ms + 1000) {
      throw new HammerTranscriptEvidenceError("invalid_segment_timing", `Turn ${turnIndex} has invalid timing or text.`);
    }
    const turnSpeakerId = speakerId(turn.providerLabel);
    const wordIds: string[] = [];
    for (const [wordIndex, providerWord] of turn.words.entries()) {
      if (providerWord.providerLabel !== turn.providerLabel) {
        throw new HammerTranscriptEvidenceError("speaker_evidence_mismatch", `Turn ${turnIndex} contains a word from another speaker.`);
      }
      if (providerWord.endMs <= providerWord.startMs || providerWord.startMs < turn.startMs || providerWord.endMs > turn.endMs) {
        throw new HammerTranscriptEvidenceError("invalid_word_timing", `Turn ${turnIndex} word ${wordIndex} falls outside its turn.`);
      }
      if (providerWord.startMs < previousWordStart) {
        throw new HammerTranscriptEvidenceError("non_monotonic_words", "Provider words are not in chronological order.");
      }
      previousWordStart = providerWord.startMs;
      const wordId = `word_${String(words.length + 1).padStart(6, "0")}`;
      wordIds.push(wordId);
      words.push({
        word_id: wordId,
        text: providerWord.text,
        start_ms: providerWord.startMs,
        end_ms: providerWord.endMs,
        speaker_id: turnSpeakerId,
        confidence: providerWord.confidence,
      });
    }
    if (wordIds.length === 0) {
      throw new HammerTranscriptEvidenceError("missing_words", `Turn ${turnIndex} has no word evidence.`);
    }
    segments.push({
      segment_id: `segment_${String(turnIndex + 1).padStart(6, "0")}`,
      text: turn.text,
      start_ms: turn.startMs,
      end_ms: turn.endMs,
      speaker_id: turnSpeakerId,
      confidence: turn.confidence,
      word_ids: wordIds,
    });
  });

  return validateHammerCanonicalTranscriptV2({
    schema_version: 2,
    transcript_id: string(context.transcriptId, "transcript_id"),
    structure: "speaker_turns_with_words",
    prepared_at: context.completedAt,
    recording: { ...context.recording },
    provider: {
      provider: context.provider,
      model: string(context.model, "provider.model"),
      model_version: string(context.modelVersion, "provider.model_version"),
      diarization_model_version: string(context.diarizationModelVersion, "provider.diarization_model_version"),
      provider_request_id: context.providerRequestId,
      response_sha256: context.responseSha256,
      submitted_at: context.submittedAt,
      completed_at: context.completedAt,
      reported_audio_duration_ms: reportedDurationMs,
    },
    speakers: [...speakerIds.entries()].map(([providerLabel, id]) => ({
      speaker_id: id,
      provider_label: providerLabel,
      display_name: null,
    })),
    words,
    segments,
  });
}

export function adaptAssemblyAiUniversal35Pro(
  payload: unknown,
  context: Omit<HammerTranscriptAdapterContext, "provider">,
): HammerCanonicalTranscriptV2 {
  if (context.model !== "universal-3-5-pro") {
    throw new HammerTranscriptEvidenceError("unapproved_model", "AssemblyAI adapter requires universal-3-5-pro.");
  }
  const root = record(payload, "assemblyai_response");
  if (string(root.status, "status") !== "completed") {
    throw new HammerTranscriptEvidenceError("provider_incomplete", "AssemblyAI transcript is not complete.");
  }
  if (string(root.id, "id") !== context.providerRequestId) {
    throw new HammerTranscriptEvidenceError("provider_request_mismatch", "AssemblyAI response ID does not match the request.");
  }
  if (string(root.speech_model, "speech_model") !== context.model) {
    throw new HammerTranscriptEvidenceError("provider_model_mismatch", "AssemblyAI used a different speech model.");
  }
  const turns = array(root.utterances, "utterances").map((value, index): NormalizedTurn => {
    const utterance = record(value, `utterances[${index}]`);
    const providerLabel = string(utterance.speaker, `utterances[${index}].speaker`);
    return {
      providerLabel,
      text: string(utterance.text, `utterances[${index}].text`),
      startMs: milliseconds(utterance.start, `utterances[${index}].start`, "ms"),
      endMs: milliseconds(utterance.end, `utterances[${index}].end`, "ms"),
      confidence: confidence(utterance.confidence, `utterances[${index}].confidence`),
      words: array(utterance.words, `utterances[${index}].words`).map((wordValue, wordIndex) => {
        const word = record(wordValue, `utterances[${index}].words[${wordIndex}]`);
        return {
          text: string(word.text, `utterances[${index}].words[${wordIndex}].text`),
          startMs: milliseconds(word.start, `utterances[${index}].words[${wordIndex}].start`, "ms"),
          endMs: milliseconds(word.end, `utterances[${index}].words[${wordIndex}].end`, "ms"),
          confidence: confidence(word.confidence, `utterances[${index}].words[${wordIndex}].confidence`),
          providerLabel: string(word.speaker, `utterances[${index}].words[${wordIndex}].speaker`),
        };
      }),
    };
  });
  return buildCanonicalTranscript(
    { ...context, provider: "assemblyai" },
    milliseconds(root.audio_duration, "audio_duration", "seconds"),
    turns,
  );
}

export function adaptDeepgramNova3(
  payload: unknown,
  context: Omit<HammerTranscriptAdapterContext, "provider">,
): HammerCanonicalTranscriptV2 {
  if (context.model !== "nova-3" || context.diarizationModelVersion !== "v2") {
    throw new HammerTranscriptEvidenceError("unapproved_model", "Deepgram adapter requires nova-3 with diarize_model=v2.");
  }
  const root = record(payload, "deepgram_response");
  const metadata = record(root.metadata, "metadata");
  if (string(metadata.request_id, "metadata.request_id") !== context.providerRequestId) {
    throw new HammerTranscriptEvidenceError("provider_request_mismatch", "Deepgram request ID does not match the request.");
  }
  const results = record(root.results, "results");
  const turns = array(results.utterances, "results.utterances").map((value, index): NormalizedTurn => {
    const utterance = record(value, `results.utterances[${index}]`);
    const providerLabel = String(number(utterance.speaker, `results.utterances[${index}].speaker`));
    return {
      providerLabel,
      text: string(utterance.transcript, `results.utterances[${index}].transcript`),
      startMs: milliseconds(utterance.start, `results.utterances[${index}].start`, "seconds"),
      endMs: milliseconds(utterance.end, `results.utterances[${index}].end`, "seconds"),
      confidence: confidence(utterance.confidence, `results.utterances[${index}].confidence`),
      words: array(utterance.words, `results.utterances[${index}].words`).map((wordValue, wordIndex) => {
        const word = record(wordValue, `results.utterances[${index}].words[${wordIndex}]`);
        return {
          text: string(word.punctuated_word ?? word.word, `results.utterances[${index}].words[${wordIndex}].word`),
          startMs: milliseconds(word.start, `results.utterances[${index}].words[${wordIndex}].start`, "seconds"),
          endMs: milliseconds(word.end, `results.utterances[${index}].words[${wordIndex}].end`, "seconds"),
          confidence: confidence(word.confidence, `results.utterances[${index}].words[${wordIndex}].confidence`),
          providerLabel: String(number(word.speaker, `results.utterances[${index}].words[${wordIndex}].speaker`)),
        };
      }),
    };
  });
  return buildCanonicalTranscript(
    { ...context, provider: "deepgram" },
    milliseconds(metadata.duration, "metadata.duration", "seconds"),
    turns,
  );
}

export function validateHammerCanonicalTranscriptV2(transcript: HammerCanonicalTranscriptV2): HammerCanonicalTranscriptV2 {
  if (transcript.schema_version !== 2 || transcript.structure !== "speaker_turns_with_words") {
    throw new HammerTranscriptEvidenceError("unsupported_schema", "Canonical transcript v2 is required.");
  }
  assertRecordingIdentity(transcript.recording);
  assertSha256(transcript.provider.response_sha256, "provider.response_sha256");
  assertIso(transcript.prepared_at, "prepared_at");
  string(transcript.transcript_id, "transcript_id");
  string(transcript.provider.model, "provider.model");
  string(transcript.provider.model_version, "provider.model_version");
  string(transcript.provider.diarization_model_version, "provider.diarization_model_version");
  string(transcript.provider.provider_request_id, "provider.provider_request_id");
  if (Math.abs(transcript.provider.reported_audio_duration_ms - transcript.recording.duration_ms) > 1000) {
    throw new HammerTranscriptEvidenceError("media_duration_mismatch", "Provider duration does not match the canonical recording.");
  }
  const speakerIds = new Set(transcript.speakers.map((speaker) => speaker.speaker_id));
  if (speakerIds.size !== transcript.speakers.length || speakerIds.size === 0) {
    throw new HammerTranscriptEvidenceError("invalid_speakers", "Speaker identities must be non-empty and unique.");
  }
  const wordIds = new Set(transcript.words.map((word) => word.word_id));
  if (wordIds.size !== transcript.words.length || wordIds.size === 0 || transcript.segments.length === 0) {
    throw new HammerTranscriptEvidenceError("invalid_transcript_content", "Words and segments must be non-empty and uniquely identified.");
  }
  const referenced = new Set<string>();
  const wordsById = new Map(transcript.words.map((word) => [word.word_id, word]));
  let previousWordStart = -1;
  for (const word of transcript.words) {
    if (!speakerIds.has(word.speaker_id)) {
      throw new HammerTranscriptEvidenceError("unknown_speaker", `Word ${word.word_id} uses an unknown speaker.`);
    }
    confidence(word.confidence, `words.${word.word_id}.confidence`);
    if (word.start_ms < previousWordStart || word.end_ms <= word.start_ms || word.end_ms > transcript.recording.duration_ms + 1000) {
      throw new HammerTranscriptEvidenceError("invalid_word_timing", `Word ${word.word_id} has invalid timing.`);
    }
    previousWordStart = word.start_ms;
  }
  for (const segment of transcript.segments) {
    if (!speakerIds.has(segment.speaker_id)) {
      throw new HammerTranscriptEvidenceError("unknown_speaker", `Segment ${segment.segment_id} uses an unknown speaker.`);
    }
    confidence(segment.confidence, `segments.${segment.segment_id}.confidence`);
    if (!segment.text.trim() || segment.end_ms <= segment.start_ms || segment.end_ms > transcript.recording.duration_ms + 1000) {
      throw new HammerTranscriptEvidenceError("invalid_segment_timing", `Segment ${segment.segment_id} has invalid timing or text.`);
    }
    for (const wordId of segment.word_ids) {
      if (!wordIds.has(wordId) || referenced.has(wordId)) {
        throw new HammerTranscriptEvidenceError("invalid_word_reference", `Segment ${segment.segment_id} has invalid word evidence.`);
      }
      const word = wordsById.get(wordId)!;
      if (word.speaker_id !== segment.speaker_id || word.start_ms < segment.start_ms || word.end_ms > segment.end_ms) {
        throw new HammerTranscriptEvidenceError("segment_word_mismatch", `Segment ${segment.segment_id} does not match its word evidence.`);
      }
      referenced.add(wordId);
    }
  }
  if (referenced.size !== transcript.words.length) {
    throw new HammerTranscriptEvidenceError("incomplete_word_evidence", "Every canonical word must belong to exactly one segment.");
  }
  return transcript;
}

export function projectCanonicalTranscriptV2ToHammerV1Editor(transcript: HammerCanonicalTranscriptV2): {
  segments: HammerTranscriptSegment[];
  speakerMap: HammerPersistedSpeakerMap;
} {
  validateHammerCanonicalTranscriptV2(transcript);
  return {
    segments: transcript.segments.map((segment) => ({
      segment_id: segment.segment_id,
      start_sec: segment.start_ms / 1000,
      end_sec: segment.end_ms / 1000,
      speaker: segment.speaker_id,
      text: segment.text,
    })),
    speakerMap: {
      schema_version: 1,
      default_labels: transcript.speakers.map((speaker) => speaker.speaker_id),
      mappings: transcript.speakers.map((speaker) => ({
        speaker_label: speaker.speaker_id,
        display_name: speaker.display_name,
        source: "default" as const,
      })),
    },
  };
}
