import type { Draft } from "../domain/draft";
import type { Revision } from "../domain/revision";
import type { HearthCanonicalRevisionsResult } from "../storage/hearth-store";

export type CanonicalApprovalCommitResult =
  | Readonly<{ ok: true; version: number; approvedAt: number }>
  | Readonly<{
      ok: false;
      stage: "canonical_read" | "draft_save" | "script_publish" | "approval_commit";
    }>;

export async function commitCanonicalScriptApproval(args: {
  episodeId: string;
  draft: Draft;
  readCanonicalRevisions: (input: {
    episodeId: string;
    draftId: string;
  }) => Promise<HearthCanonicalRevisionsResult>;
  nextApprovedVersion: (revisions: readonly Revision[]) => number;
  persistDraft: (input: { draft: Draft; updatedAt: number }) => Promise<boolean>;
  publishScript: (input: { episodeId: string; scriptText: string }) => Promise<boolean>;
  commitApprovalRevision: (input: {
    episodeId: string;
    draft: Draft;
    approvalNote: string;
  }) => Promise<{ ok: true; approvedAt: number } | { ok: false }>;
}): Promise<CanonicalApprovalCommitResult> {
  let canonicalRevisions: HearthCanonicalRevisionsResult;
  try {
    canonicalRevisions = await args.readCanonicalRevisions({
      episodeId: args.episodeId,
      draftId: args.draft.id,
    });
  } catch {
    return { ok: false, stage: "canonical_read" };
  }
  if (!canonicalRevisions.ok) return { ok: false, stage: "canonical_read" };

  const version = args.nextApprovedVersion(canonicalRevisions.revisions);
  const updatedAt = Date.now();
  try {
    const saved = await args.persistDraft({ draft: args.draft, updatedAt });
    if (!saved) return { ok: false, stage: "draft_save" };
  } catch {
    return { ok: false, stage: "draft_save" };
  }

  try {
    const published = await args.publishScript({
      episodeId: args.episodeId,
      scriptText: args.draft.body,
    });
    if (!published) return { ok: false, stage: "script_publish" };
  } catch {
    return { ok: false, stage: "script_publish" };
  }

  const approvalNote = `script_version_approved:v${version}`;
  try {
    const committed = await args.commitApprovalRevision({
      episodeId: args.episodeId,
      draft: args.draft,
      approvalNote,
    });
    if (!committed.ok) return { ok: false, stage: "approval_commit" };
    return { ok: true, version, approvedAt: committed.approvedAt };
  } catch {
    return { ok: false, stage: "approval_commit" };
  }
}
