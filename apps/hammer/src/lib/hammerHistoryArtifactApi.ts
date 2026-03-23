import type { HammerHistoryDocumentV1 } from "../editor/hammerWorkspaceHistory";
import { HAMMER_RUNTIME_WRITTEN_BY } from "../prep/hammerPrep";
import { tongsFetch } from "./tongsFetch";

export const HAMMER_HISTORY_ARTIFACT_PATH = "hammer/history.v1.json";

type HammerHistoryResult<T> =
  | { ok: true; status: number; exists: boolean; data: T | null }
  | { ok: false; status: number; error: string };

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

export async function loadHammerHistoryDocument(
  workpieceId: string,
): Promise<HammerHistoryResult<HammerHistoryDocumentV1>> {
  let response: Response;
  try {
    response = await tongsFetch(
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
  if (!response.ok) {
    const row = readJsonObject(payload);
    return {
      ok: false,
      status: response.status,
      error: readString(readJsonObject(row?.error)?.message) ?? "Hammer could not load persistent history.",
    };
  }

  const root = readJsonObject(payload);
  const exists = root?.exists === true;
  const data = (root?.data ?? null) as HammerHistoryDocumentV1 | null;
  return {
    ok: true,
    status: response.status,
    exists,
    data: exists ? data : null,
  };
}

export async function saveHammerHistoryDocument(args: {
  workpieceId: string;
  document: HammerHistoryDocumentV1;
}): Promise<HammerHistoryResult<HammerHistoryDocumentV1>> {
  try {
    const response = await tongsFetch(
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
