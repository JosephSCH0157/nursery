import { Link, useLocation } from "react-router-dom";
import "./WorkspaceRequiredNotice.css";

type WorkspaceRequiredNoticeProps = {
  toolName: string;
  accessDeniedWorkspaceId?: string | null;
};

export default function WorkspaceRequiredNotice({
  toolName,
  accessDeniedWorkspaceId = null,
}: WorkspaceRequiredNoticeProps) {
  const location = useLocation();
  const deniedState = location.state as {
    forgeWorkspaceAccessDenied?: unknown;
    deniedWorkspaceId?: unknown;
  } | null;
  const deniedFromState = deniedState?.forgeWorkspaceAccessDenied === true;
  const deniedWorkspaceIdFromState = typeof deniedState?.deniedWorkspaceId === "string"
    ? deniedState.deniedWorkspaceId.trim()
    : "";
  const deniedWorkspaceId = accessDeniedWorkspaceId ?? deniedWorkspaceIdFromState;
  const workspaceAccessDenied = !!deniedWorkspaceId || deniedFromState;

  return (
    <section className="workspace-required-notice">
      <h2 className="workspace-required-notice__title">
        {workspaceAccessDenied ? `${toolName} access denied for this workspace.` : `${toolName} requires a workspace.`}
      </h2>
      <p className="workspace-required-notice__copy">
        {workspaceAccessDenied
          ? "You don't have access to this workspace. Go to Home and select a workspace you belong to before continuing."
          : "Workspace ID is missing. Go to Home and select a workspace before continuing."}
      </p>
      {workspaceAccessDenied && deniedWorkspaceId ? (
        <p className="workspace-required-notice__meta">
          Requested workspace: {deniedWorkspaceId}
        </p>
      ) : null}
      <div>
        <Link to="/app">Go to Home and Select Workspace</Link>
      </div>
    </section>
  );
}
