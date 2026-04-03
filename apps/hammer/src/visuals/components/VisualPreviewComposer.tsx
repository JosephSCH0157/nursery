import type { MouseEvent } from "react";
import VisualOverlayHandles from "./VisualOverlayHandles";

export interface VisualPreviewOverlayModel {
  clip_id: string;
  label: string;
  kind: "image" | "broll";
  src: string | null;
  left_pct: number;
  top_pct: number;
  width_pct: number;
  height_pct: number;
  z_index: number;
  opacity: number;
  fit_mode: "contain" | "cover";
  animation_class: string;
  selected: boolean;
  dimmed: boolean;
}

interface VisualPreviewComposerProps {
  overlays: VisualPreviewOverlayModel[];
  editable: boolean;
  onSelectClip: (clipId: string) => void;
  onBeginMove: (event: MouseEvent<HTMLElement>, clipId: string) => void;
  onBeginResize: (event: MouseEvent<HTMLButtonElement>, clipId: string) => void;
  onRegisterBrollVideoRef: (clipId: string, node: HTMLVideoElement | null) => void;
}

export default function VisualPreviewComposer(props: VisualPreviewComposerProps) {
  const applyOverlayLayout = (node: HTMLDivElement | null, overlay: VisualPreviewOverlayModel) => {
    if (!node) return;
    node.style.left = `${overlay.left_pct}%`;
    node.style.top = `${overlay.top_pct}%`;
    node.style.width = `${overlay.width_pct}%`;
    node.style.height = `${overlay.height_pct}%`;
    node.style.zIndex = String(overlay.z_index);
    node.style.opacity = String(overlay.opacity);
  };

  return (
    <div className="hammer-preview-canvas" aria-label="Visual composition canvas">
      {props.overlays.map((overlay) => (
        <div
          key={overlay.clip_id}
          className={[
            "hammer-preview-canvas__bbox",
            overlay.animation_class,
            overlay.selected ? "is-selected" : "",
            overlay.dimmed ? "is-dimmed" : "",
          ].filter(Boolean).join(" ")}
          ref={(node) => {
            applyOverlayLayout(node, overlay);
          }}
          onMouseDown={(event) => {
            props.onSelectClip(overlay.clip_id);
            props.onBeginMove(event, overlay.clip_id);
          }}
        >
          {overlay.kind === "broll" ? (
            overlay.src ? (
              <video
                ref={(node) => {
                  props.onRegisterBrollVideoRef(overlay.clip_id, node);
                }}
                src={overlay.src}
                muted
                playsInline
                preload="metadata"
                className="hammer-preview-canvas__video"
              />
            ) : (
              <div className="hammer-preview-canvas__fallback">{overlay.label}</div>
            )
          ) : overlay.src ? (
            <img
              src={overlay.src}
              alt={overlay.label}
              className={[
                "hammer-preview-canvas__image",
                overlay.fit_mode === "contain"
                  ? "hammer-preview-canvas__image--contain"
                  : "hammer-preview-canvas__image--cover",
              ].join(" ")}
            />
          ) : (
            <div className="hammer-preview-canvas__fallback">{overlay.label}</div>
          )}
          {props.editable && overlay.selected ? (
            <VisualOverlayHandles onResizePointerDown={(event) => props.onBeginResize(event, overlay.clip_id)} />
          ) : null}
        </div>
      ))}
      {props.overlays.length === 0 ? (
        <div className="hammer-preview-canvas__empty">
          No active visual overlay at this playhead time.
        </div>
      ) : null}
    </div>
  );
}
