import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

export const CERTIFIED_SOURCE_COMMIT = "87524f872e76f24de631d1cbf58580674c9df2a9";
export const CERTIFIED_SOURCE_TREE = "85816e221aa31e05f2ce634a5ee785ae00db20f5";
export const FROZEN_EVIDENCE_TRUST_ANCHOR_PATH = "docs/database/baseline/v1-gate6b/frozen-evidence-trust-anchor.v1.json";
export const FROZEN_EVIDENCE_TRUST_ANCHOR_SHA256 = "fca1dbd9f8d582db01a3cd03720b8feffb75ec243340f042b9df08adbb41ebcb";
export const GATE6T_FROZEN_SUCCESSOR_PATH = "docs/database/baseline/v1-gate6t/frozen-evidence-successor.v1.json";
export const GATE6T_FROZEN_SUCCESSOR_SHA256 = "a78a66f7495958c172b477391507af643539af80dc184b87794e2ceaf62df838";
export const GATE6H_SUCCESSOR_CONTRACT_PATH = "docs/database/baseline/v1-gate6h/successor-contract.v1.json";
export const GATE6H_SUCCESSOR_CONTRACT_SHA256 = "a424d05912c808467dd13957d0690d3f95a3f11cafe0089bcd7f87712cc8fd32";
export const GATE6O_SUCCESSOR_CONTRACT_PATH = "docs/database/baseline/v1-gate6o/successor-contract.v1.json";
export const GATE6O_SUCCESSOR_CONTRACT_SHA256 = "6faf15bd24a3b9b398ffd42027bdb7a993fdc51f40cfc46b084018ecbda2c87e";
export const GATE6P_SUCCESSOR_CONTRACT_PATH = "docs/database/baseline/v1-gate6p/successor-contract.v1.json";
export const GATE6P_SUCCESSOR_CONTRACT_SHA256 = "dc27fb7a84a6cbeb44bc9af91f1db51a6c82ff6fa7db32863a6f32e9c2963219";
export const RECORDING_AUTHORITY_SUCCESSOR_CONTRACT_PATH = "docs/database/baseline/v1-recording-authority/successor-contract.v1.json";
export const RECORDING_AUTHORITY_SUCCESSOR_CONTRACT_SHA256 = "0f43b227ad3714c33afc80fef9907a8a7fcb5a2ce69d851f28312c06c44fa74f";
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

function assertCurrentRepository(repositoryRoot, verifiedTree) {
  const root = path.resolve(repositoryRoot);
  const actualRoot = path.resolve(git(root, ["rev-parse", "--show-toplevel"]).trim());
  if (actualRoot.toLowerCase() !== root.toLowerCase()) throw new Error(`Repository root mismatch: expected ${root}; found ${actualRoot}`);
  const head = resolveCommit(root, "HEAD", "HEAD");
  const verified = resolveCommit(root, verifiedTree, "Verified tree");
  if (verified !== head) throw new Error(`Verified tree must be the current HEAD: expected ${head}; found ${verified}`);
  return { root, head };
}

function validateTrustAnchor(anchor) {
  if (anchor.schema !== "forge.frozen-evidence-trust-anchor.v1") throw new Error("Frozen evidence trust anchor has an unexpected schema.");
  if (anchor.repository !== "JosephSCH0157/nursery") throw new Error("Frozen evidence trust anchor has an unexpected repository identity.");
  if (anchor.certifiedSourceCommit !== CERTIFIED_SOURCE_COMMIT || anchor.certifiedSourceTree !== CERTIFIED_SOURCE_TREE) {
    throw new Error("Frozen evidence trust anchor has an unexpected certified source identity.");
  }
  if (anchor.fileCount !== 451 || !Array.isArray(anchor.files) || anchor.files.length !== anchor.fileCount) {
    throw new Error("Frozen evidence trust anchor is missing the complete 451-file contract.");
  }
  const allowedScopes = new Set(["historical", "canonical", "pre-slice", "gate5d"]);
  const paths = new Set();
  let previous = "";
  for (const item of anchor.files) {
    const normalized = normalizePath(item.path ?? "");
    if (!normalized || normalized !== item.path || path.posix.isAbsolute(normalized) || normalized.split("/").includes("..")) {
      throw new Error(`Frozen evidence trust anchor contains an unsafe path: ${item.path}`);
    }
    if (paths.has(normalized) || (previous && previous.localeCompare(normalized) >= 0)) {
      throw new Error(`Frozen evidence trust anchor paths are duplicated or unsorted: ${normalized}`);
    }
    if (!/^(100644|100755)$/.test(item.mode) || !/^[0-9a-f]{40}$/.test(item.oid) || !/^[0-9a-f]{64}$/.test(item.blobSha256)) {
      throw new Error(`Frozen evidence trust anchor has invalid object identity: ${normalized}`);
    }
    if (item.expectedSha256 !== null && !/^[0-9a-f]{64}$/.test(item.expectedSha256)) {
      throw new Error(`Frozen evidence trust anchor has an invalid legacy hash: ${normalized}`);
    }
    if (!Array.isArray(item.contracts) || !item.contracts.length || !Array.isArray(item.scopes) || !item.scopes.length || item.scopes.some((scope) => !allowedScopes.has(scope))) {
      throw new Error(`Frozen evidence trust anchor has an incomplete contract classification: ${normalized}`);
    }
    paths.add(normalized);
    previous = normalized;
  }
  const expectedScopeKeys = ["all", "canonical", "gate5d", "historical", "pre-slice"];
  if (!anchor.protectedRootsByScope || Object.keys(anchor.protectedRootsByScope).sort().join("\n") !== expectedScopeKeys.join("\n")) {
    throw new Error("Frozen evidence trust anchor has incomplete protected-root scopes.");
  }
  const expectedAllRoots = [
    "database/canonical-baseline-v1",
    "database/historical-pre-slice-a-v1",
    "docs/database/baseline/v1-gate3",
    "docs/database/reconciliation/slice-a/original",
    "supabase/migrations",
  ];
  if (anchor.protectedRootsByScope.all.join("\n") !== expectedAllRoots.join("\n")) {
    throw new Error("Frozen evidence trust anchor has an unexpected protected-root contract.");
  }
  for (const scope of expectedScopeKeys) {
    const roots = anchor.protectedRootsByScope[scope];
    if (!Array.isArray(roots) || new Set(roots).size !== roots.length || roots.some((root) => !expectedAllRoots.includes(root))) {
      throw new Error(`Frozen evidence trust anchor has invalid protected roots for scope: ${scope}`);
    }
  }
  if (!anchor.allowedTrackedPathsByRoot || typeof anchor.allowedTrackedPathsByRoot !== "object") {
    throw new Error("Frozen evidence trust anchor omits protected-root path membership.");
  }
  if (Object.keys(anchor.allowedTrackedPathsByRoot).sort().join("\n") !== [...expectedAllRoots].sort().join("\n")) {
    throw new Error("Frozen evidence trust anchor has unexpected protected-root membership keys.");
  }
  for (const protectedRoot of expectedAllRoots) {
    const allowed = anchor.allowedTrackedPathsByRoot[protectedRoot];
    if (!Array.isArray(allowed) || !allowed.length || new Set(allowed).size !== allowed.length) {
      throw new Error(`Frozen evidence trust anchor has incomplete tracked membership for: ${protectedRoot}`);
    }
    const sorted = [...allowed].sort();
    if (allowed.some((item, index) => item !== sorted[index] || !(item === protectedRoot || item.startsWith(`${protectedRoot}/`)))) {
      throw new Error(`Frozen evidence trust anchor has invalid tracked membership for: ${protectedRoot}`);
    }
  }
  for (const protectedPath of paths) {
    const root = expectedAllRoots.find((candidate) => protectedPath === candidate || protectedPath.startsWith(`${candidate}/`));
    if (root && !anchor.allowedTrackedPathsByRoot[root].includes(protectedPath)) {
      throw new Error(`Frozen evidence trust anchor omits protected path membership: ${protectedPath}`);
    }
  }
  return anchor;
}

function checkTrustAnchorCheckout(root, headTree, bytes) {
  const entry = headTree.get(FROZEN_EVIDENCE_TRUST_ANCHOR_PATH);
  if (!entry || entry.type !== "blob" || entry.mode !== "100644") throw new Error("Frozen evidence trust anchor is missing or has an unsupported mode.");
  checkAttributes(root, [FROZEN_EVIDENCE_TRUST_ANCHOR_PATH]);
  const target = path.join(root, ...FROZEN_EVIDENCE_TRUST_ANCHOR_PATH.split("/"));
  const workingPath = fs.lstatSync(target);
  if (!workingPath.isFile() || workingPath.isSymbolicLink() || !fs.readFileSync(target).equals(bytes)) {
    throw new Error("Frozen evidence trust anchor working bytes differ from HEAD.");
  }
  const index = git(root, ["ls-files", "-s", "--", FROZEN_EVIDENCE_TRUST_ANCHOR_PATH]).trim();
  const match = /^(\d+) ([0-9a-f]+) 0\t/.exec(index);
  if (!match || match[1] !== entry.mode || match[2] !== entry.oid) throw new Error("Frozen evidence trust anchor staged content differs from HEAD.");
}

function loadTrustAnchor(root, head, expectedSha256 = FROZEN_EVIDENCE_TRUST_ANCHOR_SHA256) {
  if (expectedSha256 !== FROZEN_EVIDENCE_TRUST_ANCHOR_SHA256) throw new Error("Unapproved frozen evidence trust-anchor commitment.");
  const headTree = readTree(root, head);
  const bytes = readBlobs(root, head, [FROZEN_EVIDENCE_TRUST_ANCHOR_PATH]).get(FROZEN_EVIDENCE_TRUST_ANCHOR_PATH);
  if (!bytes || sha256(bytes) !== expectedSha256) throw new Error("Frozen evidence trust-anchor SHA-256 mismatch.");
  checkTrustAnchorCheckout(root, headTree, bytes);
  return validateTrustAnchor(JSON.parse(bytes.toString("utf8")));
}

function loadGate6TFrozenSuccessor(root, head, anchor, expectedSha256 = GATE6T_FROZEN_SUCCESSOR_SHA256) {
  if (expectedSha256 !== GATE6T_FROZEN_SUCCESSOR_SHA256) throw new Error("Unapproved Gate 6T frozen-evidence successor commitment.");
  const headTree = readTree(root, head);
  const bytes = readBlobs(root, head, [GATE6T_FROZEN_SUCCESSOR_PATH]).get(GATE6T_FROZEN_SUCCESSOR_PATH);
  if (!bytes || sha256(bytes) !== expectedSha256) throw new Error("Gate 6T frozen-evidence successor SHA-256 mismatch.");
  const contract = JSON.parse(bytes.toString("utf8"));
  if (contract.schema !== "forge.gate6t-frozen-evidence-successor.v1" || contract.repository !== "JosephSCH0157/nursery") {
    throw new Error("Gate 6T frozen-evidence successor has an unexpected identity.");
  }
  if (contract.predecessor?.path !== FROZEN_EVIDENCE_TRUST_ANCHOR_PATH ||
      contract.predecessor?.sha256 !== FROZEN_EVIDENCE_TRUST_ANCHOR_SHA256 ||
      contract.authorizedSource?.commit !== "5316868a9148b89847c3289fc2acc5353642d4c4" ||
      contract.authorizedSource?.tree !== "036742b686befbdce218f27c90f3b4c78e916593" ||
      contract.rejectAdditionalProtectedChanges !== true ||
      contract.preserveProtectedPathMembership !== true) {
    throw new Error("Gate 6T frozen-evidence successor has an invalid predecessor, source identity, or fail-closed contract.");
  }
  const sourceProbe = spawnSync("git", ["-C", root, "rev-parse", "--verify", `${contract.authorizedSource.commit}^{commit}`], {
    encoding: "utf8",
  });
  const source = sourceProbe.status === 0 ? sourceProbe.stdout.trim() : null;
  if (source && (source !== contract.authorizedSource.commit || git(root, ["rev-parse", `${source}^{tree}`]).trim() !== contract.authorizedSource.tree)) {
    throw new Error("Gate 6T frozen-evidence successor authorized source identity differs.");
  }
  if (!Array.isArray(contract.protectedChanges) || contract.protectedChanges.length !== 8) {
    throw new Error("Gate 6T frozen-evidence successor must authorize exactly eight protected changes.");
  }
  const anchorFiles = new Map(anchor.files.map((item) => [item.path, item]));
  const sourceTree = source ? readTree(root, source) : null;
  const sourceBlobs = source ? readBlobs(root, source, contract.protectedChanges.map((item) => item.path)) : null;
  const changes = new Map();
  let previous = "";
  for (const item of contract.protectedChanges) {
    const normalized = normalizePath(item.path ?? "");
    if (!normalized || normalized !== item.path || path.posix.isAbsolute(normalized) || normalized.split("/").includes("..") ||
        (previous && previous.localeCompare(normalized) >= 0) || changes.has(normalized)) {
      throw new Error(`Gate 6T frozen-evidence successor contains an unsafe, duplicate, or unsorted path: ${item.path}`);
    }
    if (!/^(100644|100755)$/.test(item.mode ?? "") || !/^[0-9a-f]{40}$/.test(item.predecessorOid ?? "") ||
        !/^[0-9a-f]{40}$/.test(item.successorOid ?? "") || !/^[0-9a-f]{64}$/.test(item.sha256 ?? "")) {
      throw new Error(`Gate 6T frozen-evidence successor has an invalid object identity: ${normalized}`);
    }
    const predecessor = anchorFiles.get(normalized);
    if (!predecessor || predecessor.mode !== item.mode || predecessor.oid !== item.predecessorOid) {
      throw new Error(`Gate 6T frozen-evidence successor does not match its pinned predecessor: ${normalized}`);
    }
    const current = headTree.get(normalized);
    if (!current || current.type !== "blob" || current.mode !== item.mode || current.oid !== item.successorOid) {
      throw new Error(`Gate 6T frozen-evidence successor does not match the current protected tree: ${normalized}`);
    }
    const currentBytes = readBlobs(root, head, [normalized]).get(normalized);
    if (!currentBytes || sha256(currentBytes) !== item.sha256) {
      throw new Error(`Gate 6T frozen-evidence successor SHA-256 differs from the current protected tree: ${normalized}`);
    }
    const successor = sourceTree?.get(normalized);
    if (source && (!successor || successor.type !== "blob" || successor.mode !== item.mode || successor.oid !== item.successorOid ||
        sha256(sourceBlobs.get(normalized)) !== item.sha256)) {
      throw new Error(`Gate 6T frozen-evidence successor does not match its authorized source: ${normalized}`);
    }
    changes.set(normalized, item);
    previous = normalized;
  }
  const entry = headTree.get(GATE6T_FROZEN_SUCCESSOR_PATH);
  if (!entry || entry.type !== "blob" || entry.mode !== "100644") throw new Error("Gate 6T frozen-evidence successor is missing or has an unsupported mode.");
  checkAttributes(root, [GATE6T_FROZEN_SUCCESSOR_PATH]);
  const target = path.join(root, ...GATE6T_FROZEN_SUCCESSOR_PATH.split("/"));
  const workingPath = fs.lstatSync(target);
  if (!workingPath.isFile() || workingPath.isSymbolicLink() || !fs.readFileSync(target).equals(bytes)) {
    throw new Error("Gate 6T frozen-evidence successor working bytes differ from HEAD.");
  }
  const index = git(root, ["ls-files", "-s", "--", GATE6T_FROZEN_SUCCESSOR_PATH]).trim();
  const match = /^(\d+) ([0-9a-f]+) 0\t/.exec(index);
  if (!match || match[1] !== entry.mode || match[2] !== entry.oid) throw new Error("Gate 6T frozen-evidence successor staged content differs from HEAD.");
  return { contract, changes };
}

function loadGate6HSuccessorContract(root, head) {
  const headTree = readTree(root, head);
  const bytes = readBlobs(root, head, [GATE6H_SUCCESSOR_CONTRACT_PATH]).get(GATE6H_SUCCESSOR_CONTRACT_PATH);
  if (!bytes || sha256(bytes) !== GATE6H_SUCCESSOR_CONTRACT_SHA256) throw new Error("Gate 6H successor-contract SHA-256 mismatch.");
  const contract = JSON.parse(bytes.toString("utf8"));
  if (contract.schema !== "forge.gate6h-successor-contract.v1" || contract.repository !== "JosephSCH0157/nursery") {
    throw new Error("Gate 6H successor contract has an unexpected identity.");
  }
  const addition = contract.sharedTailAddition;
  if (addition?.version !== "20261024164519" ||
      addition?.path !== "supabase/migrations/20261024164519_barstock_project_archive_atomic_graduation.sql" ||
      !/^[0-9a-f]{64}$/.test(addition?.sha256 ?? "") ||
      contract.rejectAdditionalProtectedPathChanges !== true) {
    throw new Error("Gate 6H successor contract has an invalid shared-tail addition.");
  }
  const entry = headTree.get(GATE6H_SUCCESSOR_CONTRACT_PATH);
  if (!entry || entry.type !== "blob" || entry.mode !== "100644") throw new Error("Gate 6H successor contract is missing or has an unsupported mode.");
  checkAttributes(root, [GATE6H_SUCCESSOR_CONTRACT_PATH]);
  const target = path.join(root, ...GATE6H_SUCCESSOR_CONTRACT_PATH.split("/"));
  if (!fs.lstatSync(target).isFile() || fs.lstatSync(target).isSymbolicLink() || !fs.readFileSync(target).equals(bytes)) {
    throw new Error("Gate 6H successor-contract working bytes differ from HEAD.");
  }
  const index = git(root, ["ls-files", "-s", "--", GATE6H_SUCCESSOR_CONTRACT_PATH]).trim();
  const match = /^(\d+) ([0-9a-f]+) 0\t/.exec(index);
  if (!match || match[1] !== entry.mode || match[2] !== entry.oid) throw new Error("Gate 6H successor-contract staged content differs from HEAD.");
  return contract;
}

function loadGate6OSuccessorContract(root, head) {
  const headTree = readTree(root, head);
  const bytes = readBlobs(root, head, [GATE6O_SUCCESSOR_CONTRACT_PATH]).get(GATE6O_SUCCESSOR_CONTRACT_PATH);
  if (!bytes || sha256(bytes) !== GATE6O_SUCCESSOR_CONTRACT_SHA256) throw new Error("Gate 6O successor-contract SHA-256 mismatch.");
  const contract = JSON.parse(bytes.toString("utf8"));
  if (contract.schema !== "forge.gate6o-successor-contract.v1" || contract.repository !== "JosephSCH0157/nursery") {
    throw new Error("Gate 6O successor contract has an unexpected identity.");
  }
  const addition = contract.sharedTailAddition;
  if (contract.predecessor?.contractSha256 !== GATE6H_SUCCESSOR_CONTRACT_SHA256 ||
      addition?.version !== "20261025070300" ||
      addition?.path !== "supabase/migrations/20261025070300_tongs_episode_storage_tier_parity.sql" ||
      !/^[0-9a-f]{64}$/.test(addition?.sha256 ?? "") ||
      contract.rejectAdditionalProtectedPathChanges !== true) {
    throw new Error("Gate 6O successor contract has an invalid predecessor or shared-tail addition.");
  }
  const entry = headTree.get(GATE6O_SUCCESSOR_CONTRACT_PATH);
  if (!entry || entry.type !== "blob" || entry.mode !== "100644") throw new Error("Gate 6O successor contract is missing or has an unsupported mode.");
  checkAttributes(root, [GATE6O_SUCCESSOR_CONTRACT_PATH]);
  const target = path.join(root, ...GATE6O_SUCCESSOR_CONTRACT_PATH.split("/"));
  if (!fs.lstatSync(target).isFile() || fs.lstatSync(target).isSymbolicLink() || !fs.readFileSync(target).equals(bytes)) {
    throw new Error("Gate 6O successor-contract working bytes differ from HEAD.");
  }
  const index = git(root, ["ls-files", "-s", "--", GATE6O_SUCCESSOR_CONTRACT_PATH]).trim();
  const match = /^(\d+) ([0-9a-f]+) 0\t/.exec(index);
  if (!match || match[1] !== entry.mode || match[2] !== entry.oid) throw new Error("Gate 6O successor-contract staged content differs from HEAD.");
  return contract;
}

function loadGate6PSuccessorContract(root, head) {
  const headTree = readTree(root, head);
  const bytes = readBlobs(root, head, [GATE6P_SUCCESSOR_CONTRACT_PATH]).get(GATE6P_SUCCESSOR_CONTRACT_PATH);
  if (!bytes || sha256(bytes) !== GATE6P_SUCCESSOR_CONTRACT_SHA256) throw new Error("Gate 6P successor-contract SHA-256 mismatch.");
  const contract = JSON.parse(bytes.toString("utf8"));
  if (contract.schema !== "forge.gate6p-successor-contract.v1" || contract.repository !== "JosephSCH0157/nursery") {
    throw new Error("Gate 6P successor contract has an unexpected identity.");
  }
  const addition = contract.sharedTailAddition;
  if (contract.predecessor?.contractSha256 !== GATE6O_SUCCESSOR_CONTRACT_SHA256 ||
      addition?.version !== "20261025080943" ||
      addition?.path !== "supabase/migrations/20261025080943_provision_required_storage_buckets.sql" ||
      !/^[0-9a-f]{64}$/.test(addition?.sha256 ?? "") ||
      contract.provisioningSuccessor?.sha256 !== "18722cbd2a747e456b882e5069b05772bc560acf2ee25e42af2d4d4d8c2dd939" ||
      contract.rejectAdditionalProtectedPathChanges !== true) {
    throw new Error("Gate 6P successor contract has an invalid predecessor, provisioning contract, or shared-tail addition.");
  }
  const entry = headTree.get(GATE6P_SUCCESSOR_CONTRACT_PATH);
  if (!entry || entry.type !== "blob" || entry.mode !== "100644") throw new Error("Gate 6P successor contract is missing or has an unsupported mode.");
  checkAttributes(root, [GATE6P_SUCCESSOR_CONTRACT_PATH]);
  const target = path.join(root, ...GATE6P_SUCCESSOR_CONTRACT_PATH.split("/"));
  if (!fs.lstatSync(target).isFile() || fs.lstatSync(target).isSymbolicLink() || !fs.readFileSync(target).equals(bytes)) {
    throw new Error("Gate 6P successor-contract working bytes differ from HEAD.");
  }
  const index = git(root, ["ls-files", "-s", "--", GATE6P_SUCCESSOR_CONTRACT_PATH]).trim();
  const match = /^(\d+) ([0-9a-f]+) 0\t/.exec(index);
  if (!match || match[1] !== entry.mode || match[2] !== entry.oid) throw new Error("Gate 6P successor-contract staged content differs from HEAD.");
  return contract;
}

function loadRecordingAuthoritySuccessorContract(root, head) {
  const headTree = readTree(root, head);
  const bytes = readBlobs(root, head, [RECORDING_AUTHORITY_SUCCESSOR_CONTRACT_PATH]).get(RECORDING_AUTHORITY_SUCCESSOR_CONTRACT_PATH);
  if (!bytes || sha256(bytes) !== RECORDING_AUTHORITY_SUCCESSOR_CONTRACT_SHA256) throw new Error("Recording authority successor-contract SHA-256 mismatch.");
  const contract = JSON.parse(bytes.toString("utf8"));
  const addition = contract.sharedTailAddition;
  if (contract.schema !== "forge.recording-authority-successor-contract.v1" || contract.repository !== "JosephSCH0157/nursery" ||
      contract.predecessor?.contractSha256 !== GATE6P_SUCCESSOR_CONTRACT_SHA256 ||
      addition?.version !== "20261027030139" ||
      addition?.path !== "supabase/migrations/20261027030139_anvil_recording_authority_repair.sql" ||
      addition?.sha256 !== "876278448329ff5a8900923e309d3489bf7cce590c157526e054ff3433b3c8fa" ||
      contract.catalogSuccessor?.fileSha256 !== "a46bb67287868b8f7f568b75962593cd2b367d5395865d9c63e0870b85e1e5ae" ||
      contract.catalogSuccessor?.normalizedContractSha256 !== "38f8a14b90e52ee876e0615084c036d286e0e280832685e07e20dcbabf86ae47" ||
      contract.rejectAdditionalProtectedPathChanges !== true) {
    throw new Error("Recording authority successor contract has an invalid predecessor or shared-tail addition.");
  }
  const entry = headTree.get(RECORDING_AUTHORITY_SUCCESSOR_CONTRACT_PATH);
  if (!entry || entry.type !== "blob" || entry.mode !== "100644") throw new Error("Recording authority successor contract is missing or has an unsupported mode.");
  checkAttributes(root, [RECORDING_AUTHORITY_SUCCESSOR_CONTRACT_PATH]);
  const target = path.join(root, ...RECORDING_AUTHORITY_SUCCESSOR_CONTRACT_PATH.split("/"));
  if (!fs.lstatSync(target).isFile() || fs.lstatSync(target).isSymbolicLink() || !fs.readFileSync(target).equals(bytes)) {
    throw new Error("Recording authority successor-contract working bytes differ from HEAD.");
  }
  const index = git(root, ["ls-files", "-s", "--", RECORDING_AUTHORITY_SUCCESSOR_CONTRACT_PATH]).trim();
  const match = /^(\d+) ([0-9a-f]+) 0\t/.exec(index);
  if (!match || match[1] !== entry.mode || match[2] !== entry.oid) throw new Error("Recording authority successor-contract staged content differs from HEAD.");
  return contract;
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
  const { root, head } = assertCurrentRepository(repositoryRoot, verifiedTree);
  const source = resolveCommit(root, certifiedSourceTree, "Certified source tree");
  if (source !== CERTIFIED_SOURCE_COMMIT && certifiedSourceTree === CERTIFIED_SOURCE_COMMIT) {
    throw new Error(`Certified source tree resolved unexpectedly: ${source}`);
  }
  return { root, head, source };
}

function verifyAnchoredFileSet({ root, head, anchor, trustSuccessor, successors, scope, requireExactWorktreeBytes = false }) {
  if (!["historical", "canonical", "pre-slice", "gate5d", "all"].includes(scope)) throw new Error(`Unknown frozen-evidence scope: ${scope}`);
  const files = anchor.files.filter((item) => scope === "all" || item.scopes.includes(scope));
  if (!files.length) throw new Error(`Frozen evidence trust anchor has no records for scope: ${scope}`);
  const protectedRoots = anchor.protectedRootsByScope[scope];
  if (!Array.isArray(protectedRoots)) throw new Error(`Frozen evidence trust anchor omits protected roots for scope: ${scope}`);
  const headTree = readTree(root, head);
  const successorFiles = successors.map((successor) => ({
    path: successor.contract.sharedTailAddition.path,
    expectedSha256: successor.contract.sharedTailAddition.sha256,
    mode: "100644",
    contracts: [`${successor.gate}-shared-tail-successor`],
  }));
  for (const item of files) {
    const current = headTree.get(item.path);
    const authorizedChange = trustSuccessor.changes.get(item.path);
    const expectedMode = authorizedChange?.mode ?? item.mode;
    const expectedOid = authorizedChange?.successorOid ?? item.oid;
    if (!current || current.type !== "blob" || current.mode !== expectedMode || current.oid !== expectedOid) {
      throw new Error(`Protected Git object differs from pinned trust anchor: ${item.path}`);
    }
  }
  for (const protectedRoot of anchor.protectedRootsByScope.all) {
    const approved = [...anchor.allowedTrackedPathsByRoot[protectedRoot]];
    if (!Array.isArray(approved)) throw new Error(`Frozen evidence trust anchor omits tracked paths for protected root: ${protectedRoot}`);
    for (const item of successorFiles) {
      if (item.path === protectedRoot || item.path.startsWith(`${protectedRoot}/`)) approved.push(item.path);
    }
    approved.sort();
    const actual = [...headTree.keys()].filter((item) => item === protectedRoot || item.startsWith(`${protectedRoot}/`)).sort();
    if (actual.length !== approved.length || actual.some((item, index) => item !== approved[index])) {
      throw new Error(`Tracked path membership differs within protected root: ${protectedRoot}`);
    }
  }
  const successorRecords = successorFiles.map((item) => {
    const current = headTree.get(item.path);
    if (!current || current.type !== "blob" || current.mode !== item.mode) throw new Error(`Shared-tail successor object is missing or unsupported: ${item.path}`);
    const bytes = readBlobs(root, head, [item.path]).get(item.path);
    const blobSha256 = sha256(bytes);
    if (blobSha256 !== item.expectedSha256) throw new Error(`Shared-tail successor SHA-256 differs: ${item.path}`);
    return { ...item, oid: current.oid, blobSha256, worktreeSha256: sha256(fs.readFileSync(path.join(root, ...item.path.split("/")))) };
  });
  const paths = files.map((item) => item.path);
  const blobs = readBlobs(root, head, paths);
  const records = files.map((item) => {
    const bytes = blobs.get(item.path);
    const blobSha256 = sha256(bytes);
    const authorizedChange = trustSuccessor.changes.get(item.path);
    const expectedBlobSha256 = authorizedChange?.sha256 ?? item.blobSha256;
    const legacyExpectedSha256 = authorizedChange?.sha256 ?? item.expectedSha256;
    const pinnedExpectedMode = authorizedChange ? "git-blob" : item.expectedMode;
    if (blobSha256 !== expectedBlobSha256) throw new Error(`Protected blob SHA-256 differs from approved trust chain: ${item.path}`);
    const expectedMode = classifyLegacyExpected(bytes, legacyExpectedSha256);
    if (expectedMode !== pinnedExpectedMode || (legacyExpectedSha256 && expectedMode === "unexplained")) {
      throw new Error(`Frozen expected hash classification differs from pinned trust anchor: ${item.path}`);
    }
    const fullPath = path.join(root, ...item.path.split("/"));
    const workingPath = fs.lstatSync(fullPath);
    if (!workingPath.isFile() || workingPath.isSymbolicLink()) throw new Error(`Protected working path is not a regular file: ${item.path}`);
    return {
      path: item.path,
      oid: authorizedChange?.successorOid ?? item.oid,
      blobSha256,
      expectedSha256: legacyExpectedSha256,
      expectedMode,
      worktreeSha256: sha256(fs.readFileSync(fullPath)),
      contracts: authorizedChange ? [...item.contracts, "gate6t-trust-successor"] : item.contracts,
    };
  });
  checkWorktree(root, headTree, [...files, ...successorFiles], protectedRoots);
  const modes = Object.fromEntries([...new Set(records.map((item) => item.expectedMode))].sort().map((mode) => [mode, records.filter((item) => item.expectedMode === mode).length]));
  const worktreeByteDifferences = records.filter((item) => item.worktreeSha256 !== item.blobSha256).length
    + successorRecords.filter((item) => item.worktreeSha256 !== item.blobSha256).length;
  if (requireExactWorktreeBytes && worktreeByteDifferences !== 0) {
    throw new Error(`Protected execution bytes differ from canonical Git blobs for ${worktreeByteDifferences} file(s). Run the frozen-evidence materializer first.`);
  }
  return {
    ok: true,
    schema: "forge.frozen-git-evidence-result.v1",
    repositoryRoot: root,
    verifiedCommit: head,
    certifiedSourceCommit: anchor.certifiedSourceCommit,
    certifiedSourceTree: anchor.certifiedSourceTree,
    trustAnchorPath: FROZEN_EVIDENCE_TRUST_ANCHOR_PATH,
    trustAnchorSha256: FROZEN_EVIDENCE_TRUST_ANCHOR_SHA256,
    trustSuccessorPath: GATE6T_FROZEN_SUCCESSOR_PATH,
    trustSuccessorSha256: GATE6T_FROZEN_SUCCESSOR_SHA256,
    trustSuccessorAuthorizedSourceCommit: trustSuccessor.contract.authorizedSource.commit,
    trustSuccessorAuthorizedSourceTree: trustSuccessor.contract.authorizedSource.tree,
    trustSuccessorProtectedChangeCount: trustSuccessor.changes.size,
    scope,
    fileCount: records.length,
    successorFileCount: successorRecords.length,
    successorContractPath: RECORDING_AUTHORITY_SUCCESSOR_CONTRACT_PATH,
    successorContractSha256: RECORDING_AUTHORITY_SUCCESSOR_CONTRACT_SHA256,
    predecessorSuccessorContractPath: GATE6P_SUCCESSOR_CONTRACT_PATH,
    predecessorSuccessorContractSha256: GATE6P_SUCCESSOR_CONTRACT_SHA256,
    expectedModes: modes,
    requireExactWorktreeBytes,
    worktreeByteDifferences,
    records,
    successorRecords,
  };
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
  trustAnchorSha256 = FROZEN_EVIDENCE_TRUST_ANCHOR_SHA256,
  trustSuccessorSha256 = GATE6T_FROZEN_SUCCESSOR_SHA256,
  requireExactWorktreeBytes = false,
} = {}) {
  const { root, head } = assertCurrentRepository(repositoryRoot, verifiedTree);
  const anchor = loadTrustAnchor(root, head, trustAnchorSha256);
  const trustSuccessor = loadGate6TFrozenSuccessor(root, head, anchor, trustSuccessorSha256);
  const gate6h = loadGate6HSuccessorContract(root, head);
  const gate6o = loadGate6OSuccessorContract(root, head);
  const gate6p = loadGate6PSuccessorContract(root, head);
  const recordingAuthority = loadRecordingAuthoritySuccessorContract(root, head);
  const successors = [
    { gate: "gate6h", contract: gate6h },
    { gate: "gate6o", contract: gate6o },
    { gate: "gate6p", contract: gate6p },
    { gate: "recording-authority", contract: recordingAuthority },
  ];
  return verifyAnchoredFileSet({ root, head, anchor, trustSuccessor, successors, scope, requireExactWorktreeBytes });
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
