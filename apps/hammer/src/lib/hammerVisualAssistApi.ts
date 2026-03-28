import { tongsFetch } from "./tongsFetch";

export const HAMMER_VISUAL_ASSIST_PREFLIGHT_ROUTE = "/api/hammer/editorial/visual-assist-preflight";

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readErrorMessage(payload: unknown): string {
  const row = readObject(payload);
  const error = readObject(row?.error);
  return readString(error?.message)
    ?? readString(row?.message)
    ?? readString(row?.detail)
    ?? "Hammer visual assist preflight failed.";
}

export async function requestHammerVisualAssistPreflight(args: {
  workspace_id: string;
  workpiece_id: string;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const response = await tongsFetch(HAMMER_VISUAL_ASSIST_PREFLIGHT_ROUTE, {
    method: "POST",
    json: {
      workspace_id: args.workspace_id,
      workpiece_id: args.workpiece_id,
    },
    timeoutMs: 20_000,
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: readErrorMessage(payload),
    };
  }

  return { ok: true };
}
