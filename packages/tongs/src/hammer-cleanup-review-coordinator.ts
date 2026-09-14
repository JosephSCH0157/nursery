import {
  canonicalCleanupSegments,
  cleanupCandidateDescriptor,
  cleanupFingerprint,
  CLEANUP_GENERATOR_VERSION,
  CLEANUP_REVIEW_VERSION,
  normalizeCleanupOptions,
  type CleanupBasis,
  type CleanupGenerator,
  type CleanupReviewSnapshot,
} from "./hammer-cleanup-review-contract.js";

type Row = Record<string, unknown>;
export interface CleanupReviewStore {
  rpc(name: string, args: Row): Promise<unknown>;
  download(bucket: string, key: string): Promise<Uint8Array>;
  decisions(
    workspace: string,
    workpiece: string,
    revision: string,
    basis: string,
  ): Promise<Row[]>;
}
export class CleanupReviewError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}
const row = (value: unknown): Row => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new CleanupReviewError(409, "cleanup_review_evidence_invalid");
  return value as Row;
};
const hashBytes = async (bytes: Uint8Array) =>
  [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes)),
    ),
  ]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
export async function coordinateCleanupReview(args: {
  actor: string;
  workspace: string;
  workpiece: string;
  revision: string;
  action: "read" | "discard";
  input: Row;
  store: CleanupReviewStore;
  generate: CleanupGenerator;
}): Promise<CleanupReviewSnapshot | unknown> {
  const { input, store } = args;
  const allowed =
    args.action === "read"
      ? ["kind", "options"]
      : ["kind", "options", "basis_fingerprint", "candidate_fingerprint"];
  if (
    Object.keys(input).some((k) => !allowed.includes(k)) ||
    (input.kind !== "fillers" && input.kind !== "retakes")
  )
    throw new CleanupReviewError(400, "cleanup_review_request_invalid");
  let options;
  try {
    options = normalizeCleanupOptions(input.kind, input.options);
  } catch {
    throw new CleanupReviewError(400, "cleanup_review_options_invalid");
  }
  const identity = {
    p_actor: args.actor,
    p_workspace: args.workspace,
    p_workpiece: args.workpiece,
    p_revision: args.revision,
  };
  const evidence = row(
    await store.rpc("read_cleanup_review_basis", {
      ...identity,
      p_write: args.action === "discard",
    }),
  );
  const transcriptFile = row(evidence.transcript),
    mediaFile = row(evidence.media);
  const size = Number(transcriptFile.bytes);
  if (!Number.isSafeInteger(size) || size <= 0 || size > 2097152)
    throw new CleanupReviewError(409, "cleanup_review_evidence_invalid");
  const bytes = await store.download(
    String(transcriptFile.storage_bucket),
    String(transcriptFile.storage_key),
  );
  if (
    bytes.length !== size ||
    (await hashBytes(bytes)) !== String(transcriptFile.hash_value).toLowerCase()
  )
    throw new CleanupReviewError(
      409,
      "cleanup_review_transcript_hash_mismatch",
    );
  let transcript: Row;
  try {
    transcript = row(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
    );
  } catch {
    throw new CleanupReviewError(409, "cleanup_review_transcript_invalid");
  }
  let segments;
  try {
    segments = canonicalCleanupSegments(transcript.segments);
  } catch {
    throw new CleanupReviewError(409, "cleanup_review_transcript_invalid");
  }
  const mediaRef = transcript.source_media_ref
    ? row(transcript.source_media_ref)
    : null;
  if (
    typeof transcript.transcript_id !== "string" ||
    !transcript.transcript_id ||
    (transcript.media_id || mediaRef?.media_id) !== evidence.media_id
  )
    throw new CleanupReviewError(
      409,
      "cleanup_review_transcript_identity_mismatch",
    );
  if (
    evidence.workspace_id !== args.workspace ||
    evidence.workpiece_id !== args.workpiece ||
    evidence.recording_revision_id !== args.revision
  )
    throw new CleanupReviewError(409, "cleanup_review_identity_conflict");
  const basis: CleanupBasis = {
    workspace_id: args.workspace,
    workpiece_id: args.workpiece,
    recording_revision_id: args.revision,
    canonical_recording_id: String(evidence.canonical_recording_id),
    contract_version: CLEANUP_REVIEW_VERSION,
    generator_version: CLEANUP_GENERATOR_VERSION,
    kind: input.kind,
    options,
    transcript_id: transcript.transcript_id,
    segments,
    media: {
      media_id: String(evidence.media_id),
      sha256: String(mediaFile.hash_value).toLowerCase(),
      bytes: Number(mediaFile.bytes),
    },
  };
  const basisHash = await cleanupFingerprint(basis);
  const cards = args.generate(input.kind, basis.segments, options);
  if (cards.length > 10000)
    throw new CleanupReviewError(409, "cleanup_review_candidate_limit");
  const candidates = await Promise.all(
    cards.map(async (card) => {
      const descriptor = cleanupCandidateDescriptor(card, basis.segments);
      return {
        candidate_fingerprint: await cleanupFingerprint(descriptor),
        descriptor,
      };
    }),
  );
  if (args.action === "read") {
    const decisions = await store.decisions(
      args.workspace,
      args.workpiece,
      args.revision,
      basisHash,
    );
    return {
      basis,
      basis_fingerprint: basisHash,
      candidates,
      acknowledged: [
        ...new Set(
          decisions
            .filter(
              (d) =>
                d.decision === "discard" &&
                d.contract_version === CLEANUP_REVIEW_VERSION &&
                d.basis_fingerprint === basisHash,
            )
            .map((d) => String(d.candidate_fingerprint)),
        ),
      ],
    };
  }
  if (input.basis_fingerprint !== basisHash)
    throw new CleanupReviewError(409, "cleanup_review_stale_basis");
  const candidate = candidates.find(
    (c) => c.candidate_fingerprint === input.candidate_fingerprint,
  );
  if (!candidate)
    throw new CleanupReviewError(409, "cleanup_review_candidate_mismatch");
  // RPC rechecks the exact server-read registry/revision tokens while locked.
  return store.rpc("commit_cleanup_review_discard", {
    ...identity,
    p_basis_hash: basisHash,
    p_candidate_hash: candidate.candidate_fingerprint,
    p_basis: basis,
    p_candidate: candidate.descriptor,
    p_evidence: evidence,
  });
}
