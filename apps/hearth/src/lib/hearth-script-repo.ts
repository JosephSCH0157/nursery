import { tongsFetch } from "./tongs-fetch";
import { validateScriptTags } from "@forge/shared/script-tags";

type CommitResult =
  | { ok: true; outcome: "saved" | "duplicate"; revision: number; hash: string; transitionId: string }
  | { ok: false; status?: number; reason: string; outcome?: string; rehydrate?: boolean };
type ReadResult<T> = { ok: true; data: T } | { ok: false; status?: number; reason: string };

const PRIMARY_SCRIPT_PATH = "script/script.md";

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

async function readBodyAsJson(response: Response): Promise<unknown> {
  try { return await response.json(); } catch { return null; }
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
  void options;
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
  // Optional review cannot rebase or publish editor text. Explicit Save owns
  // conditional publication with the basis captured before editing.
  return { ok: false, status: 409, reason: "explicit_script_save_required", outcome: "conflict", rehydrate: true };
}
