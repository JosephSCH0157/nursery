import { useEffect, useMemo, useState } from "react";
import type { JSX } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  buildHammerCanonicalEditorHref,
  loadHammerWorkspaceProjects,
  resolveHammerRouteWorkpieceId,
  resolveHammerRouteWorkspaceId,
  type HammerRuntimeProjectCard,
} from "./hammerRuntimeData";
import "./HammerProjectLibrary.css";

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

export default function HammerProjectLibrary(): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const routeWorkpieceId = useMemo(
    () => resolveHammerRouteWorkpieceId(location.search),
    [location.search],
  );
  const [workspaceId, setWorkspaceId] = useState<string | null>(() => resolveHammerRouteWorkspaceId(location.search));
  const [projects, setProjects] = useState<HammerRuntimeProjectCard[]>([]);
  const [selectedWorkpieceId, setSelectedWorkpieceId] = useState<string | null>(routeWorkpieceId);
  const [loading, setLoading] = useState(Boolean(workspaceId));
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    setWorkspaceId(resolveHammerRouteWorkspaceId(location.search));
  }, [location.search]);

  useEffect(() => {
    if (!routeWorkpieceId) return;
    setSelectedWorkpieceId(routeWorkpieceId);
  }, [routeWorkpieceId]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleStorage = () => {
      setWorkspaceId(resolveHammerRouteWorkspaceId(window.location.search));
    };
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    if (!workspaceId) {
      setProjects([]);
      setSelectedWorkpieceId(routeWorkpieceId);
      setLoading(false);
      setError(null);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    void loadHammerWorkspaceProjects(workspaceId)
      .then((nextProjects) => {
        if (!active) return;
        setProjects(nextProjects);
        setSelectedWorkpieceId((current) => {
          if (routeWorkpieceId && nextProjects.some((project) => project.workpieceId === routeWorkpieceId)) {
            return routeWorkpieceId;
          }
          if (current && nextProjects.some((project) => project.workpieceId === current)) {
            return current;
          }
          return nextProjects[0]?.workpieceId ?? null;
        });
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
  }, [routeWorkpieceId, refreshToken, workspaceId]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.workpieceId === selectedWorkpieceId) ?? null,
    [projects, selectedWorkpieceId],
  );

  const devLaunchHref = useMemo(() => {
    const params = new URLSearchParams(location.search);
    if (workspaceId) {
      params.set("workspace_id", workspaceId);
    }
    const nextSearch = params.toString();
    return nextSearch ? `/app/hammer/dev/launch?${nextSearch}` : "/app/hammer/dev/launch";
  }, [location.search, workspaceId]);

  function openProject(project: HammerRuntimeProjectCard | null) {
    if (!project) return;
    navigate(buildHammerCanonicalEditorHref(location.search, {
      workspaceId: project.workspaceId,
      workpieceId: project.workpieceId,
    }));
  }

  return (
    <section className="hammer-project-library">
      <header className="hammer-project-library__header">
        <div className="hammer-project-library__intro">
          <div className="hammer-project-library__eyebrow">
            Hammer Project Library
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
            onClick={() => setRefreshToken((current) => current + 1)}
            disabled={!workspaceId || loading}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          <button
            type="button"
            className="hammer-project-library__button hammer-project-library__button--primary"
            onClick={() => openProject(selectedProject)}
            disabled={!selectedProject}
          >
            Open Project
          </button>
          {import.meta.env.DEV ? (
            <Link to={devLaunchHref} className="hammer-project-library__dev-link">
              Dev scenarios
            </Link>
          ) : null}
        </div>
      </header>

      {!workspaceId ? (
        <section className="hammer-project-library__empty-state">
          <h3>No workspace selected.</h3>
          <p>Choose a Forge workspace, then reopen Hammer to load real workpieces.</p>
        </section>
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
        <section className="hammer-project-library__section">
          <div className="hammer-project-library__section-title">Workspace Workpieces</div>
          <div className="hammer-project-library__grid">
            {projects.map((project) => {
              const isSelected = project.workpieceId === (routeWorkpieceId ?? selectedWorkpieceId);
              return (
                <button
                  key={project.workpieceId}
                  type="button"
                  className={`hammer-project-library__card${isSelected ? " is-selected" : ""}`}
                  onClick={() => {
                    setSelectedWorkpieceId(project.workpieceId);
                    openProject(project);
                  }}
                  onFocus={() => setSelectedWorkpieceId(project.workpieceId)}
                >
                  <div className="hammer-project-library__card-body">
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
                      {project.workpieceId}
                    </div>
                    <div className="hammer-project-library__card-meta">
                      <div>
                        <div className="hammer-project-library__label">Created</div>
                        <div>{formatDateTimeLabel(project.createdAt)}</div>
                      </div>
                      <div>
                        <div className="hammer-project-library__label">Workspace</div>
                        <div>{project.workspaceId}</div>
                      </div>
                    </div>
                    <div className="hammer-project-library__indicator-row">
                      {project.readiness.indicators.map((indicator) => (
                        <span key={indicator} className="hammer-project-library__indicator">
                          {indicator}
                        </span>
                      ))}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </section>
  );
}
