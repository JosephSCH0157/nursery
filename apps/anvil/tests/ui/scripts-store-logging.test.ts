/** @jest-environment jsdom */

describe('script-store logging gating', () => {
  beforeEach(() => {
    jest.resetModules();
    localStorage.clear();
    delete (window as any).__tpScriptSyncDebug;
    window.history.replaceState({}, '', '/');
  });

  test('unchanged sync does not emit repeated SCRIPT-STORE logs by default', async () => {
    jest.doMock('../../src/forge/ready-scripts', () => ({
      readReadyScriptText: jest.fn(async () => ''),
    }));
    jest.doMock('../../src/features/ready-script-loading', () => ({
      hasUsableReadyScriptContent: jest.fn((text: string) => !!String(text || '').trim()),
      readReadyScriptRecordContent: jest.fn(async () => ''),
    }));

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});
    const { ScriptStore } = await import('../../src/features/scripts-store');

    const readyEntries = [
      {
        id: 'script-1',
        title: 'Script One',
        updatedAt: '2026-05-30T00:00:00.000Z',
        path: '/scripts/script-1.md',
        markedReadyBy: 'tester',
      },
    ] as any;

    ScriptStore.syncReady(readyEntries);
    ScriptStore.syncMapped([] as any);
    logSpy.mockClear();
    debugSpy.mockClear();

    for (let i = 0; i < 50; i += 1) {
      ScriptStore.syncReady(readyEntries);
      ScriptStore.syncMapped([] as any);
    }

    const scriptStoreLogCalls = [
      ...logSpy.mock.calls,
      ...debugSpy.mock.calls,
    ].filter((call) => String(call[0] || '').includes('[SCRIPT-STORE]') || String(call[0] || '').includes('script-store:sync'));

    expect(scriptStoreLogCalls).toHaveLength(0);
  });
});
