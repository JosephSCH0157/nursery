import { tongsFetch } from "./tongs-fetch";
import { canonicalHearthApprovalText } from "./hearth-script-approval";

function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
async function json(response: Response): Promise<unknown> { try { return await response.json(); } catch { return null; } }
type ApprovalFailure = { ok: false; error: string; status?: number; code?: string };

function responseFailure(response: Response, body: unknown, fallback: string): ApprovalFailure {
  const error = record(body) && record(body.error) ? body.error : null;
  const code = error && typeof error.code === "string" ? error.code : "tongs_request_failed";
  if (code === "unauthorized") {
    return {
      ok: false,
      status: 401,
      code,
      error: "Tongs rejected the local API credential. Reload after restoring the configured Tongs request token.",
    };
  }
  if (code === "missing_tongs_auth") {
    return {
      ok: false,
      status: 401,
      code,
      error: "Tongs authentication is not configured for this browser session.",
    };
  }
  if (code === "missing_user_token_header") {
    return {
      ok: false,
      status: 401,
      code,
      error: "Sign in again before approving the canonical script.",
    };
  }
  if (code === "stale_script_draft") {
    return {
      ok: false,
      status: response.status,
      code,
      error: "The working draft changed before approval. Reload it and approve again.",
    };
  }
  return { ok: false, status: response.status, code, error: fallback };
}
async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function hashCanonicalHearthApprovalText(scriptText: string): Promise<string> {
  return sha256(canonicalHearthApprovalText(scriptText));
}

export type PublishedScriptApprovalAuthority = Readonly<{
  approvalId: string; approvalRevision: number; contentHash: string; sourceFileRevision: number;
  disposition: "committed" | "no_change";
}>;

export async function readPublishedScriptApprovalAuthority(workpieceId: string): Promise<PublishedScriptApprovalAuthority | null> {
  const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(workpieceId)}/script-approval`, { method: "GET" });
  const body = await json(response);
  const root = record(body) && body.ok === true && record(body.data) ? body.data : null;
  const approval = root && record(root.current_approval) ? root.current_approval : null;
  if (!response.ok || !approval) return null;
  const approvalId = typeof approval.id === "string" ? approval.id : "";
  const approvalRevision = Number(approval.approval_revision);
  const contentHash = typeof approval.script_content_hash === "string" ? approval.script_content_hash : "";
  const sourceFileRevision = Number(approval.source_file_revision);
  return approvalId && Number.isInteger(approvalRevision) && Number.isInteger(sourceFileRevision) && /^[a-f0-9]{64}$/.test(contentHash)
    ? { approvalId, approvalRevision, contentHash, sourceFileRevision, disposition: "no_change" }
    : null;
}

export async function commitPublishedScriptApprovalAuthority(args: {
  workpieceId: string; workspaceId: string; creatorVersion: number; scriptText: string; operationId?: string;
  isCurrent: () => boolean;
}): Promise<{ ok: true; authority: PublishedScriptApprovalAuthority } | ApprovalFailure> {
  const expectedSourceHash = await hashCanonicalHearthApprovalText(args.scriptText);
  const changed = { ok: false as const, error: "The working draft changed before approval. Reload the current script and approve it deliberately." };
  if (!args.isCurrent()) return changed;
  const [projectionResponse, sourceResponse] = await Promise.all([
    tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/script-approval`, { method: "GET" }),
    tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/read-file?path=${encodeURIComponent("script/script.md")}`, { method: "GET" }),
  ]);
  const [projectionBody, sourceBody] = await Promise.all([json(projectionResponse), json(sourceResponse)]);
  if (!projectionResponse.ok) return responseFailure(projectionResponse, projectionBody, "Canonical script approval state could not be read.");
  if (!record(projectionBody) || projectionBody.ok !== true || !record(projectionBody.data)) return { ok: false, error: "Canonical script approval state could not be read." };
  const expectedApprovalRevision = Number(projectionBody.data.current_revision ?? 0);
  if (!Number.isInteger(expectedApprovalRevision) || expectedApprovalRevision < 0) return { ok: false, error: "Canonical script approval state was malformed." };
  const sourceData = record(sourceBody) && record(sourceBody.file_row) ? sourceBody.file_row : record(sourceBody) && record(sourceBody.data) && record(sourceBody.data.file_row) ? sourceBody.data.file_row : null;
  const returnedSourceRevision = Number(sourceData?.revision);
  const returnedSourceHash = typeof sourceData?.hash_value === "string" ? sourceData.hash_value.toLowerCase() : "";
  if (!sourceResponse.ok) return responseFailure(sourceResponse, sourceBody, "The canonical script could not be read for approval.");
  if (!args.isCurrent() || !Number.isInteger(returnedSourceRevision) || returnedSourceRevision < 1 || returnedSourceHash !== expectedSourceHash) return changed;

  const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/script-approval`, {
    method: "POST",
    json: { workspace_id: args.workspaceId, expected_current_revision: expectedApprovalRevision, expected_source_file_revision: returnedSourceRevision, expected_source_content_hash: expectedSourceHash, creator_version_label: `v${args.creatorVersion}`, operation_id: args.operationId ?? `forge:script-approval:hearth-v4:${args.workpieceId}:${returnedSourceRevision}:${expectedSourceHash.slice(0, 24)}` },
  });
  const body = await json(response);
  if (!response.ok || !record(body) || body.ok !== true || !record(body.data)) {
    return responseFailure(response, body, "Tongs did not acknowledge canonical script approval.");
  }
  const disposition = body.data.disposition;
  const approval = record(body.data.approval) ? body.data.approval : null;
  const approvalId = typeof approval?.id === "string" ? approval.id : "";
  const approvalRevision = Number(approval?.approval_revision);
  const contentHash = typeof approval?.script_content_hash === "string" ? approval.script_content_hash : "";
  const sourceFileRevision = Number(approval?.source_file_revision);
  if ((disposition !== "committed" && disposition !== "no_change") || !approvalId || !Number.isInteger(approvalRevision) || contentHash !== expectedSourceHash || sourceFileRevision !== returnedSourceRevision) {
    const error = disposition === "revision_conflict" ? "The approved script changed concurrently. Reload and approve again." : disposition === "stale_source" ? "The working draft changed before approval. Reload it and approve again." : "Tongs rejected canonical script approval.";
    return { ok: false, error };
  }

  return { ok: true, authority: { approvalId, approvalRevision, contentHash, sourceFileRevision, disposition } };
}

export async function markApprovedScriptReady(args: {
  workpieceId: string;
  workspaceId: string;
  authority: PublishedScriptApprovalAuthority;
}): Promise<{ ok: true; readyTransitionId: string } | { ok: false; error: string }> {
  const readyResponse = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/ready-transition`, {
    method: "POST",
    json: { workspace_id: args.workspaceId, script_approval_id: args.authority.approvalId, idempotency_key: `hearth-approved-ready-v4:${args.workpieceId}:${args.authority.approvalId}`, publish_evidence: { transition: "hearth.approved-script.ready.v4", script_approval_id: args.authority.approvalId, script_approval_revision: args.authority.approvalRevision, script_approval_hash: args.authority.contentHash } },
  });
  const readyBody = await json(readyResponse);
  const readyData = record(readyBody) && record(readyBody.data) ? readyBody.data : null;
  const ready = readyData && record(readyData.ready) ? readyData.ready : null;
  const readyOutcome = typeof readyData?.outcome === "string" ? readyData.outcome : "";
  const readyTransitionId = typeof ready?.transition_id === "string" ? ready.transition_id : "";
  if (!readyResponse.ok || (readyOutcome !== "saved" && readyOutcome !== "duplicate") || !readyTransitionId) return { ok: false, error: "The approved script could not enter Ready because its exact canonical revision is no longer current." };
  return { ok: true, readyTransitionId };
}
