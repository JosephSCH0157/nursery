import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_BROWSER_STT_RESTARTS,
  getBrowserSttFatalErrorMessage,
  shouldRestartBrowserSttSession,
} from "../src/lib/browser-stt";

test("browser STT keeps recoverable Web Speech aborts in the restart lane", () => {
  assert.equal(getBrowserSttFatalErrorMessage("aborted"), null);
  assert.equal(getBrowserSttFatalErrorMessage("no-speech"), null);
  assert.equal(getBrowserSttFatalErrorMessage("network"), null);
});

test("browser STT only marks hardware and permission failures as fatal", () => {
  assert.equal(
    getBrowserSttFatalErrorMessage("audio-capture"),
    "No microphone is available for browser speech.",
  );
  assert.equal(
    getBrowserSttFatalErrorMessage("not-allowed"),
    "Microphone permission was blocked.",
  );
  assert.equal(
    getBrowserSttFatalErrorMessage("service-not-allowed"),
    "Microphone permission was blocked.",
  );
  assert.equal(getBrowserSttFatalErrorMessage("bad-grammar"), "Speech recognition error.");
});

test("browser STT restart guard stops only for manual stop, fatal error, or retry exhaustion", () => {
  assert.equal(shouldRestartBrowserSttSession({
    fatalErrorMessage: null,
    manualStopRequested: false,
    restartAttempts: 0,
  }), true);

  assert.equal(shouldRestartBrowserSttSession({
    fatalErrorMessage: null,
    manualStopRequested: true,
    restartAttempts: 0,
  }), false);

  assert.equal(shouldRestartBrowserSttSession({
    fatalErrorMessage: "Microphone permission was blocked.",
    manualStopRequested: false,
    restartAttempts: 0,
  }), false);

  assert.equal(shouldRestartBrowserSttSession({
    fatalErrorMessage: null,
    manualStopRequested: false,
    restartAttempts: MAX_BROWSER_STT_RESTARTS,
  }), false);
});
