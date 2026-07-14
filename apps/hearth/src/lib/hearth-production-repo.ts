import { tongsFetch } from "./tongs-fetch";
import {
  applyProductionArtifactToEpisodePackage,
  buildDefaultMetadataDocument,
  hydrateEpisodePackageV2,
} from "./episode-package-v2";
import { canonicalFramingEquals } from "./hearth-framing-authority";
import { resolveImageMapScriptAnchorFromText } from "./hearth-image-map-beats";
import { readHearthPrimaryScript } from "./hearth-script-repo";

type WrittenBy = {
  tool: string;
  tool_version: string;
  lane: string;
};

export type ProductionArtifactKind = "seo" | "tags" | "thumbnails" | "image_beat_sheet" | "pack";

export type ProductionCommitResult =
  | { ok: true }
  | { ok: false; status?: number; reason: string };

export type ProductionArtifactReadResult =
  | { ok: true; payload: unknown }
  | { ok: false; status?: number; reason: "not_found" | "request_failed" | "invalid_response" };

const DEFAULT_LANE = "forge-managed";
const DEFAULT_TOOL_VERSION = "0.0.0";
let correlationSeq = 0;

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeIso(value: unknown, fallbackIso?: string): string {
  const raw = readString(value);
  if (!raw) return fallbackIso ?? new Date().toISOString();
  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp)) return fallbackIso ?? new Date().toISOString();
  return new Date(timestamp).toISOString();
}

async function readJsonBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function isCommitAck(body: unknown): boolean {
  if (!isRecord(body)) return false;
  if (body.ok === true || body.success === true) return true;
  if (isRecord(body.data) && (body.data.ok === true || body.data.success === true)) return true;
  return false;
}

function readRawTextFromPayload(payload: unknown): string {
  if (!isRecord(payload)) return "";
  return readString(payload.raw_text) ?? "";
}

function readGeneratedAtFromPayload(payload: unknown): string {
  if (!isRecord(payload)) return new Date().toISOString();
  return normalizeIso(payload.generated_at);
}

function resolveLane(): string {
  if (typeof window !== "undefined") {
    try {
      const query = new URLSearchParams(window.location.search || "");
      const fromQuery = readString(query.get("forge_lane") ?? query.get("lane"));
      if (fromQuery) return fromQuery;
    } catch {
      // ignore query parsing failures
    }
    try {
      const w = window as typeof window & { __forgeLane?: unknown; __tpLane?: unknown };
      const fromWindow = readString(w.__forgeLane ?? w.__tpLane);
      if (fromWindow) return fromWindow;
    } catch {
      // ignore global inspection failures
    }
    try {
      const fromStorage = readString(window.localStorage.getItem("forge_lane_v1"));
      if (fromStorage) return fromStorage;
    } catch {
      // ignore storage failures
    }
  }
  return DEFAULT_LANE;
}

function resolveToolVersion(): string {
  if (typeof window !== "undefined") {
    try {
      const w = window as typeof window & { APP_VERSION?: unknown };
      const fromWindow = readString(w.APP_VERSION);
      if (fromWindow) return fromWindow;
    } catch {
      // ignore global inspection failures
    }
  }
  return DEFAULT_TOOL_VERSION;
}

function buildWrittenBy(): WrittenBy {
  return {
    tool: "hearth",
    tool_version: resolveToolVersion(),
    lane: resolveLane(),
  };
}

function nextCorrelationId(prefix: string): string {
  correlationSeq += 1;
  return `${prefix}:${Date.now().toString(36)}:${correlationSeq}`;
}

function artifactPath(kind: ProductionArtifactKind, scriptVersion: number): string {
  const base = `production/v${scriptVersion}`;
  if (kind === "seo") return `${base}/seo.json`;
  if (kind === "tags") return `${base}/tags.json`;
  if (kind === "thumbnails") return `${base}/thumbnails.json`;
  if (kind === "image_beat_sheet") return `${base}/image-beat-sheet.json`;
  return `${base}/pack.json`;
}

export async function readWorkpieceProductionArtifact(args: {
  workpieceId: string;
  scriptVersion: number;
  kind: ProductionArtifactKind;
}): Promise<ProductionArtifactReadResult> {
  const url = `/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/read-file?path=${encodeURIComponent(
    artifactPath(args.kind, args.scriptVersion),
  )}`;
  const response = await tongsFetch(url, { method: "GET" });
  const body = await readJsonBody(response);

  if (response.status === 404) {
    return { ok: false, status: response.status, reason: "not_found" };
  }
  if (!response.ok) {
    return { ok: false, status: response.status, reason: "request_failed" };
  }
  if (!isRecord(body) || body.ok !== true || !isRecord(body.data)) {
    return { ok: false, status: response.status, reason: "invalid_response" };
  }
  return { ok: true, payload: body.data };
}

async function readWorkpieceMetadata(workpieceId: string): Promise<Record<string, unknown> | null> {
  const url = `/tongs/workpieces/${encodeURIComponent(workpieceId)}/read-file?path=${encodeURIComponent("metadata.json")}`;
  const response = await tongsFetch(url, { method: "GET" });
  const body = await readJsonBody(response);

  if (response.status === 404) {
    const exists = isRecord(body) ? body.exists : null;
    if (exists === false) return null;
    return null;
  }

  if (!response.ok) return null;
  if (!isRecord(body) || body.ok !== true) return null;
  if (!isRecord(body.data)) return null;
  return body.data;
}

async function commitMetadataDocument(args: {
  workpieceId: string;
  metadata: Record<string, unknown>;
  action: ProductionArtifactKind;
  scriptVersion: number;
}): Promise<ProductionCommitResult> {
  const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/commit-file`, {
    method: "POST",
    json: {
      path: "metadata.json",
      content_type: "application/json",
      json: args.metadata,
      written_by: buildWrittenBy(),
      correlation_id: nextCorrelationId("hearth-episode-v2"),
      event_name: "hearth.episode.package.v2",
      event_payload: {
        action: args.action,
        script_version: args.scriptVersion,
      },
    },
  });

  const body = await readJsonBody(response);
  if (!response.ok || !isCommitAck(body)) {
    return {
      ok: false,
      status: response.status,
      reason: "metadata_commit_failed",
    };
  }

  return { ok: true };
}

async function syncEpisodePackageMetadata(args: {
  workpieceId: string;
  workspaceId?: string | null;
  scriptVersion: number;
  kind: ProductionArtifactKind;
  payload: unknown;
}): Promise<ProductionCommitResult> {
  if (args.kind === "pack") {
    return { ok: true };
  }

  const nowIso = new Date().toISOString();
  const existing = await readWorkpieceMetadata(args.workpieceId);
  const existingWorkspaceId = isRecord(existing) ? readString(existing.workspace_id) : null;
  const existingStatus = isRecord(existing) ? readString(existing.status) : null;
  const existingNotes = isRecord(existing) ? existing.notes ?? null : null;
  const existingOrigin = isRecord(existing) ? existing.origin ?? null : null;
  const existingContentCategory = isRecord(existing) ? readString(existing.content_category) : null;

  const workspaceId = existingWorkspaceId ?? readString(args.workspaceId);
  if (!workspaceId) {
    return { ok: true };
  }
  const metadata = existing ?? buildDefaultMetadataDocument({
    workpieceId: args.workpieceId,
    workspaceId,
    createdAt: nowIso,
    updatedAt: nowIso,
    status: existingStatus ?? "draft",
    notes: existingNotes,
    origin: existingOrigin,
    contentCategory: existingContentCategory,
  });

  const rawText = readRawTextFromPayload(args.payload);
  if (!rawText.trim()) {
    return { ok: true };
  }

  let resolveImageMapScriptAnchor:
    | ((anchorText: string, matchHint?: string | null) => ReturnType<typeof resolveImageMapScriptAnchorFromText>)
    | null
    = null;
  if (args.kind === "image_beat_sheet") {
    const canonicalScript = await readHearthPrimaryScript(args.workpieceId);
    if (canonicalScript.ok && canonicalScript.data.text?.trim()) {
      const scriptText = canonicalScript.data.text;
      resolveImageMapScriptAnchor = (anchorText, matchHint) => (
        resolveImageMapScriptAnchorFromText(scriptText, anchorText, matchHint)
      );
    }
  }

  const nextMetadata = applyProductionArtifactToEpisodePackage({
    metadata,
    action: args.kind,
    rawText,
    generatedAt: readGeneratedAtFromPayload(args.payload),
    resolveImageMapScriptAnchor,
  });

  const committed = await commitMetadataDocument({
    workpieceId: args.workpieceId,
    metadata: nextMetadata,
    action: args.kind,
    scriptVersion: args.scriptVersion,
  });
  if (!committed.ok || (args.kind !== "seo" && args.kind !== "tags")) {
    return committed;
  }

  // Production generation may update the editor only after the same metadata
  // read used on page reload proves the framing survived the durable write.
  const verifiedMetadata = await readWorkpieceMetadata(args.workpieceId);
  if (!verifiedMetadata || !canonicalFramingEquals(
    hydrateEpisodePackageV2(verifiedMetadata),
    hydrateEpisodePackageV2(nextMetadata),
  )) {
    return { ok: false, status: 409, reason: "metadata_verification_failed" };
  }
  return committed;
}

export async function commitWorkpieceProductionArtifact(args: {
  workpieceId: string;
  workspaceId?: string | null;
  scriptVersion: number;
  kind: ProductionArtifactKind;
  payload: unknown;
}): Promise<ProductionCommitResult> {
  const url = `/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/commit-file`;
  const response = await tongsFetch(url, {
    method: "POST",
    json: {
      path: artifactPath(args.kind, args.scriptVersion),
      content_type: "application/json",
      json: args.payload,
      written_by: buildWrittenBy(),
      correlation_id: nextCorrelationId("hearth-production"),
      event_name: "hearth.production.artifact.v1",
      event_payload: {
        kind: args.kind,
        script_version: args.scriptVersion,
      },
    },
  });

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      reason: "request_failed",
    };
  }

  let body: unknown = null;
  body = await readJsonBody(response);
  if (!isRecord(body) || body.ok !== true) {
    return {
      ok: false,
      status: response.status,
      reason: "invalid_response",
    };
  }

  const metadataResult = await syncEpisodePackageMetadata(args);
  if (!metadataResult.ok) {
    return metadataResult;
  }

  return { ok: true };
}
