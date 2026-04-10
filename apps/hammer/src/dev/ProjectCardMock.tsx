import { useCallback, useMemo, useState } from "react";
import type { JSX } from "react";
import { useNavigate } from "react-router-dom";
import type { ResolveMediaResult } from "../../../../packages/contracts/hammer/media-resolver.contract";
import type {
  BadgeChipProps,
  BadgeVariant,
  MediaCtaPayload,
} from "../media/projectCardMediaBadge";
import { toProjectCardBadgeChip } from "../media/projectCardMediaBadge";
import {
  dispatchMediaCtaAction,
  type MediaCtaDispatchResult,
} from "../media/mediaCtaActionMap";
import "./ProjectCardMock.css";

interface ProjectCardMockProps {
  devMode?: boolean;
}

interface MockProject {
  projectId: string;
  title: string;
  workspaceId: string;
  result: ResolveMediaResult;
}

interface MockProjectCard extends MockProject {
  chip: BadgeChipProps;
}

const MOCK_PROJECTS: MockProject[] = [
  {
    projectId: "project_local_ok",
    title: "Episode 014 - Local Playback Ready",
    workspaceId: "ws_demo",
    result: {
      status: "ok",
      media_id: "media_local_01",
      kind: "recording_video",
      playable_uri: "D:\\ForgeMedia\\ws_demo\\recordings\\episode014.mp4",
      duration_ms: 1925000,
      diagnostics: {
        attempted_local_abs: "D:\\ForgeMedia\\ws_demo\\recordings\\episode014.mp4",
        checked_exists: true,
        notes: ["local_probe_ok"],
      },
    },
  },
  {
    projectId: "project_not_mapped",
    title: "Interview - Workspace Not Mapped",
    workspaceId: "ws_unmapped",
    result: {
      status: "unresolved",
      media_id: "media_map_01",
      kind: "recording_video",
      reason: "NO_WORKSPACE_MAPPING",
      user_message: "No workspace media mapping is configured on this machine.",
      next_action: "OPEN_WORKSPACE_SETTINGS",
      diagnostics: {
        checked_exists: false,
        notes: ["workspace_mapping_missing"],
      },
    },
  },
  {
    projectId: "project_missing_file",
    title: "Panel Show - Missing Local File",
    workspaceId: "ws_demo",
    result: {
      status: "unresolved",
      media_id: "media_missing_01",
      kind: "recording_video",
      reason: "MISSING_LOCAL_FILE",
      user_message: "Media file is missing from the mapped local workspace folder.",
      next_action: "RELINK_MEDIA",
      diagnostics: {
        attempted_local_abs: "D:\\ForgeMedia\\ws_demo\\recordings\\panel-021.mp4",
        checked_exists: true,
        notes: ["probe_exists_false"],
      },
    },
  },
  {
    projectId: "project_cloud_disabled",
    title: "Remote Guest - Cloud Only Reference",
    workspaceId: "ws_cloud",
    result: {
      status: "unresolved",
      media_id: "media_cloud_01",
      kind: "recording_video",
      reason: "CLOUD_DISABLED",
      user_message: "This media is cloud-only and cloud media is disabled in V1.",
      next_action: "ENABLE_CLOUD_MEDIA",
      diagnostics: {
        attempted_cloud_uri: "tongs://media/ws_cloud/recordings/remote-guest-9.mp4",
        checked_exists: false,
        notes: ["cloud_feature_flag_off"],
      },
    },
  },
];

const BADGE_VARIANT_CLASS: Record<BadgeVariant, string> = {
  success: "hammer-project-card-mock__badge--success",
  warning: "hammer-project-card-mock__badge--warning",
  danger: "hammer-project-card-mock__badge--danger",
  neutral: "hammer-project-card-mock__badge--neutral",
};

function isDevModeFromRuntime(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search || "");
    if (params.has("dev")) return true;
    if (window.localStorage.getItem("tp_dev_mode") === "1") return true;
    const w = window as unknown as {
      __TP_DEV?: unknown;
      __TP_DEV1?: unknown;
      __tpDevMode?: unknown;
    };
    return Boolean(w.__TP_DEV || w.__TP_DEV1 || w.__tpDevMode);
  } catch {
    return false;
  }
}

function renderBadgeChip(
  chip: BadgeChipProps,
  onCtaClick: (payload: MediaCtaPayload) => void,
): JSX.Element {
  const ctaPayload = chip.ctaPayload;
  return (
    <div className="hammer-project-card-mock__badge-row">
      <span
        title={chip.tooltip}
        className={`hammer-project-card-mock__badge ${BADGE_VARIANT_CLASS[chip.variant]}`}
      >
        {chip.text}
      </span>
      {chip.ctaText && ctaPayload ? (
        <button type="button" className="hammer-project-card-mock__cta" onClick={() => onCtaClick(ctaPayload)}>
          {chip.ctaText}
        </button>
      ) : null}
    </div>
  );
}

export default function ProjectCardMock(props: ProjectCardMockProps): JSX.Element {
  const navigate = useNavigate();
  const devMode = useMemo(
    () => (typeof props.devMode === "boolean" ? props.devMode : isDevModeFromRuntime()),
    [props.devMode],
  );
  const [lastDispatch, setLastDispatch] = useState<MediaCtaDispatchResult | null>(null);

  const cards = useMemo<MockProjectCard[]>(
    () =>
      MOCK_PROJECTS.map((project) => ({
        ...project,
        chip: toProjectCardBadgeChip(project.result, devMode, {
          workspaceId: project.workspaceId,
        }),
      })),
    [devMode],
  );

  const onCtaClick = useCallback((payload: MediaCtaPayload) => {
    const result = dispatchMediaCtaAction(payload, {
      navigate,
    });
    setLastDispatch(result);
  }, [navigate]);

  return (
    <section className="hammer-project-card-mock">
      <header className="hammer-project-card-mock__header">
        <h2 className="hammer-project-card-mock__title">Hammer Project Cards (Mock)</h2>
        <div className="hammer-project-card-mock__subtitle">
          Adapter proof-of-life for media resolver to badge chip props. Dev mode:{" "}
          <strong>{String(devMode)}</strong>
        </div>
        {lastDispatch ? (
          <div className="hammer-project-card-mock__dispatch">
            last dispatch: {lastDispatch.action}
            {"\n"}route: {lastDispatch.route || "(none)"}
            {"\n"}event: {lastDispatch.eventName || "(none)"}
          </div>
        ) : null}
      </header>

      <div className="hammer-project-card-mock__cards">
        {cards.map((card) => (
          <article key={card.projectId} className="hammer-project-card-mock__card">
            <div className="hammer-project-card-mock__card-head">
              <div className="hammer-project-card-mock__card-title">{card.title}</div>
              <div className="hammer-project-card-mock__card-meta">
                workspace: {card.workspaceId} | media: {card.result.media_id}
              </div>
            </div>

            {renderBadgeChip(card.chip, onCtaClick)}

            {devMode && card.chip.debugTooltip ? (
              <pre className="hammer-project-card-mock__debug">
                {card.chip.debugTooltip}
              </pre>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
