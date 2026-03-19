describe('session ready script loading', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('falls back to alternate ready-script paths when the session path is stale', async () => {
    const readText = jest.fn(async (_workpieceId: string, path: string) => {
      if (path === 'script/old.md') return null;
      if (path === 'script/script.md') return '[s1]Loaded from canonical path.[/s1]';
      throw new Error(`Unexpected path: ${path}`);
    });

    const { readReadyScriptRecordContent } = await import('../../src/features/ready-script-loading');
    const record = await readReadyScriptRecordContent(
      {
        workpieceId: 'workpiece-1',
        path: 'script/old.md',
        primaryPath: 'script/script.md',
        scriptPaths: ['script/old.md', 'script/script.md'],
      },
      readText,
    );

    expect(record).toBe('[s1]Loaded from canonical path.[/s1]');
    expect(readText).toHaveBeenCalledTimes(2);
  });

  it('does not return an empty placeholder when every ready-script read fails', async () => {
    const readText = jest.fn(async () => null);
    const { readReadyScriptRecordContent } = await import('../../src/features/ready-script-loading');
    const record = await readReadyScriptRecordContent(
      {
        workpieceId: 'workpiece-2',
        path: 'script/script.md',
        primaryPath: 'script/script.md',
        scriptPaths: ['script/script.md'],
      },
      readText,
    );

    expect(record).toBeNull();
    expect(readText).toHaveBeenCalledTimes(1);
  });
});
