import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import "./ResetPassword.css";

function Eye({ visible }: { visible: boolean }) {
  return visible ? <span aria-hidden="true">Hide</span> : <span aria-hidden="true">Show</span>;
}

export default function ResetPassword() {
  const nav = useNavigate();
  const [pw, setPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [success, setSuccess] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [checkingLink, setCheckingLink] = useState(true);
  const [linkInvalid, setLinkInvalid] = useState(false);
  const requirements = useMemo(() => [
    ["At least 8 characters", pw.length >= 8],
    ["Uppercase and lowercase letters", /[A-Z]/.test(pw) && /[a-z]/.test(pw)],
    ["At least one number", /\d/.test(pw)],
    ["At least one symbol", /[^A-Za-z0-9]/.test(pw)],
  ] as const, [pw]);
  const passwordValid = requirements.every(([, met]) => met);
  const passwordsMatch = pw.length > 0 && pw === confirmPw;

  useEffect(() => {
    let active = true;
    let recoveryEventSeen = false;
    const { data: authState } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") recoveryEventSeen = true;
      if (session && active) {
        setSessionReady(true); setCheckingLink(false); setLinkInvalid(false); setErr("");
      }
    });
    (async () => {
      try {
        const search = new URLSearchParams(window.location.search);
        const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        const callbackError = search.get("error_description") ?? search.get("error") ?? hash.get("error_description") ?? hash.get("error");
        if (callbackError) throw new Error(callbackError);
        const code = search.get("code");
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError && !(await supabase.auth.getSession()).data.session) throw exchangeError;
        }
        let { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!data.session) {
          const accessToken = hash.get("access_token");
          const refreshToken = hash.get("refresh_token");
          if (accessToken && refreshToken) {
            const result = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
            if (result.error) throw result.error;
            data = result.data;
          }
        }
        for (let attempt = 0; attempt < 40 && !data.session; attempt += 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 125));
          const result = await supabase.auth.getSession();
          if (result.error) throw result.error;
          data = result.data;
        }
        if (!active) return;
        if (!data.session) throw new Error("This password reset link is invalid or has expired.");
        setSessionReady(true); setCheckingLink(false);
        if (recoveryEventSeen || search.get("type") === "recovery") window.history.replaceState(null, "", "/reset-password");
      } catch (e: unknown) {
        if (!active) return;
        setCheckingLink(false); setSessionReady(false); setLinkInvalid(true);
        setErr(e instanceof Error ? e.message : "Unable to open this password reset link.");
      }
    })();
    return () => { active = false; authState.subscription.unsubscribe(); };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault(); setErr("");
    if (!passwordValid) return setErr("Choose a password that meets every requirement below.");
    if (!passwordsMatch) return setErr("The passwords do not match.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return setErr(error.message);
    setSuccess(true); setPw(""); setConfirmPw("");
  }

  return <main className="reset-password">
    <div className="reset-password__brand"><span className="reset-password__mark">♨</span>Podcaster&apos;s <strong>Forge</strong></div>
    <section className="reset-password__card" aria-labelledby="reset-title">
      {success ? <div className="reset-password__state" role="status">
        <div className="reset-password__state-icon success">✓</div><h1 id="reset-title">Password updated</h1>
        <p>Your new password is ready. You can continue securely to the Forge.</p>
        <button className="reset-password__primary" onClick={() => nav("/app", { replace: true })}>Continue to the Forge</button>
      </div> : linkInvalid ? <div className="reset-password__state" role="alert">
        <div className="reset-password__state-icon error">!</div><h1 id="reset-title">Reset link expired</h1><p>{err}</p>
        <button className="reset-password__primary" onClick={() => nav("/login", { replace: true })}>Request a new reset email</button>
      </div> : <>
        <header><span className="reset-password__eyebrow">Secure account recovery</span><h1 id="reset-title">Set a new password</h1>
          <p>Choose a strong password you have not used for this account before.</p></header>
        <form onSubmit={onSubmit} className="reset-password__form">
          <label>New password<div className="reset-password__input"><input type={showPw ? "text" : "password"} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" disabled={!sessionReady || busy} required /><button type="button" aria-label={showPw ? "Hide new password" : "Show new password"} onClick={() => setShowPw(!showPw)}><Eye visible={showPw} /></button></div></label>
          <label>Confirm password<div className="reset-password__input"><input type={showConfirm ? "text" : "password"} value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} autoComplete="new-password" disabled={!sessionReady || busy} aria-invalid={confirmPw.length > 0 && !passwordsMatch} required /><button type="button" aria-label={showConfirm ? "Hide confirmed password" : "Show confirmed password"} onClick={() => setShowConfirm(!showConfirm)}><Eye visible={showConfirm} /></button></div></label>
          <div className="reset-password__requirements"><strong>Password requirements</strong><ul>
            {requirements.map(([label, met]) => <li key={label} className={met ? "met" : ""}><span>{met ? "✓" : "○"}</span>{label}</li>)}
            <li className={passwordsMatch ? "met" : ""}><span>{passwordsMatch ? "✓" : "○"}</span>Passwords match</li>
          </ul></div>
          <button className="reset-password__primary" type="submit" disabled={busy || !sessionReady}>{busy ? "Updating password..." : checkingLink ? "Opening secure link..." : "Update password"}</button>
          {checkingLink ? <p className="reset-password__status">Verifying your secure reset link…</p> : null}
          {err ? <div className="reset-password__notice" role="alert">{err}</div> : null}
        </form>
      </>}
    </section>
  </main>;
}
