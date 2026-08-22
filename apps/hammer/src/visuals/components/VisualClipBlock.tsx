import type { MouseEvent } from "react";

export interface VisualClipBlockModel {
  clipId: string;
  label: string;
  startSec: number;
  endSec: number;
  selected: boolean;
  disabled?: boolean;
  locked?: boolean;
}

interface VisualClipBlockProps {
  clip: VisualClipBlockModel;
  durationSec: number;
  showTrimHandles?: boolean;
  onSelect: (clipId: string) => void;
  onMovePointerDown?: (event: MouseEvent<HTMLDivElement>, clipId: string) => void;
  onTrimStartPointerDown?: (event: MouseEvent<HTMLDivElement>, clipId: string) => void;
  onTrimEndPointerDown?: (event: MouseEvent<HTMLDivElement>, clipId: string) => void;
}

function toPercent(value: number, durationSec: number): number {
  if (durationSec <= 0) return 0;
  return Math.max(0, Math.min(100, (value / durationSec) * 100));
}

export default function VisualClipBlock(props: VisualClipBlockProps) {
  const { clip, durationSec } = props;
  const leftPercent = toPercent(clip.startSec, durationSec);
  const widthPercent = Math.max(1, toPercent(clip.endSec - clip.startSec, durationSec));

  return (
    <div
      role="button"
      tabIndex={0}
      data-clip-id={clip.clipId}
      aria-label={`Visual clip ${clip.startSec.toFixed(1)}-${clip.endSec.toFixed(1)}s`}
      className={[
        "hammer-visual-clip-block",
        props.showTrimHandles ? "is-editable" : "",
        clip.selected ? "is-selected" : "",
        clip.disabled ? "is-disabled" : "",
        clip.locked ? "is-locked" : "",
      ].filter(Boolean).join(" ")}
      style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}
      onMouseDown={(event) => {
        props.onMovePointerDown?.(event, clip.clipId);
      }}
      onClick={(event) => {
        event.stopPropagation();
        props.onSelect(clip.clipId);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        props.onSelect(clip.clipId);
      }}
    >
      {props.showTrimHandles ? (
        <>
          <div
            className="hammer-visual-clip-block__handle hammer-visual-clip-block__handle--start"
            aria-hidden="true"
            onMouseDown={(event) => {
              event.stopPropagation();
              props.onTrimStartPointerDown?.(event, clip.clipId);
            }}
          />
          <div
            className="hammer-visual-clip-block__handle hammer-visual-clip-block__handle--end"
            aria-hidden="true"
            onMouseDown={(event) => {
              event.stopPropagation();
              props.onTrimEndPointerDown?.(event, clip.clipId);
            }}
          />
        </>
      ) : null}
      <span className="hammer-visual-clip-block__label" aria-hidden="true" />
    </div>
  );
}
