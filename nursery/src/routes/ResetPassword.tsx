import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function ResetPassword() {
  const nav = useNavigate();
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  async function onSet(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr("");
    setMsg("");
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) return setErr(error.message);
    setMsg("Password updated.");
    nav("/app", { replace: true });
  }

  return (
    <form onSubmit={onSet} style={{ padding: 24, maxWidth: 420, margin: "60px auto", display: "flex", flexDirection: "column", gap: 12 }}>
      <h2 style={{ margin: 0 }}>Set a new password</h2>
      <input
        type="password"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        placeholder="New password"
        style={{ padding: 10 }}
        required
      />
      <button type="submit" disabled={!pw}>
        Save
      </button>
      {err ? <div style={{ color: "#f00" }}>{err}</div> : null}
      {msg ? <div style={{ color: "#0a0" }}>{msg}</div> : null}
    </form>
  );
}
