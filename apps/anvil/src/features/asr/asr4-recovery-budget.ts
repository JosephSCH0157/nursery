import {
  ASR4_RECOVERY_BUDGET_STATE,
  type Asr4RecoveryBudgetInput,
  type Asr4RecoveryBudgetState,
} from './asr4-authority.types';

export function evaluateAsr4RecoveryBudget(input: Asr4RecoveryBudgetInput): Asr4RecoveryBudgetState {
  const targetRecoveryMs = Math.max(1, Math.floor(input.targetRecoveryMs ?? 1500));
  const freezeCeilingMs = Math.max(targetRecoveryMs, Math.floor(input.freezeCeilingMs ?? 2000));
  const msSinceSafeReanchor = Math.max(0, Math.floor(input.msSinceSafeReanchor));

  if (input.hasSafeReanchor || input.hasFreshLocalProof) {
    return {
      tag: ASR4_RECOVERY_BUDGET_STATE,
      lane: 'recovery_budget',
      recoveryState: 'healthy',
      movementAllowed: true,
      msSinceSafeReanchor,
      targetRecoveryMs,
      freezeCeilingMs,
      waitingForFreshLocalProof: false,
      reason: input.hasFreshLocalProof ? 'fresh_local_proof_present' : 'safe_reanchor_present',
    };
  }

  if (msSinceSafeReanchor >= freezeCeilingMs) {
    return {
      tag: ASR4_RECOVERY_BUDGET_STATE,
      lane: 'recovery_budget',
      recoveryState: 'freeze',
      movementAllowed: false,
      msSinceSafeReanchor,
      targetRecoveryMs,
      freezeCeilingMs,
      waitingForFreshLocalProof: true,
      reason: 'recovery_budget_exhausted_waiting_for_fresh_local_proof',
    };
  }

  return {
    tag: ASR4_RECOVERY_BUDGET_STATE,
    lane: 'recovery_budget',
    recoveryState: 'recovering',
    movementAllowed: true,
    msSinceSafeReanchor,
    targetRecoveryMs,
    freezeCeilingMs,
    waitingForFreshLocalProof: false,
    reason: msSinceSafeReanchor >= targetRecoveryMs
      ? 'recovery_budget_target_missed'
      : 'recovery_in_budget',
  };
}

export function buildAsr4RecoveryBudgetDiagnostic(state: Asr4RecoveryBudgetState): string {
  return `[${state.tag}] recoveryState=${state.recoveryState} movementAllowed=${state.movementAllowed ? 1 : 0} msSinceSafeReanchor=${state.msSinceSafeReanchor} targetRecoveryMs=${state.targetRecoveryMs} freezeCeilingMs=${state.freezeCeilingMs} waitingForFreshLocalProof=${state.waitingForFreshLocalProof ? 1 : 0} reason=${state.reason}`;
}

