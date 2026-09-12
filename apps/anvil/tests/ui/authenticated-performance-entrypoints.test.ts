/** @jest-environment jsdom */

export {};

const dispatchAuthenticatedCanonicalScript: jest.Mock = jest.fn(async () => ({ outcome: 'legacy-applied' }));
const applyScript = jest.fn();
const getScript = jest.fn();
const getReadyReference = jest.fn();

jest.mock('../../src/script/authenticated-performance-dispatcher', () => ({ dispatchAuthenticatedCanonicalScript }));
jest.mock('../../src/features/apply-script', () => ({ applyScript }));
jest.mock('../../src/features/scripts-store', () => ({
  ScriptStore: { get: getScript, getReadyReference },
}));
jest.mock('../../src/state/app-store', () => ({ appStore: { get: () => 'step' } }));
jest.mock('../../src/forge/workpiece-context', () => ({ persistActiveWorkpieceFromScriptId: jest.fn() }));

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const WORKPIECE_ID = '22222222-2222-4222-8222-222222222222';
const HASH = 'a'.repeat(64);

describe('HA-4D2 authenticated entrypoint wiring', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    delete (window as any).__forgeCanonicalScriptIdentity;
    delete (window as any).__forgeCanonicalReadyScript;
  });

  test('ready-script selection supplies exact canonical authority to the dispatcher', async () => {
    getScript.mockResolvedValue({ id: 'ready-1', title: 'Ready', content: '[s1]\nReady words.\n[/s1]\n', source: 'ready' });
    getReadyReference.mockReturnValue({
      id: 'ready-1', title: 'Ready', workspaceId: WORKSPACE_ID, workpieceId: WORKPIECE_ID,
      path: 'script/script.md', scriptRevision: 9, scriptHash: HASH, transitionId: '44444444-4444-4444-8444-444444444444',
    });
    const { loadScriptById } = await import('../../src/features/script-selection');
    await expect(loadScriptById('ready-1')).resolves.toBe(true);
    expect(dispatchAuthenticatedCanonicalScript).toHaveBeenCalledWith(expect.objectContaining({
      source: 'ready-script', authenticated: true,
      canonicalIdentity: expect.objectContaining({ scriptRevision: 9, scriptHash: HASH }),
    }));
    const readyCall = dispatchAuthenticatedCanonicalScript.mock.calls[0][0];
    expect(Array.from(readyCall.canonicalUtf8Bytes)).toEqual(Array.from(new TextEncoder().encode('[s1]\nReady words.\n[/s1]\n')));
  });

  test('mapped selection is explicitly non-authoritative and cannot activate projection', async () => {
    getScript.mockResolvedValue({ id: 'mapped-1', title: 'Mapped', content: 'Mapped words.', source: 'mapped' });
    getReadyReference.mockReturnValue(null);
    dispatchAuthenticatedCanonicalScript.mockResolvedValueOnce({ outcome: 'rejected', code: 'AUTHENTICATED_SOURCE_REQUIRED' });
    const { loadScriptById } = await import('../../src/features/script-selection');
    await expect(loadScriptById('mapped-1')).resolves.toBe(false);
    expect(dispatchAuthenticatedCanonicalScript).toHaveBeenCalledWith(expect.objectContaining({
      source: 'non-authoritative', authenticated: false, canonicalIdentity: null, canonicalUtf8Bytes: null,
    }));
    expect(applyScript).not.toHaveBeenCalled();
  });

  test('ready projection rejection restores the authority that belongs to the old presentation', async () => {
    const oldIdentity = { workpieceId: 'old-workpiece', scriptRevision: 3, scriptHash: 'b'.repeat(64) };
    const oldReady = { id: 'old-ready' };
    (window as any).__forgeCanonicalScriptIdentity = oldIdentity;
    (window as any).__forgeCanonicalReadyScript = oldReady;
    getScript.mockImplementation(async () => {
      (window as any).__forgeCanonicalScriptIdentity = { workpieceId: WORKPIECE_ID, scriptRevision: 9, scriptHash: HASH };
      (window as any).__forgeCanonicalReadyScript = { id: 'ready-1' };
      return { id: 'ready-1', title: 'Ready', content: '[s1]\nReady words.\n[/s1]\n', source: 'ready' };
    });
    getReadyReference.mockReturnValue({
      id: 'ready-1', title: 'Ready', workspaceId: WORKSPACE_ID, workpieceId: WORKPIECE_ID,
      path: 'script/script.md', scriptRevision: 9, scriptHash: HASH, transitionId: '44444444-4444-4444-8444-444444444444',
    });
    dispatchAuthenticatedCanonicalScript.mockResolvedValueOnce({ outcome: 'rejected', code: 'PROJECTION_ACTIVATION_FAILED' });
    const { loadScriptById } = await import('../../src/features/script-selection');
    await expect(loadScriptById('ready-1')).resolves.toBe(false);
    expect((window as any).__forgeCanonicalScriptIdentity).toBe(oldIdentity);
    expect((window as any).__forgeCanonicalReadyScript).toBe(oldReady);
  });

  test('direct authenticated Tongs handoff seam supplies exact canonical identity, text, and bytes', async () => {
    const { dispatchAuthenticatedWorkpieceScript } = await import('../../src/forge/workpiece-performance-entrypoint');
    await dispatchAuthenticatedWorkpieceScript({
      canonicalIdentity: {
        workspaceId: WORKSPACE_ID, workpieceId: WORKPIECE_ID, path: 'script/script.md', scriptRevision: 11, scriptHash: HASH,
      },
      canonicalText: '[s1]\nTongs words.\n[/s1]\n', scrollMode: 'step', legacyApply: applyScript,
    });
    expect(dispatchAuthenticatedCanonicalScript).toHaveBeenCalledWith(expect.objectContaining({
      source: 'workpiece-handoff', authenticated: true,
      canonicalIdentity: expect.objectContaining({ scriptRevision: 11, scriptHash: HASH }),
      canonicalText: '[s1]\nTongs words.\n[/s1]\n',
    }));
    const tongsCall = dispatchAuthenticatedCanonicalScript.mock.calls[0][0];
    expect(Array.from(tongsCall.canonicalUtf8Bytes)).toEqual(Array.from(new TextEncoder().encode('[s1]\nTongs words.\n[/s1]\n')));
  });
});
