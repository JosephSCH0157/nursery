// src/forge/account.ts
import type { User } from '@supabase/supabase-js';
import { ensureUserAndProfile, type ForgeProfile } from './authProfile';
import { supabase } from './supabaseClient';

interface AccountContext {
  user: User;
  profile: ForgeProfile;
}

type CheckoutSessionResponse = {
  url?: string;
};

function getConfiguredPriceId(): string {
  const w = (typeof window !== 'undefined' ? (window as any) : {}) as any;
  const meta = (typeof import.meta !== 'undefined' ? (import.meta as any) : {}) as any;
  const metaEnv = meta.env || {};
  return String(
    w.__forgeAnvilPriceId ||
      metaEnv.VITE_STRIPE_ANVIL_PRICE_ID ||
      metaEnv.VITE_STRIPE_PRICE_ID ||
      '',
  ).trim();
}

async function startCheckout(priceId: string): Promise<void> {
  const currentUrl = new URL(window.location.href);
  currentUrl.search = "";
  currentUrl.hash = "";
  const accountBaseUrl = currentUrl.toString();
  const successUrl = `${accountBaseUrl}?checkout=success`;
  const cancelUrl = `${accountBaseUrl}?checkout=canceled`;

  const { data, error } = await supabase.functions.invoke('create-checkout-session', {
    body: {
      price_id: priceId,
      successUrl,
      cancelUrl,
    },
  });

  if (error) throw error;

  const payload = (data || {}) as CheckoutSessionResponse;
  const url = typeof payload.url === 'string' ? payload.url.trim() : '';
  if (!url) {
    throw new Error('Checkout session missing url.');
  }

  try {
    if (window.top && window.top !== window) {
      window.top.location.assign(url);
      return;
    }
  } catch {
    // ignore cross-frame access and fallback to current window redirect
  }

  window.location.assign(url);
}

function renderAccount(ctx: AccountContext) {
  const root = document.getElementById('account-details');
  if (!root) return;

  const { user, profile } = ctx;
  const email = user.email || '(no email)';
  const displayName = profile.display_name || '(no display name)';
  const tier = profile.tier || 'free';

  root.innerHTML = `
    <h2>Profile</h2>
    <p><strong>Email:</strong> ${email}</p>
    <p><strong>Display name:</strong> ${displayName}</p>
    <p><strong>Plan:</strong> ${tier}</p>

    <h2>Plan & Billing</h2>
    <p>Your current plan is <strong>${tier}</strong>.</p>
    <button id="upgrade-btn" type="button">Upgrade plan</button>
    <p id="upgrade-msg" aria-live="polite"></p>

    <h2>Session</h2>
    <button id="logout-btn" type="button">Log out</button>
  `;

  const logoutBtn = document.getElementById('logout-btn');
  const upgradeBtn = document.getElementById('upgrade-btn');
  const upgradeMsg = document.getElementById('upgrade-msg');
  const priceId = getConfiguredPriceId();

  const setUpgradeMessage = (message: string) => {
    if (upgradeMsg) {
      upgradeMsg.textContent = message;
    }
  };

  if (!priceId) {
    if (upgradeBtn) {
      (upgradeBtn as HTMLButtonElement).disabled = true;
      (upgradeBtn as HTMLButtonElement).title = 'Missing Stripe price ID configuration.';
    }
    setUpgradeMessage('Upgrade is not configured in this environment.');
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await supabase.auth.signOut();
      window.location.href = '/login';
    });
  }

  if (upgradeBtn) {
    upgradeBtn.addEventListener('click', async () => {
      if (!priceId) return;
      const button = upgradeBtn as HTMLButtonElement;
      const prevText = button.textContent || 'Upgrade plan';
      button.disabled = true;
      button.textContent = 'Redirecting...';
      setUpgradeMessage('');
      try {
        await startCheckout(priceId);
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : typeof error === 'string' ? error : 'Checkout failed.';
        setUpgradeMessage(`Checkout error: ${msg}`);
        button.disabled = false;
        button.textContent = prevText;
      }
    });
  }
}

async function main() {
  try {
    const { user, profile } = await ensureUserAndProfile();
    try { (window as any).__forgeUser = user; } catch {}
    try { (window as any).__forgeProfile = profile; } catch {}
    renderAccount({ user, profile });
  } catch (err) {
    console.error('[account] failed to load', err);
    const root = document.getElementById('account-details');
    if (root) {
      root.innerHTML = `<p>Sorry, we couldn’t load your account. Please refresh or try again later.</p>`;
    }
  }
}

main();
