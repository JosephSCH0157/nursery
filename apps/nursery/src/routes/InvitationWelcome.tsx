import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { supabase, tongsSupabase } from "../lib/supabase";
import "./Login.css";

type OnboardingState = {
  admitted: boolean;
  admission_origin: string | null;
  application_id: string | null;
  effective_state: string | null;
  profile_exists: boolean;
  workspace_id: string | null;
};

export default function InvitationWelcome() {
  const [state, setState] = useState<OnboardingState | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    const client = tongsSupabase as unknown as {
      rpc: (name: string) => Promise<{ data: unknown; error: { message: string } | null }>;
    };
    client.rpc("read_my_admission_onboarding").then(({ data, error: rpcError }) => {
      if (rpcError) setError(rpcError.message);
      else setState(data as OnboardingState);
    });
  }, []);

  async function savePassword(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (password.length < 12) {
      setError("Choose a password with at least 12 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) setError(updateError.message);
    else setComplete(true);
  }

  return (
    <main className="forge-login-page">
      <div className="forge-login-page__brand">Podcaster&apos;s <span>Forge</span></div>
      <section className="forge-login-page__panel">
        <div className="forge-login-card">
          <h1 className="forge-login-card__title">Welcome to Forge</h1>
          <p className="forge-login-card__subtitle">
            Your invitation identity is bound to the approved beta application.
          </p>
          {state ? (
            <p className="forge-login-card__meta">
              Admission: {state.effective_state ?? "unavailable"} · Workspace: {state.workspace_id ? "ready" : "pending"}
            </p>
          ) : null}
          {!complete ? (
            <form className="forge-login-form" onSubmit={savePassword}>
              <label className="forge-login-field">
                <span>Create password</span>
                <input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
              </label>
              <label className="forge-login-field">
                <span>Confirm password</span>
                <input type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} required />
              </label>
              <button className="forge-login-button forge-login-button--primary" type="submit" disabled={busy || state?.admitted === false}>
                {busy ? "Saving..." : "Finish account"}
              </button>
            </form>
          ) : (
            <div className="forge-login-card__notice is-success" role="status">
              Account setup is complete. <Link to="/app">Enter Forge</Link>.
            </div>
          )}
          {error ? <div className="forge-login-card__notice is-error" role="alert">{error}</div> : null}
        </div>
      </section>
    </main>
  );
}
