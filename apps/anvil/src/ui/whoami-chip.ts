import type { SupabaseClient, Session } from '@supabase/supabase-js';

function pickDisplayName(session: Session | null): string {
  if (!session?.user) return 'Signed out';

  const u = session.user;

  const metaName =
    (u.user_metadata?.display_name as string | undefined) ||
    (u.user_metadata?.name as string | undefined);

  const email = u.email || 'unknown';

  const baseLabel = metaName?.trim() ? metaName.trim() : email;
  return baseLabel;
}

function getLoginHref(): string {
  try {
    const target = window.location.pathname + window.location.search + window.location.hash;
    return `/app?next=${encodeURIComponent(target)}`;
  } catch {
    return '/app';
  }
}

export function wireWhoamiChip(supabase: SupabaseClient): void {
  const el = document.getElementById('whoamiChip');
  const loginLink = document.getElementById('loginLink') as HTMLAnchorElement | null;
  const logoutBtn = document.getElementById('logoutBtn') as HTMLButtonElement | null;
  const loginHref = getLoginHref();
  if (!el && !loginLink && !logoutBtn) return;
  if (loginLink) loginLink.href = loginHref;

  if (el) {
    el.textContent = 'Checking...';
    el.hidden = false;
  }
  if (loginLink) loginLink.hidden = true;
  if (logoutBtn) logoutBtn.hidden = true;

  const apply = (session: Session | null) => {
    if (!session?.user) {
      if (el) {
        el.textContent = '';
        el.hidden = true;
      }
      if (logoutBtn) logoutBtn.hidden = true;
      if (loginLink) {
        loginLink.hidden = false;
        loginLink.href = loginHref;
      }
      return;
    }

    const label = pickDisplayName(session);
    const shortId = session.user.id ? session.user.id.slice(-6) : '';
    if (el) {
      el.textContent = `Logged in as ${label}${shortId ? ` (${shortId})` : ''}`;
      el.hidden = false;
    }
    if (logoutBtn) logoutBtn.hidden = false;
    if (loginLink) loginLink.hidden = true;
  };

  void supabase.auth
    .getSession()
    .then(({ data }) => apply(data.session ?? null))
    .catch(() => apply(null));

  supabase.auth.onAuthStateChange((_event, session) => {
    apply(session ?? null);
  });
}
