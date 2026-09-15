import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import {
  canonicalCleanupSegments,
  cleanupFingerprint,
  cleanupCandidateDescriptor,
  CLEANUP_GENERATOR_VERSION,
  type CleanupReviewSnapshot,
} from "../../../packages/tongs/src/hammer-cleanup-review-contract";
import {
  coordinateCleanupReview,
  type CleanupReviewStore,
} from "../../../packages/tongs/src/hammer-cleanup-review-coordinator";
import { generateCanonicalCleanupCandidates } from "../../nursery/server/tongs/hammer-cleanup-review-generator";
import {
  filterAcknowledgedCleanupCandidates,
  loadCleanupReview,
  pendingCleanupDiscard,
  persistCleanupDiscard,
} from "../src/persistence/hammerCleanupReviewPersistence";

const context = {
  workspace_id: "11111111-1111-4111-8111-111111111111",
  workpiece_id: "22222222-2222-4222-8222-222222222222",
  canonical_recording_id: "33333333-3333-4333-8333-333333333333",
  recording_revision_id: "44444444-4444-4444-8444-444444444444",
};
const options = { aggressiveness: "medium", protectIntentionalPhrasing: true };
const segments = [
  {
    segment_id: "one",
    text: "Um, this is useful.",
    speaker: "A",
    start_sec: 0,
    end_sec: 3,
  },
  {
    segment_id: "two",
    text: "Uh, this is another thought.",
    speaker: "A",
    start_sec: 4,
    end_sec: 7,
  },
];
function fixture() {
  let bytes = new TextEncoder().encode(
    JSON.stringify({
      transcript_id: "transcript-1",
      media_id: "media-1",
      segments,
    }),
  );
  const evidence = {
    ...context,
    media_id: "media-1",
    transcript: {
      bytes: bytes.length,
      hash_value: createHash("sha256").update(bytes).digest("hex"),
      storage_bucket: "forge-workpieces",
      storage_key: "transcript",
    },
    media: { bytes: 100, hash_value: "a".repeat(64) },
  };
  const records: Record<string, unknown>[] = [];
  let failAfterCommit = false;
  const store: CleanupReviewStore = {
    download: async () => bytes,
    decisions: async (_w, _p, _r, basis) =>
      records.filter((d) => d.basis_fingerprint === basis),
    rpc: async (name, args) => {
      if (name === "read_cleanup_review_basis")
        return structuredClone(evidence);
      if (JSON.stringify(args.p_evidence) !== JSON.stringify(evidence))
        throw Error("stale");
      let receipt = records.find(
        (d) =>
          d.basis_fingerprint === args.p_basis_hash &&
          d.candidate_fingerprint === args.p_candidate_hash,
      );
      const outcome = receipt ? "already_committed" : "committed";
      if (!receipt) {
        receipt = {
          ...context,
          id: `decision-${records.length}`,
          decision: "discard",
          contract_version: "hammer-cleanup-review-v1",
          basis_fingerprint: args.p_basis_hash,
          candidate_fingerprint: args.p_candidate_hash,
        };
        records.push(receipt);
      }
      if (failAfterCommit) {
        failAfterCommit = false;
        throw Error("network_uncertain");
      }
      return { outcome, receipt };
    },
  };
  const request = async (
    c: typeof context,
    action: "read" | "discard",
    input: unknown,
  ) =>
    coordinateCleanupReview({
      actor: "owner",
      workspace: c.workspace_id,
      workpiece: c.workpiece_id,
      revision: c.recording_revision_id,
      action,
      input: input as Record<string, unknown>,
      store,
      generate: generateCanonicalCleanupCandidates,
    });
  return {
    records,
    evidence,
    request,
    setFailAfterCommit: () => {
      failAfterCommit = true;
    },
    corrupt: () => {
      bytes = new TextEncoder().encode("bad");
    },
    setTranscript: (next: typeof segments) => {
      bytes = new TextEncoder().encode(
        JSON.stringify({
          transcript_id: "transcript-1",
          media_id: "media-1",
          segments: next,
        }),
      );
      evidence.transcript.bytes = bytes.length;
      evidence.transcript.hash_value = createHash("sha256")
        .update(bytes)
        .digest("hex");
    },
  };
}
test("actual generator → server validation → discard-only receipt → reopened queue; duplicate and uncertain replay", async () => {
  const f = fixture();
  const before = await loadCleanupReview(
    context,
    "fillers",
    options,
    segments,
    f.request,
  );
  const cards = generateCanonicalCleanupCandidates(
    "fillers",
    canonicalCleanupSegments(segments),
    options,
  );
  assert.equal(cards.length, 2);
  const pending = await pendingCleanupDiscard(before, cards[0]!);
  f.setFailAfterCommit();
  await assert.rejects(
    persistCleanupDiscard(context, pending, f.request),
    /network_uncertain/,
  );
  const id = await persistCleanupDiscard(context, pending, f.request);
  assert.equal(await persistCleanupDiscard(context, pending, f.request), id);
  assert.equal(f.records.length, 1);
  const restored = await loadCleanupReview(
    context,
    "fillers",
    options,
    segments,
    f.request,
  );
  assert.deepEqual(
    [...(await filterAcknowledgedCleanupCandidates(cards, restored))],
    [cards[0]!.id],
  );
  assert.deepEqual(restored.basis.segments, canonicalCleanupSegments(segments));
  const pending2 = await pendingCleanupDiscard(restored, cards[1]!);
  await persistCleanupDiscard(context, pending2, f.request);
  assert.equal(f.records.length, 2);
});
test("basis binds each canonical identity, ordered transcript, media, algorithm and effective options", async () => {
  const f = fixture(),
    snapshot = await loadCleanupReview(
      context,
      "fillers",
      options,
      segments,
      f.request,
    );
  const changes: Array<(b: CleanupReviewSnapshot["basis"]) => void> = [
    (b) => {
      b.workspace_id = "other";
    },
    (b) => {
      b.workpiece_id = "other";
    },
    (b) => {
      b.canonical_recording_id = "other";
    },
    (b) => {
      b.recording_revision_id = "other";
    },
    (b) => {
      b.transcript_id = "other";
    },
    (b) => {
      b.segments[0]!.text += " changed";
    },
    (b) => {
      b.media.media_id = "other";
    },
    (b) => {
      b.media.sha256 = "b".repeat(64);
    },
    (b) => {
      b.generator_version = CLEANUP_GENERATOR_VERSION + "-next";
    },
    (b) => {
      b.options.aggressiveness = "strong";
    },
    (b) => {
      b.segments.reverse();
    },
  ];
  for (const change of changes) {
    const basis = structuredClone(snapshot.basis);
    change(basis);
    assert.notEqual(
      await cleanupFingerprint(basis),
      snapshot.basis_fingerprint,
    );
  }
  await assert.rejects(
    loadCleanupReview(
      { ...context, workpiece_id: "other" },
      "fillers",
      options,
      segments,
      f.request,
    ),
  );
  await assert.rejects(
    loadCleanupReview(
      context,
      "fillers",
      options,
      [{ ...segments[0]!, text: "changed" }],
      f.request,
    ),
  );
});
test("candidate identity excludes queue IDs and labels but includes exact proposal and source evidence", async () => {
  const cards = generateCanonicalCleanupCandidates(
      "fillers",
      canonicalCleanupSegments(segments),
      options,
    ),
    card = cards[0]!;
  const fingerprint = await cleanupFingerprint(
    cleanupCandidateDescriptor(card, canonicalCleanupSegments(segments)),
  );
  assert.equal(
    await cleanupFingerprint(
      cleanupCandidateDescriptor(
        { ...card, id: "reordered" },
        canonicalCleanupSegments(segments),
      ),
    ),
    fingerprint,
  );
  for (const mutate of [
    (c: typeof card) => {
      c.suggestedRemoval[0]!.selectionEnd++;
    },
    (c: typeof card) => {
      c.afterText = "other";
    },
  ]) {
    const changed = structuredClone(card);
    mutate(changed);
    assert.notEqual(
      await cleanupFingerprint(
        cleanupCandidateDescriptor(changed, canonicalCleanupSegments(segments)),
      ),
      fingerprint,
    );
  }
});
test("server rejects fabricated candidate, actor injection, stale fingerprint and corrupt canonical bytes before insert", async () => {
  const f = fixture(),
    snapshot = await loadCleanupReview(
      context,
      "fillers",
      options,
      segments,
      f.request,
    );
  await assert.rejects(
    f.request(context, "discard", {
      kind: "fillers",
      options,
      basis_fingerprint: snapshot.basis_fingerprint,
      candidate_fingerprint: "f".repeat(64),
    }),
  );
  await assert.rejects(
    f.request(context, "read", { kind: "fillers", options, actor: "forged" }),
  );
  await assert.rejects(
    f.request(context, "discard", {
      kind: "fillers",
      options,
      basis_fingerprint: "f".repeat(64),
      candidate_fingerprint: snapshot.candidates[0]!.candidate_fingerprint,
    }),
  );
  f.corrupt();
  await assert.rejects(
    f.request(context, "read", { kind: "fillers", options }),
  );
  assert.equal(f.records.length, 0);
});
test("material change makes earlier decisions inapplicable; no approved record is synthesized", async () => {
  const f = fixture(),
    snapshot = await loadCleanupReview(
      context,
      "fillers",
      options,
      segments,
      f.request,
    );
  const cards = generateCanonicalCleanupCandidates(
    "fillers",
    canonicalCleanupSegments(segments),
    options,
  );
  await persistCleanupDiscard(
    context,
    await pendingCleanupDiscard(snapshot, cards[0]!),
    f.request,
  );
  const changedOptions = { ...options, aggressiveness: "strong" };
  const next = await loadCleanupReview(
    context,
    "fillers",
    changedOptions,
    segments,
    f.request,
  );
  assert.deepEqual(next.acknowledged, []);
  assert.ok(f.records.every((d) => d.decision === "discard"));
  await assert.rejects(
    persistCleanupDiscard(
      context,
      await pendingCleanupDiscard(snapshot, cards[1]!),
      async () => {
        throw Error("offline");
      },
    ),
  );
  assert.equal(f.records.length, 1);
});

test("discard then transcript approval invalidates old basis; approval then discard restores only the new basis", async () => {
  const f = fixture(),
    old = await loadCleanupReview(
      context,
      "fillers",
      options,
      segments,
      f.request,
    );
  const cards = generateCanonicalCleanupCandidates(
    "fillers",
    canonicalCleanupSegments(segments),
    options,
  );
  await persistCleanupDiscard(
    context,
    await pendingCleanupDiscard(old, cards[0]!),
    f.request,
  );
  // Canonical history has persisted approval of the second card. The first card
  // remains textually identical, but its whole-transcript basis has changed.
  const edited = segments.map((s, i) =>
    i === 1 ? { ...s, text: "This is another thought." } : s,
  );
  f.setTranscript(edited);
  const next = await loadCleanupReview(
    context,
    "fillers",
    options,
    edited,
    f.request,
  );
  assert.deepEqual(next.acknowledged, []);
  const newCards = generateCanonicalCleanupCandidates(
    "fillers",
    canonicalCleanupSegments(edited),
    options,
  );
  assert.equal(newCards.length, 1);
  assert.equal(
    (await filterAcknowledgedCleanupCandidates(newCards, next)).size,
    0,
  );
  await assert.rejects(
    persistCleanupDiscard(
      context,
      await pendingCleanupDiscard(old, cards[1]!),
      f.request,
    ),
    /stale_basis/,
  );
  await persistCleanupDiscard(
    context,
    await pendingCleanupDiscard(next, newCards[0]!),
    f.request,
  );
  const reopened = await loadCleanupReview(
    context,
    "fillers",
    options,
    edited,
    f.request,
  );
  assert.equal(
    (await filterAcknowledgedCleanupCandidates(newCards, reopened)).size,
    1,
  );
  assert.equal(f.records.length, 2);
  assert.ok(f.records.every((d) => d.decision === "discard"));
});

test("retake identities bind the kept and removed relationship and remain stable through display reordering", async () => {
  const transcript = [
    {
      segment_id: "take-a",
      text: "This is a useful sentence about our show.",
      speaker: "A",
      start_sec: 0,
      end_sec: 4,
    },
    {
      segment_id: "take-b",
      text: "This is a useful sentence about our show.",
      speaker: "A",
      start_sec: 4.2,
      end_sec: 8,
    },
  ];
  const retakes = {
    detection: "normal",
    preferLaterCleanerTake: true,
    honorExplicitRetakePhrases: true,
    sameSpeakerOnly: true,
  };
  const canonical = canonicalCleanupSegments(transcript);
  const cards = generateCanonicalCleanupCandidates(
    "retakes",
    canonical,
    retakes,
  );
  assert.ok(cards.length > 0);
  const card = cards[0]!;
  const descriptor = cleanupCandidateDescriptor(card, canonical);
  assert.equal(descriptor.source.length, 2);
  assert.ok(descriptor.remove_segment_ids.length > 0);
  assert.equal(
    await cleanupFingerprint(descriptor),
    await cleanupFingerprint(
      cleanupCandidateDescriptor(
        {
          ...card,
          id: "presentation",
          segmentIds: [...card.segmentIds].reverse(),
        },
        canonical,
      ),
    ),
  );
  const changed = structuredClone(card);
  changed.apply.removeSegmentIds = [
    card.segmentIds.find((id) => !card.apply.removeSegmentIds.includes(id))!,
  ];
  assert.notEqual(
    await cleanupFingerprint(descriptor),
    await cleanupFingerprint(cleanupCandidateDescriptor(changed, canonical)),
  );
});
