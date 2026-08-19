import type { HammerHistoryDocumentV1 } from "../editor/hammerWorkspaceHistory";
import { HAMMER_RUNTIME_WRITTEN_BY } from "../prep/hammerPrep";
import { tongsFetch } from "./tongsFetch";
import { parseTongsReadFileResponse } from "./tongsReadFileResponse";

export const HAMMER_HISTORY_ARTIFACT_PATH = "hammer/history.v1.json";
export const HAMMER_HISTORY_PRESENCE_PATH = "hammer/history.present.v1.json";
export function buildHammerRevisionHistoryArtifactPath(revisionId: string): string {
  return `hammer/revisions/${revisionId}/history.v1.json`;
}

type TongsFetcher = typeof tongsFetch;

type HammerHistoryResult<T> =
  | { ok: true; status: number; exists: boolean; data: T | null }
  | { ok: false; status: number; classification?: "unauthorized" | "malformed" | "rejected" | "unexpected" | "schema_invalid"; error: string };

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readJsonObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

function isHistoryDocument(value: unknown): value is HammerHistoryDocumentV1 {
  const root = readJsonObject(value);
  return Boolean(
    root
    && root.version === 1
    && readString(root.workpieceId)
    && readString(root.sessionId)
    && readString(root.baseRevisionId)
    && Array.isArray(root.entries)
    && Array.isArray(root.undoStack)
    && Array.isArray(root.redoStack),
  );
}

function decodeHistoryRead<T>(response: Response, payload: unknown): HammerHistoryResult<T> {
  const parsed = parseTongsReadFileResponse<T>({
    status: response.status,
    responseOk: response.ok,
    payload,
  });
  if (parsed.kind === "absent") return { ok: true, status: response.status, exists: false, data: null };
  if (parsed.kind === "failure") {
    return { ok: false, status: response.status, classification: parsed.classification, error: parsed.message };
  }
  if (!isHistoryDocument(parsed.data)) {
    return { ok: false, status: response.status, classification: "schema_invalid", error: "Hammer history artifact failed schema validation." };
  }
  return { ok: true, status: response.status, exists: true, data: parsed.data as T };
}

export async function loadHammerHistoryDocument(
  workpieceId: string,
  fetcher: TongsFetcher = tongsFetch,
): Promise<HammerHistoryResult<HammerHistoryDocumentV1>> {
  let response: Response;
  try {
    response = await fetcher(
      `/tongs/workpieces/${encodeURIComponent(workpieceId)}/read-file?path=${encodeURIComponent(HAMMER_HISTORY_ARTIFACT_PATH)}`,
      {
        method: "GET",
        timeoutMs: 30_000,
      },
    );
  } catch (error) {
    return {
      ok: false,
      status: 504,
      error: toErrorMessage(error, "Hammer could not load persistent history."),
    };
  }

  const payload = await response.json().catch(() => null);
  return decodeHistoryRead<HammerHistoryDocumentV1>(response, payload);
}

export async function loadHammerRevisionHistoryDocument(args: {
  workpieceId: string;
  historyPath: string;
  fetcher?: TongsFetcher;
}): Promise<HammerHistoryResult<HammerHistoryDocumentV1>> {
  const path = args.historyPath;
  let response: Response;
  try {
    response = await (args.fetcher ?? tongsFetch)(
      `/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/read-file?path=${encodeURIComponent(path)}`,
      {
        method: "GET",
        timeoutMs: 30_000,
      },
    );
  } catch (error) {
    return {
      ok: false,
      status: 504,
      error: toErrorMessage(error, "Hammer could not load revision history."),
    };
  }

  const payload = await response.json().catch(() => null);
  return decodeHistoryRead<HammerHistoryDocumentV1>(response, payload);
}

export async function loadHammerHistoryPresence(
  workpieceId: string,
  fetcher: TongsFetcher = tongsFetch,
): Promise<HammerHistoryResult<{ version: number; workpieceId?: string; writtenAt?: string }>> {
  let response: Response;
  try {
    response = await fetcher(
      `/tongs/workpieces/${encodeURIComponent(workpieceId)}/read-file?path=${encodeURIComponent(HAMMER_HISTORY_PRESENCE_PATH)}`,
      {
        method: "GET",
        timeoutMs: 15_000,
      },
    );
  } catch (error) {
    return {
      ok: false,
      status: 504,
      error: toErrorMessage(error, "Hammer could not verify persistent history presence."),
    };
  }

  const payload = await response.json().catch(() => null);
  const parsed = parseTongsReadFileResponse<{ version: number; workpieceId?: string; writtenAt?: string }>({
    status: response.status,
    responseOk: response.ok,
    payload,
  });
  if (parsed.kind === "absent") return { ok: true, status: response.status, exists: false, data: null };
  if (parsed.kind === "failure") return { ok: false, status: response.status, classification: parsed.classification, error: parsed.message };
  const row = readJsonObject(parsed.data);
  if (!row || row.version !== 1) {
    return { ok: false, status: response.status, classification: "schema_invalid", error: "Hammer history presence artifact failed schema validation." };
  }
  return { ok: true, status: response.status, exists: true, data: parsed.data };
}

export async function saveHammerHistoryDocument(args: {
  workpieceId: string;
  document: HammerHistoryDocumentV1;
  fetcher?: TongsFetcher;
}): Promise<HammerHistoryResult<HammerHistoryDocumentV1>> {
  try {
    const response = await (args.fetcher ?? tongsFetch)(
      `/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/commit-file`,
      {
        method: "POST",
        json: {
          path: HAMMER_HISTORY_ARTIFACT_PATH,
          content_type: "application/json",
          written_by: { ...HAMMER_RUNTIME_WRITTEN_BY },
          json: args.document,
        },
        timeoutMs: 45_000,
      },
    );
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const row = readJsonObject(payload);
      return {
        ok: false,
        status: response.status,
        error: readString(readJsonObject(row?.error)?.message) ?? "Hammer could not save persistent history.",
      };
    }

    // Best-effort: write a sentinel so future opens can distinguish "first open" from "missing unexpectedly".
    try {
      await (args.fetcher ?? tongsFetch)(
        `/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/commit-file`,
        {
          method: "POST",
          json: {
            path: HAMMER_HISTORY_PRESENCE_PATH,
            content_type: "application/json",
            written_by: { ...HAMMER_RUNTIME_WRITTEN_BY },
            json: {
              version: 1,
              workpieceId: args.workpieceId,
              writtenAt: new Date().toISOString(),
            },
          },
          timeoutMs: 20_000,
        },
      );
    } catch {
      // ignore sentinel failures
    }
  } catch (error) {
    return {
      ok: false,
      status: 500,
      error: toErrorMessage(error, "Hammer could not save persistent history."),
    };
  }

  return {
    ok: true,
    status: 200,
    exists: true,
    data: args.document,
  };
}

export async function saveHammerRevisionHistoryDocument(args: {
  workspaceId: string;
  workpieceId: string;
  revisionId: string;
  document: HammerHistoryDocumentV1;
  fetcher?: TongsFetcher;
}): Promise<HammerHistoryResult<HammerHistoryDocumentV1>> {
  const fetcher = args.fetcher ?? tongsFetch;
  try {
    const response = await fetcher(
      `/tongs/workspaces/${encodeURIComponent(args.workspaceId)}/workpieces/${encodeURIComponent(args.workpieceId)}/hammer/revisions/${encodeURIComponent(args.revisionId)}`,
      {
        method: "PUT",
        json: {
          written_by: { ...HAMMER_RUNTIME_WRITTEN_BY },
          history: {
            data: args.document,
          },
        },
        timeoutMs: 45_000,
      },
    );
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const row = readJsonObject(payload);
      return {
        ok: false,
        status: response.status,
        error: readString(readJsonObject(row?.error)?.message) ?? "Hammer could not save revision history.",
      };
    }
  } catch (error) {
    return {
      ok: false,
      status: 500,
      error: toErrorMessage(error, "Hammer could not save revision history."),
    };
  }

  return {
    ok: true,
    status: 200,
    exists: true,
    data: args.document,
  };
}
