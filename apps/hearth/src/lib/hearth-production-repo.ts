import { tongsFetch } from "./tongs-fetch";

type WrittenBy = {
  tool: string;
  tool_version: string;
  lane: string;
};

export type ProductionArtifactKind = "seo" | "tags" | "thumbnails" | "image_beat_sheet" | "pack";

export type ProductionCommitResult =
  | { ok: true }
  | { ok: false; status?: number; reason: string };

const DEFAULT_LANE = "forge-managed";
const DEFAULT_TOOL_VERSION = "0.0.0";
let correlationSeq = 0;

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
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

export async function commitWorkpieceProductionArtifact(args: {
  workpieceId: string;
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
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!body || typeof body !== "object" || (body as { ok?: boolean }).ok !== true) {
    return {
      ok: false,
      status: response.status,
      reason: "invalid_response",
    };
  }

  return { ok: true };
}
