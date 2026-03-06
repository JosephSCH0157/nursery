import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, JSX } from "react";
import { useLocation } from "react-router-dom";
import type {
  MediaRef,
  ResolveMediaResult,
  WorkspaceMediaMapping,
} from "../../../../packages/contracts/hammer/media-resolver.contract";
import type { HammerCutInstruction } from "../../../../packages/contracts/hammer/edit-instruction.contract";
import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";
import { toMediaBadgeViewModel } from "../media/mediaBadgeViewModel";
import { V1HammerMediaResolver } from "../media/resolveMedia";
import { loadWorkspaceMapping } from "../media/workspaceMapping";
import { DEFAULT_TRANSCRIPT_FIXTURE_ID, getDevTranscriptSegments } from "./transcriptFixtures";

type PreviewQuery = {
  workspaceId: string;
  mediaId: string;
  mediaLocalRelpath: string;
  mediaRootAbs: string | null;
  transcriptFixtureId: string;
  transcriptJson: string | null;
};

const DEFAULT_WORKSPACE_ID = "ws_demo";
const DEFAULT_MEDIA_ID = "media_local_01";
const DEFAULT_MEDIA_RELPATH = "recordings/episode014.mp4";
const FALLBACK_DURATION_SEC = 32;
const MIN_SEGMENT_DURATION_SEC = 0.2;
const UNKNOWN_SPEAKER = "UNK";

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

function pickTranscriptSegmentForTime(
  segments: HammerTranscriptSegment[],
  timeSec: number,
): string | null {
  for (const segment of segments) {
    if (timeSec >= segment.start_sec && timeSec < segment.end_sec) {
      return segment.segment_id;
    }
  }

  let fallback: string | null = null;
  for (const segment of segments) {
    if (segment.start_sec <= timeSec) fallback = segment.segment_id;
  }
  return fallback;
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
  const transcriptFixtureId = readTrimmed(params, "transcript_fixture")
    ?? readTrimmed(params, "transcriptFixture")
    ?? DEFAULT_TRANSCRIPT_FIXTURE_ID;
  const transcriptJson = readTrimmed(params, "transcript_json")
    ?? readTrimmed(params, "transcript");
  return {
    workspaceId,
    mediaId,
    mediaLocalRelpath,
    mediaRootAbs,
    transcriptFixtureId,
    transcriptJson,
  };
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length ? normalized : null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function normalizeTranscriptSegment(input: unknown, index: number): HammerTranscriptSegment | null {
  const row = readRecord(input);
  if (!row) return null;

  const startSec = readNumber(row.start_sec);
  if (startSec == null || startSec < 0) return null;
  const rawEndSec = readNumber(row.end_sec);
  const endSec = rawEndSec == null || rawEndSec <= startSec
    ? startSec + MIN_SEGMENT_DURATION_SEC
    : rawEndSec;

  const text = readString(row.text);
  if (!text) return null;

  const speaker = readString(row.speaker) ?? UNKNOWN_SPEAKER;
  const segmentId = readString(row.segment_id) ?? `seg_${index + 1}`;

  return {
    segment_id: segmentId,
    start_sec: startSec,
    end_sec: endSec,
    speaker,
    text,
  };
}

function parseTranscriptSegmentsJson(raw: string): HammerTranscriptSegment[] {
  const tryParse = (source: string): unknown => JSON.parse(source);
  let parsed: unknown;
  try {
    parsed = tryParse(raw);
  } catch {
    parsed = tryParse(decodeURIComponent(raw));
  }

  const parsedRecord = readRecord(parsed);
  const maybeSegments = Array.isArray(parsed)
    ? parsed
    : (parsedRecord && Array.isArray(parsedRecord.segments) ? parsedRecord.segments : null);
  if (!maybeSegments) return [];

  const normalized = maybeSegments
    .map((row, index) => normalizeTranscriptSegment(row, index))
    .filter((row): row is HammerTranscriptSegment => Boolean(row))
    .sort((a, b) => a.start_sec - b.start_sec);

  return normalized;
}

type TranscriptLoadResult = {
  segments: HammerTranscriptSegment[];
  sourceLabel: string;
  error: string | null;
};

function loadTranscriptFromQuery(query: PreviewQuery): TranscriptLoadResult {
  if (query.transcriptJson) {
    try {
      const fromQuery = parseTranscriptSegmentsJson(query.transcriptJson);
      if (fromQuery.length > 0) {
        return {
          segments: fromQuery,
          sourceLabel: "query:transcript_json",
          error: null,
        };
      }
      return {
        segments: getDevTranscriptSegments(query.transcriptFixtureId),
        sourceLabel: `fixture:${query.transcriptFixtureId}`,
        error: "transcript_json did not contain valid segments. Falling back to fixture.",
      };
    } catch (error) {
      return {
        segments: getDevTranscriptSegments(query.transcriptFixtureId),
        sourceLabel: `fixture:${query.transcriptFixtureId}`,
        error: toErrorMessage(error, "Failed to parse transcript_json. Falling back to fixture."),
      };
    }
  }

  return {
    segments: getDevTranscriptSegments(query.transcriptFixtureId),
    sourceLabel: `fixture:${query.transcriptFixtureId}`,
    error: null,
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

function createInstructionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `ins_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

export default function TranscriptSeekMock(): JSX.Element {
  const location = useLocation();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const resolver = useMemo(() => new V1HammerMediaResolver(), []);
  const query = useMemo(
    () => readPreviewQuery(location.search),
    [location.search],
  );
  const transcriptLoad = useMemo(
    () => loadTranscriptFromQuery(query),
    [query],
  );
  const transcriptSegments = transcriptLoad.segments;
  const firstSegment = transcriptSegments[0] ?? null;
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
  const [currentSec, setCurrentSec] = useState(firstSegment?.start_sec ?? 0);
  const [durationSec, setDurationSec] = useState(FALLBACK_DURATION_SEC);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(
    firstSegment?.segment_id ?? null,
  );
  const [videoError, setVideoError] = useState<string | null>(null);
  const [cutInstructions, setCutInstructions] = useState<HammerCutInstruction[]>([]);

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
    setCurrentSec(firstSegment?.start_sec ?? 0);
    setSelectedSegmentId(firstSegment?.segment_id ?? null);
    setDurationSec(FALLBACK_DURATION_SEC);
    setIsPlaying(false);
    setVideoError(null);
  }, [firstSegment?.segment_id, firstSegment?.start_sec, videoSrc]);

  useEffect(() => {
    setCutInstructions([]);
  }, [mediaRef.media_id, transcriptLoad.sourceLabel]);

  useEffect(() => {
    const active = pickTranscriptSegmentForTime(transcriptSegments, currentSec);
    if (active && active !== selectedSegmentId) {
      setSelectedSegmentId(active);
    }
  }, [currentSec, selectedSegmentId, transcriptSegments]);

  const selectedSegment = useMemo(
    () => transcriptSegments.find((segment) => segment.segment_id === selectedSegmentId) ?? null,
    [selectedSegmentId, transcriptSegments],
  );

  const deleteInstructionBySegmentId = useMemo(() => {
    const index = new Map<string, HammerCutInstruction>();
    for (const instruction of cutInstructions) {
      if (instruction.type !== "delete") continue;
      index.set(instruction.segment_id, instruction);
    }
    return index;
  }, [cutInstructions]);

  const selectedSegmentDeleteInstruction = useMemo(
    () => (selectedSegment ? deleteInstructionBySegmentId.get(selectedSegment.segment_id) ?? null : null),
    [deleteInstructionBySegmentId, selectedSegment],
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
    if (rowId) setSelectedSegmentId(rowId);
  }

  function addDeleteInstruction(segment: HammerTranscriptSegment) {
    setCutInstructions((prev) => {
      if (prev.some((instruction) => (
        instruction.segment_id === segment.segment_id
        && instruction.type === "delete"
      ))) {
        return prev;
      }
      const next: HammerCutInstruction = {
        instruction_id: createInstructionId(),
        segment_id: segment.segment_id,
        type: "delete",
        created_at: new Date().toISOString(),
      };
      return [...prev, next];
    });
  }

  function removeDeleteInstruction(segmentId: string) {
    setCutInstructions((prev) => prev.filter((instruction) => (
      !(instruction.segment_id === segmentId && instruction.type === "delete")
    )));
  }

  return (
    <section style={ROOT_STYLE}>
      <div style={{ ...PANEL_STYLE, padding: 12, gap: 12 }}>
        <header style={{ display: "grid", gap: 2 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Transcript</h2>
          <div style={{ fontSize: 13, opacity: 0.78 }}>
            Click a row to seek the real preview playhead.
          </div>
          <div style={{ fontSize: 12, opacity: 0.72 }}>
            source: {transcriptLoad.sourceLabel}
          </div>
          <div style={{ fontSize: 12, opacity: 0.72 }}>
            edit instructions: {cutInstructions.length} (in-memory)
          </div>
          {transcriptLoad.error ? (
            <div style={{ fontSize: 12, color: "#fde68a" }}>
              {transcriptLoad.error}
            </div>
          ) : null}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
            <button
              type="button"
              disabled={!selectedSegment}
              onClick={() => {
                if (!selectedSegment) return;
                if (selectedSegmentDeleteInstruction) {
                  removeDeleteInstruction(selectedSegment.segment_id);
                  return;
                }
                addDeleteInstruction(selectedSegment);
              }}
            >
              {selectedSegmentDeleteInstruction ? "Restore segment" : "Delete segment"}
            </button>
            <button
              type="button"
              disabled={cutInstructions.length === 0}
              onClick={() => setCutInstructions([])}
            >
              Clear edits
            </button>
          </div>
        </header>

        <div style={{ display: "grid", gap: 6, overflow: "auto", maxHeight: "calc(100vh - 230px)" }}>
          {transcriptSegments.length > 0 ? (
            transcriptSegments.map((segment) => {
              const isSelected = segment.segment_id === selectedSegmentId;
              const deleteInstruction = deleteInstructionBySegmentId.get(segment.segment_id) ?? null;
              const isDeleted = Boolean(deleteInstruction);
              return (
                <button
                  key={segment.segment_id}
                  type="button"
                  onClick={() => seekTo(segment.start_sec, segment.segment_id)}
                  style={{
                    border: isDeleted
                      ? "1px solid rgba(239, 68, 68, 0.62)"
                      : isSelected
                      ? "1px solid rgba(96, 165, 250, 0.72)"
                      : "1px solid rgba(148, 163, 184, 0.22)",
                    borderRadius: 10,
                    background: isDeleted
                      ? "rgba(239, 68, 68, 0.12)"
                      : isSelected
                      ? "rgba(59, 130, 246, 0.2)"
                      : "rgba(2, 6, 23, 0.42)",
                    textAlign: "left",
                    padding: "8px 10px",
                    display: "grid",
                    gap: 3,
                    opacity: isDeleted ? 0.85 : 1,
                  }}
                >
                  <div style={{ fontSize: 12, opacity: 0.85 }}>
                    {formatClock(segment.start_sec)}-{formatClock(segment.end_sec)} {segment.speaker}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      lineHeight: 1.35,
                      textDecoration: isDeleted ? "line-through" : "none",
                    }}
                  >
                    {segment.text}
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.62 }}>id: {segment.segment_id}</div>
                  {isDeleted ? (
                    <div style={{ fontSize: 11, color: "#fecaca" }}>
                      edit: delete instruction ({deleteInstruction?.instruction_id})
                    </div>
                  ) : null}
                </button>
              );
            })
          ) : (
            <div style={{ fontSize: 13, opacity: 0.78 }}>
              No transcript segments loaded.
            </div>
          )}
        </div>

        <div
          style={{
            border: "1px dashed rgba(148, 163, 184, 0.35)",
            borderRadius: 10,
            padding: "8px 10px",
            display: "grid",
            gap: 6,
            fontSize: 12,
            color: "#b8c7db",
            background: "rgba(2, 6, 23, 0.45)",
          }}
        >
          <strong style={{ color: "#dbe8ff" }}>Cut Instructions (In Memory)</strong>
          {cutInstructions.length === 0 ? (
            <div>No edits yet.</div>
          ) : (
            cutInstructions.map((instruction) => (
              <div
                key={instruction.instruction_id}
                style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
              >
                <span>
                  {instruction.type} -> {instruction.segment_id}
                </span>
                <span style={{ opacity: 0.66 }}>{instruction.instruction_id}</span>
                <button
                  type="button"
                  onClick={() => removeDeleteInstruction(instruction.segment_id)}
                  style={{ padding: "2px 8px", fontSize: 11 }}
                >
                  Remove
                </button>
              </div>
            ))
          )}
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
                const video = videoRef.current;
                if (video) {
                  video.pause();
                  video.currentTime = 0;
                }
                setIsPlaying(false);
                setCurrentSec(0);
                setSelectedSegmentId(firstSegment?.segment_id ?? null);
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
          {selectedSegment
            ? `Selected segment: ${selectedSegment.segment_id} (${formatClock(selectedSegment.start_sec)}-${formatClock(selectedSegment.end_sec)}) ${selectedSegment.speaker} - ${selectedSegment.text}`
            : "No row selected."}
        </div>
      </div>
    </section>
  );
}
