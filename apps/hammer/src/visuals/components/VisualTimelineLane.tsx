import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import VisualClipBlock, {
  VISUAL_CLIP_MIN_WIDTH_PX,
  VISUAL_CLIP_ROW_HEIGHT_PX,
  type VisualClipBlockModel,
} from "./VisualClipBlock";

interface VisualTimelineLaneProps {
  label: string;
  countLabel?: string;
  clips: VisualClipBlockModel[];
  durationSec: number;
  playheadSec: number;
  selectedClipId: string | null;
  editable: boolean;
  onSelectClip: (clipId: string) => void;
  onMoveClip?: (event: MouseEvent<HTMLDivElement>, clip: VisualClipBlockModel) => void;
  onTrimClipStart?: (event: MouseEvent<HTMLDivElement>, clip: VisualClipBlockModel) => void;
  onTrimClipEnd?: (event: MouseEvent<HTMLDivElement>, clip: VisualClipBlockModel) => void;
}

function toPercent(value: number, durationSec: number): number {
  if (durationSec <= 0) return 0;
  return Math.max(0, Math.min(100, (value / durationSec) * 100));
}

export interface VisualClipRowLayout {
  rowByClipId: ReadonlyMap<string, number>;
  rowCount: number;
}

export function layoutVisualClipRows(
  clips: VisualClipBlockModel[],
  durationSec: number,
  trackWidthPx: number,
): VisualClipRowLayout {
  const effectiveWidthPx = Math.max(0, trackWidthPx);
  const rowEnds: number[] = [];
  const rowByClipId = new Map<string, number>();
  const sorted = clips.map((clip, inputIndex) => ({ clip, inputIndex })).sort((left, right) => (
    left.clip.startSec - right.clip.startSec
    || left.clip.endSec - right.clip.endSec
    || left.inputIndex - right.inputIndex
  ));
  for (const { clip } of sorted) {
    const leftPx = (toPercent(clip.startSec, durationSec) / 100) * effectiveWidthPx;
    const proportionalWidthPx = (toPercent(clip.endSec - clip.startSec, durationSec) / 100) * effectiveWidthPx;
    const rightPx = leftPx + Math.max(VISUAL_CLIP_MIN_WIDTH_PX, proportionalWidthPx);
    let rowIndex = rowEnds.findIndex((rowEndPx) => leftPx >= rowEndPx);
    if (rowIndex < 0) rowIndex = rowEnds.length;
    rowEnds[rowIndex] = rightPx;
    rowByClipId.set(clip.clipId, rowIndex);
  }
  return { rowByClipId, rowCount: Math.max(1, rowEnds.length) };
}

export default function VisualTimelineLane(props: VisualTimelineLaneProps) {
  const playheadPercent = toPercent(props.playheadSec, props.durationSec);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [trackWidthPx, setTrackWidthPx] = useState(0);
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const updateWidth = () => setTrackWidthPx(track.clientWidth);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(track);
    return () => observer.disconnect();
  }, []);
  const rowLayout = useMemo(
    () => layoutVisualClipRows(props.clips, props.durationSec, trackWidthPx),
    [props.clips, props.durationSec, trackWidthPx],
  );

  const applyPlayheadPosition = (node: HTMLDivElement | null) => {
    if (!node) return;
    node.style.left = `${playheadPercent}%`;
  };

  return (
    <div className="hammer-visual-timeline-lane">
      <header className="hammer-visual-timeline-lane__head">
        <strong>{props.label}</strong>
        <span>{props.countLabel ?? `${props.clips.length} clips`}</span>
        <span>{props.selectedClipId ? `Selected ${props.selectedClipId}` : "No clip selected"}</span>
      </header>
      <div
        className="hammer-visual-timeline-lane__track"
        ref={trackRef}
        style={{ minHeight: `${12 + (rowLayout.rowCount * VISUAL_CLIP_ROW_HEIGHT_PX)}px` }}
      >
        <div
          className="hammer-visual-timeline-lane__playhead"
          ref={applyPlayheadPosition}
        />
        {props.clips.map((clip) => (
          <VisualClipBlock
            key={clip.clipId}
            clip={clip}
            durationSec={props.durationSec}
            rowIndex={rowLayout.rowByClipId.get(clip.clipId) ?? 0}
            showTrimHandles={props.editable}
            onSelect={props.onSelectClip}
            onMovePointerDown={props.onMoveClip ? (event) => props.onMoveClip?.(event, clip) : undefined}
            onTrimStartPointerDown={props.onTrimClipStart ? (event) => props.onTrimClipStart?.(event, clip) : undefined}
            onTrimEndPointerDown={props.onTrimClipEnd ? (event) => props.onTrimClipEnd?.(event, clip) : undefined}
          />
        ))}
      </div>
    </div>
  );
}
