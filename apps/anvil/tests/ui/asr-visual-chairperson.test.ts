/** @jest-environment jsdom */

import { evaluateAsrVisualChairperson } from '../../src/features/asr/asr-visual-chairperson';
import type {
  AsrRecoveryEpisode,
  AsrSemanticSnapshot,
  AsrVisualAnchor,
  AsrVisualMode,
} from '../../src/features/asr/asr-scroll-driver.types';

function buildSemantic(lineIdx: number): AsrSemanticSnapshot {
  return {
    lineIdx,
    confidence: 1,
    source: 'validated_commit',
    updatedAt: 1000,
  };
}

function buildAnchor(anchorLineIdx: number, anchorViewportY: number, anchorKind = 'current_line'): AsrVisualAnchor {
  return {
    anchorLineIdx,
    anchorKind,
    anchorViewportY,
    anchorCompatibleWithSemantic: true,
    matchedLineViewportY: anchorViewportY,
  };
}

function buildEpisode(target: number): AsrRecoveryEpisode {
  return {
    startedAt: 1000,
    expiresAt: 1700,
    protectedLineIdx: 8,
    protectedTargetScrollTop: target,
    reason: 'visual_debt',
  };
}

function evaluate(overrides: Partial<Parameters<typeof evaluateAsrVisualChairperson>[0]> = {}) {
  return evaluateAsrVisualChairperson({
    nowMs: 1200,
    currentScrollTop: 430,
    maxScrollTop: 3000,
    lineHeightPx: 56,
    markerY: 390,
    preferredBandTop: 424,
    preferredBandBottom: 526,
    toleratedBandBottom: 560,
    semanticSnapshot: buildSemantic(8),
    visualAnchor: buildAnchor(8, 620, 'confirmed_spoken'),
    currentLineIdx: 8,
    committedLineIdx: 8,
    selectedTargetScrollTop: 376,
    selectedAuthority: 'comfort_nudge',
    selectedReason: 'outside_preferred_within_tolerated',
    speechFresh: true,
    finalFresh: true,
    sessionLive: true,
    asrMode: true,
    noMatchOrOffscript: false,
    hardContradiction: false,
    bridgeContextActive: false,
    trueVisualSilence: false,
    previousMode: 'track' as AsrVisualMode,
    previousTargetScrollTop: 430,
    settleUntilMs: 0,
    activeRecoveryEpisode: null,
    ...overrides,
  });
}

describe('ASR visual chairperson', () => {
  test('holds when hard blockers are active', () => {
    const result = evaluate({ bridgeContextActive: true });
    expect(result.decision.mode).toBe('hold');
    expect(result.decision.targetScrollTop).toBe(430);
    expect(result.decision.backwardAllowed).toBe(false);
  });

  test('rejects lower competing targets during recovery episodes', () => {
    const result = evaluate({
      activeRecoveryEpisode: buildEpisode(512),
      selectedTargetScrollTop: 376,
      visualAnchor: buildAnchor(8, 620, 'confirmed_spoken'),
    });
    expect(result.decision.mode).toBe('recover');
    expect(result.decision.targetScrollTop).toBe(512);
    expect(result.backwardTargetRejected).toBe(true);
    expect(result.safeForwardTargetSuppressed).toBe(true);
    expect(result.decision.controlIntent).toBe('recover');
    expect(result.decision.recoveryKind).toBe('visual_debt');
    expect(result.decision.isTrueVisualRecovery).toBe(true);
    expect(result.decision.isForwardProtection).toBe(false);
  });

  test('tracks with backward comfort allowed inside pocket', () => {
    const result = evaluate({
      visualAnchor: buildAnchor(8, 500, 'current_line'),
      selectedTargetScrollTop: 410,
      selectedAuthority: 'comfort_nudge',
      selectedReason: 'outside_preferred_within_tolerated',
    });
    expect(result.decision.mode).toBe('track');
    expect(result.decision.backwardAllowed).toBe(true);
    expect(result.pocketBand).toBe('preferred');
  });

  test('settles when recovery re-enters the tolerated pocket', () => {
    const result = evaluate({
      activeRecoveryEpisode: buildEpisode(512),
      previousMode: 'recover',
      settleUntilMs: 1500,
      selectedTargetScrollTop: 512,
      visualAnchor: buildAnchor(8, 540, 'current_line'),
    });
    expect(result.decision.mode).toBe('settle');
    expect(result.decision.targetScrollTop).toBe(512);
    expect(result.decision.backwardAllowed).toBe(false);
  });

  test('semantic_ahead stays in recover mode but emits forward-protection intent', () => {
    const result = evaluate({
      semanticSnapshot: buildSemantic(10),
      visualAnchor: buildAnchor(8, 360, 'confirmed_spoken'),
      selectedTargetScrollTop: 376,
      previousMode: 'track',
      activeRecoveryEpisode: null,
    });
    expect(result.decision.mode).toBe('recover');
    expect(result.decision.reason).toBe('semantic_ahead');
    expect(result.decision.controlIntent).toBe('forward_protect');
    expect(result.decision.recoveryKind).toBe('semantic_ahead');
    expect(result.decision.isTrueVisualRecovery).toBe(false);
    expect(result.decision.isForwardProtection).toBe(true);
  });
});
