// src/state/speech-store.ts
// App-store-backed speech settings facade for legacy readers.

import { getAppStore } from './appStore';

export type SpeechEngine = 'webspeech' | 'whisper' | 'vad' | string;

export interface SpeechState {
  engine: SpeechEngine;
  engineExplicit: boolean;
  lang: string;
  interim: boolean;
  threshold: number;
  endpointingMs: number;
  fillerFilter: boolean;
  manualAnchorAdoptEnabled: boolean;
  calmModeEnabled: boolean;
}

type Subscriber = (next: SpeechState) => void;

const STORE_KEYS = {
  engine: 'asr.engine',
  engineExplicit: 'asr.engineExplicit',
  lang: 'asr.language',
  interim: 'asr.useInterimResults',
  threshold: 'asr.threshold',
  endpointingMs: 'asr.endpointMs',
  fillerFilter: 'asr.filterFillers',
  manualAnchorAdoptEnabled: 'asr.manualAnchorAdoptEnabled',
  calmModeEnabled: 'asrCalmModeEnabled',
} as const;

const DEFAULT_STATE: SpeechState = {
  engine: 'whisper',
  engineExplicit: false,
  lang: 'en-US',
  interim: true,
  threshold: 0.6,
  endpointingMs: 700,
  fillerFilter: true,
  manualAnchorAdoptEnabled: true,
  calmModeEnabled: false,
};

const watchedKeys = Object.values(STORE_KEYS);
const subs = new Set<Subscriber>();
let fallbackState: SpeechState = { ...DEFAULT_STATE };
let subscribedStore: { subscribe?: (key: string, fn: (value: unknown) => void) => (() => void) | void } | null = null;
let unsubscribeStoreFns: Array<() => void> = [];
let suppressStoreNotifications = 0;

function getStore() {
  return getAppStore();
}

function notify(snapshot: SpeechState): void {
  for (const fn of subs) {
    try {
      fn(snapshot);
    } catch {
      // ignore bad subscribers
    }
  }
}

function readStateFromStore(): SpeechState {
  const store = getStore();
  if (!store || typeof store.get !== 'function') {
    return { ...fallbackState };
  }
  return {
    engine: (store.get(STORE_KEYS.engine as any) as SpeechEngine | undefined) ?? fallbackState.engine,
    engineExplicit: !!store.get(STORE_KEYS.engineExplicit as any),
    lang: (store.get(STORE_KEYS.lang as any) as string | undefined) ?? fallbackState.lang,
    interim: (store.get(STORE_KEYS.interim as any) as boolean | undefined) ?? fallbackState.interim,
    threshold: (store.get(STORE_KEYS.threshold as any) as number | undefined) ?? fallbackState.threshold,
    endpointingMs: (store.get(STORE_KEYS.endpointingMs as any) as number | undefined) ?? fallbackState.endpointingMs,
    fillerFilter: (store.get(STORE_KEYS.fillerFilter as any) as boolean | undefined) ?? fallbackState.fillerFilter,
    manualAnchorAdoptEnabled:
      (store.get(STORE_KEYS.manualAnchorAdoptEnabled as any) as boolean | undefined) ?? fallbackState.manualAnchorAdoptEnabled,
    calmModeEnabled:
      (store.get(STORE_KEYS.calmModeEnabled as any) as boolean | undefined) ?? fallbackState.calmModeEnabled,
  };
}

function ensureStoreSubscriptions(): void {
  const store = getStore();
  if (store === subscribedStore) return;

  unsubscribeStoreFns.forEach((unsub) => {
    try { unsub(); } catch {}
  });
  unsubscribeStoreFns = [];
  subscribedStore = store;

  if (!store || typeof store.subscribe !== 'function') {
    fallbackState = readStateFromStore();
    return;
  }

  let pendingInitial = watchedKeys.length;
  const handleChange = () => {
    fallbackState = readStateFromStore();
    if (pendingInitial > 0) {
      pendingInitial -= 1;
      return;
    }
    if (suppressStoreNotifications > 0) return;
    notify({ ...fallbackState });
  };

  unsubscribeStoreFns = watchedKeys.map((key) => {
    const unsub = store.subscribe?.(key, handleChange);
    return typeof unsub === 'function' ? unsub : () => {};
  });

  fallbackState = readStateFromStore();
}

export const speechStore = {
  get(): SpeechState {
    ensureStoreSubscriptions();
    fallbackState = readStateFromStore();
    return { ...fallbackState };
  },

  getState(): SpeechState {
    return this.get();
  },

  set(patch: Partial<SpeechState>): void {
    ensureStoreSubscriptions();
    const store = getStore();
    if (!store || typeof store.set !== 'function') {
      fallbackState = { ...fallbackState, ...patch };
      notify({ ...fallbackState });
      return;
    }

    suppressStoreNotifications += 1;
    try {
      if (Object.prototype.hasOwnProperty.call(patch, 'engine')) {
        store.set(STORE_KEYS.engine as any, patch.engine as SpeechState['engine']);
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'engineExplicit')) {
        store.set(STORE_KEYS.engineExplicit as any, !!patch.engineExplicit);
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'lang')) {
        store.set(STORE_KEYS.lang as any, patch.lang as string);
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'interim')) {
        store.set(STORE_KEYS.interim as any, !!patch.interim);
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'threshold')) {
        store.set(STORE_KEYS.threshold as any, patch.threshold as number);
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'endpointingMs')) {
        store.set(STORE_KEYS.endpointingMs as any, patch.endpointingMs as number);
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'fillerFilter')) {
        store.set(STORE_KEYS.fillerFilter as any, !!patch.fillerFilter);
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'manualAnchorAdoptEnabled')) {
        store.set(STORE_KEYS.manualAnchorAdoptEnabled as any, !!patch.manualAnchorAdoptEnabled);
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'calmModeEnabled')) {
        store.set(STORE_KEYS.calmModeEnabled as any, !!patch.calmModeEnabled);
      }
    } finally {
      suppressStoreNotifications = Math.max(0, suppressStoreNotifications - 1);
    }

    fallbackState = readStateFromStore();
    notify({ ...fallbackState });
  },

  subscribe(fn: Subscriber): () => void {
    ensureStoreSubscriptions();
    subs.add(fn);
    return () => subs.delete(fn);
  },
};
