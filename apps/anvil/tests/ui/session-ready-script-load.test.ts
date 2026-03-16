describe('session ready script loading', () => {
  beforeEach(() => {
    jest.resetModules();
    window.localStorage.clear();
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      writable: true,
      value: undefined,
    });
  });

  it('falls back to alternate ready-script paths when the session path is stale', async () => {
    const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('path=script%2Fold.md')) {
        return {
          ok: false,
          status: 404,
          json: async () => ({ ok: false }),
        };
      }
      if (url.includes('path=script%2Fscript.md')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, data: '[s1]Loaded from canonical path.[/s1]' }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      writable: true,
      value: fetchMock,
    });

    const { ScriptStore } = await import('../../src/features/scripts-store');
    const id = 'ready:workpiece-1:script/old.md';
    ScriptStore.syncReady([
      {
        id,
        workspaceId: 'workspace-1',
        workpieceId: 'workpiece-1',
        path: 'script/old.md',
        primaryPath: 'script/script.md',
        scriptPaths: ['script/old.md', 'script/script.md'],
        title: 'Episode One',
      },
    ]);

    const record = await ScriptStore.get(id);

    expect(record?.content).toBe('[s1]Loaded from canonical path.[/s1]');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not return an empty placeholder when every ready-script read fails', async () => {
    const fetchMock = jest.fn(async () => ({
      ok: false,
      status: 404,
      json: async () => ({ ok: false }),
    }));
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      writable: true,
      value: fetchMock,
    });

    const { ScriptStore } = await import('../../src/features/scripts-store');
    const id = 'ready:workpiece-2:script/script.md';
    ScriptStore.syncReady([
      {
        id,
        workspaceId: 'workspace-2',
        workpieceId: 'workpiece-2',
        path: 'script/script.md',
        primaryPath: 'script/script.md',
        scriptPaths: ['script/script.md'],
        title: 'Episode Two',
      },
    ]);

    const record = await ScriptStore.get(id);

    expect(record).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
