import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "../lib/supabase";

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
      redirectTo: `${window.location.origin}/auth/callback`,
    });

    setBusy(false);

    if (error) setMsg(error.message);
    else setMsg("Password reset email sent. Check spam/promotions too.");
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1.15fr 0.85fr",
        gap: 18,
        alignItems: "stretch",
        maxWidth: 1050,
      }}
    >
      <div
        style={{
          borderRadius: 18,
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.04)",
          minHeight: 380,
          position: "relative",
        }}
      >
        <img
          src="/anvil-login/assets/login.png"
          alt="Podcaster's Forge"
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
        <img
          src="/anvil-login/assets/anvil_teleprompter_logo.png"
          alt="Anvil"
          style={{
            position: "absolute",
            left: 18,
            bottom: 18,
            width: 180,
            height: "auto",
            filter: "drop-shadow(0 6px 18px rgba(0,0,0,0.6))",
          }}
        />
      </div>

      <div style={{ padding: 6 }}>
        <h1 style={{ margin: 0 }}>Podcaster&apos;s Forge</h1>
        <p style={{ marginTop: 8, opacity: 0.8 }}>
          Browse the Forge anytime. Sign in when you're ready to do real work.
        </p>

        <form onSubmit={onSubmit} style={{ marginTop: 14 }}>
          <label style={{ display: "block", marginBottom: 6 }}>Email</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            style={{
              width: "100%",
              padding: 10,
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.18)",
              background: "rgba(0,0,0,0.25)",
              color: "inherit",
            }}
          />

          <label style={{ display: "block", marginTop: 12, marginBottom: 6 }}>Password</label>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="current-password"
            style={{
              width: "100%",
              padding: 10,
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.18)",
              background: "rgba(0,0,0,0.25)",
              color: "inherit",
            }}
          />

          <button
            type="submit"
            disabled={!canSubmit}
            style={{
              marginTop: 14,
              width: "100%",
              padding: 10,
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.22)",
              background: "rgba(255,255,255,0.06)",
              cursor: canSubmit ? "pointer" : "default",
            }}
          >
            {busy ? "Signing in..." : "Sign in"}
          </button>

          <button
            type="button"
            onClick={onForgot}
            disabled={busy}
            style={{
              marginTop: 10,
              width: "100%",
              padding: 10,
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.22)",
              background: "transparent",
              cursor: busy ? "default" : "pointer",
            }}
          >
            Forgot password
          </button>

          {msg && (
            <div style={{ marginTop: 12, color: msg.includes("sent") ? "inherit" : "#ff6b6b" }}>{msg}</div>
          )}
        </form>
      </div>
    </div>
  );
}
