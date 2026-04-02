export interface HammerSessionHostLoopState {
  hasPendingSaveChanges: boolean;
  saveFailureMessage: string | null;
  historyRecoveryStatus: string | null;
  presenceConflictDetail: string | null;
}

export function resolveHammerReloadSuccess(
  state: HammerSessionHostLoopState,
): HammerSessionHostLoopState {
  return {
    ...state,
    hasPendingSaveChanges: false,
    saveFailureMessage: null,
    historyRecoveryStatus: null,
    presenceConflictDetail: null,
  };
}

export function resolveHammerReloadFailure(
  state: HammerSessionHostLoopState,
): HammerSessionHostLoopState {
  return state;
}

export function resolveHammerSaveSuccess(
  state: HammerSessionHostLoopState,
): HammerSessionHostLoopState {
  return {
    ...state,
    hasPendingSaveChanges: false,
    saveFailureMessage: null,
  };
}

export function resolveHammerSaveFailure(
  state: HammerSessionHostLoopState,
  message: string,
): HammerSessionHostLoopState {
  return {
    ...state,
    hasPendingSaveChanges: true,
    saveFailureMessage: message,
  };
}
