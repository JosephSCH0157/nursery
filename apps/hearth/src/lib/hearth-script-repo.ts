import { tongsFetch } from "./tongs-fetch";
import { validateScriptTags } from "@forge/shared/script-tags";

type CommitResult =
  | { ok: true; outcome: "saved" | "duplicate"; revision: number; hash: string; transitionId: string }
  | { ok: false; status?: number; reason: string; outcome?: string; rehydrate?: boolean };
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
): Promise<ReadResult<{
  text: string | null;
  updatedAt: string | null;
  revision: number | null;
  hash: string | null;
}>> {
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
      return { ok: true, data: { text: null, updatedAt: null, revision: null, hash: null } };
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
      revision?: unknown;
      hash_value?: unknown;
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
      revision: Number.isInteger(row?.file_row?.revision) && Number(row?.file_row?.revision) > 0
        ? Number(row?.file_row?.revision)
        : null,
      hash: /^[0-9a-f]{64}$/i.test(readString(row?.file_row?.hash_value) ?? "")
        ? readString(row?.file_row?.hash_value)!.toLowerCase()
        : null,
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
  const canonicalScriptText = scriptText.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").normalize("NFC");
  const validatorVersion = readString(options?.validatorVersion) ?? "shared-script-tags-v1";
  const validation = validateScriptTags(canonicalScriptText);
  if (!validation.ok) {
    return { ok: false, status: 400, reason: "invalid_script_tags", outcome: "conflict" };
  }
  const current = await readHearthPrimaryScript(workpieceId);
  if (
    current.ok
    && current.data.text === canonicalScriptText
    && current.data.revision !== null
    && current.data.hash !== null
  ) {
    return {
      ok: true,
      outcome: "duplicate",
      revision: current.data.revision,
      hash: current.data.hash,
      transitionId: "",
    };
  }
  const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(workpieceId)}/commit-file`, {
    method: "POST",
    json: {
      path: PRIMARY_SCRIPT_PATH,
      content_type: "text/markdown; charset=utf-8",
      text: canonicalScriptText,
      written_by: buildWrittenBy(),
      event_name: "hearth.script.published.v1",
      event_payload: {
        path: PRIMARY_SCRIPT_PATH,
        chars: canonicalScriptText.length,
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
  const commit = body as {
    data?: {
      hash?: unknown;
      workspace_id?: unknown;
      file_row?: { revision?: unknown };
    };
  };
  const hash = readString(commit.data?.hash);
  const revision = commit.data?.file_row?.revision;
  const workspaceId = readString(commit.data?.workspace_id);
  if (!hash || !/^[0-9a-f]{64}$/i.test(hash) || !Number.isInteger(revision) || Number(revision) < 1 || !workspaceId) {
    return { ok: false, status: response.status, reason: "malformed_canonical_commit" };
  }

  // Writing the working document does not publish production truth. The
  // explicit approval operation freezes these exact bytes; Ready is then
  // published from that immutable approval identity.
  return { ok: true, outcome: "saved", revision: Number(revision), hash: hash.toLowerCase(), transitionId: "" };
}
