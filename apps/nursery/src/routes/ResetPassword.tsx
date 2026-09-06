import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import "./ResetPassword.css";

export default function ResetPassword() {
  const nav = useNavigate();
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [sessionReady, setSessionReady] = useState(false);
  const [checkingLink, setCheckingLink] = useState(true);

  useEffect(() => {
    let active = true;
    let recoveryEventSeen = false;

    const { data: authState } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") recoveryEventSeen = true;
      if (session && active) {
        setSessionReady(true);
        setCheckingLink(false);
        setErr("");
      }
    });

    (async () => {
      try {
        const search = new URLSearchParams(window.location.search);
        const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        const callbackError = search.get("error_description")
          ?? search.get("error")
          ?? hash.get("error_description")
          ?? hash.get("error");
        if (callbackError) throw new Error(callbackError);

        const code = search.get("code");
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            const { data } = await supabase.auth.getSession();
            if (!data.session) throw exchangeError;
          }
        }

        let { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        if (!data.session) {
          const accessToken = hash.get("access_token");
          const refreshToken = hash.get("refresh_token");
          if (accessToken && refreshToken) {
            const result = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (result.error) throw result.error;
            data = result.data;
          }
        }

        if (!data.session) {
          for (let attempt = 0; attempt < 40 && !data.session; attempt += 1) {
            await new Promise((resolve) => window.setTimeout(resolve, 125));
            const result = await supabase.auth.getSession();
            if (result.error) throw result.error;
            data = result.data;
          }
        }

        if (!active) return;
        if (!data.session) {
          throw new Error("This password reset link is invalid or has expired. Request a fresh link and try again.");
        }

        setSessionReady(true);
        setCheckingLink(false);
        if (recoveryEventSeen || search.get("type") === "recovery") {
          window.history.replaceState(null, "", "/reset-password");
        }
      } catch (e: unknown) {
        if (!active) return;
        setCheckingLink(false);
        setSessionReady(false);
        setErr(e instanceof Error ? e.message : "Unable to open this password reset link.");
      }
    })();

    return () => {
      active = false;
      authState.subscription.unsubscribe();
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    setMsg("");
    setBusy(true);

    const { error } = await supabase.auth.updateUser({ password: pw });

    setBusy(false);

    if (error) return setErr(error.message);

    setMsg("Password updated.");
    nav("/app", { replace: true });
  }

  return (
    <div className="reset-password">
      <h1>Set a new password</h1>
      <form onSubmit={onSubmit} className="reset-password__form">
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="New password"
          required
        />
        <button type="submit" disabled={busy || !sessionReady}>
          {busy ? "Saving..." : "Save password"}
        </button>
        {checkingLink ? <div>Opening your secure reset link...</div> : null}
        {err ? <div className="reset-password__error">{err}</div> : null}
        {msg ? <div className="reset-password__success">{msg}</div> : null}
      </form>
    </div>
  );
}
