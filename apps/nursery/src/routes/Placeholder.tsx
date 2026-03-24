import { useOutletContext } from "react-router-dom";
import type { AppShellContext } from "./AppShell";
import WorkspaceRequiredNotice from "./WorkspaceRequiredNotice";
import "./Placeholder.css";

const WORKSPACE_REQUIRED_PLACEHOLDERS = new Set(["hearth", "hammer", "quench", "ledger", "calendar"]);
const UNDER_CONSTRUCTION_TOOLS = new Set(["hammer", "bellows", "quench", "ledger"]);

export default function Placeholder({ name }: { name: string }) {
  const shell = useOutletContext<AppShellContext>();
  const normalizedName = name.toLowerCase();
  const requiresWorkspace = WORKSPACE_REQUIRED_PLACEHOLDERS.has(normalizedName);
  const underConstruction = UNDER_CONSTRUCTION_TOOLS.has(normalizedName);

  if (requiresWorkspace && !shell.workspaceId) {
    return <WorkspaceRequiredNotice toolName={name} />;
  }

  return (
    <div className="placeholder-route">
      <div className="placeholder-route__title-row">
        <h2 className="placeholder-route__title">{name}</h2>
        {underConstruction ? (
          <span
            className="placeholder-route__badge"
            aria-label="Under construction"
            title="Under construction"
          >
            Under Construction
          </span>
        ) : null}
      </div>
      <p className="placeholder-route__copy">
        This route is a placeholder inside Podcaster's Forge. Mount the production tool here when ready.
      </p>
    </div>
  );
}
