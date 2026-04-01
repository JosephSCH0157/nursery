import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import "./Login.css";
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
  const devMode = (import.meta as { env?: Record<string, unknown> }).env?.DEV === true;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

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
    <main className="forge-login-page">
      <div className="forge-login-page__brand">
        Podcaster&apos;s <span>Forge</span>
      </div>
      <section className="forge-login-page__video-shell" aria-label="Anvil intro video">
        <iframe
          src="https://www.youtube-nocookie.com/embed/lH1E6ojjSsg?rel=0&modestbranding=1"
          title="Anvil intro and demo"
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      </section>

      <section className="forge-login-page__panel">
        <div className="forge-login-card">
          <h1 className="forge-login-card__title">Podcaster&apos;s Forge</h1>
          <p className="forge-login-card__subtitle">
            Forge your voice. Shape your story.
          </p>
          <p className="forge-login-card__meta">Private beta · invite-only access</p>

          <div className="forge-login-card__beta-banner" role="note" aria-live="polite">
            <strong>Open for beta requests.</strong> New sign-ups are currently disabled.
            <a href="/beta/index.html"> Request access via the beta form.</a>
          </div>

          <div className="forge-login-card__actions">
            <a className="forge-login-card__back" href="/">
              Back
            </a>
            <a className="forge-login-card__beta" href="/beta/index.html">Request Beta Access</a>
          </div>

          {reason ? (
            <div className="forge-login-card__notice is-error" role="alert" aria-live="assertive">
              {reason}
            </div>
          ) : null}

          <form onSubmit={onSignIn} className="forge-login-form">
            <label className="forge-login-field">
              <span>Email</span>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                autoComplete="email"
                required
              />
            </label>

            <label className="forge-login-field">
              <span>Password</span>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                autoComplete="current-password"
                required
              />
            </label>

            <button type="submit" disabled={busy} className="forge-login-button forge-login-button--primary">
              {busy ? "Signing in..." : "Sign in"}
            </button>

            <button
              type="button"
              onClick={onForgotPassword}
              disabled={busy}
              className="forge-login-button forge-login-button--ghost"
            >
              Forgot password
            </button>

            {err ? (
              <div className="forge-login-card__notice is-error" role="alert" aria-live="assertive">
                {err}
              </div>
            ) : null}
            {msg ? (
              <div className="forge-login-card__notice is-success" role="status" aria-live="polite">
                {msg}
              </div>
            ) : null}
          </form>

          <p className="forge-login-card__footer">
            Need beta access? <a href="/beta/index.html">Apply for beta</a>.
          </p>
          {devMode ? <p className="forge-login-card__dev-next">dev next: {next}</p> : null}
        </div>
      </section>
    </main>
  );
}
