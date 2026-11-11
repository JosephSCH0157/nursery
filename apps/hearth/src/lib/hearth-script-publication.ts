import { tongsFetch } from './tongs-fetch';
import { canonicalHearthApprovalText } from './hearth-script-approval';
import { hashCanonicalHearthApprovalText } from './hearth-script-approval-authority';
export type ScriptBasis = { revision: number; hash: string | null };
export type ScriptAcknowledgment = { revision: number; hash: string; bytes: number };
export class ScriptPublicationConflict extends Error {}
export async function publishReviewedScript(args: {
  workspaceId: string; workpieceId: string; operationId: string; text: string; basis: ScriptBasis;
}): Promise<ScriptAcknowledgment> {
  const text = canonicalHearthApprovalText(args.text), hash = await hashCanonicalHearthApprovalText(text);
  const bytes = new TextEncoder().encode(text).length;
  const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/script-publication`, {
    method: 'POST', json: { workspace_id: args.workspaceId, operation_id: args.operationId,
      expected_revision: args.basis.revision, expected_hash: args.basis.hash, text },
  });
  const body = await response.json();
  const receipt = body?.data?.receipt;
  if (response.status === 409) throw new ScriptPublicationConflict('Another editor changed the canonical script. Reload and review before saving again.');
  if (!response.ok || body?.data?.state !== 'committed') throw new Error('Canonical publication was not confirmed. Retry this Save to recover the same operation.');
  if (receipt?.operation_id !== args.operationId || receipt?.workpiece_id !== args.workpieceId || receipt?.workspace_id !== args.workspaceId
    || receipt?.path !== 'script/script.md' || receipt?.sha256 !== hash || receipt?.bytes !== bytes
    || !Number.isSafeInteger(receipt?.revision) || receipt.revision < 1
    || receipt.revision !== args.basis.revision + (receipt.unchanged === true ? 0 : 1)) {
    throw new Error('Canonical publication receipt does not match the reviewed script. Approval remains blocked.');
  }
  return { revision: receipt.revision, hash, bytes };
}
