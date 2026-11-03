import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  AUTH_NEXT_STORAGE_KEY,
  AUTH_PROVIDER_STORAGE_KEY,
  normalizeAuthNextPath,
} from "../lib/auth-callback-intent";
import { supabase } from "../lib/supabase";
import "./Login.css";

function clearAuthIntent(): void {
  try {
    window.sessionStorage.removeItem(AUTH_NEXT_STORAGE_KEY);
    window.sessionStorage.removeItem(AUTH_PROVIDER_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function useNextParam() {
  const loc = useLocation();
  return useMemo(() => {
    const p = new URLSearchParams(loc.search);
    return normalizeAuthNextPath(p.get("next"));
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
    if (reason === "oauth_cancelled") {
      return "Google sign-in was cancelled. You can try again or use your password.";
    }
    if (reason === "oauth_failed") {
      return "Google sign-in could not be completed. Please try again or use your password.";
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
  const [passwordVisible, setPasswordVisible] = useState(false);

  const [busy, setBusy] = useState<"password" | "google" | "recovery" | null>(null);
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
      clearAuthIntent();
      nav(next, { replace: true });
    });
  }, [nav, next]);

  async function onSignIn(e: FormEvent) {
    e.preventDefault();
    setErr("");
    setMsg("");
    setBusy("password");
    try {
      window.sessionStorage.removeItem(AUTH_PROVIDER_STORAGE_KEY);
    } catch {
      // ignore session storage failures
    }

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

      clearAuthIntent();
      nav(next, { replace: true });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Sign-in request failed.";
      setErr(message);
    } finally {
      setBusy(null);
    }
  }

  async function onGoogleSignIn() {
    setErr("");
    setMsg("");
    setBusy("google");

    try {
      try {
        window.sessionStorage.setItem(AUTH_NEXT_STORAGE_KEY, next);
        window.sessionStorage.setItem(AUTH_PROVIDER_STORAGE_KEY, "google");
      } catch {
        // OAuth still works when browser storage is unavailable; the callback uses /app.
      }

      const redirectTo = `${window.location.origin}/auth/callback`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });

      if (error) {
        window.sessionStorage.removeItem(AUTH_PROVIDER_STORAGE_KEY);
        setErr("Google sign-in could not be started. Please try again or use your password.");
        setBusy(null);
      }
    } catch {
      try {
        window.sessionStorage.removeItem(AUTH_PROVIDER_STORAGE_KEY);
      } catch {
        // ignore session storage failures
      }
      setErr("Google sign-in could not be started. Please try again or use your password.");
      setBusy(null);
    }
  }

  async function onForgotPassword() {
    setErr("");
    setMsg("");
    if (!email) {
      setErr('Enter your email first, then click "Forgot password".');
      return;
    }

    setBusy("recovery");
    const redirectTo = `${window.location.origin}/reset-password?type=recovery`;

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
      setBusy(null);
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

          <button
            type="button"
            onClick={onGoogleSignIn}
            disabled={busy !== null}
            className="forge-login-button forge-login-button--google"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path fill="#4285f4" d="M21.6 12.2c0-.7-.1-1.5-.2-2.2H12v4.2h5.4a4.6 4.6 0 0 1-2 3v2.7h3.3c1.9-1.8 2.9-4.4 2.9-7.7Z" />
              <path fill="#34a853" d="M12 22c2.7 0 5-.9 6.7-2.4l-3.3-2.7c-.9.6-2.1 1-3.4 1a5.9 5.9 0 0 1-5.5-4.1H3.1v2.8A10 10 0 0 0 12 22Z" />
              <path fill="#fbbc05" d="M6.5 13.8a6 6 0 0 1 0-3.6V7.4H3.1a10 10 0 0 0 0 9.2l3.4-2.8Z" />
              <path fill="#ea4335" d="M12 6.1c1.5 0 2.8.5 3.9 1.5l2.9-2.9A9.8 9.8 0 0 0 3.1 7.4l3.4 2.8A5.9 5.9 0 0 1 12 6.1Z" />
            </svg>
            {busy === "google" ? "Connecting to Google..." : "Continue with Google"}
          </button>

          <div className="forge-login-divider"><span>or use your password</span></div>

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

            <div className="forge-login-field">
              <label htmlFor="forge-login-password">Password</label>
              <div className="forge-login-password">
                <input
                  id="forge-login-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type={passwordVisible ? "text" : "password"}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="forge-login-password__toggle"
                  aria-label={passwordVisible ? "Hide password" : "Show password"}
                  aria-pressed={passwordVisible}
                  onClick={() => setPasswordVisible((visible) => !visible)}
                >
                  {passwordVisible ? (
                    <svg aria-hidden="true" viewBox="0 0 24 24">
                      <path d="m3 3 18 18M10.6 10.7a2 2 0 0 0 2.7 2.7M9.9 4.2A10.7 10.7 0 0 1 12 4c5.5 0 9 5.1 9 5.1a15.8 15.8 0 0 1-2.2 2.7M6.6 6.6C4.4 8 3 10 3 10s3.5 5 9 5c1.2 0 2.3-.2 3.3-.7" />
                    </svg>
                  ) : (
                    <svg aria-hidden="true" viewBox="0 0 24 24">
                      <path d="M3 10s3.5-5 9-5 9 5 9 5-3.5 5-9 5-9-5-9-5Z" />
                      <circle cx="12" cy="10" r="2.5" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button type="submit" disabled={busy !== null} className="forge-login-button forge-login-button--primary">
              {busy === "password" ? "Signing in..." : "Sign in"}
            </button>

            <button
              type="button"
              onClick={onForgotPassword}
              disabled={busy !== null}
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
        </div>
      </section>
    </main>
  );
}
