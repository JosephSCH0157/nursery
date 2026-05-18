import {
  buildAsrAlignmentEpisodeDumpPathProofDiagnostic,
  buildAsrBottomLockGeometryDiagnostic,
  buildAsrDelayedSuppressionAutopsyDiagnostic,
  buildAsrOptionalDiagnosticErrorDiagnostic,
} from './asr-diagnostics';

export type VisualOutcome =
  | 'in_pocket'
  | 'bottom_locked'
  | 'top_pressure'
  | 'delayed_until_starvation'
  | 'hard_hold_loop'
  | 'bridge_wait'
  | 'unknown';

const ASR_EPISODE_DUMP_IMPL_PROOF_VERSION = 'asr-alignment-episodes.ts 2026-05-18b';

type VisualAction = 'pursued' | 'held' | 'cleared' | 'snap_suppressed';

type Episode = {
  id: string;
  openedAtMs: number;
  closedAtMs: number | null;
  semantic: {
    currentLine: number;
    requestedTarget: number;
    acceptedCommitTarget: number;
    proofSource: string;
    authorityPath: string;
    sourceHoldReason: string;
    flags: string[];
  };
  visual: {
    scrollTopBefore: number;
    scrollTopAfter: number;
    targetScrollTop: number;
    markerY: number;
    currentLineY: number;
    nextSpeakableLineY: number;
    preferredBandTop: number;
    preferredSettleBottom: number;
    preferredBandBottom: number;
    toleratedBandBottom: number;
    pocketZone: string;
    actions: VisualAction[];
    lastAction: VisualAction | 'none';
    lastComfortReason: string;
    lastVisualTargetDeltaPx: number;
    lastVisualVelocityPxps: number;
    snapSuppressedInEpisode: boolean;
  };
  metrics: {
    deltaLinesSamples: number[];
    settleMs: number;
    lowerPocketMs: number;
    hardHoldTicks: number;
    transcriptAgeMs: number;
    audioAgeMs: number;
    stallDelayMs: number;
    speechActive: boolean;
    finalPacketFresh: boolean;
    transcriptGrowing: boolean;
  };
  diagnostic: {
    runKey: string;
    runGeneration: number;
    nextSpeakableLineIdx: number;
    desiredLineY: number;
    tolerancePx: number;
    holdTolerancePx: number;
    lastGuardReason: string;
    lastHudGuardText: string;
    lastSelectedAuthority: string;
    lastVisualAction: string;
    lastVisualErrorPx: number;
  };
  reasonChain: string[];
  visualOutcome: VisualOutcome;
};

const EPISODE_CLOSE_MS = 4000;
const LOWER_POCKET_OFFSET_PX = 80;

function nowMs(): number {
  return Date.now();
}

function finiteOr(value: number, fallback = -1): number {
  return Number.isFinite(value) ? value : fallback;
}

function classifyPocketZone(markerY: number, currentLineY: number): string {
  if (!Number.isFinite(markerY) || !Number.isFinite(currentLineY)) return 'unknown';
  const offset = currentLineY - markerY;
  if (offset > 96) return 'bottom';
  if (offset < -48) return 'top';
  return 'pocket';
}

function classifyOutcome(ep: Episode): VisualOutcome {
  if (ep.metrics.stallDelayMs >= 1400) return 'delayed_until_starvation';
  if (ep.metrics.hardHoldTicks >= 3) return 'hard_hold_loop';
  if (ep.reasonChain.some((r) => r.includes('bridge'))) return 'bridge_wait';
  if (ep.visual.pocketZone === 'bottom') return 'bottom_locked';
  if (ep.visual.pocketZone === 'top') return 'top_pressure';
  if (ep.visual.pocketZone === 'pocket') return 'in_pocket';
  return 'unknown';
}

function classifyDelayedSuppressionBlocker(ep: Episode): string {
  const reasonChain = ep.reasonChain.join('|').toLowerCase();
  const lastGuardReason = String(ep.diagnostic.lastGuardReason || '').toLowerCase();
  const lastHudGuardText = String(ep.diagnostic.lastHudGuardText || '').toLowerCase();
  const contains = (needle: string) =>
    reasonChain.includes(needle) ||
    lastGuardReason.includes(needle) ||
    lastHudGuardText.includes(needle);
  if (reasonChain.includes('asr_recovery_chain_blocked') || lastGuardReason.includes('recovery_chain')) {
    return 'recovery_chain_blocked';
  }
  if (reasonChain.includes('asr_live_no_adjacent_match_hold') || lastGuardReason.includes('adjacent')) {
    return 'no_adjacent_match_hold';
  }
  if (contains('bridge')) return 'bridge_guard';
  if (contains('cue')) return 'cue_guard';
  if (contains('low_confidence') || contains('low confidence')) return 'low_confidence';
  return 'unknown';
}

function explainDelayedSuppressionAutopsyGate(ep: Episode): { qualifies: boolean; reason: string } {
  if (ep.visualOutcome !== 'delayed_until_starvation') {
    return { qualifies: false, reason: 'visual_outcome_not_delayed_until_starvation' };
  }
  if (ep.reasonChain.some((r) => String(r).includes('live_asr_marker_lock_suppressed'))) {
    return { qualifies: true, reason: 'reason_chain_live_asr_marker_lock_suppressed' };
  }
  if (ep.visual.actions.includes('snap_suppressed')) {
    return { qualifies: true, reason: 'actions_include_snap_suppressed' };
  }
  if (ep.reasonChain.some((r) => String(r).includes('superseded_by_new_commit'))) {
    return { qualifies: true, reason: 'reason_chain_superseded_by_new_commit' };
  }
  return { qualifies: false, reason: 'no_delayed_suppression_qualifier_present' };
}

function shouldEmitDumpPathProof(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search || '');
    if (params.get('dev') === '1') return true;
    if (params.get('asr_log_buffer') === '1') return true;
  } catch {}
  try {
    const win = window as any;
    if (win.__asrLogBufferInstalled) return true;
    if (window.localStorage?.getItem('tp_dev_mode') === '1') return true;
    if (window.localStorage?.getItem('asr_log_buffer') === '1') return true;
  } catch {}
  return false;
}

function formatOptionalDiagnosticError(error: unknown): string {
  if (error instanceof Error) return error.message || error.name || 'unknown_error';
  try {
    return String(error);
  } catch {
    return 'unknown_error';
  }
}

export class AsrAlignmentEpisodeTracker {
  private sequence = 0;
  private active: Episode | null = null;
  private episodes: Episode[] = [];

  begin(input: {
    currentLine: number;
    requestedTarget: number;
    acceptedCommitTarget: number;
    proofSource?: string;
    authorityPath?: string;
    sourceHoldReason?: string;
    flags?: string[];
    reason?: string;
  }): void {
    if (this.active) {
      const closed = this.close('superseded_by_new_commit');
      if (closed) this.dumpForConsole(closed);
    }
    this.maybeCloseStale();
    const id = `ae-${++this.sequence}`;
    this.active = {
      id,
      openedAtMs: nowMs(),
      closedAtMs: null,
      semantic: {
        currentLine: finiteOr(input.currentLine),
        requestedTarget: finiteOr(input.requestedTarget),
        acceptedCommitTarget: finiteOr(input.acceptedCommitTarget),
        proofSource: String(input.proofSource || 'none'),
        authorityPath: String(input.authorityPath || 'unknown'),
        sourceHoldReason: String(input.sourceHoldReason || 'none'),
        flags: Array.isArray(input.flags) ? input.flags.slice(0, 12) : [],
      },
      visual: {
        scrollTopBefore: -1,
        scrollTopAfter: -1,
        targetScrollTop: -1,
        markerY: -1,
        currentLineY: -1,
        nextSpeakableLineY: -1,
        preferredBandTop: -1,
        preferredSettleBottom: -1,
        preferredBandBottom: -1,
        toleratedBandBottom: -1,
        pocketZone: 'unknown',
        actions: [],
        lastAction: 'none',
        lastComfortReason: 'none',
        lastVisualTargetDeltaPx: -1,
        lastVisualVelocityPxps: -1,
        snapSuppressedInEpisode: false,
      },
      metrics: {
        deltaLinesSamples: [],
        settleMs: 0,
        lowerPocketMs: 0,
        hardHoldTicks: 0,
        transcriptAgeMs: -1,
        audioAgeMs: -1,
        stallDelayMs: 0,
        speechActive: false,
        finalPacketFresh: false,
        transcriptGrowing: false,
      },
      diagnostic: {
        runKey: '',
        runGeneration: -1,
        nextSpeakableLineIdx: finiteOr(input.acceptedCommitTarget),
        desiredLineY: -1,
        tolerancePx: -1,
        holdTolerancePx: -1,
        lastGuardReason: 'none',
        lastHudGuardText: 'none',
        lastSelectedAuthority: 'none',
        lastVisualAction: 'none',
        lastVisualErrorPx: -1,
      },
      reasonChain: input.reason ? [String(input.reason)] : [],
      visualOutcome: 'unknown',
    };
  }

  noteCommit(input: { scrollTopBefore: number; scrollTopAfter: number; targetScrollTop: number }): void {
    const ep = this.active;
    if (!ep) return;
    ep.visual.scrollTopBefore = finiteOr(input.scrollTopBefore);
    ep.visual.scrollTopAfter = finiteOr(input.scrollTopAfter);
    ep.visual.targetScrollTop = finiteOr(input.targetScrollTop);
  }

  noteFollow(input: {
    deltaLines: number;
    reason?: string;
    targetDeltaPx?: number;
    velocityPxps?: number;
  }): void {
    const ep = this.active;
    if (!ep) return;
    ep.visual.actions.push('pursued');
    ep.visual.lastAction = 'pursued';
    ep.metrics.deltaLinesSamples.push(finiteOr(input.deltaLines, 0));
    if (Number.isFinite(input.targetDeltaPx)) {
      ep.visual.lastVisualTargetDeltaPx = finiteOr(input.targetDeltaPx ?? -1);
    }
    if (Number.isFinite(input.velocityPxps)) {
      ep.visual.lastVisualVelocityPxps = finiteOr(input.velocityPxps ?? -1);
    }
    if (input.reason) ep.reasonChain.push(String(input.reason));
  }

  noteHold(input: { reason?: string }): void {
    const ep = this.active;
    if (!ep) return;
    ep.visual.actions.push('held');
    ep.visual.lastAction = 'held';
    ep.metrics.hardHoldTicks += 1;
    if (input.reason) ep.reasonChain.push(String(input.reason));
  }

  noteSnapSuppressed(input: { reason?: string }): void {
    const ep = this.active;
    if (!ep) return;
    ep.visual.actions.push('snap_suppressed');
    ep.visual.lastAction = 'snap_suppressed';
    ep.visual.snapSuppressedInEpisode = true;
    if (input.reason) ep.reasonChain.push(String(input.reason));
  }

  noteCleared(input: { reason?: string }): void {
    const ep = this.active;
    if (!ep) return;
    ep.visual.actions.push('cleared');
    ep.visual.lastAction = 'cleared';
    if (input.reason) ep.reasonChain.push(String(input.reason));
  }

  noteComfort(input: {
    markerY: number;
    currentLineY: number;
    nextSpeakableLineY: number;
    preferredBandTop?: number;
    preferredSettleBottom?: number;
    preferredBandBottom?: number;
    toleratedBandBottom?: number;
    targetDeltaPx?: number;
    velocityPxps?: number;
    reason?: string;
  }): void {
    const ep = this.active;
    if (!ep) return;
    ep.visual.markerY = finiteOr(input.markerY);
    ep.visual.currentLineY = finiteOr(input.currentLineY);
    ep.visual.nextSpeakableLineY = finiteOr(input.nextSpeakableLineY);
    ep.visual.preferredBandTop = finiteOr(input.preferredBandTop as number);
    ep.visual.preferredSettleBottom = finiteOr(input.preferredSettleBottom as number);
    ep.visual.preferredBandBottom = finiteOr(input.preferredBandBottom as number);
    ep.visual.toleratedBandBottom = finiteOr(input.toleratedBandBottom as number);
    ep.visual.pocketZone = classifyPocketZone(ep.visual.markerY, ep.visual.currentLineY);
    if (Number.isFinite(input.targetDeltaPx)) {
      ep.visual.lastVisualTargetDeltaPx = finiteOr(input.targetDeltaPx ?? -1);
    }
    if (Number.isFinite(input.velocityPxps)) {
      ep.visual.lastVisualVelocityPxps = finiteOr(input.velocityPxps ?? -1);
    }
    ep.visual.lastComfortReason = String(input.reason || ep.visual.lastComfortReason || 'none');
    if (
      Number.isFinite(ep.visual.markerY) &&
      Number.isFinite(ep.visual.currentLineY) &&
      ep.visual.currentLineY - ep.visual.markerY >= LOWER_POCKET_OFFSET_PX
    ) {
      ep.metrics.lowerPocketMs += 100;
    }
    if (input.reason) ep.reasonChain.push(String(input.reason));
  }

  noteStallDelay(ms: number, reason?: string): void {
    const ep = this.active;
    if (!ep) return;
    ep.metrics.stallDelayMs = Math.max(ep.metrics.stallDelayMs, finiteOr(ms, 0));
    if (reason) ep.reasonChain.push(String(reason));
  }

  noteHeartbeat(input: { transcriptAgeMs: number; audioAgeMs: number }): void {
    const ep = this.active;
    if (!ep) return;
    ep.metrics.transcriptAgeMs = finiteOr(input.transcriptAgeMs);
    ep.metrics.audioAgeMs = finiteOr(input.audioAgeMs);
  }

  noteAutopsyState(input: {
    runKey?: string | null;
    runGeneration?: number | null;
    nextSpeakableLineIdx?: number;
    desiredLineY?: number;
    tolerancePx?: number;
    holdTolerancePx?: number;
    lastGuardReason?: string | null;
    lastHudGuardText?: string | null;
    lastSelectedAuthority?: string | null;
    lastVisualAction?: string | null;
    lastVisualErrorPx?: number;
    speechActive?: boolean;
    finalPacketFresh?: boolean;
    transcriptGrowing?: boolean;
  }): void {
    const ep = this.active;
    if (!ep) return;
    if (input.runKey != null) ep.diagnostic.runKey = String(input.runKey || '');
    if (Number.isFinite(input.runGeneration as number)) ep.diagnostic.runGeneration = finiteOr(input.runGeneration as number);
    if (Number.isFinite(input.nextSpeakableLineIdx as number)) ep.diagnostic.nextSpeakableLineIdx = finiteOr(input.nextSpeakableLineIdx as number);
    if (Number.isFinite(input.desiredLineY as number)) ep.diagnostic.desiredLineY = finiteOr(input.desiredLineY as number);
    if (Number.isFinite(input.tolerancePx as number)) ep.diagnostic.tolerancePx = finiteOr(input.tolerancePx as number);
    if (Number.isFinite(input.holdTolerancePx as number)) ep.diagnostic.holdTolerancePx = finiteOr(input.holdTolerancePx as number);
    if (input.lastGuardReason != null) ep.diagnostic.lastGuardReason = String(input.lastGuardReason || 'none');
    if (input.lastHudGuardText != null) ep.diagnostic.lastHudGuardText = String(input.lastHudGuardText || 'none');
    if (input.lastSelectedAuthority != null) ep.diagnostic.lastSelectedAuthority = String(input.lastSelectedAuthority || 'none');
    if (input.lastVisualAction != null) ep.diagnostic.lastVisualAction = String(input.lastVisualAction || 'none');
    if (Number.isFinite(input.lastVisualErrorPx as number)) ep.diagnostic.lastVisualErrorPx = finiteOr(input.lastVisualErrorPx as number);
    if (typeof input.speechActive === 'boolean') ep.metrics.speechActive = input.speechActive;
    if (typeof input.finalPacketFresh === 'boolean') ep.metrics.finalPacketFresh = input.finalPacketFresh;
    if (typeof input.transcriptGrowing === 'boolean') ep.metrics.transcriptGrowing = input.transcriptGrowing;
  }

  isSnapSuppressedActive(): boolean {
    return !!this.active?.visual.snapSuppressedInEpisode;
  }

  close(reason?: string): Episode | null {
    const ep = this.active;
    if (!ep) return null;
    ep.closedAtMs = nowMs();
    ep.metrics.settleMs = Math.max(0, ep.closedAtMs - ep.openedAtMs);
    if (reason) ep.reasonChain.push(String(reason));
    ep.visualOutcome = classifyOutcome(ep);
    this.episodes.push(ep);
    this.active = null;
    return ep;
  }

  flushStale(): Episode | null {
    return this.maybeCloseStale(true);
  }

  private maybeCloseStale(force = false): Episode | null {
    if (!this.active) return null;
    const age = nowMs() - this.active.openedAtMs;
    if (!force && age < EPISODE_CLOSE_MS) return null;
    return this.close(force ? 'forced_flush' : 'stale_timeout');
  }

  dumpForConsole(epArg?: Episode): void {
    const ep = epArg || this.active;
    if (!ep) return;
    if (shouldEmitDumpPathProof() && typeof window !== 'undefined') {
      (window as any).__ASR_EPISODE_DUMP_IMPL__ = ASR_EPISODE_DUMP_IMPL_PROOF_VERSION;
      try {
        console.warn(`[ASR_EPISODE_DUMP_IMPL] ${ASR_EPISODE_DUMP_IMPL_PROOF_VERSION}`);
      } catch {}
    }
    const reasonChain = ep.reasonChain.slice(-8).join('|') || 'none';
    const actions = ep.visual.actions.join('|') || 'none';
    const delayedAutopsyGate = explainDelayedSuppressionAutopsyGate(ep);
    try {
      console.info(
        `[ASR_ALIGNMENT_EPISODE] id=${ep.id} currentLine=${ep.semantic.currentLine} requestedTarget=${ep.semantic.requestedTarget} acceptedCommitTarget=${ep.semantic.acceptedCommitTarget} authorityPath=${ep.semantic.authorityPath} proofSource=${ep.semantic.proofSource} sourceHoldReason=${ep.semantic.sourceHoldReason} scrollTopBefore=${Math.round(ep.visual.scrollTopBefore)} scrollTopAfter=${Math.round(ep.visual.scrollTopAfter)} targetScrollTop=${Math.round(ep.visual.targetScrollTop)} markerY=${Math.round(ep.visual.markerY)} currentLineY=${Math.round(ep.visual.currentLineY)} nextSpeakableLineY=${Math.round(ep.visual.nextSpeakableLineY)} pocketZone=${ep.visual.pocketZone} actions=${actions} deltaLinesSamples=${ep.metrics.deltaLinesSamples.map((n) => n.toFixed(2)).join('|') || 'none'} settleMs=${Math.round(ep.metrics.settleMs)} lowerPocketMs=${Math.round(ep.metrics.lowerPocketMs)} hardHoldTicks=${ep.metrics.hardHoldTicks} transcriptAgeMs=${Math.round(ep.metrics.transcriptAgeMs)} audioAgeMs=${Math.round(ep.metrics.audioAgeMs)} stallDelayMs=${Math.round(ep.metrics.stallDelayMs)} visualOutcome=${ep.visualOutcome} reasonChain=${reasonChain}`,
      );
      if (shouldEmitDumpPathProof()) {
        console.info(
          buildAsrAlignmentEpisodeDumpPathProofDiagnostic({
            visualOutcome: ep.visualOutcome,
            reasonChain,
            actions,
            markerY: ep.visual.markerY,
            nextSpeakableLineY: ep.visual.nextSpeakableLineY,
            wouldQualifyDelayedSuppressionAutopsy: delayedAutopsyGate.qualifies,
            delayedAutopsyGateReason: delayedAutopsyGate.reason,
            wouldQualifyDeadScreenAutopsy: false,
            deadScreenAutopsyGateReason: 'not_evaluated_in_episode_dump_path',
          }),
        );
      }
    } catch {}
    if (ep.visualOutcome === 'bottom_locked') {
      try {
        console.info(
          buildAsrBottomLockGeometryDiagnostic({
            markerY: ep.visual.markerY,
            currentLineY: ep.visual.currentLineY,
            nextSpeakableLineY: ep.visual.nextSpeakableLineY,
            preferredBandTop: ep.visual.preferredBandTop,
            preferredSettleBottom: ep.visual.preferredSettleBottom,
            preferredBandBottom: ep.visual.preferredBandBottom,
            toleratedBandBottom: ep.visual.toleratedBandBottom,
            currentScrollTop: ep.visual.scrollTopAfter,
            targetScrollTop: ep.visual.targetScrollTop,
            scrollTopBefore: ep.visual.scrollTopBefore,
            scrollTopAfter: ep.visual.scrollTopAfter,
            pocketZone: ep.visual.pocketZone,
            lastAction: ep.visual.lastAction,
            lastComfortReason: ep.visual.lastComfortReason || 'none',
            lastVisualTargetDeltaPx: ep.visual.lastVisualTargetDeltaPx,
            lastVisualVelocityPxps: ep.visual.lastVisualVelocityPxps,
            snapSuppressedInEpisode: ep.visual.snapSuppressedInEpisode,
            reasonChain,
            deltaLinesSamples: ep.metrics.deltaLinesSamples.map((n) => n.toFixed(2)).join('|') || 'none',
          }),
        );
      } catch (error) {
        try {
          console.warn(
            buildAsrOptionalDiagnosticErrorDiagnostic({
              diagnosticTag: 'ASR_BOTTOM_LOCK_GEOMETRY_DIAG',
              errorMessage: formatOptionalDiagnosticError(error),
            }),
          );
        } catch {}
      }
    }
    if (delayedAutopsyGate.qualifies) {
      const supersededByNewCommit = ep.reasonChain.some((r) => String(r).includes('superseded_by_new_commit'));
      try {
        console.info(
          buildAsrDelayedSuppressionAutopsyDiagnostic({
            episodeId: ep.id,
            runKey: ep.diagnostic.runKey || 'none',
            runGeneration: ep.diagnostic.runGeneration,
            currentLineIdx: ep.semantic.currentLine,
            committedLineIdx: ep.semantic.currentLine,
            requestedTargetIdx: ep.semantic.requestedTarget,
            acceptedCommitTargetIdx: ep.semantic.acceptedCommitTarget,
            nextSpeakableLineIdx: ep.diagnostic.nextSpeakableLineIdx,
            visualOutcome: ep.visualOutcome,
            reasonChain,
            actions,
            stallDelayMs: ep.metrics.stallDelayMs,
            settleMs: ep.metrics.settleMs,
            speechActive: ep.metrics.speechActive,
            transcriptAgeMs: ep.metrics.transcriptAgeMs,
            audioAgeMs: ep.metrics.audioAgeMs,
            finalPacketFresh: ep.metrics.finalPacketFresh,
            transcriptGrowing: ep.metrics.transcriptGrowing,
            lastGuardReason: ep.diagnostic.lastGuardReason || 'none',
            lastHudGuardText: ep.diagnostic.lastHudGuardText || 'none',
            lastSelectedAuthority: ep.diagnostic.lastSelectedAuthority || 'none',
            lastVisualAction: ep.diagnostic.lastVisualAction || ep.visual.lastAction,
            lastVisualErrorPx: ep.diagnostic.lastVisualErrorPx,
            markerY: ep.visual.markerY,
            actualNextSpeakableLineY: ep.visual.nextSpeakableLineY,
            desiredLineY: ep.diagnostic.desiredLineY,
            tolerancePx: ep.diagnostic.tolerancePx,
            holdTolerancePx: ep.diagnostic.holdTolerancePx,
            currentScrollTop: ep.visual.scrollTopAfter,
            targetScrollTop: ep.visual.targetScrollTop,
            deltaLinesSamples: ep.metrics.deltaLinesSamples.map((n) => n.toFixed(2)).join('|') || 'none',
            snapSuppressedInEpisode: ep.visual.snapSuppressedInEpisode,
            supersededByNewCommit,
            blockerCategory: classifyDelayedSuppressionBlocker(ep),
          }),
        );
      } catch (error) {
        try {
          console.warn(
            buildAsrOptionalDiagnosticErrorDiagnostic({
              diagnosticTag: 'ASR_DELAYED_SUPPRESSION_AUTOPSY',
              errorMessage: formatOptionalDiagnosticError(error),
            }),
          );
        } catch {}
      }
    }
  }
}
