import { Link } from "react-router-dom";

type WorkspaceRequiredNoticeProps = {
  toolName: string;
};

export default function WorkspaceRequiredNotice({ toolName }: WorkspaceRequiredNoticeProps) {
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
      <h2 style={{ margin: 0 }}>{toolName} requires a workspace.</h2>
      <p style={{ margin: 0, color: "var(--forge-text-muted)" }}>
        Workspace ID is missing. Go to Home and select a workspace before continuing.
      </p>
      <div>
        <Link to="/app">Go to Home and Select Workspace</Link>
      </div>
    </section>
  );
}
