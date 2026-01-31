import { useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import type {
  MirrorPolicy,
  MountRegistryEntry,
  MountRole,
  MountTargetType,
  WorkspaceMountRegistry,
} from "@forge/tongs";
import {
  DEFAULT_MIRROR_POLICY,
  MOUNT_ROLE_POLICY,
  isCloudCanonicalRole,
  isLocalOnlyRole,
  resolveMount,
} from "@forge/tongs";
import { clearMountRegistry, loadMountRegistry, saveMountRegistry } from "../lib/mount-registry";
import { removeHandle, setHandle } from "../lib/handle-vault";
import { isAutoMirrorEnabled, loadLastMirrorStatus, mirrorRoleSnapshot, setAutoMirrorEnabled } from "../lib/mirror";
import type { AppShellContext } from "./AppShell";

const STORAGE_OPTIONS: { label: string; value: MountTargetType }[] = [
  { label: "Local", value: "local" },
  { label: "Forge Cloud (beta)", value: "tongs_cloud" },
];

type PickerWindow = Window & {
  showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
};

function toFriendly(value: unknown) {
  if (value == null) return "none";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatMirrorTime(iso?: string): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unknown";
  return d.toLocaleString();
}

function defaultTargetForRole(role: MountRole): MountTargetType {
  if (isLocalOnlyRole(role)) return "local";
  if (isCloudCanonicalRole(role)) return "tongs_cloud";
  return "local";
}

function buildVaultKey(workspaceId: string, role: MountRole, kind: "local" | "mirror"): string {
  return `mount:${workspaceId}:${role}:${kind}`;
}

function buildMirrorConfig(
  enabled: boolean,
  policy: MirrorPolicy,
  vaultKey?: string,
  hint?: string,
) {
  const mirror = { enabled, policy } as { enabled: boolean; policy: MirrorPolicy; vaultKey?: string; hint?: string };
  if (typeof vaultKey === "string" && vaultKey.length > 0) mirror.vaultKey = vaultKey;
  if (typeof hint === "string" && hint.length > 0) mirror.hint = hint;
  return mirror;
}

export default function SettingsStorage() {
  const initialState = useMemo(() => {
    const res = loadMountRegistry("default");
    let statusMessage = "Storage registry loaded.";
    if (!res.ok) {
      statusMessage = `Registry reset: ${toFriendly(res.issues)}`;
    } else if (res.seeded) {
      statusMessage = "Storage registry seeded with defaults.";
    }
    return { registry: res.registry, status: statusMessage };
  }, []);

  const [registry, setRegistry] = useState<WorkspaceMountRegistry | null>(initialState.registry);
  const [status, setStatus] = useState<string | null>(initialState.status);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [mirroringRole, setMirroringRole] = useState<MountRole | null>(null);

  const shell = useOutletContext<AppShellContext>();
  const activeWorkspaceId = shell?.workspaceId ?? registry?.workspaceId ?? null;

  const updateRegistryEntry = (role: MountRole, updater: (entry: MountRegistryEntry) => MountRegistryEntry) => {
    setRegistry((prev) => {
      if (!prev) return prev;
      const existing = prev.mounts.find((entry) => entry.role === role);
      const base: MountRegistryEntry = existing ?? { role, target: defaultTargetForRole(role) };
      const nextEntry = updater(base);
      const mounts = existing
        ? prev.mounts.map((entry) => (entry.role === role ? nextEntry : entry))
        : [...prev.mounts, nextEntry];
      return { ...prev, mounts, updatedAtIso: new Date().toISOString() };
    });
    setHasChanges(true);
  };

  const pickDirectory = async () => {
    const picker = (window as PickerWindow).showDirectoryPicker;
    if (!picker) {
      setStatus("Local folder picker is not supported in this browser.");
      return null;
    }

    try {
      return await picker();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return null;
      setStatus(`Folder pick failed: ${toFriendly(err)}`);
      return null;
    }
  };

  const setLocalFolder = async (role: MountRole) => {
    if (!registry) return;
    const handle = await pickDirectory();
    if (!handle) return;

    const vaultKey = buildVaultKey(registry.workspaceId, role, "local");
    try {
      await setHandle(vaultKey, handle, handle.name);
    } catch (err) {
      setStatus(`Failed to store local handle: ${toFriendly(err)}`);
      return;
    }

    updateRegistryEntry(role, (entry) => ({
      ...entry,
      target: "local",
      local: { vaultKey, hint: handle.name },
      mirror: undefined,
    }));
    setStatus(`Local folder set for ${role}.`);
  };

  const clearLocalFolder = async (role: MountRole, vaultKey?: string) => {
    if (vaultKey) {
      try {
        await removeHandle(vaultKey);
      } catch (err) {
        setStatus(`Failed to clear local handle: ${toFriendly(err)}`);
        return;
      }
    }

    updateRegistryEntry(role, (entry) => ({
      ...entry,
      target: "local",
      local: undefined,
      mirror: undefined,
    }));
    setStatus(`Local folder cleared for ${role}.`);
  };

  const toggleMirror = (role: MountRole, enabled: boolean) => {
    updateRegistryEntry(role, (entry) => {
      const mirror = entry.mirror ?? { enabled: false, policy: DEFAULT_MIRROR_POLICY };
      return {
        ...entry,
        target: "tongs_cloud",
        mirror: buildMirrorConfig(
          enabled,
          mirror.policy ?? DEFAULT_MIRROR_POLICY,
          mirror.vaultKey,
          mirror.hint,
        ),
      };
    });
    setStatus(enabled ? `Mirror enabled for ${role}.` : `Mirror disabled for ${role}.`);
  };

  const setMirrorFolder = async (role: MountRole) => {
    if (!registry) return;
    const handle = await pickDirectory();
    if (!handle) return;

    const vaultKey = buildVaultKey(registry.workspaceId, role, "mirror");
    try {
      await setHandle(vaultKey, handle, handle.name);
    } catch (err) {
      setStatus(`Failed to store mirror handle: ${toFriendly(err)}`);
      return;
    }

    updateRegistryEntry(role, (entry) => ({
      ...entry,
      target: "tongs_cloud",
      mirror: buildMirrorConfig(
        true,
        entry.mirror?.policy ?? DEFAULT_MIRROR_POLICY,
        vaultKey,
        handle.name,
      ),
    }));
    setStatus(`Mirror folder set for ${role}.`);
  };

  const clearMirrorFolder = async (role: MountRole, vaultKey?: string) => {
    if (vaultKey) {
      try {
        await removeHandle(vaultKey);
      } catch (err) {
        setStatus(`Failed to clear mirror handle: ${toFriendly(err)}`);
        return;
      }
    }

    updateRegistryEntry(role, (entry) => ({
      ...entry,
      target: "tongs_cloud",
      mirror: buildMirrorConfig(false, entry.mirror?.policy ?? DEFAULT_MIRROR_POLICY),
    }));
    setStatus(`Mirror folder cleared for ${role}.`);
  };

  const handleSave = async () => {
    if (!registry) return;
    setIsSaving(true);
    const result = saveMountRegistry(registry);
    setIsSaving(false);
    if (result.ok) {
      setStatus("Storage preferences saved.");
      setHasChanges(false);
      return;
    }
    setStatus(`Failed to save: ${toFriendly(result.error)}`);
  };

  const handleReset = () => {
    clearMountRegistry();
    const res = loadMountRegistry("default");
    setRegistry(res.registry);
    setHasChanges(false);
    setStatus("Storage preferences reset to defaults.");
  };

  const handleMirrorNow = async (role: MountRole) => {
    if (!activeWorkspaceId) {
      setStatus("Pick a workspace first.");
      return;
    }
    setMirroringRole(role);
    try {
      const res = await mirrorRoleSnapshot(role, activeWorkspaceId, "manual");
      if (res.ok) {
        setStatus(`Mirrored ${role} to ${res.files.snapshot} (latest.json updated).`);
      } else {
        setStatus(`Mirror failed for ${role}: ${res.error}`);
      }
    } catch (err) {
      setStatus(`Mirror failed for ${role}: ${toFriendly(err)}`);
    } finally {
      setMirroringRole(null);
    }
  };

  const handleAutoMirrorToggle = (role: MountRole, enabled: boolean) => {
    if (!activeWorkspaceId) {
      setStatus("Pick a workspace first.");
      return;
    }
    setAutoMirrorEnabled(activeWorkspaceId, role, enabled);
    setStatus(enabled ? `Auto mirror enabled for ${role}.` : `Auto mirror disabled for ${role}.`);
  };

  if (!registry) {
    return <p>Loading storage registry...</p>;
  }

  return (
    <div
      style={{
        border: "1px solid #ddd",
        borderRadius: 10,
        padding: 18,
        background: "#fff",
        maxWidth: 820,
      }}
    >
      <h3 style={{ marginTop: 0 }}>Storage / Mounts</h3>
      <p style={{ marginTop: 0, color: "#555" }}>
        Choose where role-specific data lives. Every tool will read these settings automatically.
      </p>

      {status && (
        <div style={{ marginBottom: 12, fontSize: "0.9rem", color: "#333" }}>
          <strong>Status:</strong> {status}
        </div>
      )}

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: "8px 0" }}>Role</th>
            <th style={{ textAlign: "left", padding: "8px 0" }}>Storage target</th>
          </tr>
        </thead>
        <tbody>
          {MOUNT_ROLE_POLICY.map((policy) => {
            const entry = registry.mounts.find((item) => item.role === policy.role);
            const resolved = resolveMount(registry, policy.role);
            const isLocalOnly = isLocalOnlyRole(policy.role);
            const isCloudCanonical = isCloudCanonicalRole(policy.role);
            const mirrorEnabled = entry?.mirror?.enabled ?? false;
            const mirrorHint = entry?.mirror?.hint;
            const mirrorVaultKey = entry?.mirror?.vaultKey;
            const localHint = entry?.local?.hint;
            const localVaultKey = entry?.local?.vaultKey;
            const lastMirror = activeWorkspaceId
              ? loadLastMirrorStatus(activeWorkspaceId, policy.role, mirrorVaultKey)
              : null;
            const autoMirrorEnabled = activeWorkspaceId
              ? isAutoMirrorEnabled(activeWorkspaceId, policy.role)
              : false;

            return (
              <tr key={policy.role} style={{ borderTop: "1px solid #eee" }}>
                <td style={{ padding: "12px 0" }}>
                  {policy.label}
                  {isLocalOnly && (
                    <span style={{ marginLeft: 8, fontSize: 12, color: "#666" }}>Local-only</span>
                  )}
                  {isCloudCanonical && (
                    <span style={{ marginLeft: 8, fontSize: 12, color: "#666" }}>Cloud canonical</span>
                  )}
                </td>
                <td style={{ padding: "12px 0" }}>
                  <div style={{ fontWeight: 600 }}>
                    {resolved.canonicalTarget.target === "tongs_cloud" ? "Cloud (canonical)" : "Local only"}
                  </div>

                  {isLocalOnly && (
                    <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <div style={{ fontSize: 12, color: "#666" }}>
                        Folder: {localHint ?? "not set"}
                      </div>
                      <button onClick={() => setLocalFolder(policy.role)}>Choose folder</button>
                      {localVaultKey && (
                        <button onClick={() => clearLocalFolder(policy.role, localVaultKey)}>Clear</button>
                      )}
                    </div>
                  )}

                  {isCloudCanonical && (
                    <div style={{ marginTop: 6 }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <input
                          type="checkbox"
                          checked={mirrorEnabled}
                          onChange={(event) => toggleMirror(policy.role, event.target.checked)}
                        />
                        <span>Mirror to local</span>
                      </label>
                      {mirrorEnabled && (
                        <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <div style={{ fontSize: 12, color: "#666" }}>
                            Mirror folder: {mirrorHint ?? "not set"}
                          </div>
                          <button onClick={() => setMirrorFolder(policy.role)}>Choose folder</button>
                          {mirrorVaultKey && (
                            <button onClick={() => clearMirrorFolder(policy.role, mirrorVaultKey)}>Clear</button>
                          )}
                          {policy.role === "barstock" && (
                            <button
                              onClick={() => handleMirrorNow(policy.role)}
                              disabled={mirroringRole === policy.role || !mirrorVaultKey}
                            >
                              {mirroringRole === policy.role ? "Mirroring..." : "Mirror now"}
                            </button>
                          )}
                        </div>
                      )}
                      {mirrorEnabled && policy.role === "barstock" && (
                        <div style={{ marginTop: 8, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <input
                              type="checkbox"
                              checked={autoMirrorEnabled}
                              onChange={(event) => handleAutoMirrorToggle(policy.role, event.target.checked)}
                            />
                            <span>Auto mirror at session end</span>
                          </label>
                          <div style={{ fontSize: 12, color: "#555" }}>
                            Last mirrored: {formatMirrorTime(lastMirror?.at)}{" "}
                            {lastMirror
                              ? `(${lastMirror.reason}, ${lastMirror.ok ? "ok" : "failed"})`
                              : ""}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {!isLocalOnly && !isCloudCanonical && (
                    <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center" }}>
                      <select value={resolved.canonicalTarget.target}>
                        {STORAGE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div style={{ marginTop: 18, display: "flex", gap: 10 }}>
        <button onClick={handleSave} disabled={!registry || isSaving || !hasChanges}>
          {isSaving ? "Saving..." : "Save changes"}
        </button>
        <button onClick={handleReset} disabled={isSaving}>
          Reset defaults
        </button>
      </div>
    </div>
  );
}
