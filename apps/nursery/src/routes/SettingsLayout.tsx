import { Outlet, useOutletContext } from "react-router-dom";
import type { AppShellContext } from "./AppShell";

export default function SettingsLayout() {
  const shell = useOutletContext<AppShellContext>();

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <header>
        <h2 style={{ margin: 0 }}>Settings</h2>
        <p style={{ margin: "4px 0 0", color: "var(--forge-text-muted)" }}>
          Configure storage, identity, and workspace defaults in one place.
        </p>
      </header>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Outlet context={shell} />
      </div>
    </section>
  );
}
