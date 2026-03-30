export const MAX_BROWSER_STT_RESTARTS = 2;

export type BrowserSttSessionState = {
  fatalErrorMessage: string | null;
  manualStopRequested: boolean;
  restartAttempts: number;
};

export function getBrowserSttFatalErrorMessage(errorCode: string): string | null {
  const code = errorCode.trim().toLowerCase();
  if (!code || code === "aborted" || code === "no-speech" || code === "network") {
    return null;
  }
  if (code === "audio-capture") {
    return "No microphone is available for browser speech.";
  }
  if (code === "not-allowed" || code === "service-not-allowed") {
    return "Microphone permission was blocked.";
  }
  return "Speech recognition error.";
}

export function shouldRestartBrowserSttSession(
  session: BrowserSttSessionState,
  maxRestartAttempts = MAX_BROWSER_STT_RESTARTS,
): boolean {
  return !session.manualStopRequested
    && !session.fatalErrorMessage
    && session.restartAttempts < maxRestartAttempts;
}
