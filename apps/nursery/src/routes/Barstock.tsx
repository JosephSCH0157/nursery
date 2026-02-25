import { useOutletContext } from "react-router-dom";
import BarstockApp from "@barstock/App";
import type { AppShellContext } from "./AppShell";
import WorkspaceRequiredNotice from "./WorkspaceRequiredNotice";

export default function BarstockRoute() {
  const ctx = useOutletContext<AppShellContext>();
  if (!ctx.workspaceId) {
    return <WorkspaceRequiredNotice toolName="Barstock" />;
  }

  return (
    <BarstockApp
      workspaceState={{
        workspaces: ctx.workspaces,
        workspaceId: ctx.workspaceId,
        onWorkspaceChange: ctx.selectWorkspace,
      }}
      showWorkspacePicker={false}
    />
  );
}
