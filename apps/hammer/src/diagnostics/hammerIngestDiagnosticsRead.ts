import { tongsFetch } from "../lib/tongsFetch";
import { HAMMER_INGEST_DIAGNOSTIC_PATH } from "./hammerIngestDiagnostics";

function readJsonObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

async function readJsonBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

function readErrorMessage(payload: unknown, fallback: string): string {
  const root = readJsonObject(payload);
  const error = readJsonObject(root?.error);
  return readString(error?.message) ?? fallback;
}

function isMissingFileResponse(status: number, payload: unknown): boolean {
  if (status !== 404) return false;
  const root = readJsonObject(payload);
  return root?.ok === true && root?.exists === false;
}

export type HammerIngestDiagnosticsReadResult =
  | { ok: true; exists: false; payload: null }
  | { ok: true; exists: true; payload: unknown }
  | { ok: false; status: number; error: string };

export async function loadLatestHammerIngestDiagnostics(
  workpieceId: string,
  args?: { timeoutMs?: number },
): Promise<HammerIngestDiagnosticsReadResult> {
  let response: Response;
  try {
    response = await tongsFetch(
      `/tongs/workpieces/${encodeURIComponent(workpieceId)}/read-file?path=${encodeURIComponent(HAMMER_INGEST_DIAGNOSTIC_PATH)}`,
      { method: "GET", timeoutMs: args?.timeoutMs ?? 12_000 },
    );
  } catch (error) {
    return { ok: false, status: 504, error: error instanceof Error ? error.message : "Tongs read-file timed out." };
  }

  const payload = await readJsonBody(response);
  if (!response.ok) {
    if (isMissingFileResponse(response.status, payload)) {
      return { ok: true, exists: false, payload: null };
    }
    return { ok: false, status: response.status, error: readErrorMessage(payload, "Failed to load ingest diagnostics.") };
  }

  const root = readJsonObject(payload);
  const exists = root?.exists === true;
  if (!exists) {
    return { ok: true, exists: false, payload: null };
  }
  return { ok: true, exists: true, payload: root?.data ?? null };
}
