import { tongsFetch } from "./tongs-fetch";

function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
async function json(response: Response): Promise<unknown> { try { return await response.json(); } catch { return null; } }
function canonicalApprovalText(value: string): string { return value.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").normalize("NFC"); }
async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export type PublishedScriptApprovalAuthority = Readonly<{
  approvalId: string; approvalRevision: number; contentHash: string; sourceFileRevision: number;
  disposition: "committed" | "no_change";
}>;

export async function commitPublishedScriptApprovalAuthority(args: {
  workpieceId: string; workspaceId: string; creatorVersion: number; scriptText: string; operationId?: string;
}): Promise<{ ok: true; authority: PublishedScriptApprovalAuthority; readyTransitionId: string } | { ok: false; error: string }> {
  const projectionResponse = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/script-approval`, { method: "GET" });
  const projectionBody = await json(projectionResponse);
  if (!projectionResponse.ok || !record(projectionBody) || projectionBody.ok !== true || !record(projectionBody.data)) return { ok: false, error: "Canonical script approval state could not be read." };
  const expectedApprovalRevision = Number(projectionBody.data.current_revision ?? 0);
  if (!Number.isInteger(expectedApprovalRevision) || expectedApprovalRevision < 0) return { ok: false, error: "Canonical script approval state was malformed." };

  const sourceResponse = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/read-file?path=${encodeURIComponent("script/script.md")}`, { method: "GET" });
  const sourceBody = await json(sourceResponse);
  const sourceData = record(sourceBody) && record(sourceBody.file_row) ? sourceBody.file_row : record(sourceBody) && record(sourceBody.data) && record(sourceBody.data.file_row) ? sourceBody.data.file_row : null;
  const expectedSourceRevision = Number(sourceData?.revision);
  const expectedSourceHash = await sha256(canonicalApprovalText(args.scriptText));
  const returnedSourceHash = typeof sourceData?.hash_value === "string" ? sourceData.hash_value.toLowerCase() : "";
  if (!sourceResponse.ok || !Number.isInteger(expectedSourceRevision) || expectedSourceRevision < 1 || returnedSourceHash !== expectedSourceHash) return { ok: false, error: "The working draft changed before approval. Reload the current script and approve it deliberately." };

  const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/script-approval`, {
    method: "POST",
    json: { workspace_id: args.workspaceId, expected_current_revision: expectedApprovalRevision, expected_source_file_revision: expectedSourceRevision, expected_source_content_hash: expectedSourceHash, creator_version_label: `v${args.creatorVersion}`, operation_id: args.operationId ?? `forge:script-approval:hearth:${args.workpieceId}:${expectedSourceRevision}:${expectedSourceHash.slice(0, 24)}` },
  });
  const body = await json(response);
  if (!response.ok || !record(body) || body.ok !== true || !record(body.data)) {
    const code = record(body) && record(body.error) && typeof body.error.code === "string" ? body.error.code : "";
    return { ok: false, error: code === "stale_script_draft" ? "The working draft changed before approval. Reload it and approve again." : "Tongs did not acknowledge canonical script approval." };
  }
  const disposition = body.data.disposition;
  const approval = record(body.data.approval) ? body.data.approval : null;
  const approvalId = typeof approval?.id === "string" ? approval.id : "";
  const approvalRevision = Number(approval?.approval_revision);
  const contentHash = typeof approval?.script_content_hash === "string" ? approval.script_content_hash : "";
  const sourceFileRevision = Number(approval?.source_file_revision);
  if ((disposition !== "committed" && disposition !== "no_change") || !approvalId || !Number.isInteger(approvalRevision) || contentHash !== expectedSourceHash || sourceFileRevision !== expectedSourceRevision) {
    const error = disposition === "revision_conflict" ? "The approved script changed concurrently. Reload and approve again." : disposition === "stale_source" ? "The working draft changed before approval. Reload it and approve again." : "Tongs rejected canonical script approval.";
    return { ok: false, error };
  }

  const readyResponse = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/ready-transition`, {
    method: "POST",
    json: { workspace_id: args.workspaceId, script_approval_id: approvalId, idempotency_key: `hearth-approved-ready:${args.workpieceId}:${approvalId}`, publish_evidence: { transition: "hearth.approved-script.ready.v2", script_approval_id: approvalId, script_approval_revision: approvalRevision, script_approval_hash: contentHash } },
  });
  const readyBody = await json(readyResponse);
  const readyData = record(readyBody) && record(readyBody.data) ? readyBody.data : null;
  const ready = readyData && record(readyData.ready) ? readyData.ready : null;
  const readyOutcome = typeof readyData?.outcome === "string" ? readyData.outcome : "";
  const readyTransitionId = typeof ready?.transition_id === "string" ? ready.transition_id : "";
  if (!readyResponse.ok || (readyOutcome !== "saved" && readyOutcome !== "duplicate") || !readyTransitionId) return { ok: false, error: "The script was approved, but it could not enter Ready. Retry publishing this approved version." };
  return { ok: true, authority: { approvalId, approvalRevision, contentHash, sourceFileRevision, disposition }, readyTransitionId };
}
