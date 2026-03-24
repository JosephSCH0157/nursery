import type { HammerEditorStateSerializable } from "./hammerWorkspaceHistory";
import type {
  HammerHistorySnapshotV1,
  HammerSnapshotManifestV1,
} from "../lib/hammerSnapshotArtifactApi";
import { buildHammerSnapshotPayloadPath } from "../lib/hammerSnapshotArtifactApi";

export const HAMMER_SNAPSHOT_ENTRY_INTERVAL = 40;

type SnapshotManifestEntry = HammerSnapshotManifestV1["snapshots"][number];

function toSnapshotRefStamp(isoTimestamp: string): string {
  return isoTimestamp
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z")
    .replace("T", "t");
}

function normalizeHeadEntrySuffix(headEntryId: string | null): string {
  if (!headEntryId) return "headless";
  const tail = headEntryId.slice(-12).replace(/[^a-zA-Z0-9._:-]/g, "");
  return tail || "head";
}

export function createHammerSnapshotRef(args: {
  createdAt: string;
  headEntryId: string | null;
}): string {
  const stamp = toSnapshotRefStamp(args.createdAt);
  const tail = normalizeHeadEntrySuffix(args.headEntryId);
  return `snap-${stamp}-${tail}`;
}

export function shouldCreateHammerSnapshot(args: {
  undoDepth: number;
  headEntryId: string | null;
  lastSnapshottedHeadEntryId: string | null;
  interval?: number;
}): boolean {
  const interval = Math.max(1, Math.trunc(args.interval ?? HAMMER_SNAPSHOT_ENTRY_INTERVAL));
  if (!args.headEntryId) return false;
  if (args.headEntryId === args.lastSnapshottedHeadEntryId) return false;
  if (!Number.isFinite(args.undoDepth) || args.undoDepth <= 0) return false;
  return Math.trunc(args.undoDepth) % interval === 0;
}

export function buildHammerHistorySnapshot(args: {
  workpieceId: string;
  sessionId: string;
  baseRevisionId: string;
  headEntryId: string | null;
  undoDepth: number;
  redoDepth: number;
  editorState: HammerEditorStateSerializable;
  createdAt?: string;
}): HammerHistorySnapshotV1 {
  const createdAt = args.createdAt ?? new Date().toISOString();
  const snapshotRef = createHammerSnapshotRef({
    createdAt,
    headEntryId: args.headEntryId,
  });
  return {
    version: 1,
    snapshotRef,
    createdAt,
    workpieceId: args.workpieceId,
    sessionId: args.sessionId,
    baseRevisionId: args.baseRevisionId,
    headEntryId: args.headEntryId,
    undoDepth: Math.max(0, Math.trunc(args.undoDepth)),
    redoDepth: Math.max(0, Math.trunc(args.redoDepth)),
    editorState: args.editorState,
  };
}

export function upsertHammerSnapshotManifest(args: {
  manifest: HammerSnapshotManifestV1 | null;
  workpieceId: string;
  snapshot: HammerHistorySnapshotV1;
  maxSnapshots?: number;
}): HammerSnapshotManifestV1 {
  const maxSnapshots = Math.max(1, Math.trunc(args.maxSnapshots ?? 20));
  const existing = args.manifest?.workpieceId === args.workpieceId
    ? args.manifest
    : null;
  const nextEntry: SnapshotManifestEntry = {
    snapshotRef: args.snapshot.snapshotRef,
    path: buildHammerSnapshotPayloadPath({
      snapshotRef: args.snapshot.snapshotRef,
    }),
    createdAt: args.snapshot.createdAt,
    headEntryId: args.snapshot.headEntryId,
    baseRevisionId: args.snapshot.baseRevisionId,
  };

  const withoutCurrent = (existing?.snapshots ?? []).filter(
    (entry) => entry.snapshotRef !== nextEntry.snapshotRef,
  );
  const snapshots = [nextEntry, ...withoutCurrent].slice(0, maxSnapshots);

  return {
    version: 1,
    workpieceId: args.workpieceId,
    activeSnapshotRef: nextEntry.snapshotRef,
    snapshots,
    retention: {
      maxSnapshots,
    },
    updatedAt: args.snapshot.createdAt,
  };
}

export function resolveActiveSnapshotHeadEntryId(
  manifest: HammerSnapshotManifestV1 | null,
): string | null {
  if (!manifest?.activeSnapshotRef) return null;
  const active = manifest.snapshots.find(
    (entry) => entry.snapshotRef === manifest.activeSnapshotRef,
  );
  return active?.headEntryId ?? null;
}
