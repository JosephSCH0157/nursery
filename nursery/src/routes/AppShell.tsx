import { Outlet, Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function AppShell() {
  const nav = useNavigate();

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
        <button onClick={onSignOut}>Sign out</button>
      </aside>

      <main style={{ flex: 1, padding: 16 }}>
        <Outlet />
      </main>
    </div>
  );
}
