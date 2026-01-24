import { useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";

function useQuery() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

export default function Login() {
  const q = useQuery();
  const next = q.get("next") || "/app";
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div style={{ maxWidth: 520, margin: "60px auto", padding: 24 }}>
      <h1 style={{ margin: 0 }}>Podcasters Forge</h1>
      <p style={{ opacity: 0.75, marginTop: 8 }}>
        Sign in to access Anvil, Bar-Stock, Hearth, and the rest of the Forge.
      </p>

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <input
          style={{ flex: 1, padding: 10 }}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email for magic link"
        />
        <button
          disabled={busy || !email.trim()}
          onClick={async () => {
            setBusy(true);
            setMsg(null);
            const { error } = await supabase.auth.signInWithOtp({
              email,
              options: { emailRedirectTo: window.location.origin + next },
            });
            setMsg(error ? error.message : "Magic link sent. Check your email.");
            setBusy(false);
          }}
        >
          {busy ? "Sending..." : "Send link"}
        </button>
      </div>

      {msg ? <p style={{ marginTop: 12 }}>{msg}</p> : null}

      <p style={{ opacity: 0.6, marginTop: 20 }}>
        Tip: keep this tab open, click the link in your email, and you'll come right back in.
      </p>
    </div>
  );
}
