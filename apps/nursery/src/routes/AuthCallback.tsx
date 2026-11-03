import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  AUTH_NEXT_STORAGE_KEY,
  AUTH_PROVIDER_STORAGE_KEY,
  canRestoreLegacyImplicitSession,
  isInvitationAuthCallback,
  isOAuthCancellation,
  isRecoveryAuthCallback,
  normalizeAuthNextPath,
  readAuthCallbackError,
  readAuthCallbackType,
  readImplicitAuthSessionTokens,
} from "../lib/auth-callback-intent";
import "./AuthCallback.css";

function readCallbackNext(): string {
  try {
    const next = new URLSearchParams(window.location.search).get("next");
    if (next) return normalizeAuthNextPath(next);
  } catch {
    // ignore
  }
  try {
    const next = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("next");
    if (next) return normalizeAuthNextPath(next);
  } catch {
    // ignore
  }
  try {
    return normalizeAuthNextPath(window.sessionStorage.getItem(AUTH_NEXT_STORAGE_KEY));
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

function readProviderIntent(): string | null {
  try {
    return window.sessionStorage.getItem(AUTH_PROVIDER_STORAGE_KEY);
  } catch {
    return null;
  }
}

function clearProviderIntent(): void {
  try {
    window.sessionStorage.removeItem(AUTH_PROVIDER_STORAGE_KEY);
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
    let recoveryEventSeen = false;
    const { data: authState } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") recoveryEventSeen = true;
    });

    (async () => {
      try {
        const next = readCallbackNext();
        const providerIntent = readProviderIntent();
        const callbackError = readAuthCallbackError(window.location);
        if (callbackError) {
          clearProviderIntent();
          const reason = providerIntent === "google"
            ? (isOAuthCancellation(callbackError) ? "oauth_cancelled" : "oauth_failed")
            : "callback_failed";
          nav(`/login?reason=${reason}&next=${encodeURIComponent(next)}`, { replace: true });
          return;
        }

        const recoveryCallback = isRecoveryAuthCallback(window.location);
        const invitationCallback = isInvitationAuthCallback(window.location);
        const callbackType = readAuthCallbackType(window.location);

        const code = new URLSearchParams(window.location.search).get("code");
        const initialSession = await supabase.auth.getSession();
        if (initialSession.error) throw initialSession.error;
        let session = initialSession.data.session;
        if (code && !session) {
          const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
          session = data.session;
        }

        if (
          !session
          && !code
          && canRestoreLegacyImplicitSession(callbackType)
        ) {
          const tokens = readImplicitAuthSessionTokens(window.location);
          if (tokens) {
            const { data, error: sessionError } = await supabase.auth.setSession(tokens);
            if (sessionError) throw sessionError;
            session = data.session;
            window.history.replaceState(
              window.history.state,
              "",
              `${window.location.pathname}${window.location.search}`,
            );
          }
        }
        if (!session) session = await waitForSession(code ? 1 : 10);
        if (recoveryCallback || recoveryEventSeen) {
          if (!session) {
            nav("/login?reason=callback_session_missing&next=%2Freset-password", { replace: true });
            return;
          }
          clearCallbackNext();
          clearProviderIntent();
          nav("/reset-password", { replace: true });
          return;
        }

        if (session) {
          clearCallbackNext();
          clearProviderIntent();
          nav(invitationCallback ? "/welcome/invitation" : next, { replace: true });
          return;
        }

        clearProviderIntent();
        const reason = providerIntent === "google" ? "oauth_failed" : "callback_session_missing";
        nav(`/login?reason=${reason}&next=${encodeURIComponent(next)}`, { replace: true });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Auth callback failed.";
        setErr(message);
        const next = readCallbackNext();
        const providerIntent = readProviderIntent();
        clearProviderIntent();
        const reason = providerIntent === "google" ? "oauth_failed" : "callback_failed";
        nav(`/login?reason=${reason}&next=${encodeURIComponent(next)}`, { replace: true });
      }
    })();
    return () => authState.subscription.unsubscribe();
  }, [nav]);

  return <div className="auth-callback">{err ? `Error: ${err}` : "Finishing sign-in..."}</div>;
}
