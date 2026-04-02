export interface HammerSessionActionControllerState {
  hasPendingSaveChanges: boolean;
  saveFailureMessage: string | null;
  reloadRequestNonce: number;
  saveRetryNonce: number;
}

export type HammerSessionActionId = "retry_save" | "reload_latest";

export function applyHammerSessionAction(
  state: HammerSessionActionControllerState,
  actionId: HammerSessionActionId,
): HammerSessionActionControllerState {
  if (actionId === "retry_save") {
    return {
      ...state,
      saveFailureMessage: null,
      saveRetryNonce: state.saveRetryNonce + 1,
    };
  }

  return {
    ...state,
    reloadRequestNonce: state.reloadRequestNonce + 1,
  };
}
