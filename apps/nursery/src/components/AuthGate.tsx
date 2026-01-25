import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";

type Props = { children: ReactNode };

export default function AuthGate({ children }: Props) {
  const loc = useLocation();
  const [checking, setChecking] = useState(true);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    let alive = true;

    (async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!alive) return;

      if (error) {
        setAuthed(false);
        setChecking(false);
        return;
      }

      setAuthed(!!data.session);
      setChecking(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return;
      setAuthed(!!session);
      setChecking(false);
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (checking) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui" }}>
        Checking session...
      </div>
    );
  }

  if (!authed) {
    const next = encodeURIComponent(loc.pathname + loc.search + loc.hash);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  return <>{children}</>;
}
