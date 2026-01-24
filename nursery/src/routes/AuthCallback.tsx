import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function AuthCallback() {
  const nav = useNavigate();
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;

        const params = new URLSearchParams(window.location.search);
        const type = params.get("type");

        if (type === "recovery") {
          nav("/reset-password", { replace: true });
          return;
        }

        if (data.session) {
          nav("/app", { replace: true });
          return;
        }

        setTimeout(async () => {
          const retry = await supabase.auth.getSession();
          if (retry.data.session) nav("/app", { replace: true });
          else nav("/login", { replace: true });
        }, 250);
      } catch (e: any) {
        setErr(e?.message || "Auth callback failed.");
        nav("/login", { replace: true });
      }
    })();
  }, [nav]);

  return <div style={{ padding: 24 }}>{err ? `Error: ${err}` : "Signing you in..."}</div>;
}
