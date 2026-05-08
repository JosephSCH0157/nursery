/** @jest-environment jsdom */

import type { createProfileSettingsSync as _createProfileSettingsSync } from '../../src/forge/profile-settings-sync';
import type { createProfile as _createProfile } from '../../src/ui/speaker-profiles-store';

describe('profile settings sync', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.useFakeTimers();
    jest.resetModules();
    jest.doMock('../../src/forge/authProfile', () => ({
      applySettingsPatch: (_base: unknown, patch: unknown) => patch,
      loadProfileSettings: jest.fn(),
      saveProfileSettings: jest.fn(),
    }));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  async function flushTimers(ms = 1000) {
    jest.advanceTimersByTime(ms);
    await Promise.resolve();
    await Promise.resolve();
  }

  test('snapshots extracted ASR settings through the sync module', () => {
    localStorage.setItem('tp_asr_engine_explicit_v1', '1');

    const { appStore } = require('../../src/state/app-store') as { appStore: any };
    const { createProfileSettingsSync } = require('../../src/forge/profile-settings-sync');

    appStore.set('asr.engine', 'webspeech');
    appStore.set('asr.manualAnchorAdoptEnabled', false);
    appStore.set('asr.threshold', 0.81);

    const sync = createProfileSettingsSync({
      store: appStore,
      settingsKeys: [
        'asr.engine',
        'asr.threshold',
        'asr.manualAnchorAdoptEnabled',
      ],
      normalizeUiScrollMode: (mode: string | null | undefined) => String(mode || 'hybrid'),
      isAsrOverlayActive: () => false,
    });

    const snapshot = sync.snapshotAppSettings();

    expect(snapshot.app?.['asr.engine']).toBe('webspeech');
    expect(snapshot.app?.['asr.threshold']).toBe(0.81);
    expect(snapshot.app?.['asr.manualAnchorAdoptEnabled']).toBe(false);
    expect(snapshot.asrSettings?.engine).toBe('webspeech');
    expect(snapshot.asrSettings?.threshold).toBe(0.81);
    expect(snapshot.asrSettings?.manualAnchorAdoptEnabled).toBe(false);
    expect(snapshot.asrSettings?.engineExplicit).toBe(true);
  });

  test('does not save immediately when speaker persistence is installed', async () => {
    const { appStore } = require('../../src/state/app-store') as { appStore: any };
    const authProfile = require('../../src/forge/authProfile') as {
      saveProfileSettings: jest.Mock;
    };
    const { createProfileSettingsSync } = require('../../src/forge/profile-settings-sync');

    const sync = createProfileSettingsSync({
      store: appStore,
      settingsKeys: [],
      normalizeUiScrollMode: (mode: string | null | undefined) => String(mode || 'hybrid'),
      isAsrOverlayActive: () => false,
    });

    await sync.hydrateForUser('user-1', { loadRemote: false, enablePersistence: true });
    await flushTimers();

    expect(authProfile.saveProfileSettings).not.toHaveBeenCalled();
  });

  test('saves after a speaker profile change', async () => {
    const { appStore } = require('../../src/state/app-store') as { appStore: any };
    const authProfile = require('../../src/forge/authProfile') as {
      saveProfileSettings: jest.Mock;
    };
    authProfile.saveProfileSettings.mockResolvedValue({ rev: 1 });
    const { createProfile } = require('../../src/ui/speaker-profiles-store');
    const { createProfileSettingsSync } = require('../../src/forge/profile-settings-sync');

    const sync = createProfileSettingsSync({
      store: appStore,
      settingsKeys: [],
      normalizeUiScrollMode: (mode: string | null | undefined) => String(mode || 'hybrid'),
      isAsrOverlayActive: () => false,
    });

    await sync.hydrateForUser('user-1', { loadRemote: false, enablePersistence: true });
    authProfile.saveProfileSettings.mockClear();

    createProfile('Host');
    await flushTimers();

    expect(authProfile.saveProfileSettings).toHaveBeenCalledTimes(1);
    expect(authProfile.saveProfileSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        expectedRev: 0,
        mergedSettings: expect.objectContaining({
          speakerProfiles: expect.arrayContaining([
            expect.objectContaining({ name: 'Host' }),
          ]),
        }),
      }),
    );
  });
});
