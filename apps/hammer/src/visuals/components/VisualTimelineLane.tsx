import type { MouseEvent } from "react";
import VisualClipBlock, { type VisualClipBlockModel } from "./VisualClipBlock";

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

export default function VisualTimelineLane(props: VisualTimelineLaneProps) {
  const playheadPercent = toPercent(props.playheadSec, props.durationSec);

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
      <div className="hammer-visual-timeline-lane__track">
        <div
          className="hammer-visual-timeline-lane__playhead"
          ref={applyPlayheadPosition}
        />
        {props.clips.map((clip) => (
          <VisualClipBlock
            key={clip.clipId}
            clip={clip}
            durationSec={props.durationSec}
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
