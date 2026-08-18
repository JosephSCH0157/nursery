export type EditorialAuthorityArtifactState = Readonly<{ hash: string | null; updatedAt: string | null }>;
export type EditorialAuthorityPointerState = Readonly<{ path: string | null; fingerprint: string | null; authorityRevision: number; revisionUpdatedAt: string }>;
export type EditorialAuthorityCommitState = Readonly<{ artifact: EditorialAuthorityArtifactState; pointer: EditorialAuthorityPointerState }>;
export type EditorialAuthorityCommitPlan = Readonly<{ path: string; originalArtifact: EditorialAuthorityArtifactState; originalPointer: EditorialAuthorityPointerState; intendedHash: string; intendedBytes: Uint8Array }>;

export interface EditorialAuthorityCommitAdapter {
  read(): Promise<EditorialAuthorityCommitState>;
  writeArtifact(args: { path: string; bytes: Uint8Array; expectedUpdatedAt: string | null }): Promise<EditorialAuthorityArtifactState>;
  acknowledgePointer(args: { path: string; fingerprint: string; expected: EditorialAuthorityPointerState }): Promise<EditorialAuthorityPointerState>;
  compensateArtifact(args: { path: string; original: EditorialAuthorityArtifactState; expectedWrittenUpdatedAt: string }): Promise<void>;
}

export class EditorialAuthorityCommitError extends Error {
  readonly code: "original_state_mismatch" | "foreign_state" | "acknowledgement_failed" | "compensation_failed";

  constructor(code: "original_state_mismatch" | "foreign_state" | "acknowledgement_failed" | "compensation_failed", message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.code = code;
    this.name = "EditorialAuthorityCommitError";
  }
}

const artifactEquals = (left: EditorialAuthorityArtifactState, right: EditorialAuthorityArtifactState) => left.hash === right.hash && left.updatedAt === right.updatedAt;
const pointerEquals = (left: EditorialAuthorityPointerState, right: EditorialAuthorityPointerState) => left.path === right.path && left.fingerprint === right.fingerprint && left.authorityRevision === right.authorityRevision && left.revisionUpdatedAt === right.revisionUpdatedAt;
const isCompleted = (state: EditorialAuthorityCommitState, plan: EditorialAuthorityCommitPlan) => state.artifact.hash === plan.intendedHash && state.pointer.path === plan.path && state.pointer.fingerprint === plan.intendedHash && state.pointer.authorityRevision === plan.originalPointer.authorityRevision + 1;

export async function commitHammerEditorialAuthorityTwoPhase(args: { plan: EditorialAuthorityCommitPlan; adapter: EditorialAuthorityCommitAdapter }): Promise<Readonly<{ disposition: "committed" | "already_committed"; state: EditorialAuthorityCommitState; writes: number; compensations: number }>> {
  const initial = await args.adapter.read();
  if (isCompleted(initial, args.plan)) return { disposition: "already_committed", state: initial, writes: 0, compensations: 0 };
  if (!artifactEquals(initial.artifact, args.plan.originalArtifact) || !pointerEquals(initial.pointer, args.plan.originalPointer)) throw new EditorialAuthorityCommitError("original_state_mismatch", "Editorial-authority originals no longer match canonical state.");

  const written = await args.adapter.writeArtifact({ path: args.plan.path, bytes: args.plan.intendedBytes, expectedUpdatedAt: args.plan.originalArtifact.updatedAt });
  if (written.hash !== args.plan.intendedHash || !written.updatedAt) throw new EditorialAuthorityCommitError("foreign_state", "Artifact write acknowledgement did not match the frozen intended bytes.");

  try {
    await args.adapter.acknowledgePointer({ path: args.plan.path, fingerprint: args.plan.intendedHash, expected: args.plan.originalPointer });
  } catch (error) {
    const reread = await args.adapter.read();
    if (isCompleted(reread, args.plan)) return { disposition: "committed", state: reread, writes: 2, compensations: 0 };
    const pointerUntouched = pointerEquals(reread.pointer, args.plan.originalPointer);
    const artifactIsWritten = reread.artifact.hash === args.plan.intendedHash && reread.artifact.updatedAt === written.updatedAt;
    if (!pointerUntouched || !artifactIsWritten) throw new EditorialAuthorityCommitError("foreign_state", "Canonical state changed during editorial-authority acknowledgement.", { cause: error });
    try {
      await args.adapter.compensateArtifact({ path: args.plan.path, original: args.plan.originalArtifact, expectedWrittenUpdatedAt: written.updatedAt });
    } catch (compensationError) {
      throw new EditorialAuthorityCommitError("compensation_failed", "Editorial-authority artifact compensation failed.", { cause: compensationError });
    }
    throw new EditorialAuthorityCommitError("acknowledgement_failed", "Editorial-authority pointer acknowledgement failed and the artifact was compensated.", { cause: error });
  }

  const finalState = await args.adapter.read();
  if (!isCompleted(finalState, args.plan)) throw new EditorialAuthorityCommitError("foreign_state", "Editorial-authority final verification did not match the intended state.");
  return { disposition: "committed", state: finalState, writes: 2, compensations: 0 };
}
