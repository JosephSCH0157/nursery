import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

export const CERTIFIED_SOURCE_COMMIT = "87524f872e76f24de631d1cbf58580674c9df2a9";
export const HISTORICAL_MANIFEST_PATH = "docs/database/baseline/v1-gate1/historical-migrations.sha256.json";
export const HISTORICAL_MANIFEST_SHA256 = "66a094037af456e95b34ec0ca3fb18bcc791d296fa6c2619af9639a87f7d7f40";

const canonicalFiles = [
  [HISTORICAL_MANIFEST_PATH, HISTORICAL_MANIFEST_SHA256],
  ["database/canonical-baseline-v1/supabase/migrations/20261021020814_canonical_baseline_v1.sql", "73d2779c406b9428e7fdf189ab7ad084671cf1d03908041dbbe855816556c62e"],
  ["docs/database/baseline/v1-gate3/canonical-baseline-v1.manifest.json", "f0eaf080270dde1df59a77fb075f8e363d06ad46a67c0b12dcb84220c258f4c3"],
  ["docs/database/baseline/v1-gate3/canonical-application-catalog-fingerprint.json", "abeb5876b1acf0b23d6be8594c788e1fe700fe5c1abe44755ea1cf431c2ca3d7"],
  ["docs/database/baseline/v1-gate3/wrappers-extension-compatibility.json", "8b82e58a85b835641c42738a51e695b05b4c7871ae922a48dd192dca303defc1"],
];

const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const normalizePath = (value) => value.replaceAll("\\", "/");

function git(repositoryRoot, args, options = {}) {
  return execFileSync("git", ["-C", repositoryRoot, ...args], {
    encoding: options.encoding ?? "utf8",
    maxBuffer: options.maxBuffer ?? 128 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}
function resolveCommit(repositoryRoot, value, label) {
  try {
    return git(repositoryRoot, ["rev-parse", "--verify", `${value}^{commit}`]).trim();
  } catch {
    throw new Error(`${label} does not resolve to one commit: ${value}`);
  }
}

function readTree(repositoryRoot, commit) {
  const output = git(repositoryRoot, ["ls-tree", "-r", "-z", "--full-tree", commit], { encoding: "buffer" });
  const entries = new Map();
  for (const record of output.toString("utf8").split("\0")) {
    if (!record) continue;
    const match = /^(\d+) ([^ ]+) ([0-9a-f]+)\t(.+)$/.exec(record);
    if (!match) throw new Error(`Unexpected git ls-tree record: ${record}`);
    const item = { mode: match[1], type: match[2], oid: match[3], path: match[4] };
    if (entries.has(item.path)) throw new Error(`Ambiguous Git tree path: ${item.path}`);
    entries.set(item.path, item);
  }
  return entries;
}

function readBlobs(repositoryRoot, commit, paths) {
  const input = `${paths.map((item) => `${commit}:${item}`).join("\n")}\n`;
  const child = spawnSync("git", ["-C", repositoryRoot, "cat-file", "--batch"], {
    input,
    encoding: null,
    maxBuffer: 256 * 1024 * 1024,
  });
  if (child.status !== 0) throw new Error(`git cat-file failed: ${child.stderr?.toString("utf8").trim()}`);
  const blobs = new Map();
  let offset = 0;
  for (const relativePath of paths) {
    const newline = child.stdout.indexOf(10, offset);
    if (newline < 0) throw new Error(`Missing Git object header for ${relativePath}`);
    const header = child.stdout.subarray(offset, newline).toString("utf8");
    if (header.endsWith(" missing")) throw new Error(`Missing Git object for ${relativePath}`);
    const parts = header.split(" ");
    if (parts[1] !== "blob") throw new Error(`Protected object is not a blob: ${relativePath}`);
    const size = Number(parts[2]);
    if (!Number.isSafeInteger(size) || size < 0) throw new Error(`Invalid Git blob size for ${relativePath}`);
    const start = newline + 1;
    const end = start + size;
    if (child.stdout[end] !== 10) throw new Error(`Malformed Git batch output for ${relativePath}`);
    blobs.set(relativePath, Buffer.from(child.stdout.subarray(start, end)));
    offset = end + 1;
  }
  return blobs;
}

function parseJsonBlob(blobs, relativePath, schema) {
  const bytes = blobs.get(relativePath);
  if (!bytes) throw new Error(`Frozen JSON blob is unavailable: ${relativePath}`);
  const value = JSON.parse(bytes.toString("utf8"));
  if (schema && value.schema !== schema) throw new Error(`Unexpected schema in ${relativePath}`);
  return value;
}

function addFile(files, relativePath, expectedSha256, contract) {
  const normalized = normalizePath(relativePath);
  if (!normalized || path.posix.isAbsolute(normalized) || normalized.split("/").includes("..")) {
    throw new Error(`Unsafe protected path: ${relativePath}`);
  }
  const existing = files.get(normalized);
  if (existing && existing.expectedSha256 && expectedSha256 && existing.expectedSha256 !== expectedSha256) {
    throw new Error(`Conflicting expected hashes for ${normalized}`);
  }
  files.set(normalized, {
    path: normalized,
    expectedSha256: expectedSha256 ?? existing?.expectedSha256 ?? null,
    contracts: [...new Set([...(existing?.contracts ?? []), contract])],
  });
}

function collectContracts(repositoryRoot, head, source, scope) {
  const bootstrapPaths = [
    HISTORICAL_MANIFEST_PATH,
    "docs/database/baseline/v1-gate5b/pre-slice-a-fixture.manifest.json",
    "docs/database/baseline/v1-gate5d/tooling.sha256.json",
  ];
  const sourceBlobs = readBlobs(repositoryRoot, source, bootstrapPaths);
  const historical = parseJsonBlob(sourceBlobs, bootstrapPaths[0], "forge.historical-migration-manifest.v1");
  const preSlice = parseJsonBlob(sourceBlobs, bootstrapPaths[1], "forge.pre-slice-a-schema-fixture-manifest.v1");
  const gate5d = parseJsonBlob(sourceBlobs, bootstrapPaths[2], "forge.gate5d-tooling-manifest.v1");
  const files = new Map();
  const protectedRoots = new Set();

  if (["historical", "canonical", "all"].includes(scope)) {
    protectedRoots.add("supabase/migrations");
    protectedRoots.add("docs/database/reconciliation/slice-a/original");
    addFile(files, HISTORICAL_MANIFEST_PATH, HISTORICAL_MANIFEST_SHA256, "historical-manifest");
    for (const item of historical.migrations) addFile(files, item.path, item.sha256, "historical-migration");
    for (const amendment of historical.approvedHistoricalAmendments) {
      for (const kind of ["amended", "original"]) addFile(files, amendment[kind].path, amendment[kind].sha256, `historical-${kind}`);
    }
  }
  if (["canonical", "all"].includes(scope)) {
    protectedRoots.add("database/canonical-baseline-v1");
    protectedRoots.add("docs/database/baseline/v1-gate3");
    for (const [relativePath, expected] of canonicalFiles) addFile(files, relativePath, expected, "canonical");
  }
  if (["pre-slice", "all"].includes(scope)) {
    protectedRoots.add("database/historical-pre-slice-a-v1");
    addFile(files, bootstrapPaths[1], null, "pre-slice-manifest");
    for (const item of [
      preSlice.fixture,
      preSlice.structuralSource,
      { path: preSlice.hostedCatalogEvidence.queryPath, sha256: preSlice.hostedCatalogEvidence.querySha256 },
      { path: preSlice.hostedCatalogEvidence.fingerprintPath, sha256: preSlice.hostedCatalogEvidence.fingerprintFileSha256 },
      { path: preSlice.referenceData.allowlistPath, sha256: preSlice.referenceData.allowlistSha256 },
      { path: preSlice.referenceData.hostedVerificationQuery, sha256: preSlice.referenceData.hostedVerificationQuerySha256 },
    ]) addFile(files, item.path, item.sha256, "pre-slice");
    for (const [version, expected] of Object.entries(preSlice.pendingMigrationHashes)) {
      const matches = [...readTree(repositoryRoot, head).keys()].filter((item) => item.startsWith(`supabase/migrations/${version}_`) && item.endsWith(".sql"));
      if (matches.length !== 1) throw new Error(`Expected one pending migration for ${version}; found ${matches.length}`);
      addFile(files, matches[0], expected, "pre-slice-pending");
    }
  }
  if (["gate5d", "all"].includes(scope)) {
    addFile(files, bootstrapPaths[2], null, "gate5d-manifest");
    for (const item of gate5d.files) addFile(files, item.path, item.sha256, "gate5d");
  }
  if (!files.size) throw new Error(`Unknown frozen-evidence scope: ${scope}`);
  return { files: [...files.values()].sort((a, b) => a.path.localeCompare(b.path)), protectedRoots: [...protectedRoots], historical };
}

function classifyLegacyExpected(bytes, expected) {
  if (!expected) return "unrecorded";
  if (sha256(bytes) === expected) return "git-blob";
  const fullCrlf = Buffer.from(bytes.toString("utf8").replace(/(?<!\r)\n/g, "\r\n"), "utf8");
  if (sha256(fullCrlf) === expected) return "full-crlf-checkout";
  if (bytes.length && bytes.at(-1) === 10 && bytes.at(-2) !== 13) {
    const finalCrlf = Buffer.concat([bytes.subarray(0, -1), Buffer.from("\r\n")]);
    if (sha256(finalCrlf) === expected) return "final-crlf-checkout";
  }
  return "unexplained";
}

function parseNulList(buffer) {
  return buffer.toString("utf8").split("\0").filter(Boolean).map(normalizePath);
}

function assertRepository(repositoryRoot, verifiedTree, certifiedSourceTree) {
  const root = path.resolve(repositoryRoot);
  const actualRoot = path.resolve(git(root, ["rev-parse", "--show-toplevel"]).trim());
  if (actualRoot.toLowerCase() !== root.toLowerCase()) throw new Error(`Repository root mismatch: expected ${root}; found ${actualRoot}`);
  const head = resolveCommit(root, "HEAD", "HEAD");
  const verified = resolveCommit(root, verifiedTree, "Verified tree");
  if (verified !== head) throw new Error(`Verified tree must be the current HEAD: expected ${head}; found ${verified}`);
  const source = resolveCommit(root, certifiedSourceTree, "Certified source tree");
  if (source !== CERTIFIED_SOURCE_COMMIT && certifiedSourceTree === CERTIFIED_SOURCE_COMMIT) {
    throw new Error(`Certified source tree resolved unexpectedly: ${source}`);
  }
  return { root, head, source };
}

function checkAttributes(repositoryRoot, paths) {
  const input = `${paths.join("\n")}\n`;
  const child = spawnSync("git", ["-C", repositoryRoot, "check-attr", "-z", "--stdin", "filter", "working-tree-encoding"], {
    input,
    encoding: null,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (child.status !== 0) throw new Error(`git check-attr failed: ${child.stderr?.toString("utf8").trim()}`);
  const fields = parseNulList(child.stdout);
  for (let index = 0; index < fields.length; index += 3) {
    const [relativePath, attribute, value] = fields.slice(index, index + 3);
    if (value !== "unspecified") throw new Error(`Protected path uses unsupported ${attribute}=${value}: ${relativePath}`);
  }
}

function checkWorktree(repositoryRoot, headTree, files, protectedRoots = []) {
  const paths = files.map((item) => item.path);
  checkAttributes(repositoryRoot, paths);
  const pathInput = `${paths.join("\n")}\n`;
  const cleanHashes = spawnSync("git", ["-C", repositoryRoot, "hash-object", "--stdin-paths"], {
    input: pathInput,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (cleanHashes.status !== 0) throw new Error(`Unable to hash protected working files: ${cleanHashes.stderr.trim()}`);
  const hashes = cleanHashes.stdout.trim().split(/\r?\n/);
  if (hashes.length !== paths.length) throw new Error("Git returned an unexpected number of protected working-file hashes.");
  for (let index = 0; index < paths.length; index += 1) {
    if (hashes[index] !== headTree.get(paths[index]).oid) throw new Error(`Protected working content differs from HEAD: ${paths[index]}`);
  }

  const indexOutput = git(repositoryRoot, ["ls-files", "-s", "-z"], { encoding: "buffer" });
  const indexEntries = new Map();
  for (const record of parseNulList(indexOutput)) {
    const match = /^(\d+) ([0-9a-f]+) (\d+)\t(.+)$/.exec(record);
    if (!match || match[3] !== "0") throw new Error(`Unexpected protected index entry: ${record}`);
    indexEntries.set(match[4], { mode: match[1], oid: match[2] });
  }
  for (const relativePath of paths) {
    const item = indexEntries.get(relativePath);
    const tree = headTree.get(relativePath);
    if (!item || item.oid !== tree.oid || item.mode !== tree.mode) throw new Error(`Protected staged content differs from HEAD: ${relativePath}`);
  }

  const allTracked = parseNulList(git(repositoryRoot, ["ls-files", "-z"], { encoding: "buffer" }));
  const folded = new Map();
  for (const tracked of allTracked) {
    const key = tracked.toLowerCase();
    if (folded.has(key) && folded.get(key) !== tracked && (paths.includes(tracked) || paths.includes(folded.get(key)))) {
      throw new Error(`Case-colliding protected paths: ${folded.get(key)} and ${tracked}`);
    }
    folded.set(key, tracked);
  }
  const protectedFolded = new Map(paths.map((item) => [item.toLowerCase(), item]));
  const untracked = parseNulList(git(repositoryRoot, ["ls-files", "--others", "--exclude-standard", "-z"], { encoding: "buffer" }));
  for (const item of untracked) {
    const collision = protectedFolded.get(item.toLowerCase());
    const protectedRoot = protectedRoots.find((root) => item === root || item.startsWith(`${root}/`));
    if (collision || protectedRoot || paths.some((protectedPath) => item.startsWith(`${protectedPath}/`) || protectedPath.startsWith(`${item}/`))) {
      throw new Error(`Unexpected untracked protected-path collision: ${item}${collision ? ` (${collision})` : ""}`);
    }
  }
}

function verifyFileSet({ root, head, source, files, scope, protectedRoots = [], requireExactWorktreeBytes = false }) {
  const paths = files.map((item) => item.path);
  const headTree = readTree(root, head);
  const sourceTree = readTree(root, source);
  for (const item of files) {
    const current = headTree.get(item.path);
    const certified = sourceTree.get(item.path);
    if (!current || current.type !== "blob" || !["100644", "100755"].includes(current.mode)) throw new Error(`Missing, ambiguous, or unsupported protected Git object: ${item.path}`);
    if (!certified || certified.type !== "blob") throw new Error(`Protected path is absent from the certified source tree: ${item.path}`);
    if (current.oid !== certified.oid || current.mode !== certified.mode) throw new Error(`Protected Git object differs from certified source: ${item.path}`);
  }
  const blobs = readBlobs(root, head, paths);
  const records = files.map((item) => {
    const bytes = blobs.get(item.path);
    const blobSha256 = sha256(bytes);
    const expectedMode = classifyLegacyExpected(bytes, item.expectedSha256);
    if (item.expectedSha256 && expectedMode === "unexplained") throw new Error(`Frozen expected hash has no approved byte relationship to the certified blob: ${item.path}`);
    const fullPath = path.join(root, ...item.path.split("/"));
    const workingPath = fs.lstatSync(fullPath);
    if (!workingPath.isFile() || workingPath.isSymbolicLink()) throw new Error(`Protected working path is not a regular file: ${item.path}`);
    return {
      path: item.path,
      oid: headTree.get(item.path).oid,
      blobSha256,
      expectedSha256: item.expectedSha256,
      expectedMode,
      worktreeSha256: sha256(fs.readFileSync(fullPath)),
      contracts: item.contracts,
    };
  });
  checkWorktree(root, headTree, files, protectedRoots);
  const modes = Object.fromEntries([...new Set(records.map((item) => item.expectedMode))].sort().map((mode) => [mode, records.filter((item) => item.expectedMode === mode).length]));
  const worktreeByteDifferences = records.filter((item) => item.worktreeSha256 !== item.blobSha256).length;
  if (requireExactWorktreeBytes && worktreeByteDifferences !== 0) {
    throw new Error(`Protected execution bytes differ from canonical Git blobs for ${worktreeByteDifferences} file(s). Run the frozen-evidence materializer first.`);
  }
  return {
    ok: true,
    schema: "forge.frozen-git-evidence-result.v1",
    repositoryRoot: root,
    verifiedCommit: head,
    certifiedSourceCommit: source,
    scope,
    fileCount: records.length,
    expectedModes: modes,
    requireExactWorktreeBytes,
    worktreeByteDifferences,
    records,
  };
}

export function verifyFrozenPathSet({ repositoryRoot, files, protectedRoots = [], verifiedTree = "HEAD", certifiedSourceTree, requireExactWorktreeBytes = false } = {}) {
  if (!Array.isArray(files) || !files.length) throw new Error("At least one protected file contract is required.");
  const { root, head, source } = assertRepository(repositoryRoot, verifiedTree, certifiedSourceTree);
  const normalized = files.map((item) => ({
    path: normalizePath(item.path),
    expectedSha256: item.expectedSha256 ?? null,
    contracts: item.contracts ?? ["test-contract"],
  }));
  return verifyFileSet({ root, head, source, files: normalized, scope: "explicit", protectedRoots, requireExactWorktreeBytes });
}

export function verifyFrozenEvidence({
  repositoryRoot,
  scope = "all",
  verifiedTree = "HEAD",
  certifiedSourceTree = CERTIFIED_SOURCE_COMMIT,
  requireExactWorktreeBytes = false,
} = {}) {
  const { root, head, source } = assertRepository(repositoryRoot, verifiedTree, certifiedSourceTree);
  const { files, protectedRoots } = collectContracts(root, head, source, scope);
  return verifyFileSet({ root, head, source, files, scope, protectedRoots, requireExactWorktreeBytes });
}

export function materializeFrozenEvidence(options = {}) {
  const before = verifyFrozenEvidence(options);
  const blobs = readBlobs(before.repositoryRoot, before.verifiedCommit, before.records.map((item) => item.path));
  let changed = 0;
  for (const item of before.records) {
    const target = path.join(before.repositoryRoot, ...item.path.split("/"));
    const bytes = blobs.get(item.path);
    if (!fs.readFileSync(target).equals(bytes)) {
      fs.writeFileSync(target, bytes, { flag: "w" });
      changed += 1;
    }
  }
  const after = verifyFrozenEvidence({ ...options, requireExactWorktreeBytes: true });
  if (after.worktreeByteDifferences !== 0) throw new Error("Canonical frozen-byte materialization was incomplete.");
  return { ...after, materializedFiles: changed };
}
