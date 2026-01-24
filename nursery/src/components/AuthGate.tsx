import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const nav = useNavigate();
  const loc = useLocation();
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      setReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s);
      setReady(true);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!session) {
      const next = encodeURIComponent(loc.pathname + loc.search + loc.hash);
      nav(`/login?next=${next}`, { replace: true });
    }
  }, [ready, session, nav, loc]);

  if (!ready) return <div style={{ padding: 24 }}>Loading...</div>;
  if (!session) return null; // redirecting
  return <>{children}</>;
}
