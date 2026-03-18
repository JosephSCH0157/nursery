describe('legacy ASR quarantine', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    jest.resetModules();
    (window as any).__TP_TS_PRIMARY__ = true;
    (window as any).__TP_BOOT_OWNER = 'ts:index';
    delete (window as any).__tpAllowLegacyAsrMode;
    delete (window as any).__TP_ALLOW_LEGACY_BOOT;
    delete (window as any).__tpAllowLegacyBoot;
    delete (window as any).__TP_LEGACY_ASR_BLOCKED__;
    localStorage.removeItem('tp_legacy');
  });

  afterEach(() => {
    document.body.innerHTML = '';
    delete (window as any).__TP_TS_PRIMARY__;
    delete (window as any).__TP_BOOT_OWNER;
    delete (window as any).__TP_LEGACY_ASR_BLOCKED__;
    jest.restoreAllMocks();
  });

  test('blocks legacy ASR init on the canonical runtime without explicit opt-in', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'info').mockImplementation(() => {});

    const mod = await import('../../src/index-hooks/asr-legacy');
    const result = mod.initAsrFeature();

    expect(result).toBe(false);
    expect(document.getElementById('asrChip')).toBeNull();
    expect((window as any).__TP_LEGACY_ASR_BLOCKED__).toBe(true);
    expect(warn).toHaveBeenCalled();
  });
});
