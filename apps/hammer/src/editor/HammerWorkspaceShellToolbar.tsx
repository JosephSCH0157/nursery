import type { JSX } from "react";
import type { HammerPassId } from "../persistence/hammerPersistenceContract";

export type HammerWorkspaceShellToolbarPassVM = {
  id: HammerPassId;
  shortLabel: string;
  label: string;
  toolId: string;
  statusLabel: string;
  isActive: boolean;
};

export type HammerWorkspaceShellToolbarVM = {
  stats: Array<{
    id: string;
    label: string;
    value: string;
    title?: string;
  }>;
  passes: HammerWorkspaceShellToolbarPassVM[];
  onSelectPass: (passId: HammerPassId) => void;
};

export default function HammerWorkspaceShellToolbar(props: { vm: HammerWorkspaceShellToolbarVM }): JSX.Element {
  const vm = props.vm;
  return (
    <>
      <div className="hammer-toolbar__title">Passes</div>
      {vm.stats.length > 0 ? (
        <div className="hammer-toolbar__stats" aria-label="Workspace stats">
          {vm.stats.map((stat) => (
            <div key={stat.id} className="hammer-toolbar__stat" title={stat.title ?? `${stat.label}: ${stat.value}`}>
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
            </div>
          ))}
        </div>
      ) : null}
      {vm.passes.map((pass) => (
        <button
          key={pass.id}
          type="button"
          className={pass.isActive ? "hammer-toolbar__tool is-active" : "hammer-toolbar__tool"}
          onClick={() => vm.onSelectPass(pass.id)}
          title={`${pass.label} (${pass.toolId}) - ${pass.statusLabel}`}
        >
          <strong>{pass.shortLabel}</strong>
          <span>{pass.label}</span>
        </button>
      ))}
    </>
  );
}

