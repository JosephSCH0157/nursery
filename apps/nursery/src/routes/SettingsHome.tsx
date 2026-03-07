import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import type { AppShellContext } from "./AppShell";
import WorkspaceRequiredNotice from "./WorkspaceRequiredNotice";
import {
  clearWorkspaceFeatureCache,
  getMyWritingProfile,
  getWorkspaceFeatures,
  resetMyWritingProfile,
  saveMyWritingProfile,
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
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileDirty, setProfileDirty] = useState(false);
  const [defaultAudience, setDefaultAudience] = useState("");
  const [defaultStructure, setDefaultStructure] = useState("");
  const [styleNotes, setStyleNotes] = useState("");
  const [profileNotice, setProfileNotice] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  const canEdit = canManageWorkspaceFeatures(activeWorkspace?.role ?? null);
  const adminOnlyTooltip = !canEdit ? "Admins only" : undefined;

  useEffect(() => {
    let cancelled = false;
    if (!workspaceId) {
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      setLoading(true);
      setError(null);
      setNotice(null);
      setDirty(false);

      try {
        const result = await getWorkspaceFeatures(workspaceId, { force: true });
        if (cancelled) return;
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setAlignmentEnabled(result.data.adaptiveStyleAlignmentEnabled);
        setAccelerateEnabled(result.data.adaptiveStyleAiAccelerateEnabled);
      } catch (reason: unknown) {
        if (cancelled) return;
        setError(reason instanceof Error ? reason.message : "Failed to load workspace features.");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  useEffect(() => {
    let cancelled = false;
    if (!workspaceId) {
      setDefaultAudience("");
      setDefaultStructure("");
      setStyleNotes("");
      setProfileDirty(false);
      setProfileError(null);
      setProfileNotice(null);
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      setProfileLoading(true);
      setProfileError(null);
      setProfileNotice(null);
      setProfileDirty(false);
      try {
        const result = await getMyWritingProfile(workspaceId, { force: true });
        if (cancelled) return;
        if (!result.ok) {
          setProfileError(result.error);
          return;
        }
        setDefaultAudience(result.data?.defaultAudience ?? "");
        setDefaultStructure(result.data?.defaultStructure ?? "");
        setStyleNotes(result.data?.styleNotes ?? "");
      } catch (reason: unknown) {
        if (cancelled) return;
        setProfileError(reason instanceof Error ? reason.message : "Failed to load writing profile.");
      } finally {
        if (!cancelled) {
          setProfileLoading(false);
        }
      }
    })();

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

  async function onSaveWritingProfile() {
    if (!workspaceId || profileSaving) return;
    setProfileSaving(true);
    setProfileError(null);
    setProfileNotice(null);
    const result = await saveMyWritingProfile(workspaceId, {
      defaultAudience: defaultAudience,
      defaultStructure: defaultStructure,
      styleNotes,
    });
    if (!result.ok) {
      setProfileError(result.error);
      setProfileSaving(false);
      return;
    }
    setDefaultAudience(result.data.defaultAudience ?? "");
    setDefaultStructure(result.data.defaultStructure ?? "");
    setStyleNotes(result.data.styleNotes ?? "");
    setProfileDirty(false);
    setProfileNotice("Writing profile saved.");
    setProfileSaving(false);
  }

  async function onResetWritingProfile() {
    if (!workspaceId || profileSaving) return;
    setProfileSaving(true);
    setProfileError(null);
    setProfileNotice(null);
    const result = await resetMyWritingProfile(workspaceId);
    if (!result.ok) {
      setProfileError(result.error);
      setProfileSaving(false);
      return;
    }
    setDefaultAudience(result.data.defaultAudience ?? "");
    setDefaultStructure(result.data.defaultStructure ?? "");
    setStyleNotes(result.data.styleNotes ?? "");
    setProfileDirty(false);
    setProfileNotice("Writing profile reset to neutral.");
    setProfileSaving(false);
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

        <div className="settings-home__divider" />

        <h4 className="settings-home__subtitle">Writing Profile</h4>
        <p className="settings-home__copy">
          Optional workspace defaults for audience and structure. Hearth applies these automatically when generating
          outlines and drafts.
        </p>

        <label className="settings-home__field">
          <span className="settings-home__field-label">Default audience</span>
          <input
            type="text"
            list="settings-home-audience-options"
            value={defaultAudience}
            disabled={profileLoading || profileSaving}
            onChange={(event) => {
              setDefaultAudience(event.target.value);
              setProfileDirty(true);
            }}
            placeholder="General podcast listeners"
          />
          <datalist id="settings-home-audience-options">
            <option value="General podcast listeners" />
            <option value="New creators and solopreneurs" />
            <option value="Experienced podcast producers" />
            <option value="YouTube-first audience" />
          </datalist>
        </label>

        <label className="settings-home__field">
          <span className="settings-home__field-label">Default structure</span>
          <select
            value={defaultStructure}
            disabled={profileLoading || profileSaving}
            onChange={(event) => {
              setDefaultStructure(event.target.value);
              setProfileDirty(true);
            }}
          >
            <option value="">Neutral</option>
            <option value="Hook, context, points, close">Hook, context, points, close</option>
            <option value="Problem, insight, action">Problem, insight, action</option>
            <option value="Narrative arc">Narrative arc</option>
            <option value="Debate / compare and contrast">Debate / compare and contrast</option>
          </select>
        </label>

        <label className="settings-home__field">
          <span className="settings-home__field-label">Style notes (optional)</span>
          <textarea
            value={styleNotes}
            disabled={profileLoading || profileSaving}
            onChange={(event) => {
              setStyleNotes(event.target.value);
              setProfileDirty(true);
            }}
            placeholder="Short reminders for voice, pacing, and delivery."
            rows={4}
          />
        </label>

        {profileLoading ? <p className="settings-home__hint">Loading writing profile...</p> : null}
        {profileError ? <p className="settings-home__error">{profileError}</p> : null}
        {profileNotice ? <p className="settings-home__notice">{profileNotice}</p> : null}

        <div className="settings-home__actions">
          <button
            type="button"
            onClick={() => void onSaveWritingProfile()}
            disabled={profileSaving || profileLoading || !profileDirty}
          >
            {profileSaving ? "Saving..." : "Save Writing Profile"}
          </button>
          <button
            type="button"
            onClick={() => void onResetWritingProfile()}
            disabled={profileSaving || profileLoading}
          >
            Reset to neutral
          </button>
        </div>
      </article>
    </section>
  );
}
