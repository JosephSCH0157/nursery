#!/usr/bin/env node
import { CERTIFIED_SOURCE_COMMIT, materializeFrozenEvidence } from "./lib/forge-frozen-evidence.mjs";

const args = process.argv.slice(2);
const value = (name, fallback) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
};

try {
  const result = materializeFrozenEvidence({
    repositoryRoot: value("--repository-root", process.cwd()),
    scope: value("--scope", "all"),
    verifiedTree: value("--verified-tree", "HEAD"),
    certifiedSourceTree: value("--certified-source-tree", CERTIFIED_SOURCE_COMMIT),
  });
  const output = args.includes("--details") ? result : { ...result, records: undefined };
  process.stdout.write(`${JSON.stringify(output)}\n`);
} catch (error) {
  process.stderr.write(`Frozen evidence materialization failed: ${error.message}\n`);
  process.exitCode = 1;
}
