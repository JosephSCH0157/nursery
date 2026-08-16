export type TongsReadFileMetadata = Record<string, unknown>;

export type TongsReadFileResult<T> =
  | { kind: "present"; data: T; fileRow: TongsReadFileMetadata | null; envelope: "canonical" | "legacy" }
  | { kind: "absent" }
  | { kind: "failure"; classification: "unauthorized" | "malformed" | "rejected" | "unexpected"; message: string };

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function parseTongsReadFileResponse<T>(args: {
  status: number;
  responseOk: boolean;
  payload: unknown;
}): TongsReadFileResult<T> {
  const root = record(args.payload);
  if (args.status === 401 || args.status === 403) {
    return { kind: "failure", classification: "unauthorized", message: `Tongs read-file was unauthorized (${args.status}).` };
  }
  if (args.status === 404) return { kind: "absent" };
  if (!root) return { kind: "failure", classification: "malformed", message: "Tongs read-file returned malformed JSON." };
  if (root.ok === false) return { kind: "failure", classification: "rejected", message: "Tongs read-file rejected the request." };
  if (!args.responseOk) {
    return { kind: "failure", classification: "rejected", message: `Tongs read-file failed (${args.status}).` };
  }
  if (root.ok !== true) return { kind: "failure", classification: "unexpected", message: "Tongs read-file success response is missing ok: true." };
  if (root.exists === false) return { kind: "absent" };
  if (root.exists === true) {
    if (!("data" in root) || root.data == null) return { kind: "failure", classification: "malformed", message: "Legacy read-file success response is missing data." };
    return { kind: "present", data: root.data as T, fileRow: record(root.file_row), envelope: "legacy" };
  }
  if (!("data" in root) || root.data == null) return { kind: "failure", classification: "malformed", message: "Tongs read-file success response is missing data." };
  const fileRow = record(root.file_row);
  if (!fileRow) return { kind: "failure", classification: "malformed", message: "Tongs read-file success response is missing file_row metadata." };
  return { kind: "present", data: root.data as T, fileRow, envelope: "canonical" };
}
