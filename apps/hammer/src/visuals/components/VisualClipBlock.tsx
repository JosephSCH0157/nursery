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

export const VISUAL_CLIP_MIN_WIDTH_PX = 14;
export const VISUAL_CLIP_ROW_HEIGHT_PX = 36;

interface VisualClipBlockProps {
  clip: VisualClipBlockModel;
  durationSec: number;
  showTrimHandles?: boolean;
  rowIndex?: number;
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
      style={{
        left: `${leftPercent}%`,
        width: `${widthPercent}%`,
        minWidth: `${VISUAL_CLIP_MIN_WIDTH_PX}px`,
        top: `${6 + ((props.rowIndex ?? 0) * VISUAL_CLIP_ROW_HEIGHT_PX)}px`,
      }}
      onMouseDown={(event) => {
        // Selection must settle before editable drag/focus effects can reflow the
        // timeline and move this element away from the eventual click target.
        props.onSelect(clip.clipId);
        props.onMovePointerDown?.(event, clip.clipId);
      }}
      onClick={(event) => {
        event.stopPropagation();
        // Reassert after a completed activation. Scroll/focus/pass reconciliation
        // can settle between mousedown and click; the click is the final user
        // intent boundary when the browser was able to deliver it.
        if (!clip.selected) props.onSelect(clip.clipId);
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
