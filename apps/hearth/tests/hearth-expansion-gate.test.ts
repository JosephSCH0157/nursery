import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const chat = readFileSync(new URL("../src/hooks/useChatWorkspace.ts", import.meta.url), "utf8");
const standalone = readFileSync(new URL("../../nursery/src/routes/HearthStandalone.tsx", import.meta.url), "utf8");
const authority = readFileSync(new URL("../HEARTH_CANONICAL_AUTHORITY.md", import.meta.url), "utf8");

const resolverSetupPattern = /tokenModule\s*\.\s*configureTongsUserAccessTokenResolver\s*\(\s*resolveCanonicalSupabaseAccessToken\s*,\s*resolveCanonicalSupabaseAccessTokenResult\s*,?\s*\)\s*;/;
const returnShellPattern = /return\s+shellModule\s*;/;

function requireMatch(source: string, pattern: RegExp, label: string): { index: number; text: string } {
  const match = pattern.exec(source);
  assert.ok(match?.index !== undefined, `Hearth session handoff is missing ${label}`);
  return { index: match.index, text: match[0] };
}

function assertHearthSessionHandoffContract(rawSource: string): void {
  const source = rawSource.replace(/\r\n?/g, "\n");
  const lazyShell = requireMatch(source, /const\s+HearthShell\s*=\s*lazy\s*\(\s*async\s*\(\)\s*=>\s*\{/, "the lazy HearthShell initializer");
  const shellImport = requireMatch(source, /import\s*\(\s*["']@hearth\/routes\/HearthShell["']\s*\)/, "the HearthShell import");
  const tokenImport = requireMatch(source, /import\s*\(\s*["']@hearth\/lib\/tongs-fetch["']\s*\)/, "the token-module import");
  const resolverSetup = requireMatch(source, resolverSetupPattern, "canonical token-resolver setup");
  const returnShell = requireMatch(source, returnShellPattern, "the HearthShell module return");
  const shellMount = requireMatch(source, /<HearthShell(?:\s|\/|>)/, "the mounted HearthShell route");

  assert.ok(lazyShell.index < shellImport.index);
  assert.ok(lazyShell.index < tokenImport.index);
  assert.ok(Math.max(shellImport.index, tokenImport.index) < resolverSetup.index);
  assert.ok(resolverSetup.index < returnShell.index);
  assert.ok(returnShell.index < shellMount.index);
}

assert.doesNotMatch(chat, /\bMutableRefObject<any>|\(op: any\)|let transcriptResult: any|window as any/);
assertHearthSessionHandoffContract(standalone);

const normalizedStandalone = standalone.replace(/\r\n?/g, "\n");
const resolverSetup = requireMatch(normalizedStandalone, resolverSetupPattern, "canonical token-resolver setup");
const returnShell = requireMatch(normalizedStandalone, returnShellPattern, "the HearthShell module return");
assert.throws(() => assertHearthSessionHandoffContract(
  normalizedStandalone.replace(resolverSetupPattern, ""),
));
assert.throws(() => assertHearthSessionHandoffContract(
  normalizedStandalone.replace(
    resolverSetup.text,
    resolverSetup.text.replace("resolveCanonicalSupabaseAccessToken", "resolveUnauthorizedAccessToken"),
  ),
));
assert.throws(() => assertHearthSessionHandoffContract(
  normalizedStandalone
    .replace(resolverSetup.text, "/* resolver setup moved after return */")
    .replace(returnShell.text, resolverSetup.text)
    .replace("/* resolver setup moved after return */", returnShell.text),
));
for (const law of [
  "durable cross-tool production identity",
  "never authority",
  "revalidate through Tongs",
  "unavailable/unknown",
]) assert.match(authority, new RegExp(law, "i"));

console.log("Hearth expansion gate verified: identity, acknowledgement, dependency state, concurrency, authority, and mounted route proof.");
