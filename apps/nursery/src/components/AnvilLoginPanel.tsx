import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "../lib/supabase";
import "./AnvilLoginPanel.css";

type Props = {
  onSuccess?: () => void;
};

export default function AnvilLoginPanel({ onSuccess }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const canSubmit = useMemo(() => !!email.trim() && !!password && !busy, [email, password, busy]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setBusy(true);
    setMsg(null);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setBusy(false);

    if (error) {
      setMsg(error.message);
      return;
    }

    onSuccess?.();
  }

  async function onForgot() {
    const em = email.trim();
    if (!em) {
      setMsg("Enter your email first, then click Forgot password.");
      return;
    }

    setBusy(true);
    setMsg(null);

    const { error } = await supabase.auth.resetPasswordForEmail(em, {
      redirectTo: `${window.location.origin}/reset-password?type=recovery`,
    });

    setBusy(false);

    if (error) setMsg(error.message);
    else setMsg("Password reset email sent. Check spam/promotions too.");
  }

  return (
    <div className="anvil-login-panel">
      <div className="anvil-login-panel__hero">
        <img
          src="/anvil-login/assets/login.png"
          alt="Podcaster's Forge"
          className="anvil-login-panel__hero-image"
        />
        <img
          src="/anvil-login/assets/anvil_teleprompter_logo.png"
          alt="Anvil"
          className="anvil-login-panel__hero-logo"
        />
      </div>

      <div className="anvil-login-panel__content">
        <h1 className="anvil-login-panel__title">Podcaster&apos;s Forge</h1>
        <p className="anvil-login-panel__subtitle">
          Browse the Forge anytime. Sign in when you're ready to do real work.
        </p>

        <form onSubmit={onSubmit} className="anvil-login-panel__form">
          <label htmlFor="anvil-login-email" className="anvil-login-panel__label">Email</label>
          <input
            id="anvil-login-email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            title="Email"
            placeholder="Enter your email"
            className="anvil-login-panel__input"
          />

          <label htmlFor="anvil-login-password" className="anvil-login-panel__label anvil-login-panel__label--spaced">Password</label>
          <input
            id="anvil-login-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="current-password"
            title="Password"
            placeholder="Enter your password"
            className="anvil-login-panel__input"
          />

          <button
            type="submit"
            disabled={!canSubmit}
            className="anvil-login-panel__button"
          >
            {busy ? "Signing in..." : "Sign in"}
          </button>

          <button
            type="button"
            onClick={onForgot}
            disabled={busy}
            className="anvil-login-panel__button anvil-login-panel__button--ghost"
          >
            Forgot password
          </button>

          {msg && (
            <div className={`anvil-login-panel__message${msg.includes("sent") ? "" : " anvil-login-panel__message--error"}`}>
              {msg}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
