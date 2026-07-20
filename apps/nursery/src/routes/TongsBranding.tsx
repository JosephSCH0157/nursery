import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useOutletContext } from "react-router-dom";
import type {
  BrandAssetRevision,
  BrandAssetRole,
  BrandRules,
} from "@forge/shared";
import type { AppShellContext } from "./AppShell";
import WorkspaceRequiredNotice from "./WorkspaceRequiredNotice";
import {
  appendBrandProfileRevision,
  createBrandProfile,
  defaultBrandRules,
  inspectBrandVideoRevision,
  loadBrandLibrary,
  renameBrandProfile,
  setBrandProfileArchived,
  setDefaultBrandProfile,
  uploadBrandAssetRevision,
  type BrandLibraryProjection,
} from "../lib/brand-library";
import { tongsSupabase } from "../lib/supabase";
import "./TongsBranding.css";

type Capability = { label: string; ready: boolean; detail: string };
type AssetSlot = {
  role: BrandAssetRole;
  label: string;
  hint: string;
  accept: string;
  optional?: boolean;
};
const PRIMARY_SLOTS: AssetSlot[] = [
  {
    role: "primary_logo",
    label: "Primary logo",
    hint: "PNG, SVG, JPG or WebP",
    accept: "image/png,image/svg+xml,image/jpeg,image/webp",
  },
  {
    role: "video_intro",
    label: "Video intro",
    hint: "Upload a finished video intro. Embedded audio is supported.",
    accept: "video/mp4,video/quicktime,video/webm",
  },
  {
    role: "audio_intro",
    label: "Audio-only intro",
    hint: "For podcasts and other audio-only releases.",
    accept: "audio/*",
    optional: true,
  },
  {
    role: "video_outro",
    label: "Video outro",
    hint: "Upload a finished video outro. Embedded audio is supported.",
    accept: "video/mp4,video/quicktime,video/webm",
  },
  {
    role: "audio_outro",
    label: "Audio-only outro",
    hint: "For podcasts and other audio-only releases.",
    accept: "audio/*",
    optional: true,
  },
];
const LOGO_VARIANTS: AssetSlot[] = [
  {
    role: "secondary_logo",
    label: "Square icon",
    hint: "A compact avatar or show icon",
    accept: "image/*",
    optional: true,
  },
  {
    role: "alternate_logo",
    label: "Alternate logo",
    hint: "For light or dark backgrounds",
    accept: "image/*",
    optional: true,
  },
  {
    role: "transparent_logo",
    label: "Transparent logo",
    hint: "A transparent-background version",
    accept: "image/*",
    optional: true,
  },
  {
    role: "watermark_logo",
    label: "Watermark",
    hint: "A subtle on-video mark",
    accept: "image/*",
    optional: true,
  },
];
const FONT_OPTIONS = [
  "Inter",
  "Montserrat",
  "Source Sans 3",
  "Roboto",
  "Arial",
  "Georgia",
];

function latestAssetFor(
  role: BrandAssetRole,
  draft: BrandRules,
  library: BrandLibraryProjection | null,
  profileId: string,
) {
  const attached = draft.asset_revision_ids[role];
  if (attached)
    return (
      library?.asset_revisions.find((entry) => entry.id === attached) ?? null
    );
  const profileAssetIds = new Set(
    library?.assets
      .filter((asset) => asset.profile_id === profileId)
      .map((asset) => asset.id) ?? [],
  );
  return (
    library?.asset_revisions
      .filter(
        (entry) => entry.role === role && profileAssetIds.has(entry.asset_id),
      )
      .sort((a, b) => b.revision - a.revision)[0] ?? null
  );
}

function capabilityReadiness(
  rules: BrandRules,
  library: BrandLibraryProjection | null,
  profileId: string,
): Capability[] {
  const ready = (role: BrandAssetRole) =>
    latestAssetFor(role, rules, library, profileId)?.state === "ready";
  const identity = Boolean(rules.public_identity.program_name.trim());
  const style = Boolean(
    rules.palette.primary && rules.typography.heading_family,
  );
  return [
    {
      label: "Public identity",
      ready: identity,
      detail: identity ? "Ready" : "Program name needed",
    },
    {
      label: "Thumbnail branding",
      ready: identity && style && ready("primary_logo"),
      detail:
        identity && style && ready("primary_logo")
          ? "Ready"
          : "Logo or style needed",
    },
    {
      label: "Release artwork",
      ready: ready("primary_logo"),
      detail: ready("primary_logo") ? "Ready" : "Primary logo not added",
    },
    {
      label: "Audio-only branding",
      ready: ready("audio_intro") || ready("audio_outro"),
      detail: ready("audio_intro")
        ? "Intro ready"
        : ready("audio_outro")
          ? "Outro ready"
          : "Intro and outro not added",
    },
    {
      label: "Video branding",
      ready: ready("video_intro") || ready("video_outro"),
      detail: ready("video_intro")
        ? "Intro ready"
        : ready("video_outro")
          ? "Outro ready"
          : "Intro and outro not added",
    },
  ];
}

function AssetPreview({ revision }: { revision: BrandAssetRevision }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void tongsSupabase.storage
      .from(revision.storage_bucket)
      .createSignedUrl(revision.storage_key, 900)
      .then(({ data }) => {
        if (active) setUrl(data?.signedUrl ?? null);
      });
    return () => {
      active = false;
    };
  }, [revision.id, revision.storage_bucket, revision.storage_key]);
  if (!url)
    return <div className="brand-asset-placeholder">Preparing preview…</div>;
  if (revision.mime_type.startsWith("image/"))
    return <img src={url} alt="Uploaded brand asset preview" />;
  if (revision.mime_type.startsWith("audio/"))
    return (
      <audio controls preload="metadata" src={url}>
        Audio preview unavailable.
      </audio>
    );
  if (revision.mime_type.startsWith("video/"))
    return (
      <video controls preload="metadata" src={url}>
        Video preview unavailable.
      </video>
    );
  return (
    <a href={url} target="_blank" rel="noreferrer">
      View uploaded file
    </a>
  );
}

function AssetCard({
  slot,
  revision,
  disabled,
  onUpload,
  onRetry,
}: {
  slot: AssetSlot;
  revision: BrandAssetRevision | null;
  disabled: boolean;
  onUpload: (file: File) => void;
  onRetry: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const isVideo = slot.role === "video_intro" || slot.role === "video_outro";
  const state = !revision
    ? "Empty"
    : revision.state === "pending"
      ? isVideo
        ? "Inspecting video…"
        : "Verifying"
      : revision.state === "ready"
        ? "Ready"
        : "Needs attention";
  return (
    <article className="brand-asset-card">
      <header>
        <div>
          <h4>{slot.label}</h4>
          {slot.optional ? <small>Optional</small> : null}
        </div>
        <span
          className={`brand-state is-${state.toLowerCase().replace(" ", "-")}`}
        >
          {state}
        </span>
      </header>
      {revision ? (
        <>
          <div className="brand-asset-preview">
            <AssetPreview revision={revision} />
          </div>
          <p>
            {isVideo
              ? revision.state === "pending"
                ? "Inspecting video…"
                : revision.has_audio === true
                  ? "Video + audio"
                  : revision.has_audio === false
                    ? "Video only"
                    : "Audio track not inspected"
              : revision.mime_type
                  .replace("image/", "")
                  .replace("audio/", "")
                  .toUpperCase()}{" "}
            {revision.width && revision.height
              ? `· ${revision.width} × ${revision.height}`
              : ""}
            {revision.width && revision.height
              ? ` · ${(revision.width / revision.height).toFixed(2)}:1`
              : ""}
            {revision.duration_ms
              ? ` · ${Math.round(revision.duration_ms / 1000)}s`
              : ""}
          </p>
          <div className="brand-card-actions">
            <button
              type="button"
              disabled={disabled}
              onClick={() => input.current?.click()}
            >
              Replace
            </button>
            <details>
              <summary>Version history</summary>
              <small>Current canonical asset version {revision.revision}</small>
            </details>
          </div>
        </>
      ) : (
        <button
          type="button"
          className="brand-dropzone"
          disabled={disabled}
          onClick={() => input.current?.click()}
        >
          <strong>
            {slot.role === "primary_logo"
              ? "Drop a logo here"
              : `Add ${slot.label.toLowerCase()}`}
          </strong>
          <span>or choose a file</span>
          <small>{slot.hint}</small>
        </button>
      )}
      {revision?.state === "pending" && isVideo ? (
        <div className="brand-inspection-retry">
          <span>Video inspection could not be completed.</span>
          <button type="button" disabled={disabled} onClick={onRetry}>
            Retry inspection
          </button>
        </div>
      ) : null}
      <input
        ref={input}
        hidden
        type="file"
        accept={slot.accept}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onUpload(file);
          event.currentTarget.value = "";
        }}
      />
    </article>
  );
}

export default function TongsBranding() {
  const { workspaceId } = useOutletContext<AppShellContext>();
  const location = useLocation();
  const requestedSection = new URLSearchParams(location.search).get("section");
  const requestedReturn = new URLSearchParams(location.search).get("return_to");
  const returnTo = requestedReturn?.startsWith("/app/") ? requestedReturn : null;
  const styleSectionRef = useRef<HTMLElement | null>(null);
  const [library, setLibrary] = useState<BrandLibraryProjection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [draft, setDraft] = useState<BrandRules>(defaultBrandRules());
  const [tab, setTab] = useState<
    "overview" | "assets" | "style" | "usage" | "history"
  >(requestedSection === "style" ? "style" : "overview");
  const [showVariants, setShowVariants] = useState(false);
  const reload = async () => {
    if (!workspaceId) return;
    try {
      const next = await loadBrandLibrary(workspaceId);
      setLibrary(next);
      setSelectedId(
        (current) =>
          current ??
          next.profiles.find((entry) => !entry.archived_at)?.id ??
          null,
      );
      setError(null);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to load Brand Library.",
      );
    }
  };
  useEffect(() => {
    void reload();
  }, [workspaceId]);
  const selected =
    library?.profiles.find((entry) => entry.id === selectedId) ?? null;
  const revisions = useMemo(
    () =>
      library?.revisions
        .filter((entry) => entry.profile_id === selectedId)
        .sort((a, b) => b.revision - a.revision) ?? [],
    [library, selectedId],
  );
  useEffect(() => {
    if (revisions[0]) setDraft(structuredClone(revisions[0].rules));
  }, [revisions[0]?.id]);
  useEffect(() => {
    if (requestedSection === "style" && tab === "style") styleSectionRef.current?.focus();
  }, [requestedSection, tab]);
  const capabilities = useMemo(
    () => (selectedId ? capabilityReadiness(draft, library, selectedId) : []),
    [draft, library, selectedId],
  );
  if (!workspaceId)
    return <WorkspaceRequiredNotice toolName="Tongs Branding" />;
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      await reload();
      setError(null);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Brand operation failed. Your saved brand remains safe.",
      );
    } finally {
      setBusy(false);
    }
  };
  const upload = (slot: AssetSlot, file: File) => {
    if (!selected) return;
    void run(async () => {
      const revision = await uploadBrandAssetRevision({
        workspaceId,
        profileId: selected.id,
        role: slot.role,
        label: file.name,
        file,
      });
      setDraft((current) => ({
        ...current,
        asset_revision_ids: {
          ...current.asset_revision_ids,
          [slot.role]: revision.id,
        },
      }));
    });
  };
  const retryInspection = (revision: BrandAssetRevision | null) => {
    if (!revision) return;
    void run(async () => {
      const inspected = await inspectBrandVideoRevision(revision.id);
      setDraft((current) => ({
        ...current,
        asset_revision_ids: {
          ...current.asset_revision_ids,
          [revision.role]: inspected.id,
        },
      }));
    });
  };
  const create = () =>
    void run(async () => {
      const result = (await createBrandProfile(
        workspaceId,
        newName.trim(),
        defaultBrandRules(newName.trim()),
      )) as { profile_id?: string; id?: string };
      setSelectedId(result.profile_id ?? result.id ?? null);
      setNewName("");
      setCreating(false);
    });
  return (
    <section className="brand-library" aria-label="Brand Library">
      <header className="brand-library-header">
        <div>
          <span>Workspace identity</span>
          <h2>Brand Library</h2>
          <p>
            Create a brand once, add the pieces you already have, and let Forge
            use them consistently.
          </p>
        </div>
        <button
          type="button"
          className="is-primary"
          onClick={() => setCreating(true)}
        >
          Create brand
        </button>
      </header>
      {error ? (
        <div className="tongs-storage-error" role="alert">
          {error}
        </div>
      ) : null}
      {creating ? (
        <section className="brand-create-card" aria-label="Create brand">
          <div>
            <h3>Create a brand</h3>
            <p>
              Start with the public name of your show. You can add assets and
              style next.
            </p>
          </div>
          <label>
            Brand or show name
            <input
              autoFocus
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="BS with Joe"
            />
          </label>
          <div>
            <button type="button" onClick={() => setCreating(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="is-primary"
              disabled={busy || !newName.trim()}
              onClick={create}
            >
              Create brand
            </button>
          </div>
        </section>
      ) : null}
      <div className="brand-card-grid" aria-label="Saved brands">
        {library?.profiles
          .filter((profile) => !profile.archived_at)
          .map((profile) => {
            const revision = library.revisions
              .filter((entry) => entry.profile_id === profile.id)
              .sort((a, b) => b.revision - a.revision)[0];
            const rules =
              revision?.rules ?? defaultBrandRules(profile.internal_label);
            const status = capabilityReadiness(rules, library, profile.id);
            return (
              <article
                key={profile.id}
                className={`brand-library-card${profile.id === selectedId ? " is-selected" : ""}`}
              >
                <div
                  className="brand-library-logo"
                  style={{
                    background: rules.palette.primary,
                    color: rules.palette.secondary,
                  }}
                >
                  {rules.public_identity.program_name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3>{rules.public_identity.program_name}</h3>
                  {profile.is_default ? (
                    <span className="brand-default-badge">
                      Workspace default
                    </span>
                  ) : null}
                </div>
                <ul>
                  {status.slice(1).map((entry) => (
                    <li key={entry.label}>
                      <span aria-hidden="true">{entry.ready ? "✓" : "○"}</span>
                      {entry.label}: {entry.detail}
                    </li>
                  ))}
                </ul>
                <small>
                  Updated {new Date(profile.updated_at).toLocaleDateString()}
                </small>
                <div className="brand-card-actions">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(profile.id);
                      setTab("overview");
                    }}
                  >
                    Open brand
                  </button>
                  <details>
                    <summary
                      aria-label={`More actions for ${rules.public_identity.program_name}`}
                    >
                      •••
                    </summary>
                    <div>
                      <button
                        type="button"
                        disabled={profile.is_default || busy}
                        onClick={() =>
                          void run(() =>
                            setDefaultBrandProfile(workspaceId, profile.id),
                          )
                        }
                      >
                        Make workspace default
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          const name = window
                            .prompt("Rename brand", profile.internal_label)
                            ?.trim();
                          if (name)
                            void run(() =>
                              renameBrandProfile(workspaceId, profile.id, name),
                            );
                        }}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          if (
                            !profile.is_default ||
                            window.confirm(
                              `${rules.public_identity.program_name} is your workspace default. Archiving it will leave the workspace without a default brand. Continue?`,
                            )
                          )
                            void run(() =>
                              setBrandProfileArchived({
                                workspaceId,
                                profileId: profile.id,
                                archived: true,
                                clearDefault: profile.is_default,
                              }),
                            );
                        }}
                      >
                        Archive
                      </button>
                    </div>
                  </details>
                </div>
              </article>
            );
          })}
      </div>
      {selected ? (
        <main className="brand-workspace">
          <header>
            <div>
              <h2>{draft.public_identity.program_name}</h2>
              <div>
                {selected.is_default ? (
                  <span className="brand-default-badge">Workspace default</span>
                ) : null}
                <strong>
                  {capabilities.find(
                    (entry) => entry.label === "Thumbnail branding",
                  )?.ready
                    ? "Ready for thumbnails"
                    : "Brand setup in progress"}
                </strong>
              </div>
            </div>
            <button
              type="button"
              className="is-primary"
              disabled={busy || Boolean(selected.archived_at)}
              onClick={() =>
                void run(() =>
                  appendBrandProfileRevision(workspaceId, selected.id, draft),
                )
              }
            >
              {busy ? "Saving…" : "Save brand changes"}
            </button>
          </header>
          <nav className="brand-tabs" aria-label="Brand workspace sections">
            {(["overview", "assets", "style", "usage", "history"] as const).map(
              (name) => (
                <button
                  type="button"
                  key={name}
                  className={tab === name ? "is-active" : ""}
                  aria-current={tab === name ? "page" : undefined}
                  onClick={() => setTab(name)}
                >
                  {name[0].toUpperCase() + name.slice(1)}
                </button>
              ),
            )}
          </nav>
          {tab === "overview" ? (
            <div className="brand-overview-grid">
              <section className="brand-preview-panel">
                <div
                  className="brand-show-preview"
                  style={{
                    background: draft.palette.primary,
                    color: draft.palette.secondary,
                    fontFamily: draft.typography.heading_family,
                  }}
                >
                  <span className="brand-preview-logo">
                    {draft.public_identity.program_name
                      .slice(0, 2)
                      .toUpperCase()}
                  </span>
                  <h3>
                    {draft.public_identity.display_name ||
                      draft.public_identity.program_name}
                  </h3>
                  <p>{draft.public_identity.tagline || "Your show tagline"}</p>
                  <div style={{ background: draft.palette.accent }}>
                    THUMBNAIL PREVIEW
                  </div>
                </div>
                <div className="brand-preview-switcher">
                  <button type="button" className="is-active">
                    Show card
                  </button>
                  <button type="button" onClick={() => setTab("style")}>
                    Thumbnail
                  </button>
                  <button type="button" onClick={() => setTab("assets")}>
                    Media
                  </button>
                </div>
              </section>
              <section className="brand-readiness">
                <h3>Brand readiness</h3>
                {capabilities.map((entry) => (
                  <div key={entry.label}>
                    <span
                      className={entry.ready ? "is-ready" : "is-missing"}
                      aria-hidden="true"
                    >
                      {entry.ready ? "✓" : "○"}
                    </span>
                    <div>
                      <strong>{entry.label}</strong>
                      <small>{entry.detail}</small>
                    </div>
                  </div>
                ))}
                <button type="button" onClick={() => setTab("assets")}>
                  Add missing assets
                </button>
              </section>
              <section className="brand-details">
                <h3>Brand details</h3>
                <label>
                  Program name
                  <input
                    value={draft.public_identity.program_name}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        public_identity: {
                          ...draft.public_identity,
                          program_name: event.target.value,
                        },
                      })
                    }
                  />
                </label>
                <label>
                  Public display name
                  <input
                    value={draft.public_identity.display_name ?? ""}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        public_identity: {
                          ...draft.public_identity,
                          display_name: event.target.value || null,
                        },
                      })
                    }
                  />
                </label>
                <label>
                  Tagline
                  <input
                    value={draft.public_identity.tagline ?? ""}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        public_identity: {
                          ...draft.public_identity,
                          tagline: event.target.value || null,
                        },
                      })
                    }
                  />
                </label>
                <label>
                  Short description
                  <textarea
                    value={draft.public_identity.description ?? ""}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        public_identity: {
                          ...draft.public_identity,
                          description: event.target.value || null,
                        },
                      })
                    }
                  />
                </label>
              </section>
            </div>
          ) : null}
          {tab === "assets" ? (
            <section className="brand-assets">
              <div className="brand-section-heading">
                <div>
                  <h3>Brand assets</h3>
                  <p>
                    Add only what your show uses. Video files may contain their
                    finished mixed audio; audio-only versions remain separate
                    and optional.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowVariants((value) => !value)}
                >
                  {showVariants
                    ? "Hide logo versions"
                    : "Add another logo version"}
                </button>
              </div>
              <div className="brand-asset-grid">
                {PRIMARY_SLOTS.map((slot) => {
                  const revision = latestAssetFor(slot.role, draft, library, selected.id);
                  return (
                    <AssetCard
                      key={slot.role}
                      slot={slot}
                      revision={revision}
                      disabled={busy || Boolean(selected.archived_at)}
                      onUpload={(file) => upload(slot, file)}
                      onRetry={() => retryInspection(revision)}
                    />
                  );
                })}
              </div>
              {showVariants ? (
                <>
                  <h3>Logo versions</h3>
                  <div className="brand-asset-grid">
                    {LOGO_VARIANTS.map((slot) => {
                      const revision = latestAssetFor(
                        slot.role,
                        draft,
                        library,
                        selected.id,
                      );
                      return (
                        <AssetCard
                          key={slot.role}
                          slot={slot}
                          revision={revision}
                          disabled={busy || Boolean(selected.archived_at)}
                          onUpload={(file) => upload(slot, file)}
                          onRetry={() => retryInspection(revision)}
                        />
                      );
                    })}
                  </div>
                </>
              ) : null}
              <section className="brand-audio-defaults">
                <h3>Audio defaults</h3>
                <p>
                  Usage hints only. Hammer owns placement, whole-clip gain,
                  fades, and final-media truth. A finished video mix cannot be
                  independently rebalanced without separate stems, and
                  audio-only settings are not applied to its embedded soundtrack
                  automatically.
                </p>
                <label>
                  Intro and outro volume{" "}
                  <output>{Math.round(draft.audio.music_volume * 100)}%</output>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={draft.audio.music_volume}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        audio: {
                          ...draft.audio,
                          music_volume: Number(event.target.value),
                        },
                      })
                    }
                  />
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={draft.audio.ducking > 0}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        audio: {
                          ...draft.audio,
                          ducking: event.target.checked ? 0.35 : 0,
                        },
                      })
                    }
                  />{" "}
                  Lower separate music when speech begins
                </label>
              </section>
            </section>
          ) : null}
          {tab === "style" ? (
            <section className="brand-style" ref={styleSectionRef} tabIndex={-1}>
              <div>
                <h3>Colors</h3>
                {(["primary", "secondary", "accent"] as const).map((key) => (
                  <label className="brand-color-field" key={key}>
                    <span>{key[0].toUpperCase() + key.slice(1)} color</span>
                    <input
                      type="color"
                      value={draft.palette[key]}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          palette: {
                            ...draft.palette,
                            [key]: event.target.value,
                          },
                        })
                      }
                    />
                    <input
                      value={draft.palette[key].toUpperCase()}
                      pattern="#[0-9A-Fa-f]{6}"
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          palette: {
                            ...draft.palette,
                            [key]: event.target.value,
                          },
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <div>
                <h3>Typography</h3>
                <label>
                  Heading font
                  <select
                    value={draft.typography.heading_family}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        typography: {
                          ...draft.typography,
                          heading_family: event.target.value,
                        },
                      })
                    }
                  >
                    {FONT_OPTIONS.map((font) => (
                      <option key={font}>{font}</option>
                    ))}
                  </select>
                  <strong
                    className="brand-font-heading"
                    style={{ fontFamily: draft.typography.heading_family }}
                  >
                    THE TINY BUG THAT WON
                  </strong>
                </label>
                <label>
                  Body font
                  <select
                    value={draft.typography.body_family}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        typography: {
                          ...draft.typography,
                          body_family: event.target.value,
                        },
                      })
                    }
                  >
                    {FONT_OPTIONS.map((font) => (
                      <option key={font}>{font}</option>
                    ))}
                  </select>
                  <span style={{ fontFamily: draft.typography.body_family }}>
                    Preview text showing your brand’s body style.
                  </span>
                </label>
              </div>
              <div>
                <h3>Thumbnail text style</h3>
                <label>
                  Logo placement
                  <select
                    value={draft.logo.placement}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        logo: {
                          ...draft.logo,
                          placement: event.target
                            .value as BrandRules["logo"]["placement"],
                        },
                      })
                    }
                  >
                    <option value="top_left">Top left</option>
                    <option value="top_right">Top right</option>
                    <option value="bottom_left">Bottom left</option>
                    <option value="bottom_right">Bottom right</option>
                  </select>
                </label>
                <label>
                  Watermark opacity{" "}
                  <output>
                    {Math.round(draft.logo.watermark_opacity * 100)}%
                  </output>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step=".05"
                    value={draft.logo.watermark_opacity}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        logo: {
                          ...draft.logo,
                          watermark_opacity: Number(event.target.value),
                        },
                      })
                    }
                  />
                </label>
              </div>
            </section>
          ) : null}
          {tab === "usage" ? (
            <section className="brand-usage">
              <h3>Where this brand is used</h3>
              <div>
                <strong>Hearth</strong>
                <p>Thumbnail and pre-production visual styling.</p>
              </div>
              <div>
                <strong>Hammer</strong>
                <p>
                  Editorial media suggestions and normal-use defaults; never
                  automatic placement.
                </p>
              </div>
              <div>
                <strong>Quench</strong>
                <p>Release preparation and public metadata presentation.</p>
              </div>
              <div>
                <strong>Workspace</strong>
                <p>
                  {selected.is_default
                    ? "This is the workspace default brand."
                    : "This brand is available for explicit show and episode bindings."}
                </p>
              </div>
            </section>
          ) : null}
          {tab === "history" ? (
            <section className="brand-history">
              <h3>Version history</h3>
              <p>
                Every save creates a new version. Previous versions remain
                available for audit and recovery.
              </p>
              {revisions.map((revision) => (
                <article key={revision.id}>
                  <div>
                    <strong>Version {revision.revision}</strong>
                    <span>
                      {revision.validation?.bindable
                        ? "Ready to use"
                        : "Needs attention"}
                    </span>
                  </div>
                  <small>
                    {new Date(revision.created_at).toLocaleString()}
                  </small>
                  {revision.validation?.errors?.length ? (
                    <ul>
                      {revision.validation.errors.map((entry) => (
                        <li key={entry}>{entry}</li>
                      ))}
                    </ul>
                  ) : null}
                  <details>
                    <summary>Technical details</summary>
                    <code>{revision.content_hash}</code>
                    <p>
                      Verification: {revision.validation?.verification_version}
                    </p>
                  </details>
                </article>
              ))}
            </section>
          ) : null}
          <details className="brand-advanced">
            <summary>Advanced details</summary>
            <label>
              Internal label
              <input
                value={selected.internal_label}
                onChange={(event) =>
                  setLibrary((current) =>
                    current
                      ? {
                          ...current,
                          profiles: current.profiles.map((profile) =>
                            profile.id === selected.id
                              ? {
                                  ...profile,
                                  internal_label: event.target.value,
                                }
                              : profile,
                          ),
                        }
                      : current,
                  )
                }
              />
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void run(() =>
                  renameBrandProfile(
                    workspaceId,
                    selected.id,
                    selected.internal_label,
                  ),
                )
              }
            >
              Save internal label
            </button>
            <p>
              Profile identity: <code>{selected.id}</code>
            </p>
          </details>
          <footer className="brand-save-bar">
            <div>
              <strong>{busy ? "Saving brand…" : "Brand changes"}</strong>
              <span>
                Saving creates a new version. Previous versions remain
                available.
              </span>
            </div>
            <button
              type="button"
              className="is-primary"
              disabled={busy || Boolean(selected.archived_at)}
              onClick={() => void run(async () => {
                await appendBrandProfileRevision(workspaceId, selected.id, draft);
                if (returnTo) window.location.assign(returnTo);
              })}
            >
              {returnTo ? "Save and return to thumbnails" : "Save brand changes"}
            </button>
          </footer>
        </main>
      ) : (
        <p className="brand-empty">
          Create a brand to add your show identity and assets.
        </p>
      )}
    </section>
  );
}
