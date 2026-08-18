import type { JSX } from "react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  buildHammerCanonicalEditorHref,
  loadHammerWorkspaceProjects,
  resolveHammerRouteWorkpieceId,
  type HammerRuntimeProjectCard,
} from "./hammerRuntimeData";
import { loadWorkpieceRecordingCardThumbnailState } from "./hammerRecordingCardThumbnail";
import { loadWorkpieceMediaPreviewUrl } from "../lib/hammerSourceDeskMediaApi";
import { intake, pickMediaFile } from "../lib/hammerIntakeRecordingApi";
import HammerWorkspaceSelection from "./HammerWorkspaceSelection";
import type { HammerShellWorkspaceOption, HammerWorkspaceResolutionState } from "./hammerShellContext";
import "./HammerProjectLibrary.css";

type HammerProjectLibraryProps = {
  workspaceId: string | null;
  workspaces: HammerShellWorkspaceOption[];
  loadingWorkspaces: boolean;
  workspaceError: string | null;
  workspaceResolutionState: HammerWorkspaceResolutionState;
  onSelectWorkspace: (workspaceId: string | null) => void;
  onRefreshWorkspaces: () => Promise<void>;
};

function formatDateTimeLabel(value: string | null): string {
  if (!value) return "Unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unavailable";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getReadinessClassName(project: HammerRuntimeProjectCard): string {
  return `hammer-project-library__status hammer-project-library__status--${project.readiness.tone}`;
}

function shortId(value: string): string {
  if (!value) return "";
  if (value.length <= 12) return value;
  return `${value.slice(0, 8)}...`;
}

function formatDurationLabel(durationMs: number | null): string | null {
  if (durationMs == null || !Number.isFinite(durationMs) || durationMs <= 0) return null;
  const totalSeconds = Math.max(1, Math.floor(durationMs / 1000));
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  if (hours > 0) {
    return `${hours}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

function inferVideoMimeTypeFromPath(path: string): string {
  const value = path.trim().toLowerCase();
  if (value.endsWith(".webm")) return "video/webm";
  if (value.endsWith(".mov")) return "video/quicktime";
  if (value.endsWith(".m4v")) return "video/x-m4v";
  return "video/mp4";
}

type ProjectSortMode = "updated_desc" | "title_asc" | "needs_recording";

function sortProjects(items: HammerRuntimeProjectCard[], mode: ProjectSortMode): HammerRuntimeProjectCard[] {
  const next = [...items];
  if (mode === "title_asc") {
    next.sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: "base" }));
    return next;
  }
  if (mode === "needs_recording") {
    next.sort((left, right) => {
      const leftHasTake = left.readiness.indicators.some((indicator) => indicator.toLowerCase().includes("kept take"));
      const rightHasTake = right.readiness.indicators.some((indicator) => indicator.toLowerCase().includes("kept take"));
      if (leftHasTake !== rightHasTake) return leftHasTake ? 1 : -1;
      return (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "");
    });
    return next;
  }
  next.sort((left, right) => (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""));
  return next;
}

function pickDefaultProject(
  projects: HammerRuntimeProjectCard[],
  preferredWorkpieceId: string | null,
  currentWorkpieceId: string | null,
): string | null {
  if (preferredWorkpieceId && projects.some((project) => project.workpieceId === preferredWorkpieceId)) {
    return preferredWorkpieceId;
  }
  if (currentWorkpieceId && projects.some((project) => project.workpieceId === currentWorkpieceId)) {
    return currentWorkpieceId;
  }
  return projects.find((project) => project.isEditReady)?.workpieceId
    ?? projects[0]?.workpieceId
    ?? null;
}

export default function HammerProjectLibrary(props: HammerProjectLibraryProps): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const routeWorkpieceId = useMemo(
    () => resolveHammerRouteWorkpieceId(location.search),
    [location.search],
  );
  const [projects, setProjects] = useState<HammerRuntimeProjectCard[]>([]);
  const [selectedWorkpieceId, setSelectedWorkpieceId] = useState<string | null>(routeWorkpieceId);
  const [loading, setLoading] = useState(Boolean(props.workspaceId));
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [sortMode, setSortMode] = useState<ProjectSortMode>("updated_desc");
  const [recordingThumbnailUrls, setRecordingThumbnailUrls] = useState<Record<string, string>>({});
  const [recordingThumbnailKinds, setRecordingThumbnailKinds] = useState<Record<string, "image" | "video">>({});
  const [intakeBusy, setIntakeBusy] = useState(false);
  const [intakeBusyWorkpieceId, setIntakeBusyWorkpieceId] = useState<string | null>(null);
  const [intakeError, setIntakeError] = useState<string | null>(null);

  useEffect(() => {
    if (!routeWorkpieceId) return;
    setSelectedWorkpieceId(routeWorkpieceId);
  }, [routeWorkpieceId]);

  useEffect(() => {
    if (!props.workspaceId) {
      setProjects([]);
      setSelectedWorkpieceId(routeWorkpieceId);
      setLoading(false);
      setError(null);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    void loadHammerWorkspaceProjects(props.workspaceId)
      .then((nextProjects) => {
        if (!active) return;
        setProjects(nextProjects);
        setSelectedWorkpieceId((current) => pickDefaultProject(nextProjects, routeWorkpieceId, current));
        setLoading(false);
      })
      .catch((loadError) => {
        if (!active) return;
        setProjects([]);
        setSelectedWorkpieceId(routeWorkpieceId);
        setLoading(false);
        setError(loadError instanceof Error && loadError.message.trim()
          ? loadError.message
          : "Hammer could not load projects for this workspace.");
      });

    return () => {
      active = false;
    };
  }, [props.workspaceId, routeWorkpieceId, refreshToken]);

  useEffect(() => {
    let active = true;
    const createdUrls: string[] = [];

    async function resolveCardThumbnails(): Promise<void> {
      const nextUrls: Record<string, string> = {};
      const nextKinds: Record<string, "image" | "video"> = {};
      for (const project of projects) {
        if (!project.recording.hasRecording) continue;
        if (project.recording.mediaKind !== "recording_video") continue;
        if (!project.recording.mediaPath) continue;

        let previewUrl: string | null = null;
        let thumbnailPath = project.recording.thumbnailPath;
        if (!thumbnailPath) {
          thumbnailPath = await loadWorkpieceRecordingCardThumbnailState(project.workpieceId)
            .then((state) => state.thumbnailPath)
            .catch(() => null);
        }
        if (thumbnailPath) {
          previewUrl = await loadWorkpieceMediaPreviewUrl({
            workpieceId: project.workpieceId,
            path: thumbnailPath,
            mimeType: "image/jpeg",
            surface: "project_library_preview",
          }).catch(() => null);
        }
        if (!previewUrl) {
          previewUrl = await loadWorkpieceMediaPreviewUrl({
            workpieceId: project.workpieceId,
            path: project.recording.mediaPath,
            mimeType: inferVideoMimeTypeFromPath(project.recording.mediaPath),
            surface: "project_library_preview",
          }).catch(() => null);
          if (previewUrl) {
            nextKinds[project.workpieceId] = "video";
          }
        }
        if (!previewUrl) continue;
        if (!nextKinds[project.workpieceId]) {
          nextKinds[project.workpieceId] = "image";
        }
        if (!active) {
          URL.revokeObjectURL(previewUrl);
          continue;
        }
        createdUrls.push(previewUrl);
        nextUrls[project.workpieceId] = previewUrl;
      }

      if (!active) {
        for (const url of createdUrls) URL.revokeObjectURL(url);
        return;
      }

      setRecordingThumbnailUrls((current) => {
        for (const url of Object.values(current)) {
          URL.revokeObjectURL(url);
        }
        return nextUrls;
      });
      setRecordingThumbnailKinds(nextKinds);
    }

    void resolveCardThumbnails();
    return () => {
      active = false;
      for (const url of createdUrls) {
        URL.revokeObjectURL(url);
      }
    };
  }, [projects]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.workpieceId === selectedWorkpieceId) ?? null,
    [projects, selectedWorkpieceId],
  );
  const readyProjects = useMemo(
    () => sortProjects(projects.filter((project) => project.isEditReady), sortMode),
    [projects, sortMode],
  );
  const pendingProjects = useMemo(
    () => sortProjects(projects.filter((project) => !project.isEditReady), sortMode),
    [projects, sortMode],
  );

  const devLaunchHref = useMemo(() => {
    const params = new URLSearchParams(location.search);
    if (props.workspaceId) {
      params.set("workspace_id", props.workspaceId);
    }
    const nextSearch = params.toString();
    return nextSearch ? `/app/hammer/dev/launch?${nextSearch}` : "/app/hammer/dev/launch";
  }, [location.search, props.workspaceId]);

  function openProject(project: HammerRuntimeProjectCard | null) {
    if (!project) return;
    navigate(buildHammerCanonicalEditorHref(location.search, {
      workspaceId: project.workspaceId,
      workpieceId: project.workpieceId,
    }));
  }

  async function attachMediaToEpisode(workspaceId: string, workpieceId: string): Promise<void> {
    if (intakeBusy) return;
    setIntakeError(null);

    const file = await pickMediaFile();
    if (!file) return;

    setIntakeBusy(true);
    setIntakeBusyWorkpieceId(workpieceId);
    try {
      const result = await intake({
        mode: "episode_attached",
        workspaceId,
        workpieceId,
        file,
      });
      if (!result.ok) {
        setIntakeError(result.error);
        window.alert(result.error);
        return;
      }

      setRefreshToken((current) => current + 1);
      navigate(buildHammerCanonicalEditorHref(location.search, {
        workspaceId: result.workspace_id,
        workpieceId: result.workpiece_id,
      }));
    } finally {
      setIntakeBusy(false);
      setIntakeBusyWorkpieceId(null);
    }
  }

  async function importStandalone(workspaceId: string): Promise<void> {
    if (intakeBusy) return;
    setIntakeError(null);

    const proceed = window.confirm(
      "This media will not be attached to any Episode. It will open as a standalone edit.",
    );
    if (!proceed) return;

    const file = await pickMediaFile();
    if (!file) return;

    setIntakeBusy(true);
    setIntakeBusyWorkpieceId(null);
    try {
      const result = await intake({
        mode: "standalone",
        workspaceId,
        file,
      });
      if (!result.ok) {
        setIntakeError(result.error);
        window.alert(result.error);
        return;
      }

      setRefreshToken((current) => current + 1);
      setSelectedWorkpieceId(result.workpiece_id);
      navigate(buildHammerCanonicalEditorHref(location.search, {
        workspaceId: result.workspace_id,
        workpieceId: result.workpiece_id,
      }));
    } finally {
      setIntakeBusy(false);
    }
  }

  function renderProjectGrid(items: HammerRuntimeProjectCard[]): JSX.Element {
    return (
      <div className="hammer-project-library__grid">
        {items.map((project) => {
          const isSelected = project.workpieceId === (routeWorkpieceId ?? selectedWorkpieceId);
          const recordingDurationLabel = formatDurationLabel(project.recording.mediaDurationMs);
          return (
            <article
              key={project.workpieceId}
              className={`hammer-project-library__card${isSelected ? " is-selected" : ""}`}
              tabIndex={0}
              onClick={() => {
                setSelectedWorkpieceId(project.workpieceId);
                openProject(project);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                setSelectedWorkpieceId(project.workpieceId);
                openProject(project);
              }}
            >
              <div className="hammer-project-library__card-body">
                <div className="hammer-project-library__card-media-inline">
                  <div className="hammer-project-library__card-thumb-token">
                    {recordingThumbnailUrls[project.workpieceId] ? (
                      recordingThumbnailKinds[project.workpieceId] === "video" ? (
                        <video
                          className="hammer-project-library__card-thumb"
                          src={recordingThumbnailUrls[project.workpieceId]}
                          muted
                          playsInline
                          preload="metadata"
                        />
                      ) : (
                        <img
                          className="hammer-project-library__card-thumb"
                          src={recordingThumbnailUrls[project.workpieceId]}
                          alt={`${project.label} recording thumbnail`}
                        />
                      )
                    ) : (
                      <div className="hammer-project-library__card-thumb-fallback">
                        {project.recording.hasRecording ? "Rec" : "None"}
                      </div>
                    )}
                  </div>
                  {project.recording.hasRecording ? (
                    <span className="hammer-project-library__card-media-badge">
                      Recorded
                      {recordingDurationLabel ? (
                        <span className="hammer-project-library__card-media-badge-duration">
                          {" • "}
                          {recordingDurationLabel}
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                </div>
                <div className="hammer-project-library__card-topline">
                  <span className={getReadinessClassName(project)}>
                    {project.readiness.statusLabel}
                  </span>
                  <span className="hammer-project-library__card-updated">
                    Updated {formatDateTimeLabel(project.updatedAt)}
                  </span>
                </div>
                <div className="hammer-project-library__card-title">{project.label}</div>
                <div className="hammer-project-library__card-id">
                  {shortId(project.workpieceId)}
                </div>
                <div className="hammer-project-library__card-meta">
                  <div>
                    <div className="hammer-project-library__label">Created</div>
                    <div>{formatDateTimeLabel(project.createdAt)}</div>
                  </div>
                  <div>
                    <div className="hammer-project-library__label">Workspace</div>
                    <div>{shortId(project.workspaceId)}</div>
                  </div>
                </div>
                <div className="hammer-project-library__indicator-row">
                  {project.readiness.indicators.slice(0, 3).map((indicator) => (
                    <span key={indicator} className="hammer-project-library__indicator">
                      {indicator}
                    </span>
                  ))}
                  {project.readiness.indicators.length > 3 ? (
                    <span className="hammer-project-library__indicator hammer-project-library__indicator--more">
                      +{project.readiness.indicators.length - 3} more
                    </span>
                  ) : null}
                </div>
                <div className="hammer-project-library__card-actions">
                  <button
                    type="button"
                    className="hammer-project-library__button hammer-project-library__button--secondary hammer-project-library__button--card"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      void attachMediaToEpisode(project.workspaceId, project.workpieceId);
                    }}
                    disabled={intakeBusy}
                  >
                    {intakeBusy && intakeBusyWorkpieceId === project.workpieceId
                      ? "Attaching..."
                      : "Attach Media"}
                  </button>
                </div>
                <details className="hammer-project-library__card-details">
                  <summary>Details</summary>
                  <div className="hammer-project-library__card-details-body">
                    <div><span className="hammer-project-library__label">Workpiece</span> {project.workpieceId}</div>
                    <div><span className="hammer-project-library__label">Workspace</span> {project.workspaceId}</div>
                    <div><span className="hammer-project-library__label">Indicators</span> {project.readiness.indicators.join(" • ") || "None"}</div>
                  </div>
                </details>
              </div>
            </article>
          );
        })}
      </div>
    );
  }

  return (
    <section className="hammer-project-library">
      <header className="hammer-project-library__header">
        <div className="hammer-project-library__intro">
          <div className="hammer-project-library__eyebrow-row">
            <div className="hammer-project-library__eyebrow">
              Hammer Project Library
            </div>
            <span className="hammer-project-library__title-badge">Under Construction</span>
          </div>
          <h2 className="hammer-project-library__title">Project Library</h2>
          <div className="hammer-project-library__summary">
            Hammer reads live workpieces from Tongs and opens saved editor state without synthetic launch scaffolding.
          </div>
        </div>
        <div className="hammer-project-library__actions">
          <button
            type="button"
            className="hammer-project-library__button hammer-project-library__button--secondary"
            onClick={() => {
              if (!props.workspaceId) {
                void props.onRefreshWorkspaces();
                return;
              }
              setRefreshToken((current) => current + 1);
            }}
            disabled={loading || props.loadingWorkspaces}
          >
            {loading || props.loadingWorkspaces
              ? "Refreshing..."
              : props.workspaceId
              ? "Refresh"
              : "Refresh workspaces"}
          </button>
          <button
            type="button"
            className="hammer-project-library__button hammer-project-library__button--secondary"
            onClick={() => {
              if (props.workspaceResolutionState !== "ready" || !props.workspaceId) return;
              void importStandalone(props.workspaceId);
            }}
            disabled={props.workspaceResolutionState !== "ready" || !props.workspaceId || intakeBusy}
          >
            {intakeBusy && !intakeBusyWorkpieceId ? "Importing..." : "Standalone Import"}
          </button>
          <button
            type="button"
            className="hammer-project-library__button hammer-project-library__button--primary"
            onClick={() => openProject(selectedProject)}
            disabled={!selectedProject}
          >
            Open Project
          </button>
          <label className="hammer-project-library__sort-field">
            <span>Sort</span>
            <select
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value as ProjectSortMode)}
            >
              <option value="updated_desc">Recently updated</option>
              <option value="title_asc">Title A-Z</option>
              <option value="needs_recording">Needs recording first</option>
            </select>
          </label>
          {import.meta.env.DEV ? (
            <Link to={devLaunchHref} className="hammer-project-library__dev-link" title="Development only">
              Dev scenarios
            </Link>
          ) : null}
        </div>
      </header>

      {intakeError ? (
        <div className="hammer-project-library__intake-error" role="alert">
          {intakeError}
        </div>
      ) : null}

      {props.workspaceResolutionState !== "ready" ? (
        <HammerWorkspaceSelection
          title={props.workspaceResolutionState === "resolving"
            ? "Resolving workspace context"
            : "Choose a workspace to open Hammer"}
          summary={props.workspaceResolutionState === "resolving"
            ? "Hammer is resolving workspace truth from the current route and workpiece."
            : "Hammer establishes its own workspace context when no upstream handoff is present."}
          workspaces={props.workspaces}
          selectedWorkspaceId={props.workspaceId}
          loading={props.loadingWorkspaces}
          error={props.workspaceError}
          onSelectWorkspace={(workspaceId) => props.onSelectWorkspace(workspaceId)}
          onRefresh={() => {
            void props.onRefreshWorkspaces();
          }}
          emptyMessage="No workspaces are available yet. Sign in or refresh to load a real Hammer library."
        />
      ) : error ? (
        <section className="hammer-project-library__empty-state hammer-project-library__empty-state--error">
          <h3>Project library unavailable.</h3>
          <p>{error}</p>
        </section>
      ) : loading ? (
        <section className="hammer-project-library__empty-state">
          <h3>Loading projects...</h3>
          <p>Hammer is reading workpieces and persisted editor state from Tongs.</p>
        </section>
      ) : projects.length === 0 ? (
        <section className="hammer-project-library__empty-state">
          <h3>No projects found in this workspace.</h3>
          <p>Hammer will list real workpieces here as soon as this workspace has any.</p>
        </section>
      ) : (
        <div className="hammer-project-library__sections">
          <section className="hammer-project-library__section">
            <div className="hammer-project-library__section-head">
              <div className="hammer-project-library__section-title">Edit-Ready</div>
              <div className="hammer-project-library__section-summary">
                {readyProjects.length} workpiece{readyProjects.length === 1 ? "" : "s"} with recordings or Hammer-editable state.
              </div>
            </div>
            {readyProjects.length > 0 ? (
              renderProjectGrid(readyProjects)
            ) : (
              <div className="hammer-project-library__subempty-state">
                Nothing is above the ready line yet.
              </div>
            )}
          </section>

          <div className="hammer-project-library__ready-line" aria-hidden="true">
            <span className="hammer-project-library__ready-line-label">Ready Line</span>
          </div>

          <section className="hammer-project-library__section">
            <div className="hammer-project-library__section-head">
              <div className="hammer-project-library__section-title">Not Yet Edit-Ready</div>
              <div className="hammer-project-library__section-summary">
                {pendingProjects.length} workspace item{pendingProjects.length === 1 ? "" : "s"} without recordings or Hammer-editable state.
              </div>
            </div>
            {pendingProjects.length > 0 ? (
              renderProjectGrid(pendingProjects)
            ) : (
              <div className="hammer-project-library__subempty-state">
                Everything in this workspace is already above the ready line.
              </div>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
