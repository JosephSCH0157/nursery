// src/forge/login.ts
// Legacy Anvil login page shim.
// Auth is now owned by Podcaster's Forge at /login.
import { supabase } from './supabaseClient';

function getRedirectTarget(): string {
  const params = new URLSearchParams(window.location.search || '');
  return (
    params.get('next') ||
    params.get('redirect') ||
    params.get('return') ||
    '/app/anvil'
  );
}

function buildNurseryLoginHref(target: string): string {
  return `/login?next=${encodeURIComponent(target)}`;
}

function setStatus(message: string): void {
  const errorEl = document.getElementById('error');
  if (errorEl) errorEl.textContent = message;
}

async function redirectToNurseryAuth(): Promise<void> {
  const target = getRedirectTarget();
  setStatus("Login moved to Podcaster's Forge. Redirecting...");

  try {
    const { data, error } = await supabase.auth.getSession();
    if (!error && data?.session) {
      window.location.replace(target);
      return;
    }
  } catch {
    // ignore
  }

  const nurseryLogin = buildNurseryLoginHref(target);
  try {
    window.location.replace(nurseryLogin);
  } catch {
    window.location.assign(nurseryLogin);
  }
}

void redirectToNurseryAuth();
