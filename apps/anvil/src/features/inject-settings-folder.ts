/**
 * Dev/CI helper: ensure Settings shows a mapped folder row and log a marker for smoke runs.
 */
function shouldLogSettingsMappedFolderSmoke(): boolean {
  try {
    const w = window as any;
    if (w.__tpSettingsMappedFolderDebug === true) return true;
    const params = new URLSearchParams(window.location.search || '');
    return params.get('settingsMappedFolderDebug') === '1';
  } catch {
    return false;
  }
}

export function injectSettingsFolderForSmoke(): void {
  try {
    const root = document.getElementById('settingsBody') || document;
    const row = root.querySelector<HTMLElement>('[data-ci="mapped-folder-row"]');
    const nameEl = root.querySelector<HTMLElement>('#settingsMappedFolderName');
    const shouldLog = shouldLogSettingsMappedFolderSmoke();

    if (!row || !nameEl) {
      // Matches existing smoke harness log string.
      if (shouldLog) console.log('[settings-mapped-folder:smoke]', { exists: false });
      return;
    }

    if (!nameEl.textContent || !nameEl.textContent.trim()) {
      nameEl.textContent = 'CI_MOCK_FOLDER';
    }

    if (shouldLog) console.log('[settings-mapped-folder:smoke]', { exists: true, name: nameEl.textContent });
  } catch (e) {
    if (shouldLogSettingsMappedFolderSmoke()) console.warn('[settings-mapped-folder:smoke:error]', e);
  }
}

export default injectSettingsFolderForSmoke;
