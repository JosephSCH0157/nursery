import { tongsFetch } from "./tongs-fetch";

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

async function json(response: Response): Promise<unknown> {
  try { return await response.json(); } catch { return null; }
}

export async function commitPublishedScriptApprovalAuthority(args: {
  workpieceId: string;
  workspaceId: string;
  creatorVersion: number;
}): Promise<{ ok: true; disposition: string } | { ok: false; error: string }> {
  const projectionResponse = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/script-approval`, { method: "GET" });
  const projectionBody = await json(projectionResponse);
  if (!projectionResponse.ok || !record(projectionBody) || projectionBody.ok !== true || !record(projectionBody.data)) {
    return { ok: false, error: "Canonical script approval state could not be read." };
  }
  const expected = Number(projectionBody.data.current_revision ?? 0);
  if (!Number.isInteger(expected) || expected < 0) return { ok: false, error: "Canonical script approval state was malformed." };
  const operationId = `forge:script-approval:hearth:${crypto.randomUUID()}`;
  const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/script-approval`, {
    method: "POST",
    json: {
      workspace_id: args.workspaceId,
      expected_current_revision: expected,
      creator_version_label: `v${args.creatorVersion}`,
      operation_id: operationId,
    },
  });
  const body = await json(response);
  if (!response.ok || !record(body) || body.ok !== true || !record(body.data)) {
    return { ok: false, error: "Tongs did not acknowledge canonical script approval." };
  }
  const disposition = typeof body.data.disposition === "string" ? body.data.disposition : "";
  if (disposition !== "committed" && disposition !== "no_change") {
    return { ok: false, error: disposition === "revision_conflict" ? "The approved script changed concurrently. Reload and approve again." : "Tongs rejected canonical script approval." };
  }
  return { ok: true, disposition };
}
