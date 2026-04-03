import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link, useLocation, useOutletContext } from "react-router-dom";
import { useLayoutMode } from "@forge/ui-mobile";
import {
  ALL_MOUNT_ROLES,
  MOUNT_ROLE_POLICY,
  getMountRolePolicy,
  type MountRole,
  type WorkspaceCanonicalRecordingListing,
  type WorkspaceStorageListing,
  type WorkspaceStorageTreeNode,
  type WorkpieceStorageListing,
} from "@forge/tongs";
import { useMountRegistry } from "../hooks/useMountRegistry";
import { parseForgeRouteContext } from "../lib/forge-route-context";
import { getHandle } from "../lib/handle-vault";
import { loadLastMirrorStatus, type MirrorLastStatus } from "../lib/mirror";
import { tongsApiRequest } from "../lib/tongs-api";
import type { AppShellContext } from "./AppShell";
import WorkspaceRequiredNotice from "./WorkspaceRequiredNotice";
import "./TongsStorage.css";

type WorkspaceRole = "viewer" | "editor" | "admin" | "owner";

type StorageTreeNode = {
  name: string;
  kind: "directory" | "file";
  path: string;
  bytes?: number | null;
  updated_at?: string | null;
  children?: StorageTreeNode[];
  note?: string;
};

type ListingSource = {
  kind: "local" | "mirror" | "cloud_role_root" | "cloud_workpiece" | "cloud_workpiece_recordings";
  label: string;
  badgeLabel: string;
  vaultKey?: string;
  hint?: string;
  bucket?: string;
  rootPath?: string;
};

type TreeState = {
  status: "idle" | "loading" | "ready" | "unavailable" | "error";
  source: ListingSource | null;
  nodes: StorageTreeNode[];
  message: string | null;
};

type RootViewModel = {
  role: MountRole;
  label: string;
  resolvedTargetType: "local" | "tongs_cloud";
  eligibleTargets: readonly ("local" | "tongs_cloud")[];
  canonicalKind: "local" | "cloud";
  canonicalVaultKey?: string;
  canonicalHint?: string;
  mirrorEnabled: boolean;
  mirrorPolicy?: string;
  mirrorVaultKey?: string;
  mirrorHint?: string;
  mirrorStatus: MirrorLastStatus | null;
};

type StorageListingPanelProps = {
  title: string;
  treeState: TreeState;
  emptyMessage: string;
  loadingPlaceholder: string;
  errorPlaceholder: string;
  unavailablePlaceholder: string;
  footnote?: string;
  emptyAction?: ReactNode;
};

type WorkpieceDeletionMode =
  | "full_delete"
  | "delete_keep_performance"
  | "delete_keep_reusable_media";

type DeleteWorkpieceResult = {
  result: {
    workspace_id: string;
    workpiece_id: string;
    deletion_mode: WorkpieceDeletionMode;
    retained_performance_stub: boolean;
    retained_reusable_assets: number;
    deleted_asset_rows: number;
    deleted_workpiece_file_rows: number;
    deleted_workpiece_event_rows: number;
    deleted_presence_rows: number;
    deleted_recording_links: number;
    deleted_project_links: number;
    bytes_removed_estimate: number;
    warnings: string[];
  };
};

const ROLE_POLICY_MAP = new Map(MOUNT_ROLE_POLICY.map((policy) => [policy.role, policy] as const));
const MAX_TREE_DEPTH = 3;
const MAX_TREE_ITEMS_PER_DIRECTORY = 80;
const READ_ONLY_FOOTNOTE =
  "Read-only only. Upload, rename, delete, drag/drop, and mount editing are intentionally excluded from this slice.";

function normalizeWorkspaceRole(value: unknown): WorkspaceRole | null {
  if (value === "viewer" || value === "editor" || value === "admin" || value === "owner") {
    return value;
  }
  return null;
}

function workspaceRoleLabel(role: WorkspaceRole | null): string {
  if (!role) return "Unknown";
  return `${role.slice(0, 1).toUpperCase()}${role.slice(1)}`;
}

function toFriendly(value: unknown): string {
  if (value == null) return "none";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString();
}

function formatBytes(bytes: number | null | undefined): string | null {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function summarizeMirrorStatus(root: RootViewModel): string {
  if (!root.mirrorEnabled) return "Disabled";
  const base = `Enabled${root.mirrorPolicy ? ` (${root.mirrorPolicy})` : ""}`;
  if (!root.mirrorStatus) return base;
  return `${base} • last ${root.mirrorStatus.ok ? "ok" : "failed"} ${formatDateTime(root.mirrorStatus.at)}`;
}

function describeEmptyRoleRootListing(root: RootViewModel, source: ListingSource | null): string {
  if (root.resolvedTargetType === "tongs_cloud") {
    if (source?.kind === "cloud_role_root") {
      return "This workspace role root is currently empty.";
    }
    if (source?.kind === "mirror") {
      return "Local mirror connected, but no mirrored files are visible here yet. Canonical cloud files may still exist outside this local inspection view.";
    }
    return "Cloud-backed role root. Local inspection is not currently available.";
  }
  return "This root is currently empty.";
}

function describeEmptyWorkpieceListing(): string {
  return "This canonical workpiece root is currently empty.";
}

function describeEmptyCanonicalRecordingListing(): string {
  return "No canonical kept takes are visible for active workpieces in this workspace yet.";
}

function buildListingSource(root: RootViewModel): { source: ListingSource | null; message: string } {
  if (root.canonicalKind === "local") {
    if (!root.canonicalVaultKey) {
      return {
        source: null,
        message: "Local listing unavailable. No local folder is configured for this canonical root yet.",
      };
    }
    return {
      source: {
        kind: "local",
        label: "Canonical local target",
        badgeLabel: "local",
        vaultKey: root.canonicalVaultKey,
        hint: root.canonicalHint,
      },
      message: "",
    };
  }

  if (root.mirrorEnabled && root.mirrorVaultKey) {
    return {
      source: {
        kind: "mirror",
        label: "Local mirror target",
        badgeLabel: "local mirror",
        vaultKey: root.mirrorVaultKey,
        hint: root.mirrorHint,
      },
      message: "",
    };
  }

  return {
    source: null,
    message: "Cloud-backed role root. Local mirror is not currently connected, so local tree inspection is unavailable here.",
  };
}

function compareNodes(left: StorageTreeNode, right: StorageTreeNode): number {
  if (left.kind !== right.kind) return left.kind === "directory" ? -1 : 1;
  return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
}

async function listDirectoryTree(
  handle: FileSystemDirectoryHandle,
  basePath: string,
  depth: number,
): Promise<StorageTreeNode[]> {
  const nodes: StorageTreeNode[] = [];
  let count = 0;
  const entrySource = handle as FileSystemDirectoryHandle & {
    entries?: () => AsyncIterable<[string, FileSystemHandle]>;
    values?: () => AsyncIterable<FileSystemHandle>;
  };
  const iterator =
    typeof entrySource.entries === "function"
      ? entrySource.entries()
      : typeof entrySource.values === "function"
      ? (async function* () {
          for await (const child of entrySource.values!()) {
            yield [child.name, child] as const;
          }
        })()
      : null;

  if (!iterator) return nodes;

  for await (const [name, child] of iterator) {
    count += 1;
    if (count > MAX_TREE_ITEMS_PER_DIRECTORY) {
      nodes.push({
        name: "+ more items",
        kind: "file",
        path: `${basePath}/__truncated__`,
        note: `Directory listing truncated after ${MAX_TREE_ITEMS_PER_DIRECTORY} entries.`,
      });
      break;
    }

    const path = `${basePath}/${name}`;
    if (child.kind === "directory") {
      const node: StorageTreeNode = {
        name,
        kind: "directory",
        path,
      };
      if (depth < MAX_TREE_DEPTH) {
        node.children = await listDirectoryTree(child as FileSystemDirectoryHandle, path, depth + 1);
      } else {
        node.note = `Nested listing stops after depth ${MAX_TREE_DEPTH}.`;
      }
      nodes.push(node);
      continue;
    }

    nodes.push({
      name,
      kind: "file",
      path,
    });
  }

  nodes.sort(compareNodes);
  return nodes;
}

function readErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

function buildCloudNodeNote(node: WorkspaceStorageTreeNode): string | undefined {
  if (node.note) return node.note;

  const parts: string[] = [];
  const bytes = formatBytes(node.bytes);
  if (bytes) parts.push(`Size: ${bytes}`);
  if (node.updated_at) parts.push(`updated ${formatDateTime(node.updated_at)}`);
  return parts.length > 0 ? parts.join(" • ") : undefined;
}

function mapCloudNodes(nodes: WorkspaceStorageTreeNode[]): StorageTreeNode[] {
  return nodes.map((node) => ({
    name: node.name,
    kind: node.kind,
    path: node.path,
    bytes: node.bytes ?? null,
    updated_at: node.updated_at ?? null,
    note: buildCloudNodeNote(node),
    children: node.children ? mapCloudNodes(node.children) : undefined,
  }));
}

type StorageUsageSummary = {
  fileCount: number;
  directoryCount: number;
  knownSizeFileCount: number;
  unknownSizeFileCount: number;
  totalBytes: number;
  largestFiles: Array<{
    path: string;
    name: string;
    bytes: number;
    updated_at: string | null;
  }>;
};

function buildStorageUsageSummary(nodes: StorageTreeNode[]): StorageUsageSummary {
  const stack = [...nodes];
  const fileRows: StorageUsageSummary["largestFiles"] = [];
  let fileCount = 0;
  let directoryCount = 0;
  let knownSizeFileCount = 0;
  let unknownSizeFileCount = 0;
  let totalBytes = 0;

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;
    if (node.kind === "directory") {
      directoryCount += 1;
      if (node.children?.length) {
        for (const child of node.children) stack.push(child);
      }
      continue;
    }

    fileCount += 1;
    const bytes = typeof node.bytes === "number" && Number.isFinite(node.bytes) && node.bytes >= 0
      ? node.bytes
      : null;
    if (bytes == null) {
      unknownSizeFileCount += 1;
      continue;
    }

    knownSizeFileCount += 1;
    totalBytes += bytes;
    fileRows.push({
      path: node.path,
      name: node.name,
      bytes,
      updated_at: node.updated_at ?? null,
    });
  }

  fileRows.sort((left, right) => right.bytes - left.bytes);
  return {
    fileCount,
    directoryCount,
    knownSizeFileCount,
    unknownSizeFileCount,
    totalBytes,
    largestFiles: fileRows.slice(0, 5),
  };
}

function StorageTree({ nodes, depth = 0 }: { nodes: StorageTreeNode[]; depth?: number }) {
  return (
    <ul className="tongs-storage__tree-list">
      {nodes.map((node) => {
        if (node.kind === "directory") {
          return (
            <li key={node.path} className="tongs-storage__tree-node">
              <details open={depth < 1}>
                <summary className="tongs-storage__tree-summary">
                  <span className="tongs-storage__tree-icon">Folder</span>
                  <span>{node.name}</span>
                </summary>
                {node.note ? <div className="tongs-storage__tree-note">{node.note}</div> : null}
                {node.children && node.children.length > 0 ? (
                  <StorageTree nodes={node.children} depth={depth + 1} />
                ) : (
                  <div className="tongs-storage__tree-empty">Empty folder</div>
                )}
              </details>
            </li>
          );
        }

        return (
          <li key={node.path} className="tongs-storage__tree-node tongs-storage__tree-node--file">
            <div className="tongs-storage__tree-entry">
              <span className="tongs-storage__tree-icon">File</span>
              <span>{node.name}</span>
            </div>
            {node.note ? <div className="tongs-storage__tree-note">{node.note}</div> : null}
          </li>
        );
      })}
    </ul>
  );
}

function StorageListingPanel({
  title,
  treeState,
  emptyMessage,
  loadingPlaceholder,
  errorPlaceholder,
  unavailablePlaceholder,
  footnote,
  emptyAction,
}: StorageListingPanelProps) {
  const messageClass =
    treeState.status === "error"
      ? "tongs-storage__message tongs-storage__message--error"
      : "tongs-storage__message tongs-storage__message--subtle";

  const placeholder =
    treeState.status === "loading"
      ? loadingPlaceholder
      : treeState.status === "ready"
      ? emptyMessage
      : treeState.status === "error"
      ? errorPlaceholder
      : unavailablePlaceholder;
  const usageSummary = useMemo(() => {
    if (treeState.status !== "ready" || treeState.nodes.length === 0) return null;
    return buildStorageUsageSummary(treeState.nodes);
  }, [treeState.nodes, treeState.status]);

  return (
    <div className="tongs-storage__tree-panel">
      <div className="tongs-storage__tree-header">
        <h4 className="tongs-storage__tree-title">{title}</h4>
        <div className="tongs-storage__tree-source">
          {treeState.source ? (
            <>
              <span className="tongs-storage__badge tongs-storage__badge--source">
                {treeState.source.badgeLabel}
              </span>
              <span>
                {treeState.source.label}
                {treeState.source.hint ? ` • ${treeState.source.hint}` : ""}
                {treeState.source.bucket ? ` • ${treeState.source.bucket}` : ""}
                {treeState.source.rootPath ? ` • ${treeState.source.rootPath}` : ""}
              </span>
            </>
          ) : (
            "No readable source"
          )}
        </div>
      </div>

      {treeState.message ? <div className={messageClass}>{treeState.message}</div> : null}

      {usageSummary ? (
        <section className="tongs-storage__usage-summary">
          <div className="tongs-storage__usage-grid">
            <div className="tongs-storage__usage-card">
              <div className="tongs-storage__usage-label">Total size (known)</div>
              <div className="tongs-storage__usage-value">{formatBytes(usageSummary.totalBytes) ?? "0 B"}</div>
            </div>
            <div className="tongs-storage__usage-card">
              <div className="tongs-storage__usage-label">Files</div>
              <div className="tongs-storage__usage-value">
                {usageSummary.fileCount}
                {usageSummary.unknownSizeFileCount > 0
                  ? ` (${usageSummary.unknownSizeFileCount} without size metadata)`
                  : ""}
              </div>
            </div>
            <div className="tongs-storage__usage-card">
              <div className="tongs-storage__usage-label">Folders</div>
              <div className="tongs-storage__usage-value">{usageSummary.directoryCount}</div>
            </div>
          </div>
          {usageSummary.largestFiles.length > 0 ? (
            <div className="tongs-storage__largest-files">
              <h5 className="tongs-storage__largest-files-title">Largest Files</h5>
              <ul className="tongs-storage__largest-files-list">
                {usageSummary.largestFiles.map((row) => (
                  <li key={row.path} className="tongs-storage__largest-files-item">
                    <span className="tongs-storage__largest-files-name">{row.name}</span>
                    <span className="tongs-storage__largest-files-meta">
                      {formatBytes(row.bytes) ?? "Unknown"} • {row.path}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {treeState.status === "ready" && treeState.nodes.length > 0 ? <StorageTree nodes={treeState.nodes} /> : null}

      {treeState.status !== "ready" || treeState.nodes.length === 0 ? (
        <div className="tongs-storage__tree-placeholder">{placeholder}</div>
      ) : null}
      {emptyAction && (treeState.status !== "ready" || treeState.nodes.length === 0) ? (
        <div className="tongs-storage__tree-action">{emptyAction}</div>
      ) : null}

      {footnote ? <div className="tongs-storage__tree-footnote">{footnote}</div> : null}
    </div>
  );
}

export default function TongsStorage() {
  const shell = useOutletContext<AppShellContext>();
  const location = useLocation();
  const routeContext = useMemo(() => parseForgeRouteContext(location.search), [location.search]);
  const workspaceId = shell?.workspaceId ?? null;
  const workpieceId = routeContext.workpieceId;
  const activeWorkspace = useMemo(
    () => shell?.workspaces?.find((workspace) => workspace.id === workspaceId) ?? null,
    [shell?.workspaces, workspaceId],
  );
  const workspaceRole = useMemo(
    () => normalizeWorkspaceRole(activeWorkspace?.role ?? null),
    [activeWorkspace?.role],
  );
  const { seeded, issues, reload, resolveMount } = useMountRegistry(workspaceId ?? "default");
  const layoutMode = useLayoutMode();
  const isMobile = layoutMode === "mobile";
  const [selectedRole, setSelectedRole] = useState<MountRole>(ALL_MOUNT_ROLES[0]);
  const [roleRootTreeState, setRoleRootTreeState] = useState<TreeState>({
    status: "idle",
    source: null,
    nodes: [],
    message: null,
  });
  const [workpieceTreeState, setWorkpieceTreeState] = useState<TreeState>({
    status: "idle",
    source: null,
    nodes: [],
    message: null,
  });
  const [canonicalRecordingsTreeState, setCanonicalRecordingsTreeState] = useState<TreeState>({
    status: "idle",
    source: null,
    nodes: [],
    message: null,
  });
  const applyWorkpieceTreeState = useCallback((nextState: TreeState) => {
    setWorkpieceTreeState(nextState);
  }, []);
  const applyRoleRootTreeState = useCallback((nextState: TreeState) => {
    setRoleRootTreeState(nextState);
  }, []);
  const applyCanonicalRecordingsTreeState = useCallback((nextState: TreeState) => {
    setCanonicalRecordingsTreeState(nextState);
  }, []);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [deleteMode, setDeleteMode] = useState<WorkpieceDeletionMode>("delete_keep_performance");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteNotice, setDeleteNotice] = useState<string | null>(null);

  const roots = useMemo<RootViewModel[]>(() => {
    return ALL_MOUNT_ROLES.map((role) => {
      const policy = ROLE_POLICY_MAP.get(role);
      const rolePolicy = getMountRolePolicy(role);
      const resolved = resolveMount(role);
      const mirrorVaultKey = resolved.mirrorTarget?.vaultKey;
      return {
        role,
        label: policy?.label ?? role,
        resolvedTargetType: resolved.canonicalTarget.target,
        eligibleTargets: rolePolicy.eligibleTargets,
        canonicalKind: resolved.canonicalTarget.type,
        canonicalVaultKey: resolved.canonicalTarget.vaultKey,
        canonicalHint: resolved.canonicalTarget.hint,
        mirrorEnabled: Boolean(resolved.mirrorTarget),
        mirrorPolicy: resolved.mirrorPolicy,
        mirrorVaultKey,
        mirrorHint: resolved.mirrorTarget?.hint,
        mirrorStatus: workspaceId ? loadLastMirrorStatus(workspaceId, role, mirrorVaultKey) : null,
      };
    });
  }, [resolveMount, workspaceId]);

  const selectedRoot = useMemo(
    () => roots.find((root) => root.role === selectedRole) ?? roots[0] ?? null,
    [roots, selectedRole],
  );

  useEffect(() => {
    if (!workpieceId) {
      queueMicrotask(() => {
        applyWorkpieceTreeState({
          status: "unavailable",
          source: null,
          nodes: [],
          message: routeContext.hasInvalidWorkpieceId
            ? "Route contains an invalid workpiece_id. Provide a valid workpiece UUID to inspect canonical workpiece storage."
            : "No workpiece is selected in the current route. Add workpiece_id to inspect canonical workpiece storage.",
        });
      });
      return;
    }

    const workpieceSource: ListingSource = {
      kind: "cloud_workpiece",
      label: "Canonical workpiece cloud target",
      badgeLabel: "canonical workpiece",
    };

    let cancelled = false;
    queueMicrotask(() => {
      applyWorkpieceTreeState({
        status: "loading",
        source: workpieceSource,
        nodes: [],
        message: "Loading canonical workpiece listing...",
      });
    });

    void (async () => {
      try {
        const data = await tongsApiRequest<{ listing: WorkpieceStorageListing }>(
          `/tongs/workpieces/${encodeURIComponent(workpieceId)}/storage`,
        );
        if (cancelled) return;

        const source: ListingSource = {
          kind: "cloud_workpiece",
          label: "Canonical workpiece cloud target",
          badgeLabel: "canonical workpiece",
          bucket: data.listing.source.bucket,
          rootPath: data.listing.source.root_path,
        };
        const nodes = mapCloudNodes(data.listing.nodes);
        applyWorkpieceTreeState({
          status: "ready",
          source,
          nodes,
          message: nodes.length === 0 ? describeEmptyWorkpieceListing() : null,
        });
      } catch (error: unknown) {
        if (cancelled) return;
        applyWorkpieceTreeState({
          status: "error",
          source: workpieceSource,
          nodes: [],
          message: readErrorMessage(error, "Canonical workpiece listing could not be loaded for this workpiece."),
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyWorkpieceTreeState, routeContext.hasInvalidWorkpieceId, workpieceId, refreshNonce]);

  useEffect(() => {
    if (!selectedRoot) {
      queueMicrotask(() => {
        applyRoleRootTreeState({
          status: "unavailable",
          source: null,
          nodes: [],
          message: "Workspace role root unavailable.",
        });
      });
      return;
    }

    if (selectedRoot.resolvedTargetType === "tongs_cloud") {
      if (!workspaceId) {
        queueMicrotask(() => {
          applyRoleRootTreeState({
            status: "unavailable",
            source: null,
            nodes: [],
            message: "Workspace context is required to inspect workspace role roots.",
          });
        });
        return;
      }

      const cloudSource: ListingSource = {
        kind: "cloud_role_root",
        label: "Workspace role-root cloud target",
        badgeLabel: "workspace role root",
      };

      let cancelled = false;
      queueMicrotask(() => {
        applyRoleRootTreeState({
          status: "loading",
          source: cloudSource,
          nodes: [],
          message: "Loading workspace role-root listing...",
        });
      });

      void (async () => {
        try {
          const data = await tongsApiRequest<{ listing: WorkspaceStorageListing }>(
            `/tongs/workspaces/${encodeURIComponent(workspaceId)}/storage/${encodeURIComponent(selectedRoot.role)}`,
          );
          if (cancelled) return;

          const source: ListingSource = {
            kind: "cloud_role_root",
            label: "Workspace role-root cloud target",
            badgeLabel: "workspace role root",
            bucket: data.listing.source.bucket,
            rootPath: data.listing.source.root_path,
          };
          const nodes = mapCloudNodes(data.listing.nodes);
          applyRoleRootTreeState({
            status: "ready",
            source,
            nodes,
            message: nodes.length === 0 ? describeEmptyRoleRootListing(selectedRoot, source) : null,
          });
        } catch (error: unknown) {
          if (cancelled) return;
          applyRoleRootTreeState({
            status: "error",
            source: cloudSource,
            nodes: [],
            message: readErrorMessage(error, "Workspace role-root listing could not be loaded for this root."),
          });
        }
      })();

      return () => {
        cancelled = true;
      };
    }

    const listing = buildListingSource(selectedRoot);
    if (!listing.source) {
      queueMicrotask(() => {
        applyRoleRootTreeState({
          status: "unavailable",
          source: null,
          nodes: [],
          message: listing.message,
        });
      });
      return;
    }

    const source = listing.source;
    if (!source.vaultKey) {
      queueMicrotask(() => {
        applyRoleRootTreeState({
          status: "unavailable",
          source,
          nodes: [],
          message: "Local listing is unavailable because no vault key is configured for this root.",
        });
      });
      return;
    }
    const sourceVaultKey = source.vaultKey;

    let cancelled = false;
    queueMicrotask(() => {
      applyRoleRootTreeState({
        status: "loading",
        source,
        nodes: [],
        message: "Loading read-only listing...",
      });
    });

    void (async () => {
      try {
        const handle = await getHandle(sourceVaultKey);
        if (!handle) {
          if (!cancelled) {
            applyRoleRootTreeState({
              status: "unavailable",
              source,
              nodes: [],
              message:
                "Folder handle is not available in this browser vault. Reconnect the local folder in Settings Storage to list contents.",
            });
          }
          return;
        }

        const nodes = await listDirectoryTree(handle, selectedRoot.role, 0);
        if (cancelled) return;
        applyRoleRootTreeState({
          status: "ready",
          source,
          nodes,
          message: nodes.length === 0 ? describeEmptyRoleRootListing(selectedRoot, source) : null,
        });
      } catch (error: unknown) {
        if (cancelled) return;
        applyRoleRootTreeState({
          status: "error",
          source,
          nodes: [],
          message: readErrorMessage(
            error,
            "The browser does not currently have permission to inspect this local folder handle.",
          ),
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyRoleRootTreeState, selectedRoot, workspaceId, refreshNonce]);

  useEffect(() => {
    if (!workspaceId || selectedRoot?.role !== "recordings") {
      queueMicrotask(() => {
        applyCanonicalRecordingsTreeState({
          status: "unavailable",
          source: null,
          nodes: [],
          message: "Select the Recordings role root to inspect canonical kept takes across workpieces.",
        });
      });
      return;
    }

    const canonicalRecordingSource: ListingSource = {
      kind: "cloud_workpiece_recordings",
      label: "Canonical kept takes from workpiece storage",
      badgeLabel: "canonical kept takes",
    };

    let cancelled = false;
    queueMicrotask(() => {
      applyCanonicalRecordingsTreeState({
        status: "loading",
        source: canonicalRecordingSource,
        nodes: [],
        message: "Loading canonical recording inventory...",
      });
    });

    void (async () => {
      try {
        const data = await tongsApiRequest<{ listing: WorkspaceCanonicalRecordingListing }>(
          `/tongs/workspaces/${encodeURIComponent(workspaceId)}/canonical-recordings`,
        );
        if (cancelled) return;

        const source: ListingSource = {
          kind: "cloud_workpiece_recordings",
          label: "Canonical kept takes from workpiece storage",
          badgeLabel: "canonical kept takes",
          bucket: data.listing.source.bucket,
          rootPath: data.listing.source.root_path,
        };
        const nodes = mapCloudNodes(data.listing.nodes);
        applyCanonicalRecordingsTreeState({
          status: "ready",
          source,
          nodes,
          message: nodes.length === 0 ? describeEmptyCanonicalRecordingListing() : null,
        });
      } catch (error: unknown) {
        if (cancelled) return;
        applyCanonicalRecordingsTreeState({
          status: "error",
          source: canonicalRecordingSource,
          nodes: [],
          message: readErrorMessage(
            error,
            "Canonical recording inventory could not be loaded for this workspace.",
          ),
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyCanonicalRecordingsTreeState, selectedRoot?.role, workspaceId, refreshNonce]);

  if (!workspaceId) {
    return <WorkspaceRequiredNotice toolName="Tongs Storage" />;
  }

  if (!selectedRoot) {
    return (
      <section className="tongs-storage">
        <div className="tongs-storage__panel">
          <div className="tongs-storage__message tongs-storage__message--error">
            Storage roles are unavailable for this workspace.
          </div>
        </div>
      </section>
    );
  }

  const diagnostics = issues
    ? `Mount registry diagnostics: ${toFriendly(issues)}`
    : seeded
    ? "Mount registry was seeded with canonical defaults for this workspace."
    : null;

  const workpieceRootPath = workpieceId
    ? (workpieceTreeState.source?.rootPath ?? `workpieces/${workpieceId}`)
    : "Not selected";
  const mountSettingsHref = (() => {
    const params = new URLSearchParams(location.search);
    const nextSearch = params.toString();
    return nextSearch ? `/app/settings/storage?${nextSearch}` : "/app/settings/storage";
  })();
  const hearthHref = (() => {
    const params = new URLSearchParams(location.search);
    const nextSearch = params.toString();
    return nextSearch ? `/app/hearth?${nextSearch}` : "/app/hearth";
  })();
  const workpieceStatusLabel = workpieceTreeState.status === "loading"
    ? "Loading contents"
    : workpieceTreeState.status === "ready"
    ? (workpieceTreeState.nodes.length > 0 ? "Contents loaded" : "No contents yet")
    : workpieceTreeState.status === "error"
    ? "Unable to load contents"
    : "Workpiece context required";

  async function copyDiagnosticsToClipboard() {
    const payload = [
      `Workspace: ${activeWorkspace?.name ?? workspaceId ?? "unknown"}`,
      `Role: ${workspaceRoleLabel(workspaceRole)}`,
      `Selected root: ${selectedRoot.role}`,
      `Selected workpiece: ${workpieceId ?? "none"}`,
      diagnostics ? diagnostics : "No registry diagnostics.",
    ].join("\n");
    try {
      await navigator.clipboard.writeText(payload);
      setCopyNotice("Diagnostics copied.");
    } catch {
      setCopyNotice("Copy failed. Browser clipboard permissions may be blocked.");
    }
  }

  async function deleteCurrentWorkpiece() {
    if (!workspaceId || !workpieceId || deleteBusy) return;
    if (deleteMode === "full_delete" && deleteConfirmText.trim().toUpperCase() !== "DELETE") {
      setDeleteNotice("Full delete requires typing DELETE.");
      return;
    }
    setDeleteBusy(true);
    setDeleteNotice("Deleting episode...");
    try {
      const response = await tongsApiRequest<DeleteWorkpieceResult>(
        `/tongs/workpieces/${encodeURIComponent(workpieceId)}/delete`,
        {
          method: "POST",
          body: JSON.stringify({
            workspace_id: workspaceId,
            deletion_mode: deleteMode,
          }),
        },
      );
      const row = response.result;
      const reclaimed = formatBytes(row.bytes_removed_estimate) ?? `${row.bytes_removed_estimate} B`;
      setDeleteNotice(
        `Deleted using ${row.deletion_mode}. Reclaimed ~${reclaimed}. ` +
        `Files: ${row.deleted_workpiece_file_rows}, assets: ${row.deleted_asset_rows}, ` +
        `reusable kept: ${row.retained_reusable_assets}, performance stub: ${row.retained_performance_stub ? "yes" : "no"}.`,
      );
      setDeleteConfirmText("");
      setRefreshNonce((value) => value + 1);
    } catch (error) {
      setDeleteNotice(error instanceof Error ? error.message : "Episode delete failed.");
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <section className={`tongs-storage${isMobile ? " tongs-storage--mobile" : ""}`}>
      <header className="tongs-storage__header">
        <div className="tongs-storage__title-wrap">
          <h2 className="tongs-storage__title">Tongs Storage</h2>
          <p className="tongs-storage__subtitle">
            Canonical workpiece storage is shown first when a workpiece is selected. Workspace role roots remain available as a separate read-only topology view.
          </p>
        </div>
        <div className="tongs-storage__header-actions">
          <div className="tongs-storage__workspace-pill">
            <span className="tongs-storage__workspace-name">{activeWorkspace?.name ?? "Workspace"}</span>
            <span className="tongs-storage__workspace-role">Role: {workspaceRoleLabel(workspaceRole)}</span>
          </div>
          <button type="button" onClick={reload}>Refresh Mounts</button>
          <button type="button" onClick={() => void copyDiagnosticsToClipboard()}>Copy diagnostics</button>
          <Link className="tongs-storage__action-link" to={mountSettingsHref}>Open mount settings</Link>
        </div>
      </header>

      {diagnostics ? <div className="tongs-storage__diagnostic">{diagnostics}</div> : null}
      {copyNotice ? <div className="tongs-storage__diagnostic">{copyNotice}</div> : null}

      <section className="tongs-storage__panel">
        <div className="tongs-storage__panel-header">
          <div>
            <h3 className="tongs-storage__panel-title">Canonical Workpiece Storage</h3>
            <p className="tongs-storage__panel-subtitle">
              Real canonical cloud contents from the selected workpiece root.
            </p>
          </div>
          {workpieceId ? (
            <div className="tongs-storage__selection-pill">
              <span className="tongs-storage__selection-label">Selected workpiece</span>
              <span className="tongs-storage__mono">{workpieceId}</span>
            </div>
          ) : null}
        </div>

        <div className="tongs-storage__status-line">
          <span className="tongs-storage__badge tongs-storage__badge--status">
            {workpieceId ? "Workpiece selected" : "No workpiece selected"}
          </span>
          <span className="tongs-storage__badge tongs-storage__badge--status">{workpieceStatusLabel}</span>
          <span className="tongs-storage__badge tongs-storage__badge--status">
            Source: {workpieceTreeState.source?.badgeLabel ?? "route context"}
          </span>
        </div>

        {workpieceId ? (
          <section className="tongs-storage__archive-panel">
            <h4 className="tongs-storage__archive-title">Archive Episode</h4>
            <p className="tongs-storage__archive-copy">
              Coming soon. Archive will move this episode to long-term storage, remove it from active workspaces, and keep it restorable.
            </p>
            <button
              type="button"
              disabled
              title="Archive is not available yet because long-term storage is not configured."
            >
              Archive Episode (Coming soon)
            </button>
            <p className="tongs-storage__archive-copy">
              Archive remains non-destructive and is currently disabled until cold storage is configured.
            </p>
          </section>
        ) : null}

        {workpieceId ? (
          <section className="tongs-storage__delete-panel">
            <h4 className="tongs-storage__delete-title">Episode Deletion</h4>
            <p className="tongs-storage__delete-copy">
              Delete by episode/workpiece boundary. File-level delete remains intentionally disabled.
            </p>
            <label className="tongs-storage__delete-field">
              <span>Deletion mode</span>
              <select
                value={deleteMode}
                onChange={(event) => setDeleteMode(event.target.value as WorkpieceDeletionMode)}
                disabled={deleteBusy}
              >
                <option value="full_delete">Delete everything</option>
                <option value="delete_keep_performance">Delete episode, keep performance</option>
                <option value="delete_keep_reusable_media">Delete episode, keep reusable media</option>
              </select>
            </label>
            <p className="tongs-storage__delete-copy">
              {deleteMode === "full_delete"
                ? "Removes production footprint and stops performance continuity."
                : deleteMode === "delete_keep_performance"
                ? "Removes production footprint but keeps published performance tracking identity."
                : "Removes episode production footprint while retaining explicitly reusable assets."}
            </p>
            {deleteMode === "full_delete" ? (
              <label className="tongs-storage__delete-field">
                <span>Type DELETE to confirm full delete</span>
                <input
                  value={deleteConfirmText}
                  onChange={(event) => setDeleteConfirmText(event.target.value)}
                  placeholder="DELETE"
                  disabled={deleteBusy}
                />
              </label>
            ) : null}
            <button type="button" onClick={() => void deleteCurrentWorkpiece()} disabled={deleteBusy}>
              {deleteBusy ? "Deleting..." : deleteMode === "full_delete" ? "Confirm Full Delete" : "Delete Episode"}
            </button>
            {deleteNotice ? <div className="tongs-storage__delete-notice">{deleteNotice}</div> : null}
          </section>
        ) : null}

        <details className="tongs-storage__advanced">
          <summary>Advanced routing details</summary>
          <div className="tongs-storage__meta-grid">
            <div className="tongs-storage__meta-card">
              <div className="tongs-storage__meta-label">Selected workpiece</div>
              <div className="tongs-storage__meta-value tongs-storage__mono">{workpieceId ?? "Not selected"}</div>
            </div>
            <div className="tongs-storage__meta-card">
              <div className="tongs-storage__meta-label">Canonical root</div>
              <div className="tongs-storage__meta-value tongs-storage__mono">{workpieceRootPath}</div>
            </div>
            <div className="tongs-storage__meta-card">
              <div className="tongs-storage__meta-label">Bucket</div>
              <div className="tongs-storage__meta-value">{workpieceTreeState.source?.bucket ?? "Loading..."}</div>
            </div>
            <div className="tongs-storage__meta-card">
              <div className="tongs-storage__meta-label">Selection source</div>
              <div className="tongs-storage__meta-value">Forge route context (`workpiece_id`)</div>
            </div>
          </div>
        </details>

        <StorageListingPanel
          title="Contents"
          treeState={workpieceTreeState}
          emptyMessage={describeEmptyWorkpieceListing()}
          loadingPlaceholder="Loading canonical workpiece tree..."
          errorPlaceholder="Canonical workpiece listing could not be loaded for this workpiece."
          unavailablePlaceholder="No workpiece is selected in the current route."
          emptyAction={!workpieceId ? (
            <Link className="tongs-storage__action-link" to={hearthHref}>
              Open Hearth and pick a workpiece
            </Link>
          ) : null}
          footnote={READ_ONLY_FOOTNOTE}
        />
      </section>

      <section className="tongs-storage__panel">
        <div className="tongs-storage__panel-header">
          <div>
            <h3 className="tongs-storage__panel-title">Workspace Role Roots</h3>
            <p className="tongs-storage__panel-subtitle">
              Separate read-only view of workspace-level storage topology and mount policy.
            </p>
          </div>
        </div>

        <div className="tongs-storage__layout">
          <section className="tongs-storage__panel tongs-storage__panel--roots">
            <div className="tongs-storage__panel-header">
              <h4 className="tongs-storage__panel-title">Role Roots</h4>
              <span className="tongs-storage__panel-subtitle">Six canonical roles from Tongs policy</span>
            </div>
            <div className="tongs-storage__roots-list" aria-label="Tongs workspace role roots">
              {roots.map((root) => {
                const isActive = root.role === selectedRoot.role;
                return (
                  <button
                    key={root.role}
                    type="button"
                    className={`tongs-storage__root-button${isActive ? " tongs-storage__root-button--active" : ""}`}
                    onClick={() => setSelectedRole(root.role)}
                  >
                    <div className="tongs-storage__root-title-row">
                      <span className="tongs-storage__root-title">{root.label}</span>
                      <span className="tongs-storage__root-target">{root.resolvedTargetType}</span>
                    </div>
                    <div className="tongs-storage__root-meta-row">
                      <span className="tongs-storage__root-meta">Targets: {root.eligibleTargets.join(" + ")}</span>
                      <span className="tongs-storage__root-meta">
                        {root.mirrorEnabled ? "Mirror on" : "Mirror off"}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="tongs-storage__panel tongs-storage__panel--detail">
            <div className="tongs-storage__panel-header">
              <div>
                <h4 className="tongs-storage__panel-title">{selectedRoot.label}</h4>
                <p className="tongs-storage__panel-subtitle">
                  {selectedRoot.role === "recordings"
                    ? "Canonical kept takes are shown first from workpiece storage. Workspace role-root contents remain below as a separate topology view."
                    : `Workspace role root view. Canonical target: ${selectedRoot.resolvedTargetType}`}
                </p>
              </div>
            </div>

            <div className="tongs-storage__detail-groups">
              <section className="tongs-storage__detail-group">
                <h5 className="tongs-storage__detail-group-title">Routing</h5>
                <div className="tongs-storage__meta-grid">
                  <div className="tongs-storage__meta-card">
                    <div className="tongs-storage__meta-label">Role</div>
                    <div className="tongs-storage__meta-value">{selectedRoot.role}</div>
                  </div>
                  <div className="tongs-storage__meta-card">
                    <div className="tongs-storage__meta-label">Resolved target</div>
                    <div className="tongs-storage__meta-value">{selectedRoot.resolvedTargetType}</div>
                  </div>
                  <div className="tongs-storage__meta-card">
                    <div className="tongs-storage__meta-label">Eligible targets</div>
                    <div className="tongs-storage__meta-value">{selectedRoot.eligibleTargets.join(", ")}</div>
                  </div>
                </div>
              </section>
              <section className="tongs-storage__detail-group">
                <h5 className="tongs-storage__detail-group-title">Policy + Mirror</h5>
                <div className="tongs-storage__meta-grid">
                  <div className="tongs-storage__meta-card">
                    <div className="tongs-storage__meta-label">Policy class</div>
                    <div className="tongs-storage__meta-value">Mount configuration + entitlement</div>
                  </div>
                  <div className="tongs-storage__meta-card">
                    <div className="tongs-storage__meta-label">Mirror status</div>
                    <div className="tongs-storage__meta-value">{summarizeMirrorStatus(selectedRoot)}</div>
                  </div>
                  <div className="tongs-storage__meta-card">
                    <div className="tongs-storage__meta-label">Canonical hint</div>
                    <div className="tongs-storage__meta-value">{selectedRoot.canonicalHint ?? "Not available"}</div>
                  </div>
                  <div className="tongs-storage__meta-card">
                    <div className="tongs-storage__meta-label">Mirror hint</div>
                    <div className="tongs-storage__meta-value">{selectedRoot.mirrorHint ?? "Not available"}</div>
                  </div>
                </div>
              </section>
              <section className="tongs-storage__detail-group">
                <h5 className="tongs-storage__detail-group-title">Vault Keys</h5>
                <div className="tongs-storage__meta-grid">
                  <div className="tongs-storage__meta-card">
                    <div className="tongs-storage__meta-label">Canonical vault key</div>
                    <div className="tongs-storage__meta-value">{selectedRoot.canonicalVaultKey ?? "Not available"}</div>
                  </div>
                  <div className="tongs-storage__meta-card">
                    <div className="tongs-storage__meta-label">Mirror vault key</div>
                    <div className="tongs-storage__meta-value">{selectedRoot.mirrorVaultKey ?? "Not available"}</div>
                  </div>
                </div>
              </section>
            </div>

            {selectedRoot.role === "recordings" ? (
              <StorageListingPanel
                title="Canonical Workpiece Recordings"
                treeState={canonicalRecordingsTreeState}
                emptyMessage={describeEmptyCanonicalRecordingListing()}
                loadingPlaceholder="Loading canonical kept-take inventory..."
                errorPlaceholder="Canonical recording inventory could not be loaded for this workspace."
                unavailablePlaceholder="Select the Recordings role root to inspect canonical kept takes."
                footnote="These recordings come from canonical workpiece kept-take truth. Workspace role-root contents remain a separate read-only topology view below."
              />
            ) : null}

            <StorageListingPanel
              title={selectedRoot.role === "recordings" ? "Workspace Role-Root Contents" : "Contents"}
              treeState={roleRootTreeState}
              emptyMessage={describeEmptyRoleRootListing(selectedRoot, roleRootTreeState.source)}
              loadingPlaceholder="Loading workspace role-root tree..."
              errorPlaceholder={
                selectedRoot.resolvedTargetType === "tongs_cloud"
                  ? "Workspace role-root listing could not be loaded for this root."
                  : "Read-only local inspection could not be resolved from the current folder handle state."
              }
              unavailablePlaceholder={
                selectedRoot.resolvedTargetType === "tongs_cloud"
                  ? "Cloud-backed role root. Local inspection is not currently available."
                  : "Listing is unavailable for the current local target in this workspace context."
              }
              footnote={READ_ONLY_FOOTNOTE}
            />
          </section>
        </div>
      </section>
    </section>
  );
}
