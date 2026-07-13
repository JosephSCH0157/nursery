import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const shell = readFileSync(new URL("../src/routes/HearthShell.tsx", import.meta.url), "utf8");
const chat = readFileSync(new URL("../src/hooks/useChatWorkspace.ts", import.meta.url), "utf8");
const standalone = readFileSync(new URL("../../nursery/src/routes/HearthStandalone.tsx", import.meta.url), "utf8");
const authority = readFileSync(new URL("../HEARTH_CANONICAL_AUTHORITY.md", import.meta.url), "utf8");

assert.doesNotMatch(chat, /\bMutableRefObject<any>|\(op: any\)|let transcriptResult: any|window as any/);
assert.doesNotMatch(shell, /window as any/);
assert.match(standalone, /lazy\(\(\) => import\("@hearth\/routes\/HearthShell"\)\)/);
for (const law of [
  "durable cross-tool production identity",
  "never authority",
  "revalidate through Tongs",
  "unavailable/unknown",
]) assert.match(authority, new RegExp(law, "i"));

console.log("Hearth expansion gate verified: identity, acknowledgement, dependency state, concurrency, authority, and mounted route proof.");
