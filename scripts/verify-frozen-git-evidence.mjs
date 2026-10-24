#!/usr/bin/env node
import { FROZEN_EVIDENCE_TRUST_ANCHOR_SHA256, verifyFrozenEvidence } from "./lib/forge-frozen-evidence.mjs";

const args = process.argv.slice(2);
const value = (name, fallback) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
};

try {
  const result = verifyFrozenEvidence({
    repositoryRoot: value("--repository-root", process.cwd()),
    scope: value("--scope", "all"),
    verifiedTree: value("--verified-tree", "HEAD"),
    trustAnchorSha256: value("--trust-anchor-sha256", FROZEN_EVIDENCE_TRUST_ANCHOR_SHA256),
    requireExactWorktreeBytes: args.includes("--require-exact-worktree-bytes"),
  });
  const output = args.includes("--details") ? result : { ...result, records: undefined };
  process.stdout.write(`${JSON.stringify(output)}\n`);
} catch (error) {
  process.stderr.write(`Frozen evidence verification failed: ${error.message}\n`);
  process.exitCode = 1;
}
