import { useEffect, useRef } from "react";
import type { MouseEvent } from "react";
import VisualTimelineLane from "./VisualTimelineLane";
import type { VisualClipBlockModel } from "./VisualClipBlock";

interface VisualTimelineDockProps {
  clips: VisualClipBlockModel[];
  playheadSec: number;
  durationSec: number;
  selectedClipId: string | null;
  editable: boolean;
  focusToken?: number;
  onSelectClip: (clipId: string) => void;
  onMoveClip?: (event: MouseEvent<HTMLDivElement>, clip: VisualClipBlockModel) => void;
  onTrimClipStart?: (event: MouseEvent<HTMLDivElement>, clip: VisualClipBlockModel) => void;
  onTrimClipEnd?: (event: MouseEvent<HTMLDivElement>, clip: VisualClipBlockModel) => void;
}

export function resolveVisualTimelineDisplayDurationSec(
  durationSec: number,
  clips: VisualClipBlockModel[],
): number {
  return clips.reduce(
    (displayDurationSec, clip) => Math.max(displayDurationSec, clip.endSec),
    Math.max(0, durationSec),
  );
}

export default function VisualTimelineDock(props: VisualTimelineDockProps) {
  const dockRef = useRef<HTMLDivElement | null>(null);
  const displayDurationSec = resolveVisualTimelineDisplayDurationSec(props.durationSec, props.clips);

  useEffect(() => {
    if (!props.selectedClipId) return;
    if (props.focusToken == null) return;
    const container = dockRef.current;
    if (!container) return;
    const selected = container.querySelector<HTMLElement>(`[data-clip-id="${props.selectedClipId}"]`);
    if (!selected) return;
    const track = selected.parentElement;
    if (!(track instanceof HTMLElement)) return;
    const left = selected.offsetLeft;
    const right = left + selected.offsetWidth;
    const viewLeft = track.scrollLeft;
    const viewRight = viewLeft + track.clientWidth;
    if (left >= viewLeft && right <= viewRight) return;
    const centeredLeft = Math.max(0, left - ((track.clientWidth - selected.offsetWidth) / 2));
    track.scrollTo({
      left: centeredLeft,
      behavior: "smooth",
    });
  }, [props.focusToken, props.selectedClipId]);

  return (
    <section className="hammer-visual-timeline-dock" aria-label="Visual timeline dock" ref={dockRef}>
      <VisualTimelineLane
        label="Visuals"
        countLabel={`${props.clips.length} composition clips`}
        clips={props.clips}
        durationSec={displayDurationSec}
        playheadSec={props.playheadSec}
        selectedClipId={props.selectedClipId}
        editable={props.editable}
        onSelectClip={props.onSelectClip}
        onMoveClip={props.onMoveClip}
        onTrimClipStart={props.onTrimClipStart}
        onTrimClipEnd={props.onTrimClipEnd}
      />
    </section>
  );
}
