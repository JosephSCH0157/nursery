#!/usr/bin/env node
import { CERTIFIED_SOURCE_COMMIT, verifyFrozenEvidence } from "./lib/forge-frozen-evidence.mjs";

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
    certifiedSourceTree: value("--certified-source-tree", CERTIFIED_SOURCE_COMMIT),
    requireExactWorktreeBytes: args.includes("--require-exact-worktree-bytes"),
  });
  const output = args.includes("--details") ? result : { ...result, records: undefined };
  process.stdout.write(`${JSON.stringify(output)}\n`);
} catch (error) {
  process.stderr.write(`Frozen evidence verification failed: ${error.message}\n`);
  process.exitCode = 1;
}
