import {
  deriveCandidateScopedVoiceAdmission,
  evaluateCandidateScopedVoiceBridgeEligibility,
  type CandidateScopedVoiceAdmissionInput,
  type CandidateScopedVoiceBridgeEligibilityInput,
} from '../../src/features/asr/asr-scroll-driver';

describe('candidate-scoped voice bridge eligibility', () => {
  const healthyBaseline = (): CandidateScopedVoiceBridgeEligibilityInput => ({
    isFinal: true,
    isForwardAdjacentLocalStep: true,
    targetSpeakable: true,
    runIdentityCurrent: true,
    responseAuthorityCurrent: true,
    responseFresh: true,
    audioFresh: true,
    offscriptOrNoMatchBlocked: false,
    contradictionBlocked: false,
    focused: true,
    visible: true,
    focusHoldActive: false,
    requestCaptureVerdict: 'voice_detected',
    captureActivityVerdict: 'provenance_safe + capture_activity_present',
    proofOwnedLocalLineage: true,
    safeAuthority: true,
    forwardMatchCreatedByAssembly: false,
    targetSupportProvenance: 'voice_backed_multi_request_support',
  });

  test('explicit direct forward match is eligible', () => {
    const result = evaluateCandidateScopedVoiceBridgeEligibility(healthyBaseline());
    expect(result).toEqual({
      eligible: true,
      reason: 'explicit_direct_forward_match',
    });
  });

  test('voice-backed assembly match is eligible', () => {
    const result = evaluateCandidateScopedVoiceBridgeEligibility({
      ...healthyBaseline(),
      forwardMatchCreatedByAssembly: true,
      targetSupportProvenance: 'voice_backed_multi_request_support',
    });
    expect(result).toEqual({
      eligible: true,
      reason: 'voice_backed_assembly_forward_match',
    });
  });

  test('assembly match with wrong or missing provenance is ineligible', () => {
    expect(
      evaluateCandidateScopedVoiceBridgeEligibility({
        ...healthyBaseline(),
        forwardMatchCreatedByAssembly: true,
        targetSupportProvenance: null,
      }),
    ).toEqual({
      eligible: false,
      reason: 'assembly_support_not_voice_backed',
    });

    expect(
      evaluateCandidateScopedVoiceBridgeEligibility({
        ...healthyBaseline(),
        forwardMatchCreatedByAssembly: true,
        targetSupportProvenance: 'single_request_assembly_only',
      }),
    ).toEqual({
      eligible: false,
      reason: 'assembly_support_not_voice_backed',
    });
  });

  test('unknown assembly origin is ineligible even with voice-backed provenance', () => {
    const result = evaluateCandidateScopedVoiceBridgeEligibility({
      ...healthyBaseline(),
      forwardMatchCreatedByAssembly: null,
      targetSupportProvenance: 'voice_backed_multi_request_support',
    });
    expect(result).toEqual({
      eligible: false,
      reason: 'forward_match_origin_unknown',
    });
  });

  test('focus blockers make an otherwise healthy candidate ineligible', () => {
    expect(
      evaluateCandidateScopedVoiceBridgeEligibility({
        ...healthyBaseline(),
        focused: false,
      }),
    ).toEqual({
      eligible: false,
      reason: 'document_not_focused',
    });

    expect(
      evaluateCandidateScopedVoiceBridgeEligibility({
        ...healthyBaseline(),
        focusHoldActive: true,
      }),
    ).toEqual({
      eligible: false,
      reason: 'focus_hold_active',
    });
  });

  test('unsafe capture evidence makes an otherwise healthy candidate ineligible', () => {
    expect(
      evaluateCandidateScopedVoiceBridgeEligibility({
        ...healthyBaseline(),
        requestCaptureVerdict: 'unknown',
      }),
    ).toEqual({
      eligible: false,
      reason: 'request_not_voice_detected',
    });

    expect(
      evaluateCandidateScopedVoiceBridgeEligibility({
        ...healthyBaseline(),
        captureActivityVerdict: 'capture_activity_unavailable',
      }),
    ).toEqual({
      eligible: false,
      reason: 'capture_activity_not_safe',
    });
  });

  test('bridge supplies candidate-local live voice without mutating inherited stale latches', () => {
    const eligibilityInput = healthyBaseline();
    const eligibility = evaluateCandidateScopedVoiceBridgeEligibility(eligibilityInput);
    expect(eligibility).toEqual({
      eligible: true,
      reason: 'explicit_direct_forward_match',
    });

    const admissionInput: CandidateScopedVoiceAdmissionInput = {
      inheritedSpeechFresh: false,
      inheritedSpeechActive: false,
      bridgeEligible: eligibility.eligible,
    };
    const before = { ...admissionInput };

    const result = deriveCandidateScopedVoiceAdmission(admissionInput);

    expect(result).toEqual({
      effectiveSpeechFresh: true,
      effectiveSpeechActive: true,
      bridgeNeeded: true,
    });
    expect(admissionInput).toEqual(before);
  });

  test('without a bridge, stale inherited latches remain stale', () => {
    const eligibility = evaluateCandidateScopedVoiceBridgeEligibility({
      ...healthyBaseline(),
      requestCaptureVerdict: 'unknown',
    });
    expect(eligibility).toEqual({
      eligible: false,
      reason: 'request_not_voice_detected',
    });

    const result = deriveCandidateScopedVoiceAdmission({
      inheritedSpeechFresh: false,
      inheritedSpeechActive: false,
      bridgeEligible: eligibility.eligible,
    });

    expect(result).toEqual({
      effectiveSpeechFresh: false,
      effectiveSpeechActive: false,
      bridgeNeeded: false,
    });
  });

  test('bridge does not claim credit when inherited latches are already live', () => {
    const eligibility = evaluateCandidateScopedVoiceBridgeEligibility(healthyBaseline());
    expect(eligibility.eligible).toBe(true);

    const result = deriveCandidateScopedVoiceAdmission({
      inheritedSpeechFresh: true,
      inheritedSpeechActive: true,
      bridgeEligible: eligibility.eligible,
    });

    expect(result).toEqual({
      effectiveSpeechFresh: true,
      effectiveSpeechActive: true,
      bridgeNeeded: false,
    });
  });
});
