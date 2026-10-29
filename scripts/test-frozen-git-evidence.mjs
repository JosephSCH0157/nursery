#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  FROZEN_EVIDENCE_TRUST_ANCHOR_PATH,
  FROZEN_EVIDENCE_TRUST_ANCHOR_SHA256,
  GATE6T_FROZEN_SUCCESSOR_PATH,
  GATE6T_FROZEN_SUCCESSOR_SHA256,
  verifyFrozenEvidence,
  verifyFrozenPathSet,
} from "./lib/forge-frozen-evidence.mjs";

const repositoryRoot = path.resolve(process.argv[2] ?? process.cwd());
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const git = (root, args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const expectFailure = (label, action, pattern) => {
  assert.throws(action, pattern, label);
  return true;
};

const actual = verifyFrozenEvidence({ repositoryRoot, scope: "historical" });
assert.equal(actual.trustAnchorSha256, FROZEN_EVIDENCE_TRUST_ANCHOR_SHA256);
assert.equal(actual.certifiedSourceCommit, "87524f872e76f24de631d1cbf58580674c9df2a9");
assert.equal(actual.expectedModes["final-crlf-checkout"], 5);
assert.equal(actual.expectedModes["full-crlf-checkout"], 233);
assert.equal(actual.expectedModes["git-blob"], 179);
const mixed = actual.records.filter((item) => item.expectedMode === "final-crlf-checkout").map((item) => item.path);
assert.deepEqual(mixed, [
  "supabase/migrations/20260301101500_tongs_recording_session_items.sql",
  "supabase/migrations/20260302110000_tongs_barstock_projects_and_links.sql",
  "supabase/migrations/20260303020000_tongs_workspace_team_rpcs.sql",
  "supabase/migrations/20260303023000_tongs_workspace_team_list_rpcs.sql",
  "supabase/migrations/20260303030000_tongs_workspace_team_hardening.sql",
]);

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "forge-frozen-evidence-test-"));
const publishedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "forge-frozen-evidence-published-test-"));
try {
  git(temporaryRoot, ["init", "--quiet"]);
  git(temporaryRoot, ["config", "user.name", "Forge certification"]);
  git(temporaryRoot, ["config", "user.email", "forge-certification@example.invalid"]);
  git(temporaryRoot, ["config", "core.autocrlf", "false"]);
  fs.mkdirSync(path.join(temporaryRoot, "protected"));
  fs.writeFileSync(path.join(temporaryRoot, ".gitattributes"), "* text=auto\n", "utf8");
  const canonical = Buffer.from("alpha\nbeta\n", "utf8");
  const finalCrlf = Buffer.from("alpha\nbeta\r\n", "utf8");
  fs.writeFileSync(path.join(temporaryRoot, "protected", "plain.sql"), canonical);
  fs.writeFileSync(path.join(temporaryRoot, "protected", "mixed.sql"), canonical);
  git(temporaryRoot, ["add", "."]);
  git(temporaryRoot, ["commit", "--quiet", "-m", "fixture"]);
  const source = git(temporaryRoot, ["rev-parse", "HEAD"]);
  const files = [
    { path: "protected/plain.sql", expectedSha256: sha256(canonical), contracts: ["plain"] },
    { path: "protected/mixed.sql", expectedSha256: sha256(finalCrlf), contracts: ["mixed-final"] },
  ];
  const options = { repositoryRoot: temporaryRoot, files, protectedRoots: ["protected"], certifiedSourceTree: source };
  const clean = verifyFrozenPathSet(options);
  assert.equal(clean.expectedModes["git-blob"], 1);
  assert.equal(clean.expectedModes["final-crlf-checkout"], 1);

  git(temporaryRoot, ["config", "core.autocrlf", "true"]);
  fs.writeFileSync(path.join(temporaryRoot, "protected", "plain.sql"), "alpha\r\nbeta\r\n", "utf8");
  const crlf = verifyFrozenPathSet(options);
  assert.equal(crlf.worktreeByteDifferences, 1, "CRLF materialization must remain visible but semantically clean");
  expectFailure(
    "execution byte identity",
    () => verifyFrozenPathSet({ ...options, requireExactWorktreeBytes: true }),
    /execution bytes differ/,
  );

  fs.writeFileSync(path.join(temporaryRoot, "protected", "plain.sql"), "alpha\r\nchanged\r\n", "utf8");
  expectFailure("unstaged content", () => verifyFrozenPathSet(options), /working content differs/);
  git(temporaryRoot, ["restore", "--worktree", "protected/plain.sql"]);

  fs.writeFileSync(path.join(temporaryRoot, "protected", "plain.sql"), "alpha\nchanged\n", "utf8");
  git(temporaryRoot, ["add", "protected/plain.sql"]);
  git(temporaryRoot, ["restore", "--worktree", "--source=HEAD", "protected/plain.sql"]);
  expectFailure("staged content", () => verifyFrozenPathSet(options), /staged content differs/);
  git(temporaryRoot, ["restore", "--staged", "--worktree", "protected/plain.sql"]);

  fs.writeFileSync(path.join(temporaryRoot, "protected", "unexpected.sql"), "select 1;\n", "utf8");
  expectFailure("untracked protected path", () => verifyFrozenPathSet(options), /untracked protected-path/);
  fs.rmSync(path.join(temporaryRoot, "protected", "unexpected.sql"));

  expectFailure("missing source", () => verifyFrozenPathSet({ ...options, certifiedSourceTree: "deadbeef" }), /does not resolve/);
  expectFailure(
    "incorrect repository root",
    () => verifyFrozenPathSet({ ...options, repositoryRoot: path.join(temporaryRoot, "protected") }),
    /Repository root mismatch/,
  );
  git(temporaryRoot, ["checkout", "--quiet", "-b", "other"]);
  fs.writeFileSync(path.join(temporaryRoot, "protected", "plain.sql"), "branch-change\n", "utf8");
  git(temporaryRoot, ["add", "protected/plain.sql"]);
  git(temporaryRoot, ["commit", "--quiet", "-m", "other tree"]);
  expectFailure("different branch object", () => verifyFrozenPathSet(options), /differs from certified source/);
  expectFailure("incorrect verified tree", () => verifyFrozenPathSet({ ...options, verifiedTree: source }), /must be the current HEAD/);

  git(publishedRoot, ["init", "--quiet"]);
  git(publishedRoot, ["config", "user.name", "Forge certification"]);
  git(publishedRoot, ["config", "user.email", "forge-certification@example.invalid"]);
  // The trust-successor contract is bound to the certified predecessor commit.
  // Ordinary PR jobs receive only a synthetic merge commit. The separately
  // pinned successor must therefore remain verifiable from its current Git
  // objects without requiring either authorized source history to be present.
  git(publishedRoot, ["fetch", "--quiet", "--depth=1", repositoryRoot, "HEAD"]);
  git(publishedRoot, ["checkout", "--quiet", "--detach", "FETCH_HEAD"]);
  const published = verifyFrozenEvidence({ repositoryRoot: publishedRoot, scope: "all", requireExactWorktreeBytes: true });
  assert.equal(published.fileCount, 451);
  assert.equal(published.successorFileCount, 6);
  assert.equal(published.trustAnchorSha256, FROZEN_EVIDENCE_TRUST_ANCHOR_SHA256);
  assert.equal(published.trustSuccessorSha256, GATE6T_FROZEN_SUCCESSOR_SHA256);
  assert.equal(published.trustSuccessorProtectedChangeCount, 8);
  assert.throws(
    () => git(publishedRoot, ["cat-file", "-e", `${published.certifiedSourceCommit}^{commit}`]),
    "fresh published-history fixture must not contain the local-only certified source commit",
  );
  assert.throws(
    () => git(publishedRoot, ["cat-file", "-e", `${published.trustSuccessorAuthorizedSourceCommit}^{commit}`]),
    "fresh published-history fixture must not require the Gate 6T authorized source commit",
  );

  fs.appendFileSync(path.join(publishedRoot, ...GATE6T_FROZEN_SUCCESSOR_PATH.split("/")), "\n", "utf8");
  expectFailure("unstaged trust successor", () => verifyFrozenEvidence({ repositoryRoot: publishedRoot, scope: "all" }), /successor working bytes differ/);
  git(publishedRoot, ["restore", "--worktree", GATE6T_FROZEN_SUCCESSOR_PATH]);
  fs.appendFileSync(path.join(publishedRoot, ...GATE6T_FROZEN_SUCCESSOR_PATH.split("/")), "\n", "utf8");
  git(publishedRoot, ["add", GATE6T_FROZEN_SUCCESSOR_PATH]);
  git(publishedRoot, ["commit", "--quiet", "-m", "tamper successor contract"]);
  expectFailure("committed trust successor", () => verifyFrozenEvidence({ repositoryRoot: publishedRoot, scope: "all" }), /successor SHA-256 mismatch/);
  git(publishedRoot, ["reset", "--hard", "--quiet", "HEAD^"]);

  const unauthorizedProtectedPath = published.records.find((item) => !item.contracts.includes("gate6t-trust-successor")).path;
  fs.appendFileSync(path.join(publishedRoot, ...unauthorizedProtectedPath.split("/")), "\n", "utf8");
  git(publishedRoot, ["add", unauthorizedProtectedPath]);
  git(publishedRoot, ["commit", "--quiet", "-m", "tamper unapproved protected object"]);
  expectFailure("unapproved protected change", () => verifyFrozenEvidence({ repositoryRoot: publishedRoot, scope: "all" }), /Protected Git object differs/);
  git(publishedRoot, ["reset", "--hard", "--quiet", "HEAD^"]);

  const approvedProtectedPath = published.records.find((item) => item.contracts.includes("gate6t-trust-successor")).path;
  fs.appendFileSync(path.join(publishedRoot, ...approvedProtectedPath.split("/")), "\n", "utf8");
  git(publishedRoot, ["add", approvedProtectedPath]);
  git(publishedRoot, ["commit", "--quiet", "-m", "tamper approved protected successor"]);
  expectFailure("changed approved successor", () => verifyFrozenEvidence({ repositoryRoot: publishedRoot, scope: "all" }), /does not match the current protected tree/);
  git(publishedRoot, ["reset", "--hard", "--quiet", "HEAD^"]);

  fs.appendFileSync(path.join(publishedRoot, ...FROZEN_EVIDENCE_TRUST_ANCHOR_PATH.split("/")), "\n", "utf8");
  expectFailure("unstaged trust anchor", () => verifyFrozenEvidence({ repositoryRoot: publishedRoot, scope: "all" }), /trust anchor working bytes differ/);
  git(publishedRoot, ["restore", "--worktree", FROZEN_EVIDENCE_TRUST_ANCHOR_PATH]);
  fs.appendFileSync(path.join(publishedRoot, ...FROZEN_EVIDENCE_TRUST_ANCHOR_PATH.split("/")), "\n", "utf8");
  git(publishedRoot, ["add", FROZEN_EVIDENCE_TRUST_ANCHOR_PATH]);
  git(publishedRoot, ["commit", "--quiet", "-m", "tamper anchor"]);
  expectFailure("committed trust anchor", () => verifyFrozenEvidence({ repositoryRoot: publishedRoot, scope: "all" }), /trust-anchor SHA-256 mismatch/);
  git(publishedRoot, ["reset", "--hard", "--quiet", "HEAD^"]);
  fs.rmSync(path.join(publishedRoot, ...FROZEN_EVIDENCE_TRUST_ANCHOR_PATH.split("/")));
  git(publishedRoot, ["add", FROZEN_EVIDENCE_TRUST_ANCHOR_PATH]);
  git(publishedRoot, ["commit", "--quiet", "-m", "remove anchor"]);
  expectFailure("missing trust anchor", () => verifyFrozenEvidence({ repositoryRoot: publishedRoot, scope: "all" }), /Missing Git object/);

  process.stdout.write(`${JSON.stringify({
    ok: true,
    schema: "forge.frozen-git-evidence-test-result.v1",
    historicalFiles: actual.fileCount,
    mixedFinalNewlineFiles: mixed,
    windowsCrlfMaterialization: true,
    negativeTests: {
      unstaged: true,
      staged: true,
      untracked: true,
      missingObject: true,
      incorrectRepository: true,
      wrongBranchObject: true,
      wrongVerifiedTree: true,
      executionByteIdentity: true,
      freshPublishedHistory: true,
      trustAnchorTamper: true,
      trustSuccessorTamper: true,
      unapprovedProtectedChange: true,
      changedApprovedSuccessor: true,
      missingTrustAnchor: true,
    },
  })}\n`);
} finally {
  const resolved = path.resolve(temporaryRoot);
  if (!resolved.startsWith(path.resolve(os.tmpdir())) || !path.basename(resolved).startsWith("forge-frozen-evidence-test-")) {
    throw new Error(`Unsafe temporary cleanup target: ${resolved}`);
  }
  fs.rmSync(resolved, { recursive: true, force: true });
  const publishedResolved = path.resolve(publishedRoot);
  if (!publishedResolved.startsWith(path.resolve(os.tmpdir())) || !path.basename(publishedResolved).startsWith("forge-frozen-evidence-published-test-")) {
    throw new Error(`Unsafe published-history cleanup target: ${publishedResolved}`);
  }
  fs.rmSync(publishedResolved, { recursive: true, force: true });
}
