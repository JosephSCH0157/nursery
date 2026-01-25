import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

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
    <div style={{ padding: 24, fontFamily: "system-ui", maxWidth: 520 }}>
      <h1>Set a new password</h1>
      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
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
        {err ? <div style={{ color: "crimson" }}>{err}</div> : null}
        {msg ? <div style={{ color: "green" }}>{msg}</div> : null}
      </form>
    </div>
  );
}
