import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

const FORGE_LOGIN_LOGO_PATH = "/assets/podcasters-forge-logo.png";
const AUTH_NEXT_STORAGE_KEY = "forge_auth_next_v1";

function clearAuthNextPath(): void {
  try {
    window.sessionStorage.removeItem(AUTH_NEXT_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function normalizeNextPath(raw: string | null): string {
  if (!raw) return "/app";
  const trimmed = raw.trim();
  if (!trimmed) return "/app";
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return "/app";
  return trimmed;
}

function useNextParam() {
  const loc = useLocation();
  return useMemo(() => {
    const p = new URLSearchParams(loc.search);
    return normalizeNextPath(p.get("next"));
  }, [loc.search]);
}

function useLoginReason(): string | null {
  const loc = useLocation();
  return useMemo(() => {
    const p = new URLSearchParams(loc.search);
    const reason = p.get("reason");
    if (reason === "callback_session_missing") {
      return "Sign-in callback did not establish a session. Please sign in again.";
    }
    if (reason === "callback_failed") {
      return "Sign-in callback failed. Please try again.";
    }
    return null;
  }, [loc.search]);
}

async function waitForSession(attempts = 8, delayMs = 120) {
  for (let i = 0; i < attempts; i += 1) {
    const { data } = await supabase.auth.getSession();
    if (data.session) return data.session;
    if (i < attempts - 1) {
      await new Promise((resolve) => window.setTimeout(resolve, delayMs));
    }
  }
  return null;
}

export default function Login() {
  const nav = useNavigate();
  const next = useNextParam();
  const reason = useLoginReason();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [showLogo, setShowLogo] = useState(true);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(AUTH_NEXT_STORAGE_KEY, next);
    } catch {
      // ignore session storage failures
    }
  }, [next]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) return;
      clearAuthNextPath();
      nav(next, { replace: true });
    });
  }, [nav, next]);

  async function onSignIn(e: FormEvent) {
    e.preventDefault();
    setErr("");
    setMsg("");
    setBusy(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setErr(error.message);
        return;
      }

      const session = data.session ?? await waitForSession();
      if (!session) {
        setErr("Sign-in did not establish a session. Please try again.");
        return;
      }

      clearAuthNextPath();
      nav(next, { replace: true });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Sign-in request failed.";
      setErr(message);
    } finally {
      setBusy(false);
    }
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

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      });

      if (error) {
        setErr(error.message);
        return;
      }

      setMsg("Password reset link sent. Check your email.");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Password reset request failed.";
      setErr(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: 24, fontFamily: "system-ui", maxWidth: 520 }}>
      {showLogo ? (
        <img
          src={FORGE_LOGIN_LOGO_PATH}
          alt="Podcaster's Forge logo"
          onError={() => setShowLogo(false)}
          style={{
            display: "block",
            width: "min(320px, 100%)",
            height: "auto",
            marginBottom: 16,
            borderRadius: 12,
          }}
        />
      ) : null}
      <h1 style={{ marginBottom: 8 }}>Podcaster's Forge</h1>
      <p style={{ marginTop: 0, opacity: 0.8 }}>
        Sign in to access Podcaster's Forge, Anvil, Hearth, Hammer, and Barstock.
      </p>
      {reason ? <div style={{ marginBottom: 12, color: "crimson" }}>{reason}</div> : null}

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
