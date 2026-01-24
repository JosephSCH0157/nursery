import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) nav("/app", { replace: true });
    });
  }, [nav]);

  async function onSignIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr("");
    setMsg("");
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return setErr(error.message);
    nav("/app", { replace: true });
  }

  async function onForgotPassword() {
    setErr("");
    setMsg("");
    if (!email) {
      setErr('Enter your email first, then click "Forgot password".');
      return;
    }
    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) return setErr(error.message);
    setMsg("Password reset link sent. Check your email.");
  }

  return (
    <div style={{ maxWidth: 520, margin: "60px auto", padding: 24 }}>
      <h1 style={{ margin: 0 }}>Podcasters Forge</h1>
      <p style={{ opacity: 0.75, marginTop: 8 }}>
        Sign in to access Anvil, Bar-Stock, Hearth, and the rest of the Forge.
      </p>

      <form onSubmit={onSignIn} style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ padding: 10 }}
            required
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ padding: 10 }}
            required
          />
        </label>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button type="submit" disabled={busy}>
            {busy ? "Signing in..." : "Sign in"}
          </button>
          <button type="button" onClick={onForgotPassword} style={{ background: "transparent", border: "none", color: "#06f", cursor: "pointer" }}>
            Forgot password?
          </button>
        </div>
      </form>

      {msg ? <p style={{ marginTop: 12, color: "var(--success, #0a0)" }}>{msg}</p> : null}
      {err ? <p style={{ marginTop: 12, color: "var(--error, #f00)" }}>Error: {err}</p> : null}

      <p style={{ opacity: 0.6, marginTop: 20 }}>
        Tip: keep this tab open so you stay on Nursery while you work through the tools.
      </p>
    </div>
  );
}
