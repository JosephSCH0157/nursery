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
  getDefaultMountTarget,
  getMountRolePolicy,
  resolveMount,
} from "@forge/tongs";
import { clearMountRegistry, loadMountRegistry, saveMountRegistry } from "../lib/mount-registry";
import { removeHandle, setHandle } from "../lib/handle-vault";
import { isAutoMirrorEnabled, loadLastMirrorStatus, mirrorRoleSnapshot, setAutoMirrorEnabled } from "../lib/mirror";
import type { AppShellContext } from "./AppShell";
import "./SettingsStorage.css";

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
  return getDefaultMountTarget(role);
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
  const session = shell?.session ?? null;
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

  const setTarget = (role: MountRole, target: MountTargetType) => {
    updateRegistryEntry(role, (entry) => ({
      ...entry,
      target,
      mirror: target === "tongs_cloud"
        ? buildMirrorConfig(
            entry.mirror?.enabled ?? false,
            entry.mirror?.policy ?? DEFAULT_MIRROR_POLICY,
            entry.mirror?.vaultKey,
            entry.mirror?.hint,
          )
        : entry.mirror,
    }));
    setStatus(`Canonical target updated for ${role}: ${target}.`);
  };

  if (!registry) {
    return <p>Loading storage registry...</p>;
  }

  return (
    <div className="settings-storage">
      <h3 className="settings-storage__title">Storage / Mounts</h3>
      <p className="settings-storage__copy">
        Choose where role-specific data lives. Every tool will read these settings automatically.
      </p>
      {!session ? (
        <p className="settings-storage__trial-note">
          Trial mode: storage mappings are local to this browser until you sign in.
        </p>
      ) : null}

      {status && (
        <div className="settings-storage__status">
          <strong>Status:</strong> {status}
        </div>
      )}

      <table className="settings-storage__table">
        <thead>
          <tr>
            <th className="settings-storage__th">Role</th>
            <th className="settings-storage__th">Storage target</th>
          </tr>
        </thead>
        <tbody>
          {MOUNT_ROLE_POLICY.map((policy) => {
            const entry = registry.mounts.find((item) => item.role === policy.role);
            const resolved = resolveMount(registry, policy.role);
            const rolePolicy = getMountRolePolicy(policy.role);
            const supportsCloud = rolePolicy.eligibleTargets.includes("tongs_cloud");
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
              <tr key={policy.role} className="settings-storage__row">
                <td className="settings-storage__cell">
                  {policy.label}
                  <span className="settings-storage__role-tag">
                    {rolePolicy.eligibleTargets.join(" + ")}
                  </span>
                </td>
                <td className="settings-storage__cell">
                  <div className="settings-storage__target-title">
                    {resolved.canonicalTarget.target === "tongs_cloud" ? "Forge Cloud" : "Local"}
                  </div>

                  <div className="settings-storage__inline-row">
                    <div className="settings-storage__muted">Resolved target</div>
                    <select
                      aria-label={`${policy.label} resolved target`}
                      value={resolved.canonicalTarget.target}
                      onChange={(event) => setTarget(policy.role, event.target.value as MountTargetType)}
                    >
                      {rolePolicy.eligibleTargets.map((target) => (
                        <option key={target} value={target}>
                          {target === "tongs_cloud" ? "Forge Cloud" : "Local"}
                        </option>
                      ))}
                    </select>
                  </div>

                  {resolved.canonicalTarget.target === "local" ? (
                    <div className="settings-storage__inline-row">
                      <div className="settings-storage__muted">
                        Folder: {localHint ?? "not set"}
                      </div>
                      <button onClick={() => setLocalFolder(policy.role)}>Choose folder</button>
                      {localVaultKey && (
                        <button onClick={() => clearLocalFolder(policy.role, localVaultKey)}>Clear</button>
                      )}
                    </div>
                  ) : null}

                  {resolved.canonicalTarget.target === "tongs_cloud" && supportsCloud ? (
                    <div className="settings-storage__section">
                      <label className="settings-storage__label-inline">
                        <input
                          type="checkbox"
                          checked={mirrorEnabled}
                          onChange={(event) => toggleMirror(policy.role, event.target.checked)}
                        />
                        <span>Mirror to local</span>
                      </label>
                      {mirrorEnabled && (
                        <div className="settings-storage__inline-row">
                          <div className="settings-storage__muted">
                            Mirror folder: {mirrorHint ?? "not set"}
                          </div>
                          <button onClick={() => setMirrorFolder(policy.role)}>Choose folder</button>
                          {mirrorVaultKey && (
                            <button onClick={() => clearMirrorFolder(policy.role, mirrorVaultKey)}>Clear</button>
                          )}
                          {(policy.role === "barstock" || policy.role === "scripts") && (
                            <button
                              onClick={() => handleMirrorNow(policy.role)}
                              disabled={mirroringRole === policy.role || !mirrorVaultKey}
                            >
                              {mirroringRole === policy.role ? "Mirroring..." : "Mirror now"}
                            </button>
                          )}
                        </div>
                      )}
                      {mirrorEnabled && (policy.role === "barstock" || policy.role === "scripts") && (
                        <div className="settings-storage__auto-row">
                          {policy.role === "barstock" && (
                            <label className="settings-storage__label-inline">
                              <input
                                type="checkbox"
                                checked={autoMirrorEnabled}
                                onChange={(event) => handleAutoMirrorToggle(policy.role, event.target.checked)}
                              />
                              <span>Auto mirror at session end</span>
                            </label>
                          )}
                          <div className="settings-storage__muted">
                            Last mirrored: {formatMirrorTime(lastMirror?.at)}{" "}
                            {lastMirror
                              ? `(${lastMirror.reason}, ${lastMirror.ok ? "ok" : "failed"})`
                              : ""}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="settings-storage__actions">
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
