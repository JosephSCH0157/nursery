import { Link, Outlet, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";

export default function AppShell() {
  const loc = useLocation();
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const navItem = (to: string, label: string) => (
    <Link
      to={to}
      style={{
        display: "block",
        padding: "10px 12px",
        borderRadius: 10,
        textDecoration: "none",
        opacity: loc.pathname.startsWith(to) ? 1 : 0.75,
        background: loc.pathname.startsWith(to) ? "rgba(255,255,255,0.08)" : "transparent",
        color: "inherit",
      }}
    >
      {label}
    </Link>
  );

  return (
    <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", height: "100vh" }}>
      <aside style={{ padding: 16, borderRight: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <strong>Nursery</strong>
          <button onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>

        <div style={{ marginTop: 10, opacity: 0.7, fontSize: 13 }}>
          {session?.user?.email ?? ""}
        </div>

        <div style={{ marginTop: 16, display: "grid", gap: 6 }}>
          {navItem("/app/barstock", "Bar-Stock")}
          {navItem("/app/anvil", "Anvil")}
          {navItem("/app/hearth", "Hearth")}
          {navItem("/app/hammer", "Hammer")}
          {navItem("/app/quench", "Quench")}
          {navItem("/app/ironmine", "IronMine")}
        </div>
      </aside>

      <main style={{ padding: 18 }}>
        <Outlet />
      </main>
    </div>
  );
}
