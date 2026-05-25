export type Asr4AuthorityStatus = 'authorize' | 'hold' | 'freeze';

export type Asr4AdvisoryRole = 'advisory_only';

export type Asr4MarkerPocketKind = 'safe' | 'near_rail' | 'bottom_lock' | 'unknown';

export type Asr4RecoveryStateKind = 'healthy' | 'recovering' | 'freeze';

export type Asr4MotionMode = 'eased_follow';

export const ASR4_LOCAL_AUTHORITY_DECISION = 'ASR4_LOCAL_AUTHORITY_DECISION' as const;
export const ASR4_WHISPER_ADVISORY_EVIDENCE = 'ASR4_WHISPER_ADVISORY_EVIDENCE' as const;
export const ASR4_FRESH_TAIL_VETO = 'ASR4_FRESH_TAIL_VETO' as const;
export const ASR4_MARKER_POCKET_STATE = 'ASR4_MARKER_POCKET_STATE' as const;
export const ASR4_RECOVERY_BUDGET_STATE = 'ASR4_RECOVERY_BUDGET_STATE' as const;
export const ASR4_RECOVERY_BUDGET_VIOLATION = 'ASR4_RECOVERY_BUDGET_VIOLATION' as const;
export const ASR4_RECOVERY_BUDGET_AUTHORITY_APPLIED = 'ASR4_RECOVERY_BUDGET_AUTHORITY_APPLIED' as const;
export const ASR4_VISUAL_RECOVERY_STATE = 'ASR4_VISUAL_RECOVERY_STATE' as const;
export const ASR4_VISUAL_RECOVERY_AUTHORITY_APPLIED = 'ASR4_VISUAL_RECOVERY_AUTHORITY_APPLIED' as const;
export const ASR4_POCKET_DRIFT_STATE = 'ASR4_POCKET_DRIFT_STATE' as const;
export const ASR4_POCKET_DRIFT_AUTHORITY_APPLIED = 'ASR4_POCKET_DRIFT_AUTHORITY_APPLIED' as const;
export const ASR4_MOTION_RENDER_REQUEST = 'ASR4_MOTION_RENDER_REQUEST' as const;

export type Asr4LocalAuthorityInput = {
  currentLine: number;
  requestedTargetLine: number;
  freshNearbyProof: boolean;
  nearbyProofLine: number | null;
  maxForwardLines?: number;
};

export type Asr4LocalAuthorityDecision = {
  tag: typeof ASR4_LOCAL_AUTHORITY_DECISION;
  lane: 'local_authority';
  status: Asr4AuthorityStatus;
  canAuthorizeMovement: boolean;
  hasFreshNearbyProof: boolean;
  requestedTargetLine: number;
  boundedTargetLine: number | null;
  boundedDeltaLines: number;
  reason: string;
};

export type Asr4WhisperAdvisoryInput = {
  hintLine: number | null;
  referenceLine?: number | null;
  confidence?: number | null;
  transcriptAgeMs?: number | null;
  correctionKind?: 'reference' | 'reanchor_hint' | 'none';
};

export type Asr4WhisperAdvisoryEvidence = {
  tag: typeof ASR4_WHISPER_ADVISORY_EVIDENCE;
  lane: 'whisper_advisory';
  role: Asr4AdvisoryRole;
  canAuthorizeMovement: false;
  hintLine: number | null;
  referenceLine: number | null;
  confidence: number | null;
  transcriptAgeMs: number | null;
  correctionKind: 'reference' | 'reanchor_hint' | 'none';
  reason: string;
};

export type Asr4FreshTailVetoInput = {
  freshTailText: string;
  nearbyScriptText: string;
  tailMatchesNearbyScript: boolean;
  rollingContextMatchesScript?: boolean;
};

export type Asr4FreshTailVetoResult = {
  tag: typeof ASR4_FRESH_TAIL_VETO;
  lane: 'fresh_tail_veto';
  status: Extract<Asr4AuthorityStatus, 'hold' | 'freeze'>;
  vetoActive: boolean;
  movementAllowed: boolean;
  freshTailText: string;
  nearbyScriptText: string;
  rollingContextMatchesScript: boolean;
  reason: string;
};

export type Asr4MarkerPocketInput = {
  markerViewportLine: number | null;
  readViewportLine: number | null;
};

export type Asr4MarkerPocketState = {
  tag: typeof ASR4_MARKER_POCKET_STATE;
  lane: 'marker_pocket';
  pocketState: Asr4MarkerPocketKind;
  markerViewportLine: number;
  readViewportLine: number;
  distanceFromMarkerLines: number | null;
  pocketTopLine: number | null;
  pocketBottomLine: number | null;
  reason: string;
};

export type Asr4RecoveryBudgetInput = {
  msSinceSafeReanchor: number;
  hasSafeReanchor: boolean;
  hasFreshLocalProof: boolean;
  targetRecoveryMs?: number;
  freezeCeilingMs?: number;
};

export type Asr4RecoveryBudgetState = {
  tag: typeof ASR4_RECOVERY_BUDGET_STATE;
  lane: 'recovery_budget';
  recoveryState: Asr4RecoveryStateKind;
  movementAllowed: boolean;
  msSinceSafeReanchor: number;
  targetRecoveryMs: number;
  freezeCeilingMs: number;
  waitingForFreshLocalProof: boolean;
  reason: string;
};

export type Asr4MotionContractInput = {
  authorityTargetLine: number | null;
  currentVisibleLine: number;
  currentScrollTop: number;
  targetScrollTop: number | null;
};

export type Asr4MotionRenderRequest = {
  tag: typeof ASR4_MOTION_RENDER_REQUEST;
  lane: 'motion_renderer';
  mode: Asr4MotionMode;
  immediateAuthorityTargetLine: number | null;
  visibleTargetLine: number | null;
  currentVisibleLine: number;
  currentScrollTop: number;
  targetScrollTop: number | null;
  requiresEasedMovement: boolean;
  reason: string;
};

export type Asr4AuthorityPipelineInput = {
  localAuthority: Asr4LocalAuthorityInput;
  whisperAdvisory: Asr4WhisperAdvisoryInput;
  freshTailVeto: Asr4FreshTailVetoInput;
  markerPocket: Asr4MarkerPocketInput;
  recoveryBudget: Asr4RecoveryBudgetInput;
  motion: Omit<Asr4MotionContractInput, 'authorityTargetLine'>;
};

export type Asr4AuthorityDecision = {
  localAuthority: Asr4LocalAuthorityDecision;
  whisperAdvisory: Asr4WhisperAdvisoryEvidence;
  freshTailVeto: Asr4FreshTailVetoResult;
  markerPocket: Asr4MarkerPocketState;
  recoveryBudget: Asr4RecoveryBudgetState;
  motionRequest: Asr4MotionRenderRequest;
  finalMovementAllowed: boolean;
  finalTargetLine: number | null;
  freezeReason: string | null;
};

export type Asr4FreshTailShadowSnapshot = {
  runKey: string;
  runGeneration: number | null;
  transcriptSource: string;
  currentLine: number;
  candidateTargetLine: number | null;
  legacyMoved: boolean;
  legacyTargetLine: number | null;
  wouldFreeze: boolean;
  mismatch: boolean;
  reason: string;
  freshTailPreview: string;
  nearbyScriptPreview: string;
  rollingContextMatchesScript: boolean;
  previousLineMatched: boolean;
  currentLineMatched: boolean;
  forwardLineMatched: boolean;
  selectedNearbyWindow: 'previous' | 'current' | 'forward' | 'unknown';
  packetMatchAnchorLine: number | null;
  packetMatchAnchorMatched: boolean;
  packetMatchAnchorSim: number | null;
  selectedAnchorSource: 'current_local' | 'packet_match_local';
};

export type Asr4RecoveryShadowSnapshot = {
  currentLine: number;
  targetLine: number | null;
  pendingBridgeAgeMs: number;
  sinceOnResultMs: number;
  sinceIngestMs: number;
  sinceCommitMs: number;
  commitCount: number;
  holdReason: string;
  sourceBranch: string;
  recoveryState: Asr4RecoveryStateKind;
  wouldFreeze: boolean;
  targetRecoveryMs: number;
  freezeCeilingMs: number;
  waitingForFreshLocalProof: boolean;
  movementAllowed: boolean;
  reason: string;
};
