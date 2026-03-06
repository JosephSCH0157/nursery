import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
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

export default function Signup() {
  const nav = useNavigate();
  const next = useNextParam();

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    setMsg("");

    if (password !== confirmPassword) {
      setErr("Passwords do not match.");
      return;
    }

    setBusy(true);

    try {
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
      const trimmedDisplayName = displayName.trim();
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: redirectTo,
          data: trimmedDisplayName ? { full_name: trimmedDisplayName } : undefined,
        },
      });

      if (error) {
        setErr(error.message);
        return;
      }

      const session = data.session ?? await waitForSession();
      if (session) {
        clearAuthNextPath();
        nav(next, { replace: true });
        return;
      }

      setMsg("Account created. Check your email to confirm it, then continue into Forge.");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Account creation failed.";
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
          <h1 className="forge-login-card__title">Create Your Forge Account</h1>
          <p className="forge-login-card__subtitle">
            Start in Nursery and move into the tools from one account.
          </p>
          <p className="forge-login-card__meta">Private beta · account creation available</p>

          <div className="forge-login-card__actions">
            <Link className="forge-login-card__back" to={`/login?next=${encodeURIComponent(next)}`}>
              Back to Login
            </Link>
            <a className="forge-login-card__beta" href="/beta/index.html">
              Apply For Beta
            </a>
          </div>

          <form onSubmit={onSubmit} className="forge-login-form">
            <label className="forge-login-field">
              <span>Display name</span>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                type="text"
                autoComplete="name"
              />
            </label>

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
                autoComplete="new-password"
                required
              />
            </label>

            <label className="forge-login-field">
              <span>Confirm password</span>
              <input
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                type="password"
                autoComplete="new-password"
                required
              />
            </label>

            <button type="submit" disabled={busy} className="forge-login-button forge-login-button--primary">
              {busy ? "Creating account..." : "Create Account"}
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
            Already have an account? <Link to={`/login?next=${encodeURIComponent(next)}`}>Sign in</Link>.
          </p>
        </div>
      </section>
    </main>
  );
}
