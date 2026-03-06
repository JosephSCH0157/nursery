import { useCallback, useMemo, useState } from "react";
import type { CSSProperties, JSX } from "react";
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

interface ProjectCardMockProps {
  devMode?: boolean;
}

interface MockProject {
  projectId: string;
  title: string;
  workspaceId: string;
  result: ResolveMediaResult;
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

const CARD_STYLE: CSSProperties = {
  border: "1px solid rgba(148, 163, 184, 0.28)",
  borderRadius: 12,
  padding: 12,
  background: "rgba(15, 23, 38, 0.72)",
  display: "grid",
  gap: 10,
};

const CTA_STYLE: CSSProperties = {
  border: "1px solid rgba(148, 163, 184, 0.35)",
  borderRadius: 999,
  padding: "5px 10px",
  background: "rgba(15, 23, 38, 0.95)",
  color: "#e6edf7",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

const BADGE_VARIANT_STYLE: Record<BadgeVariant, CSSProperties> = {
  success: {
    background: "rgba(34, 197, 94, 0.16)",
    border: "1px solid rgba(34, 197, 94, 0.5)",
    color: "#bbf7d0",
  },
  warning: {
    background: "rgba(245, 158, 11, 0.18)",
    border: "1px solid rgba(245, 158, 11, 0.55)",
    color: "#fde68a",
  },
  danger: {
    background: "rgba(239, 68, 68, 0.16)",
    border: "1px solid rgba(239, 68, 68, 0.5)",
    color: "#fecaca",
  },
  neutral: {
    background: "rgba(148, 163, 184, 0.18)",
    border: "1px solid rgba(148, 163, 184, 0.45)",
    color: "#e2e8f0",
  },
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
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <span
        title={chip.tooltip}
        style={{
          ...BADGE_VARIANT_STYLE[chip.variant],
          borderRadius: 999,
          padding: "4px 10px",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: 0.2,
          display: "inline-flex",
          alignItems: "center",
        }}
      >
        {chip.text}
      </span>
      {chip.ctaText && chip.ctaPayload ? (
        <button type="button" style={CTA_STYLE} onClick={() => onCtaClick(chip.ctaPayload)}>
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

  const cards = useMemo(
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
    <section
      style={{
        display: "grid",
        gap: 12,
        padding: 12,
        border: "1px solid rgba(148, 163, 184, 0.25)",
        borderRadius: 12,
        background: "#0b1220",
        color: "#e6edf7",
      }}
    >
      <header style={{ display: "grid", gap: 4 }}>
        <h2 style={{ margin: 0 }}>Hammer Project Cards (Mock)</h2>
        <div style={{ opacity: 0.78, fontSize: 13 }}>
          Adapter proof-of-life for media resolver to badge chip props. Dev mode:{" "}
          <strong>{String(devMode)}</strong>
        </div>
        {lastDispatch ? (
          <div
            style={{
              marginTop: 6,
              fontSize: 12,
              border: "1px dashed rgba(148, 163, 184, 0.35)",
              borderRadius: 8,
              padding: "6px 8px",
              color: "#b8c7db",
              background: "rgba(2, 6, 23, 0.45)",
              whiteSpace: "pre-wrap",
            }}
          >
            last dispatch: {lastDispatch.action}
            {"\n"}route: {lastDispatch.route || "(none)"}
            {"\n"}event: {lastDispatch.eventName || "(none)"}
          </div>
        ) : null}
      </header>

      <div style={{ display: "grid", gap: 10 }}>
        {cards.map((card) => (
          <article key={card.projectId} style={CARD_STYLE}>
            <div style={{ display: "grid", gap: 4 }}>
              <div style={{ fontWeight: 700 }}>{card.title}</div>
              <div style={{ fontSize: 12, opacity: 0.72 }}>
                workspace: {card.workspaceId} | media: {card.result.media_id}
              </div>
            </div>

            {renderBadgeChip(card.chip, onCtaClick)}

            {devMode && card.chip.debugTooltip ? (
              <pre
                style={{
                  margin: 0,
                  border: "1px dashed rgba(148, 163, 184, 0.35)",
                  borderRadius: 8,
                  padding: 8,
                  whiteSpace: "pre-wrap",
                  fontSize: 12,
                  color: "#b8c7db",
                  background: "rgba(2, 6, 23, 0.45)",
                }}
              >
                {card.chip.debugTooltip}
              </pre>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
