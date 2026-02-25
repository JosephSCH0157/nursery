import { useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { ForgeNav } from "../nav/ForgeNav";
import { anvilNavExtras } from "../nav/anvilNavExtras";
import { composeNav, forgeNavTree } from "../nav/forgeNavTree";
import type { AppShellContext } from "./AppShell";
import WorkspaceRequiredNotice from "./WorkspaceRequiredNotice";

export default function AnvilRoute() {
  const shell = useOutletContext<AppShellContext>();
  const [open, setOpen] = useState(false);
  const anvilMenuTree = useMemo(() => composeNav(forgeNavTree, anvilNavExtras), []);

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
