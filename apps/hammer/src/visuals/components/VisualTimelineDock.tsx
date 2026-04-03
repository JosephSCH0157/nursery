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
  onTrimClipStart?: (event: MouseEvent<HTMLButtonElement>, clip: VisualClipBlockModel) => void;
  onTrimClipEnd?: (event: MouseEvent<HTMLButtonElement>, clip: VisualClipBlockModel) => void;
}

export default function VisualTimelineDock(props: VisualTimelineDockProps) {
  const dockRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!props.selectedClipId) return;
    const container = dockRef.current;
    if (!container) return;
    const selected = container.querySelector<HTMLElement>(`[data-clip-id="${props.selectedClipId}"]`);
    selected?.scrollIntoView({
      block: "nearest",
      inline: "center",
      behavior: "smooth",
    });
  }, [props.focusToken, props.selectedClipId]);

  return (
    <section className="hammer-visual-timeline-dock" aria-label="Visual timeline dock" ref={dockRef}>
      <VisualTimelineLane
        label="Visuals"
        clips={props.clips}
        durationSec={props.durationSec}
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
