import { appStore } from '../state/app-store';
import { getAsrState } from './store';

export type AsrNotReadyReason = 'NO_PERMISSION' | 'NO_DEVICE' | 'NOT_READY';
export type AsrWarnReason = 'NOT_CALIBRATED';

export function computeAsrReadiness(): { ready: true; warn?: AsrWarnReason } | { ready: false; reason: AsrNotReadyReason } {
  try {
    const micOpen = !!(window as any).__tpMic?.__lastStream || !!(window as any).__tpMic?.isOpen?.();
    const permState = String((window as any).__tpMicPermState || '').toLowerCase();
    const micGranted = !!appStore.get?.('micGranted') || micOpen || permState === 'granted';
    if (micOpen) {
      try { appStore.set?.('micGranted', true as any); } catch {}
      try { (window as any).__tpMicPermState = 'granted'; } catch {}
    }
    if (!micGranted) return { ready: false, reason: 'NO_PERMISSION' };

    const micDevice = String(appStore.get?.('micDevice') || '').trim();
    let activeProfile: any = null;
    try {
      const asrState = getAsrState?.();
      activeProfile = asrState?.activeProfileId && asrState.profiles?.[asrState.activeProfileId];
    } catch {
      // ignore ASR state failures
    }
    const hasDevice = !!micDevice || !!activeProfile?.capture?.deviceId || micOpen;
    if (!hasDevice) return { ready: false, reason: 'NO_DEVICE' };

    if (!activeProfile) return { ready: true, warn: 'NOT_CALIBRATED' };

    return { ready: true };
  } catch {
    return { ready: true };
  }
}
