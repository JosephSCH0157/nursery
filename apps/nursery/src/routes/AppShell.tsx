import { Outlet, Link, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { loadMountRegistry } from "../lib/mount-registry";
import { supabase } from "../lib/supabase";

export default function AppShell() {
  const nav = useNavigate();
  useEffect(() => {
    const res = loadMountRegistry("default");
    if (!res.ok) {
      console.warn("[tongs] mount registry recovered/seeded due to issues:", res.issues);
    } else if (res.seeded) {
      console.log("[tongs] mount registry seeded");
    }
  }, []);

  async function onSignOut() {
    await supabase.auth.signOut();
    nav("/login", { replace: true });
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "system-ui" }}>
      <aside style={{ width: 240, padding: 16, borderRight: "1px solid #ddd" }}>
        <h3>Nursery</h3>
        <nav style={{ display: "grid", gap: 8 }}>
          <Link to="/app">Home</Link>
          <Link to="/app/anvil">Anvil</Link>
          <Link to="/app/hearth">Hearth</Link>
          <Link to="/app/hammer">Hammer</Link>
          <Link to="/app/barstock">Barstock</Link>
        </nav>
        <hr />
        <div style={{ fontSize: "0.85rem", color: "#666" }}>Settings</div>
        <nav style={{ display: "grid", gap: 6, marginTop: 4 }}>
          <Link to="/app/settings">Settings home</Link>
          <Link to="/app/settings/storage">Storage (Mounts)</Link>
        </nav>
        <hr />
        <button onClick={onSignOut}>Sign out</button>
      </aside>

      <main style={{ flex: 1, padding: 16 }}>
        <Outlet />
      </main>
    </div>
  );
}
