import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assertPerformanceCandidate, validateInternalEpisodeManifest } from "../scripts/hammer-preview-performance-preflight.mts";

assert.doesNotThrow(() => assertPerformanceCandidate({ formal: false, trackedStatus: " M file", head: "a".repeat(40) }));
assert.doesNotThrow(() => assertPerformanceCandidate({ formal: true, declaredCandidate: "a".repeat(40), trackedStatus: "", head: "a".repeat(40) }));
assert.throws(() => assertPerformanceCandidate({ formal: true, declaredCandidate: "b".repeat(40), trackedStatus: "", head: "a".repeat(40) }), /HEAD_MISMATCH/);
assert.throws(() => assertPerformanceCandidate({ formal: true, declaredCandidate: "a".repeat(40), trackedStatus: " M file", head: "a".repeat(40) }), /WORKTREE_DIRTY/);

const publicRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hammer-performance-preflight-"));
try {
  const episodes = [
    { sanitized_label: "presenter-reference", evidence_role: "presenter_edges", duration_sec: 20 },
    { sanitized_label: "visual-reference", evidence_role: "visual_heavy", duration_sec: 120 },
    { sanitized_label: "transport-reference", evidence_role: "transport_recovery", duration_sec: 15 },
  ].map((entry, index) => {
    const public_path = `/__hammer_performance_internal__/reference-${index}.mp4`;
    const absolute = path.join(publicRoot, public_path.slice(1));
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, `reference-${index}`);
    return { ...entry, classification: "internal_episode", public_path, content_hash: createHash("sha256").update(fs.readFileSync(absolute)).digest("hex"), width: 1920, height: 1080, frame_rate: 30 };
  });
  assert.doesNotThrow(() => validateInternalEpisodeManifest({ episodes }, publicRoot));
  assert.throws(() => validateInternalEpisodeManifest({ episodes: episodes.map((episode) => ({ ...episode, evidence_role: "presenter_edges" })) }, publicRoot), /EVIDENCE_ROLE_INVALID/);
  assert.throws(() => validateInternalEpisodeManifest({ episodes: episodes.map((episode) => episode.evidence_role === "transport_recovery" ? { ...episode, duration_sec: 14.9 } : episode) }, publicRoot), /SHAPE_INVALID/);
} finally {
  fs.rmSync(publicRoot, { recursive: true, force: true });
}
console.log("Hammer Preview performance preflight tests passed.");
