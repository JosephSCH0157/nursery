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
  passes: HammerWorkspaceShellToolbarPassVM[];
  onSelectPass: (passId: HammerPassId) => void;
};

export default function HammerWorkspaceShellToolbar(props: { vm: HammerWorkspaceShellToolbarVM }): JSX.Element {
  const vm = props.vm;
  return (
    <>
      <div className="hammer-toolbar__title">Passes</div>
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

