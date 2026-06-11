import type { MatchResult } from '../../speech/matcher';

export type DriverOptions = {
  /** Minimum forward line delta before issuing a seek. */
  minLineAdvance?: number;
  /** Minimum milliseconds between seeks (throttle) */
  seekThrottleMs?: number;
  /** Scale applied to the confidence threshold when processing interim results (values >1 tighten). */
  interimConfidenceScale?: number;
  /** Stable ASR run key passed by lifecycle owner to dedupe duplicate driver summaries. */
  runKey?: string;
  /** Monotonic ASR run/session generation token from lifecycle owner. */
  runGeneration?: number;
};

export type TranscriptDetail = {
  matchId?: string | null;
  match?: MatchResult;
  source?: string;
  meta?: boolean;
  noMatch?: boolean;
  currentIdx?: number | null;
  runKey?: string | null;
  runGeneration?: number | null;
  speechRunningActual?: boolean;
  transcriptSeq?: number | null;
  requestSeq?: string | null;
  receivedAtMs?: number | null;
  responseCreatedAtMs?: number | null;
  responseAgeMs?: number | null;
};

export type PendingMatch = {
  line: number;
  conf: number;
  isFinal: boolean;
  hasEvidence: boolean;
  snippet: string;
  minThreshold?: number;
  forced?: boolean;
  forceReason?: string;
  consistency?: { count: number; needed: number };
  relockOverride?: boolean;
  relockReason?: string;
  relockSpan?: number;
  relockOverlapRatio?: number;
  relockRepeat?: number;
  matchId?: string;
  requiredThreshold?: number;
  topScores?: Array<{ idx: number; score: number }>;
  recoveryDetails?: {
    delta: number;
    sim: number;
    streak: number;
    debt: number;
  };
  tieGap?: number;
  stickinessApplied?: boolean;
  cursorLine?: number;
  searchWindowFrom?: number;
  searchWindowTo?: number;
  lostMode?: boolean;
  cueBridgeNudgeDelta?: number;
  liveForwardGuardActive?: boolean;
  runKey?: string | null;
  runGeneration?: number | null;
  sourceBranch?: string;
  proofSource?: string;
  starvationMs?: number;
  provenSpeakablePath?: boolean;
  transcriptSource?: string;
  transcriptSeq?: number | null;
  requestSeq?: string | null;
  transcriptReceivedAtMs?: number | null;
  transcriptResponseAgeMs?: number | null;
  transcriptSpeechAgeMs?: number | null;
  transcriptAudioAgeMs?: number | null;
  transcriptSpeechFresh?: boolean;
  transcriptSpeechActive?: boolean;
  transcriptAuthorityEpoch?: number | null;
};

export type AsrEventSnapshot = {
  ts: string;
  currentIndex: number;
  lastLineIndex: number;
  bestIdx: number;
  sim: number;
  isFinal: boolean;
  snippet: string;
  matchId?: string;
};

export type EvidenceEntry = {
  ts: number;
  text: string;
  isFinal: boolean;
};

export type LagSample = {
  ts: number;
  delta: number;
  sim: number;
  nearMarker: boolean;
  inBand: boolean;
};

export type ConsistencyEntry = {
  ts: number;
  idx: number;
  delta: number;
  sim: number;
  nearMarker: boolean;
  isFinal: boolean;
};

export type ConsistencyResult = {
  ok: boolean;
  count: number;
  needed: number;
  minDelta: number;
  maxDelta: number;
  minSim: number;
  spread: number;
  nearOk: boolean;
};

export type AsrBlockCorpusEntry = {
  blockId: number;
  startLine: number;
  endLine: number;
  textNorm: string;
  tokens: string[];
};

export type AsrBlockMatch = {
  blockId: number;
  conf: number;
  startLine: number;
  endLine: number;
  textNormSample: string;
};

export type AsrCommit = {
  forced: boolean;
  forceReason?: string;
  lineIdx: number;
  blockId: number;
  fromTop: number;
  targetTop: number;
  nextTargetTop: number;
  snapToMarker: boolean;
  markerLockRequired?: boolean;
  markerLockLineIdx?: number;
};

export type ViewerRole = 'main' | 'display';

export type AsrCommitMoveDeps = {
  scroller: HTMLElement;
  writerAvailable: boolean;
  role: ViewerRole;
  path: string;
};

export type AsrMoveResult = {
  method: 'writer' | 'pixel';
  writerCommitted: boolean;
  beforeTop: number;
  afterTop: number;
  movedPx: number;
  snapSuppressed?: boolean;
  directWriteBlocked?: boolean;
  targetPreservedForEasing?: boolean;
};

export type CueBridgeSkipReason = 'blank' | 'cue' | 'note' | 'speaker';

export type CueBridgeScanResult = {
  nextOffset: number | null;
  skippedReasons: CueBridgeSkipReason[];
};

export type AsrMovementAuthority =
  | 'none'
  | 'weak'
  | 'strong'
  | 'proof'
  | 'reconcile';

export type AsrMovementAuthorityDecision = {
  authority: AsrMovementAuthority;
  current: number;
  target: number;
  bestIdx: number;
  bestSim: number;
  reason: string;
  proofSource?: string;
  sourceBranch: string;
  bypassDownstreamVeto: boolean;
};

export type AsrMovementAuthorityContext = {
  current: number;
  target: number;
  bestIdx: number;
  bestSim: number;
  starvationMs: number;
  speechRunningActual: boolean;
  isFinal: boolean;
  hasStrictLocalProof: boolean;
  hasAdjacentProof: boolean;
  hasBridgeLexicalProof: boolean;
  hasFinalForwardProof: boolean;
  proofSource?: string;
};

export type PendingSpeakableBridgeState = {
  semanticFrom: number;
  semanticTarget: number;
  visualCurrent: number;
  visualReducedTarget: number;
  skippedVisibleRows: number;
  proofSource: string;
  sourceBranch: string;
  createdAtMs: number;
  runKey: string;
  runGeneration: number | null;
};

export type StallCueRescuePolicy = {
  allow: boolean;
  directContentForwardRescue: boolean;
  blockedReason: string;
};

export type LiveProgressHeuristics = {
  lastAdvanceAtMs: number;
  lastStrongSyncAtMs: number;
  lastAcceptedForwardIndex: number;
  consecutiveNoAdvanceFrames: number;
  consecutiveWeakForwardSignals: number;
  estimatedBehindByLines: number;
};

export type AsrScrollDriverStats = {
  lastIngestAt: number;
  lastCommitAt: number;
  commitCount: number;
  eventsSinceCommit: number;
  finalsSinceCommit: number;
};

export type AsrVisualMode = 'track' | 'recover' | 'settle' | 'hold';

export type AsrSemanticSnapshot = {
  lineIdx: number;
  confidence: number;
  source: string;
  updatedAt: number;
};

export type AsrVisualAnchor = {
  anchorLineIdx: number;
  anchorKind: string;
  anchorViewportY: number;
  anchorCompatibleWithSemantic: boolean;
  matchedLineViewportY: number;
};

export type AsrRecoveryEpisode = {
  startedAt: number;
  expiresAt: number;
  protectedLineIdx: number;
  protectedTargetScrollTop: number;
  reason: 'visual_debt' | 'semantic_ahead';
};

export type AsrVisualControlIntent =
  | 'track'
  | 'recover'
  | 'forward_protect'
  | 'settle'
  | 'hold';

export type AsrRecoveryKind = 'none' | 'visual_debt' | 'semantic_ahead';

export type AsrScrollDecision = {
  mode: AsrVisualMode;
  anchorLineIdx: number;
  authority:
    | 'track_follow'
    | 'recover_visual_debt'
    | 'recover_semantic_ahead'
    | 'settle_hold'
    | 'hold';
  targetScrollTop: number;
  maxVelocityPxps: number;
  backwardAllowed: boolean;
  preserveUntilMs: number;
  reason: string;
  controlIntent: AsrVisualControlIntent;
  recoveryKind: AsrRecoveryKind;
  isTrueVisualRecovery: boolean;
  isForwardProtection: boolean;
};

export interface AsrScrollDriver {
  ingest(text: string, isFinal: boolean, detail?: TranscriptDetail): void;
  dispose(): void;
  setLastLineIndex(index: number): void;
  getLastLineIndex(): number;
  getStats(): AsrScrollDriverStats;
}
