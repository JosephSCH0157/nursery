import { useState } from "react";
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
        <button type="submit" disabled={busy}>
          {busy ? "Saving..." : "Save password"}
        </button>
        {err ? <div className="reset-password__error">{err}</div> : null}
        {msg ? <div className="reset-password__success">{msg}</div> : null}
      </form>
    </div>
  );
}
