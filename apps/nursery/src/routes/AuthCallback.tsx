import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

const AUTH_NEXT_STORAGE_KEY = "forge_auth_next_v1";

function normalizeNextPath(raw: string | null): string {
  if (!raw) return "/app";
  const trimmed = raw.trim();
  if (!trimmed) return "/app";
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return "/app";
  return trimmed;
}

function readCallbackType(): string | null {
  try {
    const searchType = new URLSearchParams(window.location.search).get("type");
    if (searchType) return searchType;
  } catch {
    // ignore
  }
  try {
    const hashType = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("type");
    if (hashType) return hashType;
  } catch {
    // ignore
  }
  return null;
}

function readCallbackError(): string | null {
  try {
    const search = new URLSearchParams(window.location.search);
    const err = search.get("error_description") ?? search.get("error");
    if (err) return err;
  } catch {
    // ignore
  }
  try {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const err = hash.get("error_description") ?? hash.get("error");
    if (err) return err;
  } catch {
    // ignore
  }
  return null;
}

function readCallbackNext(): string {
  try {
    const next = new URLSearchParams(window.location.search).get("next");
    if (next) return normalizeNextPath(next);
  } catch {
    // ignore
  }
  try {
    const next = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("next");
    if (next) return normalizeNextPath(next);
  } catch {
    // ignore
  }
  try {
    return normalizeNextPath(window.sessionStorage.getItem(AUTH_NEXT_STORAGE_KEY));
  } catch {
    return "/app";
  }
}

function clearCallbackNext(): void {
  try {
    window.sessionStorage.removeItem(AUTH_NEXT_STORAGE_KEY);
  } catch {
    // ignore
  }
}

async function waitForSession(attempts = 10, delayMs = 120) {
  for (let i = 0; i < attempts; i += 1) {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (data.session) return data.session;
    if (i < attempts - 1) {
      await new Promise((resolve) => window.setTimeout(resolve, delayMs));
    }
  }
  return null;
}

export default function AuthCallback() {
  const nav = useNavigate();
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const next = readCallbackNext();
        const callbackError = readCallbackError();
        if (callbackError) {
          throw new Error(callbackError);
        }

        const type = readCallbackType();
        if (type === "recovery") {
          clearCallbackNext();
          nav("/reset-password", { replace: true });
          return;
        }

        const code = new URLSearchParams(window.location.search).get("code");
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
        }

        const session = await waitForSession();
        if (session) {
          clearCallbackNext();
          nav(next, { replace: true });
          return;
        }

        nav(`/login?reason=callback_session_missing&next=${encodeURIComponent(next)}`, { replace: true });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Auth callback failed.";
        setErr(message);
        const next = readCallbackNext();
        nav(`/login?reason=callback_failed&next=${encodeURIComponent(next)}`, { replace: true });
      }
    })();
  }, [nav]);

  return <div style={{ padding: 24 }}>{err ? `Error: ${err}` : "Finishing sign-in..."}</div>;
}
