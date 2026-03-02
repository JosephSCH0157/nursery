import { useOutletContext } from "react-router-dom";
import type { AppShellContext } from "./AppShell";
import WorkspaceRequiredNotice from "./WorkspaceRequiredNotice";

const WORKSPACE_REQUIRED_PLACEHOLDERS = new Set(["hearth", "hammer", "quench", "ledger", "calendar"]);

export default function Placeholder({ name }: { name: string }) {
  const shell = useOutletContext<AppShellContext>();
  const normalizedName = name.toLowerCase();
  const requiresWorkspace = WORKSPACE_REQUIRED_PLACEHOLDERS.has(normalizedName);

  if (requiresWorkspace && !shell.workspaceId) {
    return <WorkspaceRequiredNotice toolName={name} />;
  }

  return (
    <div style={{ padding: 18 }}>
      <h2 style={{ marginTop: 0 }}>{name}</h2>
      <p style={{ opacity: 0.7 }}>
        This route is a placeholder inside Podcaster's Forge. Mount the production tool here when ready.
      </p>
    </div>
  );
}
