import type { SupabaseClient } from '@supabase/supabase-js';

export type Entitlements = {
  tier: string | null;
  anvil_paid: boolean;
  subscription_status: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_end: string | null;
};

export type EntitlementsState =
  | { status: 'idle'; ent: null; error?: string }
  | { status: 'loading'; ent: null; error?: string }
  | { status: 'ready'; ent: Entitlements; error?: string }
  | { status: 'error'; ent: null; error: string };

const FREE_ENTITLEMENTS: Entitlements = {
  tier: 'free',
  anvil_paid: false,
  subscription_status: null,
  stripe_customer_id: null,
  stripe_subscription_id: null,
  current_period_end: null,
};

let state: EntitlementsState = { status: 'idle', ent: null };
const subscribers = new Set<(next: EntitlementsState) => void>();

function notify(next: EntitlementsState): void {
  state = next;
  subscribers.forEach((fn) => {
    try {
      fn(next);
    } catch {
      // ignore subscriber failures
    }
  });
}

function toNullableString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeEntitlements(row: any): Entitlements {
  return {
    tier: toNullableString(row?.tier) ?? 'free',
    anvil_paid: Boolean(row?.anvil_paid),
    subscription_status: toNullableString(row?.subscription_status),
    stripe_customer_id: toNullableString(row?.stripe_customer_id),
    stripe_subscription_id: toNullableString(row?.stripe_subscription_id),
    current_period_end: toNullableString(row?.current_period_end),
  };
}

export function getEntitlementsState(): EntitlementsState {
  return state;
}

export function subscribeEntitlements(fn: (next: EntitlementsState) => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

export function setFreeEntitlements(): EntitlementsState {
  const next: EntitlementsState = { status: 'ready', ent: FREE_ENTITLEMENTS };
  notify(next);
  return next;
}

export async function refreshEntitlements(
  supabase: SupabaseClient,
): Promise<EntitlementsState> {
  try {
    notify({ status: 'loading', ent: null });

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    const user = authData?.user;

    if (!user) {
      return setFreeEntitlements();
    }

    const { data, error } = await supabase
      .from('profiles')
      .select(
        'tier, anvil_paid, subscription_status, stripe_customer_id, stripe_subscription_id, current_period_end',
      )
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) throw error;

    const next: EntitlementsState = {
      status: 'ready',
      ent: normalizeEntitlements(data || {}),
    };
    notify(next);
    return next;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown entitlement error';
    const next: EntitlementsState = { status: 'error', ent: null, error: message };
    notify(next);
    return next;
  }
}

export function isPaid(ent: Entitlements | null): boolean {
  if (!ent) return false;
  if (ent.anvil_paid) return true;
  if (ent.tier && ent.tier !== 'free') return true;
  return ent.subscription_status === 'active';
}

