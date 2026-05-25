import {
  ASR4_WHISPER_ADVISORY_EVIDENCE,
  type Asr4WhisperAdvisoryEvidence,
  type Asr4WhisperAdvisoryInput,
} from './asr4-authority.types';

function finiteOrNull(value: number | null | undefined): number | null {
  return Number.isFinite(value) ? Number(value) : null;
}

export function buildAsr4WhisperAdvisoryEvidence(input: Asr4WhisperAdvisoryInput): Asr4WhisperAdvisoryEvidence {
  const hintLine = finiteOrNull(input.hintLine);
  const referenceLine = finiteOrNull(input.referenceLine);
  const confidence = finiteOrNull(input.confidence);
  const transcriptAgeMs = finiteOrNull(input.transcriptAgeMs);
  const correctionKind = input.correctionKind ?? 'none';

  return {
    tag: ASR4_WHISPER_ADVISORY_EVIDENCE,
    lane: 'whisper_advisory',
    role: 'advisory_only',
    canAuthorizeMovement: false,
    hintLine,
    referenceLine,
    confidence,
    transcriptAgeMs,
    correctionKind,
    reason: hintLine == null ? 'no_whisper_hint_available' : 'delayed_whisper_reference_only',
  };
}

export function buildAsr4WhisperAdvisoryDiagnostic(evidence: Asr4WhisperAdvisoryEvidence): string {
  return `[${evidence.tag}] role=${evidence.role} canAuthorizeMovement=0 hintLine=${evidence.hintLine ?? -1} referenceLine=${evidence.referenceLine ?? -1} confidence=${evidence.confidence ?? -1} transcriptAgeMs=${evidence.transcriptAgeMs ?? -1} correctionKind=${evidence.correctionKind} reason=${evidence.reason}`;
}

