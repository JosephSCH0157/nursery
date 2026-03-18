import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useLayoutMode } from "@forge/ui-mobile";
import { ALL_MOUNT_ROLES, MOUNT_ROLE_POLICY, getMountRolePolicy, type MountRole } from "@forge/tongs";
import { useMountRegistry } from "../hooks/useMountRegistry";
import { getHandle } from "../lib/handle-vault";
import { loadLastMirrorStatus, type MirrorLastStatus } from "../lib/mirror";
import type { AppShellContext } from "./AppShell";
import WorkspaceRequiredNotice from "./WorkspaceRequiredNotice";
import "./TongsStorage.css";

type WorkspaceRole = "viewer" | "editor" | "admin" | "owner";

type StorageTreeNode = {
  name: string;
  kind: "directory" | "file";
  path: string;
  children?: StorageTreeNode[];
  note?: string;
};

type ListingSource = {
  kind: "canonical" | "mirror";
  label: string;
  vaultKey: string;
  hint?: string;
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

const ROLE_POLICY_MAP = new Map(MOUNT_ROLE_POLICY.map((policy) => [policy.role, policy] as const));
const MAX_TREE_DEPTH = 3;
const MAX_TREE_ITEMS_PER_DIRECTORY = 80;

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

function summarizeMirrorStatus(root: RootViewModel): string {
  if (!root.mirrorEnabled) return "Disabled";
  const base = `Enabled${root.mirrorPolicy ? ` (${root.mirrorPolicy})` : ""}`;
  if (!root.mirrorStatus) return base;
  return `${base} • last ${root.mirrorStatus.ok ? "ok" : "failed"} ${formatDateTime(root.mirrorStatus.at)}`;
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
        kind: "canonical",
        label: "Canonical local target",
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
        vaultKey: root.mirrorVaultKey,
        hint: root.mirrorHint,
      },
      message: "",
    };
  }

  return {
    source: null,
    message: "Listing not wired yet for canonical tongs_cloud roots without a configured local mirror.",
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

  for await (const [name, child] of handle.entries()) {
    count += 1;
    if (count > MAX_TREE_ITEMS_PER_DIRECTORY) {
      nodes.push({
        name: `+ more items`,
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
        node.children = await listDirectoryTree(child, path, depth + 1);
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

export default function TongsStorage() {
  const shell = useOutletContext<AppShellContext>();
  const workspaceId = shell?.workspaceId ?? null;
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
  const [treeState, setTreeState] = useState<TreeState>({
    status: "idle",
    source: null,
    nodes: [],
    message: null,
  });

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
    if (!selectedRoot) {
      setTreeState({ status: "unavailable", source: null, nodes: [], message: "Storage root unavailable." });
      return;
    }

    const listing = buildListingSource(selectedRoot);
    if (!listing.source) {
      setTreeState({
        status: "unavailable",
        source: null,
        nodes: [],
        message: listing.message,
      });
      return;
    }

    let cancelled = false;
    setTreeState({
      status: "loading",
      source: listing.source,
      nodes: [],
      message: "Loading read-only listing...",
    });

    void (async () => {
      try {
        const handle = await getHandle(listing.source.vaultKey);
        if (!handle) {
          if (!cancelled) {
            setTreeState({
              status: "unavailable",
              source: listing.source,
              nodes: [],
              message: "Folder handle is not available in this browser vault. Reconnect the local folder in Settings Storage to list contents.",
            });
          }
          return;
        }

        const nodes = await listDirectoryTree(handle, selectedRoot.role, 0);
        if (cancelled) return;
        setTreeState({
          status: "ready",
          source: listing.source,
          nodes,
          message: nodes.length === 0 ? "No files or folders found under this root." : null,
        });
      } catch (error: unknown) {
        if (cancelled) return;
        setTreeState({
          status: "error",
          source: listing.source,
          nodes: [],
          message: readErrorMessage(
            error,
            "Listing not wired yet for this root, or the browser does not have permission to inspect the local folder handle.",
          ),
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedRoot]);

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

  const treePanelMessageClass = treeState.status === "error"
    ? "tongs-storage__message tongs-storage__message--error"
    : "tongs-storage__message tongs-storage__message--subtle";

  return (
    <section className={`tongs-storage${isMobile ? " tongs-storage--mobile" : ""}`}>
      <header className="tongs-storage__header">
        <div className="tongs-storage__title-wrap">
          <h2 className="tongs-storage__title">Workspace Storage</h2>
          <p className="tongs-storage__subtitle">
            Read-only view of canonical storage roots for this workspace. This slice resolves current target state, mirror diagnostics, and local listing availability without mutation.
          </p>
        </div>
        <div className="tongs-storage__header-actions">
          <div className="tongs-storage__workspace-pill">
            <span className="tongs-storage__workspace-name">{activeWorkspace?.name ?? "Workspace"}</span>
            <span className="tongs-storage__workspace-role">Role: {workspaceRoleLabel(workspaceRole)}</span>
          </div>
          <button type="button" onClick={reload}>Refresh Mounts</button>
        </div>
      </header>

      {diagnostics ? <div className="tongs-storage__diagnostic">{diagnostics}</div> : null}

      <div className="tongs-storage__layout">
        <section className="tongs-storage__panel tongs-storage__panel--roots">
          <div className="tongs-storage__panel-header">
            <h3 className="tongs-storage__panel-title">Canonical Roots</h3>
            <span className="tongs-storage__panel-subtitle">Six canonical roles from Tongs policy</span>
          </div>
          <div className="tongs-storage__roots-list" aria-label="Tongs storage roots">
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
                  <div className="tongs-storage__root-badges">
                    <span className="tongs-storage__badge tongs-storage__badge--capability">
                      {root.eligibleTargets.join(" + ")}
                    </span>
                    {root.mirrorEnabled ? (
                      <span className="tongs-storage__badge tongs-storage__badge--mirror">mirror enabled</span>
                    ) : null}
                  </div>
                  <div className="tongs-storage__root-meta">Mirror: {summarizeMirrorStatus(root)}</div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="tongs-storage__panel tongs-storage__panel--detail">
          <div className="tongs-storage__panel-header">
            <div>
              <h3 className="tongs-storage__panel-title">{selectedRoot.label}</h3>
              <p className="tongs-storage__panel-subtitle">
                Canonical target: {selectedRoot.resolvedTargetType}
              </p>
            </div>
          </div>

          <div className="tongs-storage__meta-grid">
            <div className="tongs-storage__meta-card">
              <div className="tongs-storage__meta-label">Role</div>
              <div className="tongs-storage__meta-value">{selectedRoot.role}</div>
            </div>
            <div className="tongs-storage__meta-card">
              <div className="tongs-storage__meta-label">Policy class</div>
              <div className="tongs-storage__meta-value">Resolved by mount configuration and entitlement</div>
            </div>
            <div className="tongs-storage__meta-card">
              <div className="tongs-storage__meta-label">Eligible targets</div>
              <div className="tongs-storage__meta-value">{selectedRoot.eligibleTargets.join(", ")}</div>
            </div>
            <div className="tongs-storage__meta-card">
              <div className="tongs-storage__meta-label">Resolved target type</div>
              <div className="tongs-storage__meta-value">{selectedRoot.resolvedTargetType}</div>
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
              <div className="tongs-storage__meta-label">Canonical vault key</div>
              <div className="tongs-storage__meta-value">{selectedRoot.canonicalVaultKey ?? "Not available"}</div>
            </div>
            <div className="tongs-storage__meta-card">
              <div className="tongs-storage__meta-label">Mirror hint</div>
              <div className="tongs-storage__meta-value">{selectedRoot.mirrorHint ?? "Not available"}</div>
            </div>
            <div className="tongs-storage__meta-card">
              <div className="tongs-storage__meta-label">Mirror vault key</div>
              <div className="tongs-storage__meta-value">{selectedRoot.mirrorVaultKey ?? "Not available"}</div>
            </div>
          </div>

          <div className="tongs-storage__tree-panel">
            <div className="tongs-storage__tree-header">
              <h4 className="tongs-storage__tree-title">Contents</h4>
              <div className="tongs-storage__tree-source">
                {treeState.source ? `${treeState.source.label}${treeState.source.hint ? ` • ${treeState.source.hint}` : ""}` : "No readable local source"}
              </div>
            </div>

            {treeState.message ? (
              <div className={treePanelMessageClass}>{treeState.message}</div>
            ) : null}

            {treeState.status === "ready" && treeState.nodes.length > 0 ? (
              <StorageTree nodes={treeState.nodes} />
            ) : null}

            {treeState.status !== "ready" || treeState.nodes.length === 0 ? (
              <div className="tongs-storage__tree-placeholder">
                {treeState.status === "loading"
                  ? "Loading read-only tree..."
                  : treeState.status === "ready"
                  ? "This root is currently empty."
                  : treeState.status === "error"
                  ? "Read-only listing could not be resolved from existing local mount state."
                  : "Listing not wired yet for the current resolved target in this workspace context."}
              </div>
            ) : null}

            <div className="tongs-storage__tree-footnote">
              Read-only only. Upload, rename, delete, drag/drop, and mount editing are intentionally excluded from this slice.
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}