import type { JSX } from "react";
import type { HammerShellWorkspaceOption } from "./hammerShellContext";
import "./HammerWorkspaceSelection.css";

type HammerWorkspaceSelectionProps = {
  title: string;
  summary: string;
  workspaces: HammerShellWorkspaceOption[];
  selectedWorkspaceId: string | null;
  loading: boolean;
  error: string | null;
  onSelectWorkspace: (workspaceId: string) => void;
  onRefresh?: () => void;
  emptyMessage?: string;
  footer?: JSX.Element | null;
};

export default function HammerWorkspaceSelection(
  props: HammerWorkspaceSelectionProps,
): JSX.Element {
  const emptyMessage = props.emptyMessage
    ?? "No workspaces are available yet. Sign in or refresh to load your Hammer library.";

  return (
    <section className="hammer-workspace-selection">
      <header className="hammer-workspace-selection__header">
        <div className="hammer-workspace-selection__eyebrow">Hammer Workspace</div>
        <h2 className="hammer-workspace-selection__title">{props.title}</h2>
        <p className="hammer-workspace-selection__summary">{props.summary}</p>
      </header>

      {props.error ? (
        <div className="hammer-workspace-selection__error">
          {props.error}
        </div>
      ) : null}

      {props.loading && props.workspaces.length === 0 ? (
        <div className="hammer-workspace-selection__empty">
          Loading available workspaces...
        </div>
      ) : props.workspaces.length === 0 ? (
        <div className="hammer-workspace-selection__empty">
          {emptyMessage}
        </div>
      ) : (
        <div className="hammer-workspace-selection__grid">
          {props.workspaces.map((workspace) => {
            const isSelected = workspace.id === props.selectedWorkspaceId;
            return (
              <button
                key={workspace.id}
                type="button"
                className={`hammer-workspace-selection__option${isSelected ? " is-selected" : ""}`}
                onClick={() => props.onSelectWorkspace(workspace.id)}
              >
                <span className="hammer-workspace-selection__option-name">
                  {workspace.name}
                </span>
                <span className="hammer-workspace-selection__option-meta">
                  {workspace.role ? `${workspace.role} · ` : ""}{workspace.id}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="hammer-workspace-selection__actions">
        {props.onRefresh ? (
          <button
            type="button"
            className="hammer-workspace-selection__button"
            onClick={props.onRefresh}
            disabled={props.loading}
          >
            {props.loading ? "Refreshing..." : "Refresh workspaces"}
          </button>
        ) : null}
        {props.footer}
      </div>
    </section>
  );
}
