import type { AsrProfile } from './schema';
import { getAsrState } from './store';

export function getActiveAsrProfile(): AsrProfile | null {
  try {
    const state = getAsrState();
    const id = state?.activeProfileId;
    if (!id) return null;
    return state.profiles?.[id] || null;
  } catch {
    return null;
  }
}

