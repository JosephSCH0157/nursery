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

export type AsrScrollDriverStats = {
  lastIngestAt: number;
  lastCommitAt: number;
  commitCount: number;
  eventsSinceCommit: number;
  finalsSinceCommit: number;
};

export interface AsrScrollDriver {
  ingest(text: string, isFinal: boolean, detail?: TranscriptDetail): void;
  dispose(): void;
  setLastLineIndex(index: number): void;
  getLastLineIndex(): number;
  getStats(): AsrScrollDriverStats;
}
