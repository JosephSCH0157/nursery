import { useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import type { AppShellContext } from "./AppShell";
import WorkspaceRequiredNotice from "./WorkspaceRequiredNotice";

const ANVIL_FULL_PAGE_URL = "/anvil/teleprompter_pro.html";

export default function AnvilRoute() {
  const shell = useOutletContext<AppShellContext>();

  useEffect(() => {
    if (!shell.workspaceId) return;
    window.location.replace(ANVIL_FULL_PAGE_URL);
  }, [shell.workspaceId]);

  if (!shell.workspaceId) {
    return <WorkspaceRequiredNotice toolName="Anvil" />;
  }

  return (
    <section style={{ padding: 24, display: "grid", gap: 8 }}>
      <h2 style={{ margin: 0 }}>Opening Anvil...</h2>
      <a href={ANVIL_FULL_PAGE_URL}>Continue to Anvil</a>
    </section>
  );
}
