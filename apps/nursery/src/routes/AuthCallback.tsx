import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function AuthCallback() {
  const nav = useNavigate();
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const p = new URLSearchParams(window.location.search);
        const type = p.get("type");
        if (type === "recovery") {
          nav("/reset-password", { replace: true });
          return;
        }

        const { data } = await supabase.auth.getSession();
        if (data.session) nav("/app", { replace: true });
        else nav("/login", { replace: true });
      } catch (e: any) {
        setErr(e?.message || "Auth callback failed.");
        nav("/login", { replace: true });
      }
    })();
  }, [nav]);

  return <div style={{ padding: 24 }}>{err ? `Error: ${err}` : "Finishing sign-in..."}</div>;
}
