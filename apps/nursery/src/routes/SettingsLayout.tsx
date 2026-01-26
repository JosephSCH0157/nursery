import { Outlet } from "react-router-dom";

export default function SettingsLayout() {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <header>
        <h2 style={{ margin: 0 }}>Settings</h2>
        <p style={{ margin: "4px 0 0", color: "#555" }}>Configure storage, identity, and workspace defaults in one place.</p>
      </header>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Outlet />
      </div>
    </section>
  );
}
