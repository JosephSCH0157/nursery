import { getNurseryManagedDirectory } from '../../src/forge/nursery-mounts';

type VaultRecord = { key: string; handle: FileSystemDirectoryHandle };

function installVault(records: VaultRecord[] = [], openError?: Error): jest.Mock {
  const byKey = new Map(records.map((record) => [record.key, record]));
  const get = jest.fn((key: string) => {
    const request: any = {};
    queueMicrotask(() => {
      request.result = byKey.get(key);
      request.onsuccess?.({ target: request });
    });
    return request;
  });
  const open = jest.fn(() => {
    const request: any = {};
    queueMicrotask(() => {
      if (openError) {
        request.error = openError;
        request.onerror?.({ target: request });
        return;
      }
      request.result = {
        objectStoreNames: { contains: () => true },
        transaction: () => ({ objectStore: () => ({ get }) }),
      };
      request.onsuccess?.({ target: request });
    });
    return request;
  });
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    value: { open },
  });
  return get;
}

function setRegistry(mounts: unknown[]): void {
  localStorage.setItem('forge_mount_registry_v2', JSON.stringify({
    workspaceId: 'workspace-1',
    mounts,
  }));
}

describe('Nursery managed directory resolution', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('cloud-canonical Recordings resolves the enabled recordings:mirror handle before a stale local handle', async () => {
    const localHandle = { name: 'OldLocal' } as FileSystemDirectoryHandle;
    const mirrorHandle = { name: 'ConfiguredRecordings' } as FileSystemDirectoryHandle;
    const get = installVault([
      { key: 'mount:workspace-1:recordings:local', handle: localHandle },
      { key: 'mount:workspace-1:recordings:mirror', handle: mirrorHandle },
    ]);
    setRegistry([{
      role: 'recordings',
      target: 'tongs_cloud',
      local: { vaultKey: 'mount:workspace-1:recordings:local', hint: 'OldLocal' },
      mirror: {
        enabled: true,
        vaultKey: 'mount:workspace-1:recordings:mirror',
        hint: 'ConfiguredRecordings',
      },
    }]);

    await expect(getNurseryManagedDirectory('recordings')).resolves.toEqual(expect.objectContaining({
      managed: true,
      localPersistenceExpected: true,
      vaultKey: 'mount:workspace-1:recordings:mirror',
      hint: 'ConfiguredRecordings',
      handle: mirrorHandle,
    }));
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('mount:workspace-1:recordings:mirror');
  });

  test('cloud-canonical Recordings with its mirror disabled does not resolve either stored local handle', async () => {
    const get = installVault([
      { key: 'mount:workspace-1:recordings:local', handle: { name: 'OldLocal' } as FileSystemDirectoryHandle },
      { key: 'mount:workspace-1:recordings:mirror', handle: { name: 'DisabledMirror' } as FileSystemDirectoryHandle },
    ]);
    setRegistry([{
      role: 'recordings',
      target: 'tongs_cloud',
      local: { vaultKey: 'mount:workspace-1:recordings:local' },
      mirror: { enabled: false, vaultKey: 'mount:workspace-1:recordings:mirror' },
    }]);

    await expect(getNurseryManagedDirectory('recordings')).resolves.toEqual(expect.objectContaining({
      managed: true,
      localPersistenceExpected: false,
      handle: null,
    }));
    expect(get).not.toHaveBeenCalled();
  });

  test('enabled cloud-canonical Recordings reports a missing mirror handle without falling back to recordings:local', async () => {
    const get = installVault([
      { key: 'mount:workspace-1:recordings:local', handle: { name: 'OldLocal' } as FileSystemDirectoryHandle },
    ]);
    setRegistry([{
      role: 'recordings',
      target: 'tongs_cloud',
      local: { vaultKey: 'mount:workspace-1:recordings:local' },
      mirror: { enabled: true, hint: 'ConfiguredRecordings' },
    }]);

    await expect(getNurseryManagedDirectory('recordings')).resolves.toEqual(expect.objectContaining({
      localPersistenceExpected: true,
      vaultKey: 'mount:workspace-1:recordings:mirror',
      hint: 'ConfiguredRecordings',
      handle: null,
    }));
    expect(get).toHaveBeenCalledWith('mount:workspace-1:recordings:mirror');
    expect(get).not.toHaveBeenCalledWith('mount:workspace-1:recordings:local');
  });

  test('an inaccessible handle vault is reported as an unavailable enabled mirror without throwing', async () => {
    installVault([], new Error('IndexedDB unavailable for this origin'));
    setRegistry([{
      role: 'recordings',
      target: 'tongs_cloud',
      mirror: {
        enabled: true,
        vaultKey: 'mount:workspace-1:recordings:mirror',
        hint: 'ConfiguredRecordings',
      },
    }]);

    await expect(getNurseryManagedDirectory('recordings')).resolves.toEqual(expect.objectContaining({
      localPersistenceExpected: true,
      vaultKey: 'mount:workspace-1:recordings:mirror',
      hint: 'ConfiguredRecordings',
      handle: null,
    }));
  });

  test('local-canonical Recordings and cloud-mirrored Scripts retain their existing bindings', async () => {
    const recordingsHandle = { name: 'LocalRecordings' } as FileSystemDirectoryHandle;
    const scriptsHandle = { name: 'MirroredScripts' } as FileSystemDirectoryHandle;
    installVault([
      { key: 'mount:workspace-1:recordings:local', handle: recordingsHandle },
      { key: 'mount:workspace-1:scripts:mirror', handle: scriptsHandle },
    ]);
    setRegistry([
      {
        role: 'recordings',
        target: 'local',
        local: { vaultKey: 'mount:workspace-1:recordings:local', hint: 'LocalRecordings' },
      },
      {
        role: 'scripts',
        target: 'tongs_cloud',
        mirror: { enabled: true, vaultKey: 'mount:workspace-1:scripts:mirror', hint: 'MirroredScripts' },
      },
    ]);

    await expect(getNurseryManagedDirectory('recordings')).resolves.toEqual(expect.objectContaining({
      vaultKey: 'mount:workspace-1:recordings:local',
      handle: recordingsHandle,
    }));
    await expect(getNurseryManagedDirectory('scripts')).resolves.toEqual(expect.objectContaining({
      vaultKey: 'mount:workspace-1:scripts:mirror',
      handle: scriptsHandle,
    }));
  });
});
