import type { JSX } from "react";

type SelectedBrollPlacement = {
  id: string;
  kind: string;
  label: string;
  startSec: number;
  endSec: number;
};

export default function HammerBrollSelectionControls(props: {
  placement: SelectedBrollPlacement | null;
  onRemove: (placementId: string) => void;
}): JSX.Element {
  const placement = props.placement;
  return (
    <>
      <header className="hammer-tool-card__head">B-roll</header>
      {placement && (placement.kind === "broll" || placement.kind === "reference_clip") ? (
        <div className="hammer-source-card">
          <div className="hammer-tool-hint">
            Selected: {placement.label}
            {` (${placement.startSec.toFixed(1)}s - ${placement.endSec.toFixed(1)}s)`}
          </div>
          <div className="hammer-source-card__actions">
            <button
              type="button"
              data-placement-id={placement.id}
              aria-label={`Remove selected B-roll clip ${placement.id}`}
              onClick={() => props.onRemove(placement.id)}
            >
              Remove Clip
            </button>
          </div>
        </div>
      ) : (
        <div className="hammer-tool-hint">Select a B-roll clip in the timeline to open clip controls.</div>
      )}
    </>
  );
}
