import { useEffect, useState } from "react";
import type { MountRole, MountTargetType, WorkspaceMountRegistry } from "@forge/tongs";
import { MOUNT_ROLE_POLICY } from "@forge/tongs";
import { clearMountRegistry, getMount, loadMountRegistry, saveMountRegistry } from "../lib/mount-registry";

const STORAGE_OPTIONS: { label: string; value: MountTargetType; comingSoon?: boolean }[] = [
  { label: "Local", value: "local" },
  { label: "Forge Cloud (coming soon)", value: "tongs_cloud", comingSoon: true },
];

function toFriendly(value: unknown) {
  if (value == null) return "none";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export default function SettingsStorage() {
  const [registry, setRegistry] = useState<WorkspaceMountRegistry | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    const res = loadMountRegistry("default");
    setRegistry(res.registry);
    if (!res.ok) {
      setStatus(`Registry reset: ${toFriendly(res.issues)}`);
    } else if (res.seeded) {
      setStatus("Storage registry seeded with defaults.");
    } else {
      setStatus("Storage registry loaded.");
    }
  }, []);

  const mountForRole = (role: MountRole) => getMount(registry, role);

  const handleTargetChange = (role: MountRole, target: MountTargetType) => {
    setRegistry((prev) => {
      if (!prev) return prev;
      const updatedAtIso = new Date().toISOString();
      const idx = prev.mounts.findIndex((entry) => entry.role === role);
      const existingEntry = prev.mounts.find((entry) => entry.role === role);
      const updatedEntry = { ...(existingEntry ?? { role, target }), role, target, updatedAtIso };
      const mounts =
        idx === -1
          ? [...prev.mounts, updatedEntry]
          : prev.mounts.map((entry, index) => (index === idx ? updatedEntry : entry));
      return { ...prev, mounts, updatedAtIso };
    });
    setHasChanges(true);
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
            const entry = mountForRole(policy.role);
            const eligibleTargets = policy.eligibleTargets as readonly MountTargetType[];
            const isLocalOnly = eligibleTargets.length === 1 && eligibleTargets[0] === "local";
            return (
              <tr key={policy.role} style={{ borderTop: "1px solid #eee" }}>
                <td style={{ padding: "12px 0" }}>
                  {policy.label}
                  {isLocalOnly && (
                    <span style={{ marginLeft: 8, fontSize: 12, color: "#666" }}>Local-only (v1)</span>
                  )}
                </td>
                <td style={{ padding: "12px 0" }}>
                  <select
                    value={entry.target}
                    onChange={(event) => handleTargetChange(policy.role, event.target.value as MountTargetType)}
                    style={{ padding: "4px 8px" }}
                  >
                    {STORAGE_OPTIONS.filter(
                      (option) => option.value !== "tongs_cloud" || eligibleTargets.includes(option.value),
                    ).map((option) => {
                      const eligible = eligibleTargets.includes(option.value);
                      const disabled = option.comingSoon || !eligible;
                      return (
                        <option key={option.value} value={option.value} disabled={disabled}>
                          {option.label}
                        </option>
                      );
                    })}
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button onClick={handleSave} disabled={!registry || isSaving}>
          {isSaving ? "Saving..." : "Save"}
        </button>
        <button onClick={handleReset} disabled={isSaving}>
          Reset to defaults
        </button>
        {hasChanges && <span style={{ alignSelf: "center", color: "#0366d6" }}>Changes not saved yet</span>}
      </div>
    </div>
  );
}
