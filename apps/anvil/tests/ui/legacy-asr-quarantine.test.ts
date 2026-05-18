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
    delete (window as any).__ASR_INIT_IMPL__;
    delete (window as any).__ASR_DIAGNOSTIC_PROOF__;
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

  test('initAsrFeature exposes runtime diagnostic smoke proof object', async () => {
    (window as any).__TP_BUILD_STAMP = 'asr-scroll-2026-05-18T22:07:18.976Z';
    (window as any).__TP_DEV = true;
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const mod = await import('../../src/index-hooks/asr');
    mod.initAsrFeature();

    expect((window as any).__ASR_INIT_IMPL__).toBe('asr.ts 2026-05-18b');
    expect((window as any).__ASR_DIAGNOSTIC_PROOF__).toEqual(
      expect.objectContaining({
        buildStamp: 'asr-scroll-2026-05-18T22:07:18.976Z',
        delayedAutopsyBuilderPresent: true,
        deadScreenAutopsyBuilderPresent: true,
        dumpPathProofPresent: true,
        initImpl: 'asr.ts 2026-05-18b',
      }),
    );
    expect(warn).toHaveBeenCalledWith('[ASR_INIT_IMPL] asr.ts 2026-05-18b');
  });
});
