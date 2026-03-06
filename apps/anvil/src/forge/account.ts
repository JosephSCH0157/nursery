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

type AiBillingMode = 'forge' | 'byo' | 'unknown';

type AiPackKey = 'base' | 'mid' | 'high';

type AiPack = {
  key: AiPackKey;
  label: string;
  amountLabel: string;
  tokensLabel: string;
  priceId: string;
};

type AiCreditsSnapshot = {
  billingMode: AiBillingMode;
  tokenBalance: number | null;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readWindowConfig(key: string): string {
  const w = (typeof window !== 'undefined' ? (window as any) : {}) as any;
  return normalizeString(w[key]);
}

function getConfiguredPlanPriceId(): string {
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

function getConfiguredAiPriceId(key: AiPackKey): string {
  const meta = (typeof import.meta !== 'undefined' ? (import.meta as any) : {}) as any;
  const metaEnv = meta.env || {};
  const envKey = key === 'base'
    ? metaEnv.VITE_STRIPE_AI_PRICE_ID_BASE
    : key === 'mid'
      ? metaEnv.VITE_STRIPE_AI_PRICE_ID_MID
      : metaEnv.VITE_STRIPE_AI_PRICE_ID_HIGH;
  return String(readWindowConfig(`__forgeAiPriceId_${key}`) || envKey || '').trim();
}

function getConfiguredAiPacks(): AiPack[] {
  return [
    {
      key: 'base',
      label: 'AI Base',
      amountLabel: '$10',
      tokensLabel: '1,000,000',
      priceId: getConfiguredAiPriceId('base'),
    },
    {
      key: 'mid',
      label: 'AI Mid',
      amountLabel: '$25',
      tokensLabel: '3,000,000',
      priceId: getConfiguredAiPriceId('mid'),
    },
    {
      key: 'high',
      label: 'AI High',
      amountLabel: '$50',
      tokensLabel: '7,000,000',
      priceId: getConfiguredAiPriceId('high'),
    },
  ];
}

function isFounderTier(tier: string): boolean {
  return tier.trim().toLowerCase() === 'founder';
}

function getCheckoutStatus(): 'success' | 'canceled' | null {
  const params = new URLSearchParams(window.location.search || '');
  const raw = params.get('checkout');
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if (value === 'success') return 'success';
  if (value === 'canceled') return 'canceled';
  return null;
}

function getCheckoutStatusMessage(): string | null {
  const checkoutStatus = getCheckoutStatus();
  if (checkoutStatus === 'success') return 'Thanks - credits will appear in a moment.';
  if (checkoutStatus === 'canceled') return 'Checkout canceled.';
  const params = new URLSearchParams(window.location.search || '');
  if (params.has('session_id')) return 'Checkout received - processing...';
  return null;
}

function formatTokenBalance(value: number | null): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--';
  return Math.max(0, Math.floor(value)).toLocaleString();
}

function parseTokenBalance(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

async function fetchAiCreditsSnapshot(): Promise<AiCreditsSnapshot> {
  const tongsClient = supabase.schema('tongs') as unknown as {
    rpc: (
      fn: string,
      args?: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message?: string } | null }>;
  };

  const { data, error } = await tongsClient.rpc('get_my_ai_credits');
  if (error) {
    throw new Error(error.message || 'Failed to load AI credits state.');
  }

  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  const rawMode = normalizeString(row?.billing_mode);
  const billingMode: AiBillingMode = rawMode === 'forge' || rawMode === 'byo'
    ? rawMode
    : 'unknown';

  return {
    billingMode,
    tokenBalance: parseTokenBalance(row?.token_balance),
  };
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
  const email = escapeHtml(user.email || '(no email)');
  const displayName = escapeHtml(profile.display_name || '(no display name)');
  const tierRaw = profile.tier || 'free';
  const tier = escapeHtml(tierRaw);
  const isFounder = isFounderTier(tierRaw);
  const checkoutMessage = getCheckoutStatusMessage();
  const planPriceId = getConfiguredPlanPriceId();
  const aiPacks = getConfiguredAiPacks();

  root.innerHTML = `
    <h2>Profile</h2>
    <p><strong>Email:</strong> ${email}</p>
    <p><strong>Display name:</strong> ${displayName}</p>
    <p><strong>Plan:</strong> ${tier}</p>

    <h2>Plan & Billing</h2>
    <p>Your current plan is <strong>${tier}</strong>.</p>
    ${isFounder ? '<p class="account-note">Founder access is admin-assigned.</p>' : ''}
    ${isFounder ? '' : '<button id="upgrade-btn" type="button">Upgrade plan</button>'}
    <p id="upgrade-msg" aria-live="polite">${!isFounder && checkoutMessage ? escapeHtml(checkoutMessage) : ''}</p>

    <h2>Forge AI Credits</h2>
    <section id="ai-pack-section" class="pack-section">
      <p>Buy credits for Forge-managed AI usage.</p>
      <div class="pack-row">
        ${aiPacks.map((pack) =>
          `<button id="ai-pack-${pack.key}" type="button" data-pack="${pack.key}">Buy ${pack.amountLabel} (${pack.tokensLabel} tokens)</button>`
        ).join('')}
      </div>
      <p id="ai-pack-balance" class="account-note">Balance: loading...</p>
      <p id="ai-pack-mode" class="account-note">AI billing mode: loading...</p>
      <p id="ai-pack-msg" aria-live="polite">${checkoutMessage ? escapeHtml(checkoutMessage) : ''}</p>
      <p id="ai-pack-help" class="account-note"></p>
    </section>

    <h2>Session</h2>
    <button id="logout-btn" type="button">Log out</button>
  `;

  const logoutBtn = document.getElementById('logout-btn');
  const upgradeBtn = document.getElementById('upgrade-btn');
  const upgradeMsg = document.getElementById('upgrade-msg');
  const aiSection = document.getElementById('ai-pack-section');
  const aiBalanceEl = document.getElementById('ai-pack-balance');
  const aiModeEl = document.getElementById('ai-pack-mode');
  const aiHelpEl = document.getElementById('ai-pack-help');
  const aiMsgEl = document.getElementById('ai-pack-msg');

  const setUpgradeMessage = (message: string) => {
    if (upgradeMsg) {
      upgradeMsg.textContent = message;
    }
  };

  const setAiMessage = (message: string) => {
    if (aiMsgEl) aiMsgEl.textContent = message;
  };

  let aiLocked = true;
  let aiLockReason = 'Loading AI billing mode...';

  const applyAiAvailability = () => {
    if (aiSection) {
      aiSection.classList.toggle('is-disabled', aiLocked);
    }
    for (const pack of aiPacks) {
      const button = document.getElementById(`ai-pack-${pack.key}`) as HTMLButtonElement | null;
      if (!button) continue;
      const missingPrice = !pack.priceId;
      button.disabled = aiLocked || missingPrice;
      if (missingPrice) {
        button.title = `${pack.label} price ID is not configured.`;
      } else if (aiLocked && aiLockReason) {
        button.title = aiLockReason;
      } else {
        button.title = '';
      }
    }
    if (aiHelpEl) {
      if (aiLocked && aiLockReason) {
        aiHelpEl.textContent = aiLockReason;
      } else if (aiPacks.some((pack) => !pack.priceId)) {
        aiHelpEl.textContent = 'One or more AI pack price IDs are not configured.';
      } else {
        aiHelpEl.textContent = 'Choose a pack to launch Stripe checkout.';
      }
    }
  };

  const refreshAiCredits = async () => {
    try {
      const snapshot = await fetchAiCreditsSnapshot();
      if (aiBalanceEl) {
        aiBalanceEl.textContent = `Balance: ${formatTokenBalance(snapshot.tokenBalance)} tokens`;
      }
      if (aiModeEl) {
        const modeLabel = snapshot.billingMode === 'forge'
          ? 'Forge-managed'
          : snapshot.billingMode === 'byo'
            ? 'BYO'
            : 'Unknown';
        aiModeEl.textContent = `AI billing mode: ${modeLabel}`;
      }

      if (snapshot.billingMode === 'byo') {
        aiLocked = true;
        aiLockReason =
          'Forge AI Credits are only for Forge-managed AI. You are currently using your own provider key.';
      } else {
        aiLocked = false;
        aiLockReason = '';
      }
      applyAiAvailability();
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : typeof error === 'string' ? error : 'Failed to load AI mode.';
      aiLocked = true;
      aiLockReason = 'Unable to load AI billing mode. Refresh and try again.';
      applyAiAvailability();
      setAiMessage(`AI mode error: ${msg}`);
      if (aiBalanceEl) aiBalanceEl.textContent = 'Balance: --';
      if (aiModeEl) aiModeEl.textContent = 'AI billing mode: unknown';
    }
  };

  if (!planPriceId && upgradeBtn) {
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
      if (!planPriceId) return;
      const button = upgradeBtn as HTMLButtonElement;
      const prevText = button.textContent || 'Upgrade plan';
      button.disabled = true;
      button.textContent = 'Redirecting...';
      setUpgradeMessage('');
      try {
        await startCheckout(planPriceId);
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : typeof error === 'string' ? error : 'Checkout failed.';
        setUpgradeMessage(`Checkout error: ${msg}`);
        button.disabled = false;
        button.textContent = prevText;
      }
    });
  }

  for (const pack of aiPacks) {
    const button = document.getElementById(`ai-pack-${pack.key}`) as HTMLButtonElement | null;
    if (!button) continue;
    const defaultLabel = button.textContent || `Buy ${pack.amountLabel}`;
    button.dataset.defaultLabel = defaultLabel;
    button.addEventListener('click', async () => {
      if (aiLocked || !pack.priceId) return;
      const allButtons = aiPacks
        .map((entry) => document.getElementById(`ai-pack-${entry.key}`) as HTMLButtonElement | null)
        .filter(Boolean) as HTMLButtonElement[];
      for (const btn of allButtons) {
        btn.disabled = true;
      }
      button.textContent = 'Redirecting...';
      setAiMessage('');
      try {
        await startCheckout(pack.priceId);
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : typeof error === 'string' ? error : 'Checkout failed.';
        setAiMessage(`Checkout error: ${msg}`);
        for (const btn of allButtons) {
          btn.textContent = btn.dataset.defaultLabel || 'Buy';
        }
        applyAiAvailability();
      }
    });
  }

  applyAiAvailability();
  void refreshAiCredits();

  if (getCheckoutStatus() === 'success') {
    window.setTimeout(() => {
      void refreshAiCredits();
    }, 2500);
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
