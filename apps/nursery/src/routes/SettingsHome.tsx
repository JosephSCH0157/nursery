import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import type { AppShellContext } from "./AppShell";
import WorkspaceRequiredNotice from "./WorkspaceRequiredNotice";
import {
  clearWorkspaceFeatureCache,
  getWorkspaceFeatures,
  setAdaptiveStyleFeatures,
} from "@hearth/lib/hearth-style-service";
import "./SettingsHome.css";

function canManageWorkspaceFeatures(role: string | null | undefined): boolean {
  return role === "admin" || role === "owner";
}

export default function SettingsHome() {
  const shell = useOutletContext<AppShellContext>();
  const workspaceId = shell?.workspaceId ?? null;
  const workspaceAccessDeniedId = shell?.workspaceAccessDeniedId ?? null;
  const activeWorkspace = useMemo(
    () => shell?.workspaces?.find((workspace) => workspace.id === workspaceId) ?? null,
    [shell?.workspaces, workspaceId],
  );

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [alignmentEnabled, setAlignmentEnabled] = useState(false);
  const [accelerateEnabled, setAccelerateEnabled] = useState(false);
  const [dirty, setDirty] = useState(false);

  const canEdit = canManageWorkspaceFeatures(activeWorkspace?.role ?? null);
  const adminOnlyTooltip = !canEdit ? "Admins only" : undefined;

  useEffect(() => {
    let cancelled = false;
    if (!workspaceId) {
      setAlignmentEnabled(false);
      setAccelerateEnabled(false);
      setDirty(false);
      setError(null);
      setNotice(null);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    setError(null);
    setNotice(null);
    setDirty(false);

    void getWorkspaceFeatures(workspaceId, { force: true })
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setAlignmentEnabled(result.data.adaptiveStyleAlignmentEnabled);
        setAccelerateEnabled(result.data.adaptiveStyleAiAccelerateEnabled);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setError(reason instanceof Error ? reason.message : "Failed to load workspace features.");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  async function onSaveFeatures() {
    if (!workspaceId || !canEdit || saving) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    const result = await setAdaptiveStyleFeatures(workspaceId, {
      alignmentEnabled,
      aiAccelerateEnabled: accelerateEnabled,
    });
    if (!result.ok) {
      setError(result.error);
      setSaving(false);
      return;
    }

    clearWorkspaceFeatureCache(workspaceId);
    setDirty(false);
    setNotice("Adaptive style feature settings saved.");
    setSaving(false);
  }

  if (!workspaceId) {
    return (
      <WorkspaceRequiredNotice
        toolName="Settings"
        accessDeniedWorkspaceId={workspaceAccessDeniedId}
      />
    );
  }

  return (
    <section className="settings-home">
      <article className="settings-home__panel">
        <h3 className="settings-home__title">Workspace Settings</h3>
        <p className="settings-home__copy">
          Storage decisions live under <strong>Storage (Mounts)</strong>. Pick your storage path per workspace role and every tool obeys it.
        </p>

        <div className="settings-home__divider" />

        <h4 className="settings-home__subtitle">Adaptive Style Alignment</h4>
        <p className="settings-home__copy">
          Keep this off by default. Turn on per workspace when you are ready for profile learning at Ready checkpoints.
        </p>

        <label className="settings-home__toggle" title={adminOnlyTooltip}>
          <input
            type="checkbox"
            checked={alignmentEnabled}
            title={adminOnlyTooltip}
            disabled={!canEdit || loading || saving}
            onChange={(event) => {
              const next = event.target.checked;
              setAlignmentEnabled(next);
              if (!next) setAccelerateEnabled(false);
              setDirty(true);
            }}
          />
          <span>Enable Adaptive Style Alignment</span>
        </label>

        <label className="settings-home__toggle" title={adminOnlyTooltip}>
          <input
            type="checkbox"
            checked={accelerateEnabled}
            title={adminOnlyTooltip}
            disabled={!canEdit || loading || saving || !alignmentEnabled}
            onChange={(event) => {
              setAccelerateEnabled(event.target.checked);
              setDirty(true);
            }}
          />
          <span>Enable AI Accelerate</span>
        </label>

        {!canEdit ? (
          <p className="settings-home__hint">
            Admin or Owner role is required to update workspace feature flags.
          </p>
        ) : null}

        {loading ? <p className="settings-home__hint">Loading workspace features...</p> : null}
        {error ? <p className="settings-home__error">{error}</p> : null}
        {notice ? <p className="settings-home__notice">{notice}</p> : null}

        <div className="settings-home__actions">
          <button
            type="button"
            onClick={() => void onSaveFeatures()}
            disabled={!canEdit || saving || loading || !dirty}
          >
            {saving ? "Saving..." : "Save Feature Flags"}
          </button>
        </div>
      </article>
    </section>
  );
}
