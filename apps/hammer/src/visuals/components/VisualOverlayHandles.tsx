import type { MouseEvent } from "react";

interface VisualOverlayHandlesProps {
  onResizePointerDown: (event: MouseEvent<HTMLButtonElement>) => void;
}

export default function VisualOverlayHandles(props: VisualOverlayHandlesProps) {
  return (
    <button
      type="button"
      className="hammer-preview-canvas__resize-handle"
      aria-label="Resize selected visual"
      onMouseDown={(event) => {
        event.stopPropagation();
        props.onResizePointerDown(event);
      }}
    />
  );
}
