import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
  resolve(process.cwd(), "src/hooks/useChatWorkspace.ts"),
  "utf8",
);

assert.match(source, /browserSttStopTimerRef/);
assert.match(source, /args\.speechRecognitionRef\.current\?\.abort\?\.\(\);/);
assert.match(source, /navigator\.mediaDevices\?\.getUserMedia/);
assert.match(source, /__hearthBrowserSttSettle/);
assert.match(source, /args\.browserSttStopTimerRef\.current = window\.setTimeout/);
assert.match(source, /Cleanup should only run when the hook unmounts\./);

console.log("[ok] hearth-chat-stt-smoke");
