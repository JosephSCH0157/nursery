import type { Revision } from "../domain/revision";
import { tongsFetch } from "./tongs-fetch";

export type ScriptApprovalState = Readonly<{
  hasApprovedScript: boolean;
  approvedScriptVersion: number | null;
  approvedAt: number | null;
}>;

export const NO_CANONICAL_SCRIPT_APPROVAL: ScriptApprovalState = Object.freeze({
  hasApprovedScript: false,
  approvedScriptVersion: null,
  approvedAt: null,
});

export async function readTongsCanonicalScriptApproval(workpieceId:string):Promise<ScriptApprovalState>{
  const response=await tongsFetch(`/tongs/workpieces/${encodeURIComponent(workpieceId)}/script-approval`,{method:"GET"});
  if(!response.ok)return NO_CANONICAL_SCRIPT_APPROVAL;
  const body=await response.json().catch(()=>null) as {data?:{current_revision?:unknown;current_approval?:{approval_revision?:unknown;created_at?:unknown}}}|null;
  const version=Number(body?.data?.current_approval?.approval_revision??body?.data?.current_revision??0);
  if(!Number.isInteger(version)||version<1)return NO_CANONICAL_SCRIPT_APPROVAL;
  const approvedAt=Date.parse(String(body?.data?.current_approval?.created_at??""));
  return{hasApprovedScript:true,approvedScriptVersion:version,approvedAt:Number.isFinite(approvedAt)?approvedAt:null};
}

export function parseApprovedVersionFromNote(note: string | undefined): number | null {
  if (!note) return null;
  const normalized = note.trim();
  if (!normalized) return null;
  const tagged = normalized.match(/script_version_approved:v(\d+)/i);
  if (tagged) {
    const parsed = Number.parseInt(tagged[1] ?? "", 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  const plain = normalized.match(/script\s+version\s+(\d+)\s+approved/i);
  if (plain) {
    const parsed = Number.parseInt(plain[1] ?? "", 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

export function nextApprovedScriptVersion(revisions: readonly Revision[]): number {
  const maxVersion = revisions.reduce((max, revision) => {
    if (revision.kind !== "milestone") return max;
    const parsed = parseApprovedVersionFromNote(revision.note);
    return parsed && parsed > max ? parsed : max;
  }, 0);
  return maxVersion + 1;
}

export function resolveCanonicalScriptApproval(
  revisions: readonly Revision[],
  draftId: string | null | undefined,
): ScriptApprovalState {
  const normalizedDraftId = draftId?.trim() ?? "";
  if (!normalizedDraftId) return NO_CANONICAL_SCRIPT_APPROVAL;

  let latest: { version: number; approvedAt: number } | null = null;
  for (const revision of revisions) {
    if (revision.draftId !== normalizedDraftId || revision.kind !== "milestone") continue;
    const version = parseApprovedVersionFromNote(revision.note);
    if (!version) continue;
    if (!latest || version > latest.version || (version === latest.version && revision.createdAt > latest.approvedAt)) {
      latest = { version, approvedAt: revision.createdAt };
    }
  }
  return latest
    ? {
        hasApprovedScript: true,
        approvedScriptVersion: latest.version,
        approvedAt: latest.approvedAt,
      }
    : NO_CANONICAL_SCRIPT_APPROVAL;
}

export function isScriptApprovalStateEqual(
  left: ScriptApprovalState,
  right: ScriptApprovalState,
): boolean {
  return left.hasApprovedScript === right.hasApprovedScript
    && left.approvedScriptVersion === right.approvedScriptVersion
    && left.approvedAt === right.approvedAt;
}
