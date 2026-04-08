import type { HammerEditorStateSerializable } from "../editor/hammerWorkspaceHistory";
import { HAMMER_RUNTIME_WRITTEN_BY } from "../prep/hammerPrep";
import { tongsFetch } from "./tongsFetch";

export const HAMMER_SNAPSHOT_DIR_PATH = "hammer/snapshots";
export const HAMMER_SNAPSHOT_MANIFEST_PATH = `${HAMMER_SNAPSHOT_DIR_PATH}/manifest.v1.json`;

export type HammerSnapshotManifestEntryV1 = {
  snapshotRef: string;
  path: string;
  createdAt: string;
  headEntryId: string | null;
  baseRevisionId: string;
};

export type HammerSnapshotManifestV1 = {
  version: 1;
  workpieceId: string;
  activeSnapshotRef: string | null;
  snapshots: HammerSnapshotManifestEntryV1[];
  retention: {
    maxSnapshots: number;
  };
  updatedAt: string;
};

export type HammerHistorySnapshotV1 = {
  version: 1;
  snapshotRef: string;
  createdAt: string;
  workpieceId: string;
  sessionId: string;
  baseRevisionId: string;
  headEntryId: string | null;
  undoDepth: number;
  redoDepth: number;
  editorState: HammerEditorStateSerializable;
};

type SnapshotArtifactResult<T> =
  | { ok: true; status: number; exists: boolean; data: T | null }
  | { ok: false; status: number; error: string };

type TongsFetcher = typeof tongsFetch;

type SnapshotRefLike = {
  snapshotRef: string;
};

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

function isMissingFileResponse(status: number, payload: unknown): boolean {
  if (status !== 404) return false;
  const root = readJsonObject(payload);
  return root?.ok === true && root?.exists === false;
}

function readNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function normalizeSnapshotRef(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return /^[a-zA-Z0-9._:-]+$/.test(trimmed) ? trimmed : null;
}

function normalizeSnapshotManifestEntry(
  value: unknown,
): HammerSnapshotManifestEntryV1 | null {
  const row = readJsonObject(value);
  if (!row) return null;
  const snapshotRef = normalizeSnapshotRef(readString(row.snapshotRef) ?? "");
  const path = readString(row.path);
  const createdAt = readString(row.createdAt);
  const baseRevisionId = readString(row.baseRevisionId);
  const headEntryIdValue = row.headEntryId;
  const headEntryId = headEntryIdValue == null ? null : readString(headEntryIdValue);
  if (!snapshotRef || !path || !createdAt || !baseRevisionId) return null;
  return {
    snapshotRef,
    path,
    createdAt,
    headEntryId,
    baseRevisionId,
  };
}

function normalizeSnapshotManifest(
  value: unknown,
): HammerSnapshotManifestV1 | null {
  const row = readJsonObject(value);
  if (!row) return null;
  if (row.version !== 1) return null;
  const workpieceId = readString(row.workpieceId);
  const activeSnapshotRefValue = row.activeSnapshotRef;
  const activeSnapshotRef = activeSnapshotRefValue == null
    ? null
    : normalizeSnapshotRef(readString(activeSnapshotRefValue) ?? "");
  const snapshots = Array.isArray(row.snapshots)
    ? row.snapshots
      .map((entry) => normalizeSnapshotManifestEntry(entry))
      .filter((entry): entry is HammerSnapshotManifestEntryV1 => Boolean(entry))
    : [];
  const retentionRow = readJsonObject(row.retention);
  const maxSnapshots = readNumber(retentionRow?.maxSnapshots);
  const updatedAt = readString(row.updatedAt);
  if (!workpieceId || !updatedAt || maxSnapshots == null) return null;
  return {
    version: 1,
    workpieceId,
    activeSnapshotRef,
    snapshots,
    retention: {
      maxSnapshots: Math.max(1, Math.trunc(maxSnapshots)),
    },
    updatedAt,
  };
}

function normalizeHistorySnapshot(
  value: unknown,
): HammerHistorySnapshotV1 | null {
  const row = readJsonObject(value);
  if (!row) return null;
  if (row.version !== 1) return null;
  const snapshotRef = normalizeSnapshotRef(readString(row.snapshotRef) ?? "");
  const createdAt = readString(row.createdAt);
  const workpieceId = readString(row.workpieceId);
  const sessionId = readString(row.sessionId);
  const baseRevisionId = readString(row.baseRevisionId);
  const headEntryIdValue = row.headEntryId;
  const headEntryId = headEntryIdValue == null ? null : readString(headEntryIdValue);
  const undoDepth = readNumber(row.undoDepth);
  const redoDepth = readNumber(row.redoDepth);
  const editorState = readJsonObject(row.editorState);
  if (
    !snapshotRef
    || !createdAt
    || !workpieceId
    || !sessionId
    || !baseRevisionId
    || undoDepth == null
    || redoDepth == null
    || !editorState
  ) {
    return null;
  }
  return {
    version: 1,
    snapshotRef,
    createdAt,
    workpieceId,
    sessionId,
    baseRevisionId,
    headEntryId,
    undoDepth: Math.max(0, Math.trunc(undoDepth)),
    redoDepth: Math.max(0, Math.trunc(redoDepth)),
    editorState: editorState as unknown as HammerEditorStateSerializable,
  };
}

export function buildHammerSnapshotPayloadPath(
  args: SnapshotRefLike,
): string {
  const snapshotRef = normalizeSnapshotRef(args.snapshotRef);
  if (!snapshotRef) {
    throw new Error("Hammer snapshot ref is invalid.");
  }
  return `${HAMMER_SNAPSHOT_DIR_PATH}/${snapshotRef}.v1.json`;
}

export async function loadHammerSnapshotManifest(
  workpieceId: string,
  fetcher: TongsFetcher = tongsFetch,
): Promise<SnapshotArtifactResult<HammerSnapshotManifestV1>> {
  let response: Response;
  try {
    response = await fetcher(
      `/tongs/workpieces/${encodeURIComponent(workpieceId)}/read-file?path=${encodeURIComponent(HAMMER_SNAPSHOT_MANIFEST_PATH)}`,
      {
        method: "GET",
        timeoutMs: 30_000,
      },
    );
  } catch (error) {
    return {
      ok: false,
      status: 504,
      error: toErrorMessage(error, "Hammer could not load the snapshot manifest."),
    };
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    if (isMissingFileResponse(response.status, payload)) {
      return {
        ok: true,
        status: response.status,
        exists: false,
        data: null,
      };
    }
    const row = readJsonObject(payload);
    return {
      ok: false,
      status: response.status,
      error: readString(readJsonObject(row?.error)?.message) ?? "Hammer could not load the snapshot manifest.",
    };
  }

  const root = readJsonObject(payload);
  const exists = root?.exists === true;
  if (!exists) {
    return {
      ok: true,
      status: response.status,
      exists: false,
      data: null,
    };
  }

  const data = normalizeSnapshotManifest(root?.data);
  if (!data) {
    return {
      ok: false,
      status: 422,
      error: "Hammer snapshot manifest is invalid.",
    };
  }

  return {
    ok: true,
    status: response.status,
    exists: true,
    data,
  };
}

export async function saveHammerSnapshotManifest(args: {
  workpieceId: string;
  manifest: HammerSnapshotManifestV1;
  fetcher?: TongsFetcher;
}): Promise<SnapshotArtifactResult<HammerSnapshotManifestV1>> {
  try {
    const response = await (args.fetcher ?? tongsFetch)(
      `/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/commit-file`,
      {
        method: "POST",
        json: {
          path: HAMMER_SNAPSHOT_MANIFEST_PATH,
          content_type: "application/json",
          written_by: { ...HAMMER_RUNTIME_WRITTEN_BY },
          json: args.manifest,
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
        error: readString(readJsonObject(row?.error)?.message) ?? "Hammer could not save the snapshot manifest.",
      };
    }
  } catch (error) {
    return {
      ok: false,
      status: 500,
      error: toErrorMessage(error, "Hammer could not save the snapshot manifest."),
    };
  }

  return {
    ok: true,
    status: 200,
    exists: true,
    data: args.manifest,
  };
}

export async function loadHammerSnapshotPayload(args: {
  workpieceId: string;
  snapshotRef: string;
  fetcher?: TongsFetcher;
}): Promise<SnapshotArtifactResult<HammerHistorySnapshotV1>> {
  const path = buildHammerSnapshotPayloadPath({
    snapshotRef: args.snapshotRef,
  });

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
      error: toErrorMessage(error, "Hammer could not load the snapshot payload."),
    };
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    if (isMissingFileResponse(response.status, payload)) {
      return {
        ok: true,
        status: response.status,
        exists: false,
        data: null,
      };
    }
    const row = readJsonObject(payload);
    return {
      ok: false,
      status: response.status,
      error: readString(readJsonObject(row?.error)?.message) ?? "Hammer could not load the snapshot payload.",
    };
  }

  const root = readJsonObject(payload);
  const exists = root?.exists === true;
  if (!exists) {
    return {
      ok: true,
      status: response.status,
      exists: false,
      data: null,
    };
  }

  const data = normalizeHistorySnapshot(root?.data);
  if (!data) {
    return {
      ok: false,
      status: 422,
      error: "Hammer snapshot payload is invalid.",
    };
  }

  return {
    ok: true,
    status: response.status,
    exists: true,
    data,
  };
}

export async function saveHammerSnapshotPayload(args: {
  workpieceId: string;
  snapshot: HammerHistorySnapshotV1;
  fetcher?: TongsFetcher;
}): Promise<SnapshotArtifactResult<HammerHistorySnapshotV1>> {
  const path = buildHammerSnapshotPayloadPath({
    snapshotRef: args.snapshot.snapshotRef,
  });
  try {
    const response = await (args.fetcher ?? tongsFetch)(
      `/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/commit-file`,
      {
        method: "POST",
        json: {
          path,
          content_type: "application/json",
          written_by: { ...HAMMER_RUNTIME_WRITTEN_BY },
          json: args.snapshot,
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
        error: readString(readJsonObject(row?.error)?.message) ?? "Hammer could not save the snapshot payload.",
      };
    }
  } catch (error) {
    return {
      ok: false,
      status: 500,
      error: toErrorMessage(error, "Hammer could not save the snapshot payload."),
    };
  }

  return {
    ok: true,
    status: 200,
    exists: true,
    data: args.snapshot,
  };
}
