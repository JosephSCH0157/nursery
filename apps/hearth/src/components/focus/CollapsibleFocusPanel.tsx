import type { ReactNode } from "react";

type CollapsibleFocusPanelProps = {
  panelId: string;
  title: string;
  meta?: string | null;
  collapsed: boolean;
  onToggle: () => void;
  collapsible?: boolean;
  children: ReactNode;
};

export default function CollapsibleFocusPanel({
  panelId,
  title,
  meta = null,
  collapsed,
  onToggle,
  collapsible = true,
  children,
}: CollapsibleFocusPanelProps) {
  const labelId = `${panelId}-label`;
  const bodyId = `${panelId}-body`;

  return (
    <section className={`hs-focus-panel${collapsed ? " is-collapsed" : ""}`} aria-labelledby={labelId}>
      <header className="hs-focus-panel-header">
        <div className="hs-focus-panel-heading">
          <div id={labelId} className="hs-focus-panel-title">{title}</div>
          {meta ? <div className="hs-focus-panel-meta">{meta}</div> : null}
        </div>
        {collapsible ? (
          collapsed ? (
            <button
              type="button"
              className="hs-focus-panel-toggle"
              onClick={onToggle}
              aria-controls={bodyId}
              aria-expanded="false"
            >
              Open
            </button>
          ) : (
            <button
              type="button"
              className="hs-focus-panel-toggle"
              onClick={onToggle}
              aria-controls={bodyId}
              aria-expanded="true"
            >
              Collapse
            </button>
          )
        ) : null}
      </header>

      <div id={bodyId} className="hs-focus-panel-body" inert={collapsed}>
        <div className="hs-focus-panel-body-inner">
          {children}
        </div>
      </div>
    </section>
  );
}
