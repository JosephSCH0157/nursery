import { tongsFetch } from "./tongs-fetch";

type CommitResult = { ok: true } | { ok: false; status?: number; reason: string };
type ReadResult<T> = { ok: true; data: T } | { ok: false; status?: number; reason: string };

type WrittenBy = {
  tool: string;
  tool_version: string;
  lane: string;
};

const PRIMARY_SCRIPT_PATH = "script/script.md";
const DEFAULT_LANE = "forge-managed";
const DEFAULT_TOOL_VERSION = "0.0.0";
let correlationSeq = 0;

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function getQueryParam(...keys: string[]): string | null {
  try {
    const q = new URLSearchParams(window.location.search || "");
    for (const key of keys) {
      const value = readString(q.get(key));
      if (value) return value;
    }
  } catch {
    // ignore
  }
  return null;
}

function resolveLane(): string {
  const fromQuery = readString(getQueryParam("forge_lane", "lane"));
  if (fromQuery) return fromQuery;
  const w = window as typeof window & { __forgeLane?: unknown; __tpLane?: unknown };
  const fromWindow = readString(w.__forgeLane ?? w.__tpLane);
  if (fromWindow) return fromWindow;
  try {
    const fromStorage = readString(window.localStorage.getItem("forge_lane_v1"));
    if (fromStorage) return fromStorage;
  } catch {
    // ignore
  }
  return DEFAULT_LANE;
}

function resolveToolVersion(): string {
  const w = window as typeof window & { APP_VERSION?: unknown };
  const fromWindow = readString(w.APP_VERSION);
  return fromWindow ?? DEFAULT_TOOL_VERSION;
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

function isCommitAck(body: unknown): boolean {
  const row = body as {
    ok?: unknown;
    success?: unknown;
    error?: unknown;
    data?: {
      ok?: unknown;
      success?: unknown;
    };
  };

  if (row?.error) return false;

  return row?.ok === true
    || row?.success === true
    || row?.data?.ok === true
    || row?.data?.success === true;
}

async function readBodyAsJson(response: Response): Promise<unknown> {
  const text = await response.text();
  const raw = readString(text);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

export function getHearthPrimaryScriptPath(): string {
  return PRIMARY_SCRIPT_PATH;
}

export async function readHearthPrimaryScript(
  workpieceId: string,
): Promise<ReadResult<{ text: string | null; updatedAt: string | null }>> {
  const response = await tongsFetch(
    `/tongs/workpieces/${encodeURIComponent(workpieceId)}/read-file?path=${encodeURIComponent(PRIMARY_SCRIPT_PATH)}`,
    { method: "GET" },
  );

  if (response.status === 404) {
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      // ignore
    }
    if (
      body
      && typeof body === "object"
      && (body as { ok?: boolean }).ok === true
      && (body as { exists?: boolean }).exists === false
    ) {
      return { ok: true, data: { text: null, updatedAt: null } };
    }
    return { ok: false, status: 404, reason: "not_found" };
  }

  if (!response.ok) {
    return { ok: false, status: response.status, reason: "request_failed" };
  }

  const body = await readBodyAsJson(response);
  const row = body as {
    ok?: unknown;
    data?: unknown;
    file_row?: {
      updated_at?: unknown;
    } | null;
  } | null;

  if (row?.ok !== true) {
    return { ok: false, status: response.status, reason: "invalid_response" };
  }

  return {
    ok: true,
    data: {
      text: typeof row?.data === "string" ? row.data : null,
      updatedAt: readString(row?.file_row?.updated_at) ?? null,
    },
  };
}

export async function commitHearthPrimaryScript(
  workpieceId: string,
  scriptText: string,
  options?: {
    validatorVersion?: string;
  },
): Promise<CommitResult> {
  const validatorVersion = readString(options?.validatorVersion) ?? "shared-script-tags-v1";
  const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(workpieceId)}/commit-file`, {
    method: "POST",
    json: {
      path: PRIMARY_SCRIPT_PATH,
      content_type: "text/markdown; charset=utf-8",
      text: scriptText,
      written_by: buildWrittenBy(),
      event_name: "hearth.script.published.v1",
      event_payload: {
        path: PRIMARY_SCRIPT_PATH,
        chars: scriptText.length,
        validator_version: validatorVersion,
      },
      correlation_id: nextCorrelationId("hearth-script"),
    },
  });

  const body = await readBodyAsJson(response);
  if (!response.ok) {
    return { ok: false, status: response.status, reason: "request_failed" };
  }
  if (!isCommitAck(body)) {
    return { ok: false, status: response.status, reason: "invalid_response" };
  }
  return { ok: true };
}
