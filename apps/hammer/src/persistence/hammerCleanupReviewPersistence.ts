import { tongsFetch } from "../lib/tongsFetch";
import {
  canonicalCleanupSegments,
  cleanupCandidateDescriptor,
  cleanupFingerprint,
  CLEANUP_GENERATOR_VERSION,
  CLEANUP_REVIEW_VERSION,
  stableCleanupJson,
  type CleanupCandidate,
  type CleanupIdentity,
  type CleanupKind,
  type CleanupOptions,
  type CleanupReviewSnapshot,
  type CleanupSegment,
} from "../../../../packages/tongs/src/hammer-cleanup-review-contract";

export type CleanupReviewContext = CleanupIdentity;
export type PendingCleanupDiscard = {
  kind: CleanupKind;
  options: CleanupOptions;
  basis_fingerprint: string;
  candidate_fingerprint: string;
};
export async function requestCleanupReview(
  context: CleanupReviewContext,
  action: "read" | "discard",
  input: unknown,
): Promise<unknown> {
  const response = await tongsFetch(
    `/tongs/workspaces/${encodeURIComponent(context.workspace_id)}/workpieces/${encodeURIComponent(context.workpiece_id)}/hammer/revisions/${encodeURIComponent(context.recording_revision_id)}/cleanup-review/${action}`,
    { method: "POST", json: input, timeoutMs: 20000 },
  );
  const payload = await response.json();
  if (!response.ok || !payload?.ok)
    throw new Error(payload?.error?.message || "cleanup_review_unavailable");
  return payload.data;
}
export async function loadCleanupReview(
  context: CleanupReviewContext,
  kind: CleanupKind,
  options: CleanupOptions,
  segments: CleanupSegment[],
  request = requestCleanupReview,
): Promise<CleanupReviewSnapshot> {
  const snapshot = (await request(context, "read", {
    kind,
    options,
  })) as CleanupReviewSnapshot;
  const basis = snapshot?.basis;
  if (
    !basis ||
    Object.entries(context).some(
      ([key, value]) => basis[key as keyof CleanupReviewContext] !== value,
    ) ||
    basis.contract_version !== CLEANUP_REVIEW_VERSION ||
    basis.generator_version !== CLEANUP_GENERATOR_VERSION ||
    basis.kind !== kind ||
    stableCleanupJson(basis.options) !== stableCleanupJson(options) ||
    stableCleanupJson(canonicalCleanupSegments(basis.segments)) !==
      stableCleanupJson(canonicalCleanupSegments(segments)) ||
    (await cleanupFingerprint(basis)) !== snapshot.basis_fingerprint ||
    !Array.isArray(snapshot.acknowledged) ||
    !Array.isArray(snapshot.candidates)
  )
    throw new Error("cleanup_review_basis_not_saved");
  return snapshot;
}
export async function pendingCleanupDiscard(
  snapshot: CleanupReviewSnapshot,
  card: CleanupCandidate,
): Promise<PendingCleanupDiscard> {
  const fingerprint = await cleanupFingerprint(
    cleanupCandidateDescriptor(card, snapshot.basis.segments),
  );
  if (!snapshot.candidates.some((c) => c.candidate_fingerprint === fingerprint))
    throw new Error("cleanup_review_candidate_changed");
  return {
    kind: snapshot.basis.kind,
    options: snapshot.basis.options,
    basis_fingerprint: snapshot.basis_fingerprint,
    candidate_fingerprint: fingerprint,
  };
}
export async function persistCleanupDiscard(
  context: CleanupReviewContext,
  pending: PendingCleanupDiscard,
  request = requestCleanupReview,
): Promise<string> {
  const data = (await request(context, "discard", pending)) as {
    outcome?: string;
    receipt?: Record<string, unknown>;
  };
  if (
    !["committed", "already_committed"].includes(data?.outcome ?? "") ||
    !data.receipt ||
    typeof data.receipt.id !== "string" ||
    data.receipt.decision !== "discard" ||
    data.receipt.contract_version !== CLEANUP_REVIEW_VERSION ||
    data.receipt.basis_fingerprint !== pending.basis_fingerprint ||
    data.receipt.candidate_fingerprint !== pending.candidate_fingerprint ||
    Object.entries(context).some(
      ([key, value]) => data.receipt?.[key] !== value,
    )
  )
    throw new Error("cleanup_review_receipt_invalid");
  return data.receipt.id;
}
export async function filterAcknowledgedCleanupCandidates(
  cards: CleanupCandidate[],
  snapshot: CleanupReviewSnapshot,
): Promise<Set<string>> {
  const acknowledged = new Set(snapshot.acknowledged);
  const ids = await Promise.all(
    cards.map(async (card) =>
      acknowledged.has(
        await cleanupFingerprint(
          cleanupCandidateDescriptor(card, snapshot.basis.segments),
        ),
      )
        ? card.id
        : null,
    ),
  );
  return new Set(ids.filter((id): id is string => id !== null));
}
