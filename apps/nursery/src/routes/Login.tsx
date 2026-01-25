import { FormEvent, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

function useNextParam() {
  const loc = useLocation();
  return useMemo(() => {
    const p = new URLSearchParams(loc.search);
    return p.get("next") || "/app";
  }, [loc.search]);
}

export default function Login() {
  const nav = useNavigate();
  const next = useNextParam();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) nav(next, { replace: true });
    });
  }, [nav, next]);

  async function onSignIn(e: FormEvent) {
    e.preventDefault();
    setErr("");
    setMsg("");
    setBusy(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setBusy(false);

    if (error) {
      setErr(error.message);
      return;
    }

    nav(next, { replace: true });
  }

  async function onForgotPassword() {
    setErr("");
    setMsg("");
    if (!email) {
      setErr('Enter your email first, then click "Forgot password".');
      return;
    }

    setBusy(true);
    const redirectTo = `${window.location.origin}/auth/callback?type=recovery`;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    setBusy(false);

    if (error) {
      setErr(error.message);
      return;
    }

    setMsg("Password reset link sent. Check your email.");
  }

  return (
    <div style={{ padding: 24, fontFamily: "system-ui", maxWidth: 520 }}>
      <h1 style={{ marginBottom: 8 }}>Podcaster's Forge</h1>
      <p style={{ marginTop: 0, opacity: 0.8 }}>
        Sign in to access Nursery, Anvil, Hearth, Hammer, and Barstock.
      </p>

      <form onSubmit={onSignIn} style={{ display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span>Email</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="email"
            required
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Password</span>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="current-password"
            required
          />
        </label>

        <button type="submit" disabled={busy}>
          {busy ? "Signing in..." : "Sign in"}
        </button>

        <button type="button" onClick={onForgotPassword} disabled={busy}>
          Forgot password
        </button>

        {err ? <div style={{ color: "crimson" }}>{err}</div> : null}
        {msg ? <div style={{ color: "green" }}>{msg}</div> : null}
      </form>
    </div>
  );
}
