import {
  isAsrEngineExplicit,
  normalizePersistedAsrSelection,
} from '../features/asr/engine-selection';
import { withScrollModeWriter } from '../scroll/audit';
import type { AppStore } from '../state/app-store';
import type { SpeakerBindingsSettings } from '../types/speaker-profiles';
import {
  getSpeakerProfilesSnapshot,
  initSpeakerProfilesFromSettings,
  subscribeSpeakerProfileState,
} from '../ui/speaker-profiles-store';
import {
  applySettingsPatch,
  loadProfileSettings,
  saveProfileSettings,
  type PersistedAppKey,
  type UserSettings,
} from './authProfile';

type SettingsSaveState = 'idle' | 'saving' | 'saved' | 'failed';

type SettingsSaveStatus = {
  state: SettingsSaveState;
  at: number;
  error?: string;
};

type AsrHandshakeSummary = {
  engine?: string;
  lang?: string;
  profileName?: string;
  reason?: string;
};

type ProfileSettingsSyncOptions = {
  store: AppStore;
  settingsKeys: PersistedAppKey[];
  isCiMode?: boolean;
  devLog?: (...args: any[]) => void;
  isSettingsHydrating?: () => boolean;
  normalizeUiScrollMode: (mode: string | null | undefined) => string;
  isAsrOverlayActive: () => boolean;
};

type HydrateOptions = {
  loadRemote?: boolean;
  enablePersistence?: boolean;
  skipLogLabel?: string;
};

const SETTINGS_SAVE_DEBOUNCE_MS = 900;
const RECENT_CHANGE_WINDOW_MS = 10_000;

function areSettingsSnapshotsEqual(left: UserSettings, right: UserSettings): boolean {
  try {
    return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
  } catch {
    return false;
  }
}

export function createProfileSettingsSync(options: ProfileSettingsSyncOptions) {
  const {
    store,
    settingsKeys,
    isCiMode = false,
    devLog,
    isSettingsHydrating = () => false,
    normalizeUiScrollMode,
    isAsrOverlayActive,
  } = options;

  let profileHydrated = false;
  let profileRev = 0;
  let suppressSave = false;
  let saveTimer: number | null = null;
  let saving = false;
  let currentSettings: UserSettings = { app: {} };
  let lastUserChange = 0;
  let saveIndicatorTimer: number | null = null;
  let persistenceUserId: string | null = null;
  let settingsPersistenceInstalled = false;
  let speakerPersistenceInstalled = false;

  function log(...args: any[]) {
    try { devLog?.(...args); } catch {}
  }

  function setSettingsSaveStatus(status: SettingsSaveStatus) {
    try {
      store.set?.('settingsSaveStatus', status as any);
    } catch {}
  }

  function resolveActiveAsrProfileSummary(): string {
    try {
      const profiles = store.get?.('asrProfiles') as Record<string, any> | undefined;
      const active = (store.get?.('asrActiveProfileId') || '') as string;
      const candidate = active && profiles ? profiles[active] : null;
      if (candidate && typeof candidate === 'object') {
        return (candidate.label || candidate.name || active || 'default') as string;
      }
      return active || 'default';
    } catch {
      return 'default';
    }
  }

  function recordAsrApplied(reason?: string) {
    try {
      const summary: AsrHandshakeSummary = {
        engine: store.get?.('asr.engine') as string | undefined,
        lang: store.get?.('asr.language') as string | undefined,
        profileName: resolveActiveAsrProfileSummary(),
        reason,
      };
      store.set?.('asrLastAppliedAt', Date.now() as any);
      store.set?.('asrLastAppliedSummary', summary as any);
      store.set?.('asrLastApplyOk', true as any);
    } catch {}
  }

  function bindAsrAppliedListener() {
    try {
      const w = window as any;
      if (w.__tpProfileSettingsAsrAppliedBound) return;
      w.__tpProfileSettingsAsrAppliedBound = true;
      window.addEventListener('tp:asrChanged', () => {
        recordAsrApplied('asr-changed');
      });
    } catch {}
  }

  function ensureSettingsSavedDot(): HTMLElement | null {
    try {
      const btn = document.getElementById('settingsBtn');
      if (!btn) return null;
      btn.classList.add('tp-save-host');
      let dot = btn.querySelector<HTMLElement>('.tp-save-dot');
      if (!dot) {
        dot = document.createElement('span');
        dot.className = 'tp-save-dot';
        dot.setAttribute('aria-hidden', 'true');
        btn.appendChild(dot);
      }
      return dot;
    } catch {
      return null;
    }
  }

  function flashSettingsSaved() {
    try {
      const btn = document.getElementById('settingsBtn');
      const dot = ensureSettingsSavedDot();
      if (!btn || !dot) return;
      btn.classList.add('tp-save-flash');
      if (saveIndicatorTimer) {
        try { clearTimeout(saveIndicatorTimer); } catch {}
      }
      saveIndicatorTimer = window.setTimeout(() => {
        try { btn.classList.remove('tp-save-flash'); } catch {}
      }, 1600);
    } catch {}
  }

  function applySettingsToStore(settings: UserSettings): void {
    if (!settings || typeof settings !== 'object') return;
    const normalizedSettings = normalizePersistedAsrSelection(settings);
    const app = (normalizedSettings as any).app || {};
    log('hydrate:apply', { keys: Object.keys(app).length });
    suppressSave = true;
    try {
      settingsKeys.forEach((k) => {
        if (!Object.prototype.hasOwnProperty.call(app, k)) return;
        if (k === 'scrollMode') {
          let raw = '';
          let current = '';
          try {
            raw = normalizeUiScrollMode(String((app as any)[k] ?? '').trim().toLowerCase());
            current = normalizeUiScrollMode(store.get?.('scrollMode') as string | undefined);
            const engaged = isAsrOverlayActive();
            if (raw === 'asr' && current !== 'asr' && !engaged) {
              log('[ASR] hydrate skipped scrollMode override to asr', { raw, current, engaged });
              return;
            }
            if (raw !== 'asr' && engaged) {
              log('[ASR] hydrate skipped scrollMode override while engaged', { raw });
              return;
            }
          } catch {}
          try {
            withScrollModeWriter('state/app-store', () => {
              store.set?.('scrollMode' as any, raw as any);
            }, { source: 'hydrate', via: 'profile' });
          } catch {}
          return;
        }
        try { store.set?.(k as any, (app as any)[k]); } catch {}
      });
      currentSettings = applySettingsPatch(currentSettings || { app: {} }, normalizedSettings) || { app: {} };
      try {
        const asrSettings = (normalizedSettings as any).asrSettings;
        if (asrSettings && typeof asrSettings === 'object') {
          const mapping: Record<string, string> = {
            engine: 'asr.engine',
            engineExplicit: 'asr.engineExplicit',
            language: 'asr.language',
            useInterimResults: 'asr.useInterimResults',
            filterFillers: 'asr.filterFillers',
            threshold: 'asr.threshold',
            endpointingMs: 'asr.endpointMs',
            manualAnchorAdoptEnabled: 'asr.manualAnchorAdoptEnabled',
            calmModeEnabled: 'asrCalmModeEnabled',
          };
          Object.keys(mapping).forEach((src) => {
            const value = (asrSettings as any)[src];
            if (typeof value !== 'undefined') {
              try { store.set?.(mapping[src as keyof typeof mapping] as any, value as any); } catch {}
            }
          });
          try {
            store.set?.('asr.engineExplicit' as any, isAsrEngineExplicit((asrSettings as any).engineExplicit) as any);
          } catch {}
        } else {
          try { store.set?.('asr.engineExplicit' as any, false as any); } catch {}
        }

        const asrProfiles = (normalizedSettings as any).asrProfiles;
        if (Array.isArray(asrProfiles)) {
          const map: Record<string, unknown> = {};
          asrProfiles.forEach((profile) => {
            if (profile && typeof profile === 'object' && 'id' in profile) {
              map[(profile as any).id] = profile;
            }
          });
          try { store.set?.('asrProfiles', map); } catch {}
        }

        const speakerProfiles = (normalizedSettings as any).speakerProfiles;
        const speakerBindings = (normalizedSettings as any).speakerBindings as SpeakerBindingsSettings | undefined;
        if (Array.isArray(speakerProfiles) || speakerBindings) {
          initSpeakerProfilesFromSettings({
            profiles: Array.isArray(speakerProfiles)
              ? speakerProfiles.filter((profile) => profile && typeof profile === 'object')
              : undefined,
            bindings: speakerBindings,
            activeSlot: speakerBindings?.activeSlot,
          });
        }
      } catch {
        // ignore ASR hydrate issues
      }
      recordAsrApplied('hydrate');
    } catch {
      // ignore apply failures
    } finally {
      suppressSave = false;
    }
  }

  function snapshotAppSettings(): UserSettings {
    const app: Record<string, any> = {};
    settingsKeys.forEach((k) => {
      try { app[k] = store.get?.(k as any); } catch {}
    });
    const asrSettings = {
      engine: store.get?.('asr.engine'),
      language: store.get?.('asr.language'),
      useInterimResults: store.get?.('asr.useInterimResults'),
      filterFillers: store.get?.('asr.filterFillers'),
      threshold: store.get?.('asr.threshold'),
      endpointingMs: store.get?.('asr.endpointMs'),
      manualAnchorAdoptEnabled: store.get?.('asr.manualAnchorAdoptEnabled'),
      calmModeEnabled: store.get?.('asrCalmModeEnabled'),
      engineExplicit: !!store.get?.('asr.engineExplicit'),
    };
    const rawProfiles = store.get?.('asrProfiles') as Record<string, unknown> | undefined;
    const asrProfiles = rawProfiles ? Object.values(rawProfiles) : [];
    const speakerState = getSpeakerProfilesSnapshot();
    const speakerProfiles = speakerState.profiles;
    const speakerBindings: SpeakerBindingsSettings = {
      ...speakerState.bindings,
      activeSlot: speakerState.activeSlot,
    };
    return { app, asrSettings, asrProfiles, speakerProfiles, speakerBindings };
  }

  let speakerPersistenceHydrating = false;

  function queueProfileSave(): void {
    if (isCiMode) return;
    if (!persistenceUserId || !profileHydrated || suppressSave) return;
    if (speakerPersistenceHydrating) return;
    if (isSettingsHydrating()) return;
    if (saveTimer) {
      try { clearTimeout(saveTimer); } catch {}
    }
    log('save:queue');
    saveTimer = window.setTimeout(async () => {
      saveTimer = null;
      if (!persistenceUserId || saving) return;
      saving = true;
      try {
        const merged = snapshotAppSettings();
        if (areSettingsSnapshotsEqual(currentSettings, merged)) {
          log('save:skip-noop');
          return;
        }
        currentSettings = merged;
        setSettingsSaveStatus({ state: 'saving', at: Date.now() });
        const { rev } = await saveProfileSettings({
          userId: persistenceUserId,
          mergedSettings: merged,
          expectedRev: profileRev,
        });
        profileRev = rev;
        log('save:flushed', { rev });
        if (lastUserChange && Date.now() - lastUserChange <= RECENT_CHANGE_WINDOW_MS) {
          flashSettingsSaved();
        }
        setSettingsSaveStatus({ state: 'saved', at: Date.now() });
      } catch (err) {
        setSettingsSaveStatus({ state: 'failed', at: Date.now(), error: String(err) });
        try {
          const { settings, rev } = await loadProfileSettings(persistenceUserId);
          profileRev = rev;
          applySettingsToStore(settings);
          log('save:conflict-reloaded', { rev });
        } catch (errReload) {
          try {
            console.warn('[forge] settings save failed; reload also failed', err, errReload);
            log('save:conflict-reload-failed');
          } catch {}
        }
      } finally {
        saving = false;
      }
    }, SETTINGS_SAVE_DEBOUNCE_MS);
  }

  function installSettingsPersistence(userId: string): void {
    persistenceUserId = userId;
    if (settingsPersistenceInstalled) return;
    settingsPersistenceInstalled = true;
    try {
      const seenInit = new Set<string>();
      settingsKeys.forEach((k) => {
        store.subscribe?.(k as any, (_v: any) => {
          if (!profileHydrated || suppressSave) return;
          if (isSettingsHydrating()) return;
          if (!seenInit.has(k)) {
            seenInit.add(k);
            return;
          }
          lastUserChange = Date.now();
          currentSettings.app = currentSettings.app || {};
          (currentSettings.app as any)[k] = _v;
          queueProfileSave();
        });
      });
    } catch {}
  }

  function installSpeakerPersistence(userId: string): void {
    persistenceUserId = userId;
    if (speakerPersistenceInstalled) return;
    speakerPersistenceInstalled = true;
    let seenInit = false;
    speakerPersistenceHydrating = true;
    let lastSpeakerSnapshot: string | null = null;
    subscribeSpeakerProfileState((snapshot) => {
      if (!persistenceUserId) return;
      if (!profileHydrated || suppressSave) return;
      if (!seenInit) {
        seenInit = true;
        speakerPersistenceHydrating = false;
        return;
      }
      const serialized = (() => {
        try { return JSON.stringify(snapshot); } catch { return null; }
      })();
      if (serialized && serialized === lastSpeakerSnapshot) return;
      if (serialized) lastSpeakerSnapshot = serialized;
      lastUserChange = Date.now();
      queueProfileSave();
    });
  }

  async function hydrateForUser(userId: string, opts: HydrateOptions = {}): Promise<void> {
    persistenceUserId = userId;
    const { loadRemote = true, enablePersistence = true, skipLogLabel = 'hydrate:ci-skip' } = opts;
    if (loadRemote) {
      try {
        const { settings, rev } = await loadProfileSettings(userId);
        profileRev = rev;
        applySettingsToStore(settings);
        currentSettings = snapshotAppSettings();
        profileHydrated = true;
        log('hydrate:done', { rev });
      } catch (err) {
        try { console.warn('[forge] settings load failed; using defaults', err); } catch {}
        currentSettings = snapshotAppSettings();
        profileHydrated = true;
        log('hydrate:failed');
      }
    } else {
      currentSettings = snapshotAppSettings();
      profileHydrated = true;
      log(skipLogLabel);
    }

    if (enablePersistence) {
      installSettingsPersistence(userId);
      installSpeakerPersistence(userId);
    }
  }

  bindAsrAppliedListener();

  return {
    applySettingsToStore,
    snapshotAppSettings,
    hydrateForUser,
    isProfileHydrated(): boolean {
      return profileHydrated;
    },
    isSuppressingSave(): boolean {
      return suppressSave;
    },
  };
}
