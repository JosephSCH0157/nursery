import type { HearthResearchResult } from "./hearth-research-contract";
import {
  buildHearthEditorialPreflightReport,
  HEARTH_PREFLIGHT_CHECKER_VERSION,
  type HearthEditorialPreflightFinding,
  type HearthEditorialPreflightReport,
} from "./hearth-editorial-preflight";
import { tongsFetch } from "./tongs-fetch";

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

async function json(response: Response): Promise<unknown> {
  try { return await response.json(); } catch { return null; }
}

function canonicalText(value: string): string {
  return value.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").normalize("NFC");
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (record(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

export async function hashHearthScriptContent(value: string): Promise<string> {
  return sha256(canonicalText(value));
}

function errorMessage(body: unknown, fallback: string): string {
  if (record(body) && record(body.error) && typeof body.error.message === "string") return body.error.message;
  if (record(body) && record(body.data) && typeof body.data.reason === "string") return `${fallback} (${body.data.reason})`;
  return fallback;
}

export type CanonicalHearthResearchAuthority = Readonly<{
  id: string;
  revision: number;
  contentHash: string;
  result: HearthResearchResult;
}>;

export type HearthPreflightAuthority = Readonly<{
  id: string;
  revision: number;
  sourceFileRevision: number;
  scriptHash: string;
  researchArtifactId: string | null;
  researchArtifactHash: string | null;
  report: HearthEditorialPreflightReport;
  findings: Array<HearthEditorialPreflightFinding & { latestAction: "acknowledge" | "resolve" | null }>;
  reviewed: boolean;
  stale: boolean;
  staleReasons: string[];
}>;

export function buildCanonicalHearthResearchResult(result: HearthResearchResult): HearthResearchResult {
  return {
    ...result,
    evidence: result.evidence?.map((entry) => ({ ...entry, excerpt: entry.excerpt?.slice(0, 8192) ?? null })),
    sources: result.sources.map((source) => ({
      ...source,
      snippet: source.snippet?.slice(0, 4096) ?? null,
      extractedText: null,
      transcript: null,
      transcriptSegments: null,
      attributedQuotes: source.attributedQuotes?.slice(0, 24).map((quote) => ({
        ...quote,
        text: quote.text.slice(0, 2048),
        context: quote.context?.slice(0, 2048) ?? null,
      })) ?? null,
    })),
  };
}

function parseResearchAuthority(body: unknown): CanonicalHearthResearchAuthority | null {
  const data = record(body) && body.ok === true && record(body.data) ? body.data : record(body) ? body : null;
  const artifact = data && record(data.artifact) ? data.artifact : null;
  const artifactJson = artifact && record(artifact.artifact_json) ? artifact.artifact_json : null;
  const result = artifactJson && record(artifactJson.result) ? artifactJson.result as unknown as HearthResearchResult : null;
  const id = typeof artifact?.id === "string" ? artifact.id : "";
  const revision = Number(artifact?.revision);
  const contentHash = typeof artifact?.artifact_content_hash === "string" ? artifact.artifact_content_hash : "";
  return id && Number.isInteger(revision) && revision > 0 && /^[a-f0-9]{64}$/.test(contentHash) && result
    ? { id, revision, contentHash, result }
    : null;
}

export async function readCanonicalHearthResearch(args: { workspaceId: string; workpieceId: string }): Promise<CanonicalHearthResearchAuthority | null> {
  const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/hearth-research?workspace_id=${encodeURIComponent(args.workspaceId)}`, { method: "GET" });
  const body = await json(response);
  if (!response.ok) throw new Error(errorMessage(body, "Canonical Hearth research could not be read."));
  const data = record(body) && record(body.data) ? body.data : null;
  const disposition = typeof data?.disposition === "string" ? data.disposition : null;
  if (disposition !== "current" && disposition !== "empty") throw new Error(disposition === "integrity_error" ? "Canonical Hearth research failed its integrity check." : "Canonical Hearth research authority was unavailable.");
  return parseResearchAuthority(body);
}

export async function commitCanonicalHearthResearch(args: { workspaceId: string; workpieceId: string; result: HearthResearchResult }): Promise<CanonicalHearthResearchAuthority | null> {
  if (args.result.artifact?.status !== "complete" && args.result.artifact?.status !== "partial") return null;
  const canonicalResult = buildCanonicalHearthResearchResult(args.result);
  const currentResponse = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/hearth-research?workspace_id=${encodeURIComponent(args.workspaceId)}`, { method: "GET" });
  const currentBody = await json(currentResponse);
  if (!currentResponse.ok) throw new Error(errorMessage(currentBody, "Canonical Hearth research state could not be read before saving."));
  const currentData = record(currentBody) && record(currentBody.data) ? currentBody.data : null;
  const currentArtifact = currentData && record(currentData.artifact) ? currentData.artifact : null;
  const expectedRevision = Number(currentArtifact?.revision ?? 0);
  const expectedRevisionId = typeof currentArtifact?.id === "string" ? currentArtifact.id : null;
  const fingerprint = canonicalResult.brief?.briefFingerprint ?? canonicalResult.artifact!.briefFingerprint;
  const payloadHash = await sha256(stableJson(canonicalResult));
  const operationId = `forge:hearth-research:commit:${args.workpieceId}:${fingerprint.replace(/[^a-zA-Z0-9._:-]/g, "").slice(0, 32)}:${payloadHash.slice(0, 24)}`;
  const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/hearth-research`, {
    method: "POST",
    json: {
      workspace_id: args.workspaceId,
      expected_revision: expectedRevision,
      expected_revision_id: expectedRevisionId,
      artifact_json: { schema: "forge.hearth.research-artifact.v1", result: canonicalResult },
      contract_version: "forge.hearth.research-artifact.v1",
      operation_id: operationId,
    },
  });
  const body = await json(response);
  if (!response.ok || !record(body) || body.ok !== true || !record(body.data) || !record(body.data.artifact)) throw new Error(errorMessage(body, "Canonical Hearth research was not saved."));
  const artifact = body.data.artifact;
  return {
    id: String(artifact.id),
    revision: Number(artifact.revision),
    contentHash: String(artifact.artifact_content_hash),
    result: canonicalResult,
  };
}

function parsePreflight(body: unknown): HearthPreflightAuthority | null {
  const data = record(body) && body.ok === true && record(body.data) ? body.data : record(body) ? body : null;
  const reportRow = data && record(data.report) ? data.report : null;
  const reportJson = reportRow && record(reportRow.report_json) ? reportRow.report_json as unknown as HearthEditorialPreflightReport : null;
  if (!reportRow || !reportJson || reportJson.schema !== "forge.hearth.editorial-preflight.v1") return null;
  const rawFindings = Array.isArray(data?.findings) ? data.findings : [];
  return {
    id: String(reportRow.id),
    revision: Number(reportRow.revision),
    sourceFileRevision: Number(reportRow.source_file_revision),
    scriptHash: String(reportRow.script_content_hash),
    researchArtifactId: typeof reportRow.research_artifact_id === "string" ? reportRow.research_artifact_id : null,
    researchArtifactHash: typeof reportRow.research_artifact_hash === "string" ? reportRow.research_artifact_hash : null,
    report: reportJson,
    findings: rawFindings.flatMap((value) => {
      if (!record(value)) return [];
      const findingJson = record(value.finding_json) ? value.finding_json : value;
      const finding = findingJson as unknown as HearthEditorialPreflightFinding;
      if (!finding.id || !finding.code || !finding.message) return [];
      return [{ ...finding, latestAction: value.latest_action === "acknowledge" || value.latest_action === "resolve" ? value.latest_action : null }];
    }),
    reviewed: record(data?.review),
    stale: data?.disposition === "stale",
    staleReasons: Array.isArray(data?.stale_reasons) ? data.stale_reasons.filter((value): value is string => typeof value === "string") : [],
  };
}

export async function readCurrentHearthPreflight(args: { workspaceId: string; workpieceId: string }): Promise<HearthPreflightAuthority | null> {
  const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/hearth-preflight?workspace_id=${encodeURIComponent(args.workspaceId)}`, { method: "GET" });
  const body = await json(response);
  if (!response.ok) throw new Error(errorMessage(body, "Optional Hearth script check could not be read."));
  const data = record(body) && record(body.data) ? body.data : null;
  const disposition = typeof data?.disposition === "string" ? data.disposition : null;
  if (disposition !== "current" && disposition !== "stale" && disposition !== "empty") throw new Error(disposition === "integrity_error" ? "The optional Hearth script check failed its integrity check." : "Optional Hearth script-check state was unavailable.");
  return parsePreflight(body);
}

export async function commitHearthPreflight(args: { workspaceId: string; workpieceId: string; scriptText: string; research: CanonicalHearthResearchAuthority | null }): Promise<HearthPreflightAuthority> {
  const [sourceResponse, current] = await Promise.all([
    tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/read-file?path=${encodeURIComponent("script/script.md")}`, { method: "GET" }),
    readCurrentHearthPreflight({ workspaceId: args.workspaceId, workpieceId: args.workpieceId }),
  ]);
  const sourceBody = await json(sourceResponse);
  const sourceData = record(sourceBody) && record(sourceBody.file_row) ? sourceBody.file_row : record(sourceBody) && record(sourceBody.data) && record(sourceBody.data.file_row) ? sourceBody.data.file_row : null;
  const sourceRevision = Number(sourceData?.revision);
  const sourceHash = typeof sourceData?.hash_value === "string" ? sourceData.hash_value.toLowerCase() : "";
  const localHash = await hashHearthScriptContent(args.scriptText);
  if (!sourceResponse.ok || !Number.isInteger(sourceRevision) || sourceRevision < 1 || sourceHash !== localHash) throw new Error("Save the current working draft before running the optional script check.");
  const report = buildHearthEditorialPreflightReport({ scriptText: args.scriptText, researchResult: args.research?.result ?? null });
  const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/hearth-preflight`, {
    method: "POST",
    json: {
      workspace_id: args.workspaceId,
      expected_revision: current?.revision ?? 0,
      expected_revision_id: current?.id ?? null,
      expected_source_file_revision: sourceRevision,
      expected_script_hash: sourceHash,
      research_artifact_id: args.research?.id ?? null,
      research_artifact_hash: args.research?.contentHash ?? null,
      checker_contract_version: HEARTH_PREFLIGHT_CHECKER_VERSION,
      report_json: report,
      operation_id: `forge:hearth-preflight:review:${args.workpieceId}:${sourceRevision}:${sourceHash.slice(0, 24)}`,
    },
  });
  const body = await json(response);
  if (!response.ok || !record(body) || body.ok !== true || !record(body.data)) throw new Error(errorMessage(body, "The optional Hearth script check was not saved."));
  const disposition = typeof body.data.disposition === "string" ? body.data.disposition : "";
  if (disposition !== "committed" && disposition !== "duplicate") throw new Error(errorMessage(body, `The optional Hearth script check was not saved (${disposition || "unknown"}).`));
  const reportRow = record(body.data.report) ? body.data.report : null;
  if (!reportRow) throw new Error("Tongs returned malformed optional script-check state.");
  return {
    id: String(reportRow.id), revision: Number(reportRow.revision), sourceFileRevision: sourceRevision,
    scriptHash: sourceHash, researchArtifactId: args.research?.id ?? null, researchArtifactHash: args.research?.contentHash ?? null,
    report, findings: report.findings.map((finding) => ({ ...finding, latestAction: null })), reviewed: false, stale: false, staleReasons: [],
  };
}

export async function decideHearthPreflightFinding(args: { workspaceId: string; workpieceId: string; reportId: string; finding: HearthEditorialPreflightFinding; action: "acknowledge" | "resolve"; note?: string }): Promise<void> {
  const findingKey = args.finding.id.replace(/[^a-zA-Z0-9._:-]/g, "").slice(0, 48) || "finding";
  const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/hearth-preflight/finding`, { method: "POST", json: {
    workspace_id: args.workspaceId, report_id: args.reportId, finding_key: args.finding.id, action: args.action, note: args.note ?? null,
    operation_id: `forge:hearth-preflight-finding:${args.reportId}:${findingKey}:${args.action}`,
  } });
  const body = await json(response);
  const disposition = record(body) && record(body.data) ? body.data.disposition : null;
  if (!response.ok || (disposition !== "saved" && disposition !== "duplicate")) throw new Error(errorMessage(body, "The finding decision was not saved."));
}

export async function completeHearthPreflightReview(args: { workspaceId: string; workpieceId: string; reportId: string }): Promise<void> {
  const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/hearth-preflight/review`, { method: "POST", json: {
    workspace_id: args.workspaceId, report_id: args.reportId,
    operation_id: `forge:hearth-preflight-review:${args.workpieceId}:${args.reportId}`,
  } });
  const body = await json(response);
  const disposition = record(body) && record(body.data) ? body.data.disposition : null;
  if (!response.ok || (disposition !== "reviewed" && disposition !== "duplicate")) throw new Error(disposition === "blocked" ? "To save optional review status, note or address each advisory finding first." : errorMessage(body, "Optional script-review status was not saved."));
}
