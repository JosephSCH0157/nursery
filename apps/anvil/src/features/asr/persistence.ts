// src/features/asr/persistence.ts
import { getSpeechStore, type SpeechState } from '../speech/speech-store';
import { getAppStore } from '../../state/appStore';

const speechStore = getSpeechStore();

let initialized = false;
let bridgeMuted = false;

function readInitialState(): SpeechState {
  const store = getAppStore();

  return {
    engine:
      (store?.get('asr.engine') as string | undefined) ??
      'whisper',
    lang:
      (store?.get('asr.language') as string | undefined) ??
      'en-US',
    interim:
      (store?.get('asr.useInterimResults') as boolean | undefined) ??
      true,
    threshold:
      (store?.get('asr.threshold') as number | undefined) ??
      0.6,
    endpointingMs:
      (store?.get('asr.endpointMs') as number | undefined) ??
      700,
    fillerFilter:
      (store?.get('asr.filterFillers') as boolean | undefined) ??
      true,
    manualAnchorAdoptEnabled:
      (store?.get('asr.manualAnchorAdoptEnabled') as boolean | undefined) ??
      true,
    calmModeEnabled:
      (store?.get('asrCalmModeEnabled') as boolean | undefined) ??
      false,
  };
}

export function applySpeechStateFromOwner(next: Partial<SpeechState>): void {
  bridgeMuted = true;
  try {
    speechStore.set(next);
  } finally {
    bridgeMuted = false;
  }
}

function syncToStore(next: SpeechState): void {
  const store = getAppStore();
  if (!store) return;
  try { store.set('asr.engine', next.engine); } catch {}
  try { store.set('asr.language', next.lang); } catch {}
  try { store.set('asr.useInterimResults', next.interim); } catch {}
  try { store.set('asr.filterFillers', next.fillerFilter); } catch {}
  try { store.set('asr.threshold', next.threshold); } catch {}
  try { store.set('asr.endpointMs', next.endpointingMs); } catch {}
  try { store.set('asr.manualAnchorAdoptEnabled', next.manualAnchorAdoptEnabled ?? true); } catch {}
  try { store.set('asrCalmModeEnabled', next.calmModeEnabled ?? false); } catch {}
}

export function initAsrPersistence(): void {
  if (initialized) return;
  initialized = true;

  const initialState = readInitialState();
  try {
    applySpeechStateFromOwner(initialState);
  } catch (err) {
    try { console.warn('[ASR] failed to hydrate settings from app store', err); } catch {}
  }

  try {
    speechStore.subscribe((state) => {
      if (bridgeMuted) return;
      syncToStore(state);
    });
  } catch (err) {
    try { console.warn('[ASR] failed to subscribe speech store bridge', err); } catch {}
  }
}
