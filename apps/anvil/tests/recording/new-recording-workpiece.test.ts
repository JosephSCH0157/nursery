/** @jest-environment jsdom */

const fetchAuthenticatedTongs = jest.fn();
jest.mock('../../src/forge/tongs-user-auth', () => ({ fetchAuthenticatedTongs: (...args: unknown[]) => fetchAuthenticatedTongs(...args) }));

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const WORKPIECE_ID = '22222222-2222-4222-8222-222222222222';

describe('Anvil explicit New recording workpiece', () => {
  beforeEach(() => {
    jest.resetModules();
    fetchAuthenticatedTongs.mockReset();
    document.body.innerHTML = '<input id="scriptTitle"><textarea id="editor"></textarea><main id="viewer"><div id="script"></div></main>';
    window.history.replaceState({}, '', `/?workspace_id=${WORKSPACE_ID}`);
    localStorage.clear();
    sessionStorage.clear();
    delete (window as any).__forgeCanonicalScriptIdentity;
    delete (window as any).__forgeCanonicalReadyScript;
  });

  test('preserves ephemeral pasted text across canonical route rebinding without script persistence', async () => {
    (document.getElementById('editor') as HTMLTextAreaElement).value = 'Twenty minutes of temporary teleprompter guidance.';
    document.getElementById('script')!.innerHTML = '<p>Twenty minutes of temporary teleprompter guidance.</p>';
    (document.getElementById('scriptTitle') as HTMLInputElement).value = 'Local title hint';
    (document.getElementById('viewer') as HTMLElement).scrollTop = 240;
    (window as any).__forgeCanonicalScriptIdentity = { workspaceId: WORKSPACE_ID, workpieceId: '33333333-3333-4333-8333-333333333333' };
    (window as any).__forgeCanonicalReadyScript = { workpieceId: '33333333-3333-4333-8333-333333333333' };
    fetchAuthenticatedTongs.mockResolvedValue({ ok: true, json: async () => ({ data: { outcome: 'created', workpiece_id: WORKPIECE_ID } }) });

    const { createNewRecordingWorkpiece } = await import('../../src/features/new-recording-workpiece');
    await expect(createNewRecordingWorkpiece("Brad's Brilliant Idea", 'recording-workpiece:anvil:stable-operation')).resolves.toEqual({ outcome: 'created', workpiece_id: WORKPIECE_ID });

    expect((document.getElementById('editor') as HTMLTextAreaElement).value).toContain('temporary teleprompter guidance');
    expect(document.getElementById('script')!.textContent).toContain('temporary teleprompter guidance');
    expect((document.getElementById('scriptTitle') as HTMLInputElement).value).toBe('Local title hint');
    expect((document.getElementById('viewer') as HTMLElement).scrollTop).toBe(240);
    expect(new URLSearchParams(window.location.search).get('workpiece_id')).toBe(WORKPIECE_ID);
    expect((window as any).__forgeCanonicalScriptIdentity).toBeUndefined();
    expect((window as any).__forgeCanonicalReadyScript).toBeUndefined();
    expect(fetchAuthenticatedTongs).toHaveBeenCalledTimes(1);
    expect(fetchAuthenticatedTongs.mock.calls[0]![0]).toContain('/recording-workpieces');
    expect(String(fetchAuthenticatedTongs.mock.calls[0]![1]?.body)).not.toMatch(/script|ready|approval/i);
  });

  test('initializing New on an existing workpiece performs no canonical mutation', async () => {
    document.body.innerHTML += '<button id="scriptRefreshBtn"></button>';
    window.history.replaceState({}, '', `/?workspace_id=${WORKSPACE_ID}&workpiece_id=${WORKPIECE_ID}`);
    const { initNewRecordingWorkpieceEntry } = await import('../../src/features/new-recording-workpiece');
    initNewRecordingWorkpieceEntry();
    expect(document.getElementById('newRecordingWorkpieceBtn')).not.toBeNull();
    expect(fetchAuthenticatedTongs).not.toHaveBeenCalled();
  });

  test('rejects a blank title before any canonical request', async () => {
    const { createNewRecordingWorkpiece } = await import('../../src/features/new-recording-workpiece');
    await expect(createNewRecordingWorkpiece('   ')).rejects.toThrow('invalid_episode_title');
    expect(fetchAuthenticatedTongs).not.toHaveBeenCalled();
  });

  test('reuses the pending operation key after an ambiguous creation response', async () => {
    fetchAuthenticatedTongs
      .mockRejectedValueOnce(new Error('network_lost'))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { outcome: 'existing', workpiece_id: WORKPIECE_ID } }) });
    const { createNewRecordingWorkpiece } = await import('../../src/features/new-recording-workpiece');
    await expect(createNewRecordingWorkpiece('Retry-safe recording')).rejects.toThrow('network_lost');
    const firstBody = JSON.parse(String(fetchAuthenticatedTongs.mock.calls[0]![1]?.body));
    await expect(createNewRecordingWorkpiece('Retry-safe recording')).resolves.toMatchObject({ outcome: 'existing' });
    const secondBody = JSON.parse(String(fetchAuthenticatedTongs.mock.calls[1]![1]?.body));
    expect(secondBody.operation_key).toBe(firstBody.operation_key);
  });
});
