import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, JSX } from "react";
import { useLocation } from "react-router-dom";
import type {
  MediaRef,
  ResolveMediaResult,
  WorkspaceMediaMapping,
} from "../../../../packages/contracts/hammer/media-resolver.contract";
import { toMediaBadgeViewModel } from "../media/mediaBadgeViewModel";
import { V1HammerMediaResolver } from "../media/resolveMedia";
import { loadWorkspaceMapping } from "../media/workspaceMapping";

type TranscriptRow = {
  id: string;
  startSec: number;
  speaker: "S1" | "S2" | "G1" | "G2";
  text: string;
};

type PreviewQuery = {
  workspaceId: string;
  mediaId: string;
  mediaLocalRelpath: string;
  mediaRootAbs: string | null;
};

const DEFAULT_WORKSPACE_ID = "ws_demo";
const DEFAULT_MEDIA_ID = "media_local_01";
const DEFAULT_MEDIA_RELPATH = "recordings/episode014.mp4";
const FALLBACK_DURATION_SEC = 32;

const MOCK_TRANSCRIPT: TranscriptRow[] = [
  { id: "r1", startSec: 3, speaker: "S1", text: "Let me start with this." },
  { id: "r2", startSec: 7, speaker: "S2", text: "Right, and that is exactly the tension." },
  { id: "r3", startSec: 10, speaker: "S1", text: "Here is the real problem we keep seeing." },
  { id: "r4", startSec: 14, speaker: "S2", text: "Most teams optimize output, not signal." },
  { id: "r5", startSec: 17, speaker: "S1", text: "That is why workflow quality breaks first." },
  { id: "r6", startSec: 21, speaker: "G1", text: "Can we anchor this to one repeatable pattern?" },
  { id: "r7", startSec: 24, speaker: "S1", text: "Yes, transcript-driven edits become deterministic." },
  { id: "r8", startSec: 28, speaker: "S2", text: "Then shorts packaging is mostly review, not rescue." },
];

const ROOT_STYLE: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(340px, 0.95fr) minmax(420px, 1.05fr)",
  gap: 14,
  minHeight: "calc(100vh - 138px)",
};

const PANEL_STYLE: CSSProperties = {
  border: "1px solid rgba(148, 163, 184, 0.28)",
  borderRadius: 12,
  background: "rgba(15, 23, 38, 0.74)",
  display: "grid",
  alignContent: "start",
  minHeight: 0,
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function formatClock(totalSec: number): string {
  const sec = Math.floor(totalSec);
  const mm = Math.floor(sec / 60);
  const ss = sec % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function pickTranscriptRowForTime(rows: TranscriptRow[], timeSec: number): string | null {
  let active: string | null = null;
  for (const row of rows) {
    if (row.startSec <= timeSec) active = row.id;
  }
  return active;
}

function readTrimmed(params: URLSearchParams, key: string): string | null {
  const raw = params.get(key);
  if (!raw) return null;
  const next = raw.trim();
  return next.length ? next : null;
}

function readPreviewQuery(search: string): PreviewQuery {
  const params = new URLSearchParams(search);
  const workspaceId = readTrimmed(params, "workspace_id")
    ?? readTrimmed(params, "workspaceId")
    ?? readTrimmed(params, "workspace")
    ?? DEFAULT_WORKSPACE_ID;
  const mediaId = readTrimmed(params, "media_id")
    ?? readTrimmed(params, "mediaId")
    ?? DEFAULT_MEDIA_ID;
  const mediaLocalRelpath = readTrimmed(params, "media_local_relpath")
    ?? readTrimmed(params, "media_relpath")
    ?? readTrimmed(params, "local_relpath")
    ?? DEFAULT_MEDIA_RELPATH;
  const mediaRootAbs = readTrimmed(params, "media_root_abs")
    ?? readTrimmed(params, "local_root_abs")
    ?? readTrimmed(params, "media_root");
  return {
    workspaceId,
    mediaId,
    mediaLocalRelpath,
    mediaRootAbs,
  };
}

async function resolveWorkspace(
  workspaceId: string,
  mediaRootAbs: string | null,
): Promise<WorkspaceMediaMapping | null> {
  if (mediaRootAbs) {
    return {
      workspace_id: workspaceId,
      local_root_abs: mediaRootAbs,
    };
  }
  return loadWorkspaceMapping(workspaceId);
}

function toBrowserVideoSrc(playableUri: string): string {
  const value = playableUri.trim();
  if (!value) return "";
  if (/^(https?:|blob:|data:)/i.test(value)) return value;
  if (value.startsWith("/@fs/")) return value;
  if (/^[a-zA-Z]:[\\/]/.test(value) || value.startsWith("/")) {
    const normalized = value.replace(/\\/g, "/");
    return `/@fs/${encodeURI(normalized)}`;
  }
  return value;
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

export default function TranscriptSeekMock(): JSX.Element {
  const location = useLocation();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const resolver = useMemo(() => new V1HammerMediaResolver(), []);
  const query = useMemo(
    () => readPreviewQuery(location.search),
    [location.search],
  );
  const mediaRef = useMemo<MediaRef>(
    () => ({
      media_id: query.mediaId,
      kind: "recording_video",
      source_hint: "local",
      local_relpath: query.mediaLocalRelpath,
      duration_ms: FALLBACK_DURATION_SEC * 1000,
    }),
    [query.mediaId, query.mediaLocalRelpath],
  );
  const [resolveResult, setResolveResult] = useState<ResolveMediaResult | null>(null);
  const [resolving, setResolving] = useState(true);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [currentSec, setCurrentSec] = useState(MOCK_TRANSCRIPT[0]?.startSec ?? 0);
  const [durationSec, setDurationSec] = useState(FALLBACK_DURATION_SEC);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(MOCK_TRANSCRIPT[0]?.id ?? null);
  const [videoError, setVideoError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setResolving(true);
    setResolveError(null);
    setResolveResult(null);

    void resolveWorkspace(query.workspaceId, query.mediaRootAbs)
      .then(async (workspaceMapping) => {
        const result = await resolver.resolveMedia(workspaceMapping, mediaRef);
        if (!active) return;
        setResolveResult(result);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setResolveError(toErrorMessage(error, "Failed to resolve media."));
      })
      .finally(() => {
        if (!active) return;
        setResolving(false);
      });

    return () => {
      active = false;
    };
  }, [mediaRef, query.mediaRootAbs, query.workspaceId, resolver]);

  const badgeVm = useMemo(
    () => (resolveResult ? toMediaBadgeViewModel(resolveResult, true) : null),
    [resolveResult],
  );

  const resolvedPlayableUri = resolveResult?.status === "ok" ? resolveResult.playable_uri : null;
  const videoSrc = useMemo(
    () => (resolvedPlayableUri ? toBrowserVideoSrc(resolvedPlayableUri) : null),
    [resolvedPlayableUri],
  );

  useEffect(() => {
    setCurrentSec(MOCK_TRANSCRIPT[0]?.startSec ?? 0);
    setSelectedRowId(MOCK_TRANSCRIPT[0]?.id ?? null);
    setDurationSec(FALLBACK_DURATION_SEC);
    setIsPlaying(false);
    setVideoError(null);
  }, [videoSrc]);

  useEffect(() => {
    const active = pickTranscriptRowForTime(MOCK_TRANSCRIPT, currentSec);
    if (active && active !== selectedRowId) {
      setSelectedRowId(active);
    }
  }, [currentSec, selectedRowId]);

  const selectedRow = useMemo(
    () => MOCK_TRANSCRIPT.find((row) => row.id === selectedRowId) ?? null,
    [selectedRowId],
  );

  const effectiveDurationSec = durationSec > 0 ? durationSec : FALLBACK_DURATION_SEC;
  const progressPercent = useMemo(
    () => clamp((currentSec / effectiveDurationSec) * 100, 0, 100),
    [currentSec, effectiveDurationSec],
  );

  const canControlVideo = Boolean(videoSrc && resolveResult?.status === "ok");

  async function onTogglePlayback() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      try {
        await video.play();
      } catch (error) {
        setVideoError(toErrorMessage(error, "Playback failed."));
      }
      return;
    }
    video.pause();
  }

  function seekTo(nextSec: number, rowId?: string) {
    const bounded = clamp(nextSec, 0, effectiveDurationSec);
    const video = videoRef.current;
    if (video) {
      video.currentTime = bounded;
    }
    setCurrentSec(bounded);
    if (rowId) setSelectedRowId(rowId);
  }

  return (
    <section style={ROOT_STYLE}>
      <div style={{ ...PANEL_STYLE, padding: 12, gap: 12 }}>
        <header style={{ display: "grid", gap: 2 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Transcript</h2>
          <div style={{ fontSize: 13, opacity: 0.78 }}>
            Click a row to seek the real preview playhead.
          </div>
        </header>

        <div style={{ display: "grid", gap: 6, overflow: "auto", maxHeight: "calc(100vh - 230px)" }}>
          {MOCK_TRANSCRIPT.map((row) => {
            const isSelected = row.id === selectedRowId;
            return (
              <button
                key={row.id}
                type="button"
                onClick={() => seekTo(row.startSec, row.id)}
                style={{
                  border: isSelected
                    ? "1px solid rgba(96, 165, 250, 0.72)"
                    : "1px solid rgba(148, 163, 184, 0.22)",
                  borderRadius: 10,
                  background: isSelected
                    ? "rgba(59, 130, 246, 0.2)"
                    : "rgba(2, 6, 23, 0.42)",
                  textAlign: "left",
                  padding: "8px 10px",
                  display: "grid",
                  gap: 3,
                }}
              >
                <div style={{ fontSize: 12, opacity: 0.85 }}>
                  {formatClock(row.startSec)} {row.speaker}
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.35 }}>{row.text}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ ...PANEL_STYLE, padding: 14, gap: 12 }}>
        <header style={{ display: "grid", gap: 4 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Preview (Local Video)</h2>
          <div style={{ fontSize: 13, opacity: 0.8 }}>
            media_id: <strong>{mediaRef.media_id}</strong>
          </div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            local_relpath: {mediaRef.local_relpath}
          </div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            workspace_id: {query.workspaceId}
          </div>
        </header>

        <div
          style={{
            border: "1px solid rgba(148, 163, 184, 0.28)",
            borderRadius: 12,
            background: "linear-gradient(145deg, rgba(11, 20, 38, 0.9), rgba(2, 6, 23, 0.84))",
            padding: 12,
            display: "grid",
            gap: 10,
          }}
        >
          {resolving ? (
            <div style={{ fontSize: 13, opacity: 0.82 }}>Resolving media...</div>
          ) : resolveError ? (
            <div style={{ color: "#fecaca", fontSize: 13 }}>{resolveError}</div>
          ) : resolveResult ? (
            <>
              <div style={{ fontSize: 12, opacity: 0.82 }}>
                {badgeVm?.badge.label}
                {badgeVm?.tooltip ? ` - ${badgeVm.tooltip}` : ""}
              </div>

              {resolveResult.status === "ok" ? (
                videoSrc ? (
                  <video
                    ref={videoRef}
                    src={videoSrc}
                    preload="metadata"
                    style={{
                      width: "100%",
                      maxHeight: 380,
                      borderRadius: 10,
                      background: "#000",
                      border: "1px solid rgba(148, 163, 184, 0.3)",
                    }}
                    onLoadedMetadata={(event) => {
                      const nextDuration = event.currentTarget.duration;
                      if (Number.isFinite(nextDuration) && nextDuration > 0) {
                        setDurationSec(nextDuration);
                      }
                    }}
                    onTimeUpdate={(event) => {
                      setCurrentSec(event.currentTarget.currentTime);
                    }}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onEnded={() => setIsPlaying(false)}
                    onError={() => {
                      setIsPlaying(false);
                      setVideoError(
                        "Video failed to load. Verify media_root_abs/local mapping and local_relpath.",
                      );
                    }}
                  />
                ) : (
                  <div style={{ fontSize: 13, color: "#fde68a" }}>
                    Resolved path is empty after browser source conversion.
                  </div>
                )
              ) : (
                <div style={{ fontSize: 13, color: "#fde68a" }}>
                  {resolveResult.user_message}
                </div>
              )}

              {resolveResult.status === "ok" ? (
                <div style={{ fontSize: 12, opacity: 0.72 }}>
                  resolved_uri: {resolveResult.playable_uri}
                </div>
              ) : null}
            </>
          ) : null}

          {videoError ? (
            <div style={{ color: "#fecaca", fontSize: 12 }}>{videoError}</div>
          ) : null}

          <div style={{ fontSize: 13, opacity: 0.85 }}>
            Time: {formatClock(currentSec)} / {formatClock(effectiveDurationSec)}
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            <div
              style={{
                height: 10,
                borderRadius: 999,
                border: "1px solid rgba(148, 163, 184, 0.25)",
                background: "rgba(2, 6, 23, 0.75)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${progressPercent}%`,
                  height: "100%",
                  background: "linear-gradient(90deg, rgba(96, 165, 250, 0.75), rgba(14, 165, 233, 0.85))",
                }}
              />
            </div>
            <input
              type="range"
              min={0}
              max={effectiveDurationSec}
              step={0.1}
              value={currentSec}
              onChange={(event) => seekTo(Number(event.target.value))}
              aria-label="Preview playhead"
              disabled={!canControlVideo}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={() => void onTogglePlayback()} disabled={!canControlVideo}>
              {isPlaying ? "Pause" : "Play"}
            </button>
            <button
              type="button"
              disabled={!canControlVideo}
              onClick={() => {
                const firstRow = MOCK_TRANSCRIPT[0];
                if (!firstRow) return;
                const video = videoRef.current;
                if (video) {
                  video.pause();
                  video.currentTime = 0;
                }
                setIsPlaying(false);
                setCurrentSec(0);
                setSelectedRowId(firstRow.id);
              }}
            >
              Reset
            </button>
          </div>
        </div>

        <div
          style={{
            border: "1px dashed rgba(148, 163, 184, 0.35)",
            borderRadius: 10,
            padding: "8px 10px",
            fontSize: 13,
            color: "#b8c7db",
            background: "rgba(2, 6, 23, 0.45)",
          }}
        >
          {selectedRow
            ? `Selected row: ${formatClock(selectedRow.startSec)} ${selectedRow.speaker} - ${selectedRow.text}`
            : "No row selected."}
        </div>
      </div>
    </section>
  );
}
