import { Link, useLocation } from "react-router-dom";

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
    <section
      style={{
        border: "1px solid var(--forge-border)",
        borderRadius: 12,
        background: "var(--forge-bg-elevated)",
        padding: 16,
        maxWidth: 560,
        display: "grid",
        gap: 10,
      }}
    >
      <h2 style={{ margin: 0 }}>
        {workspaceAccessDenied ? `${toolName} access denied for this workspace.` : `${toolName} requires a workspace.`}
      </h2>
      <p style={{ margin: 0, color: "var(--forge-text-muted)" }}>
        {workspaceAccessDenied
          ? "You don't have access to this workspace. Go to Home and select a workspace you belong to before continuing."
          : "Workspace ID is missing. Go to Home and select a workspace before continuing."}
      </p>
      {workspaceAccessDenied && deniedWorkspaceId ? (
        <p style={{ margin: 0, color: "var(--forge-text-muted)", fontSize: 13 }}>
          Requested workspace: {deniedWorkspaceId}
        </p>
      ) : null}
      <div>
        <Link to="/app">Go to Home and Select Workspace</Link>
      </div>
    </section>
  );
}
