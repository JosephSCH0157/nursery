type DirectoryApi = {
  init?: () => Promise<void>;
  get?: () => FileSystemDirectoryHandle | null;
  isManaged?: () => boolean;
  localPersistenceExpected?: () => boolean;
  managedHint?: () => string | null;
};
export type LocalDestination = { handle: FileSystemDirectoryHandle | null; expected: boolean; hint: string | null };
export type LocalWriteResult = LocalDestination & { success: boolean; errorCode: string | null; errorMessage: string | null };

export async function resolveLocalRecordingDestination(): Promise<LocalDestination> {
  const api = (window as any).__tpRecDir as DirectoryApi | undefined;
  if (!api) throw new Error('Recording destination unavailable. Link the recording folder through Hearth and reopen Anvil.');
  await api.init?.();
  const handle = api.get?.() ?? null;
  const managed = !!api.isManaged?.();
  const expected = managed ? (api.localPersistenceExpected?.() ?? true) : !!handle;
  const hint = api.managedHint?.() || handle?.name || null;
  return { handle, expected, hint };
}

export async function requireLocalRecordingDestination(): Promise<LocalDestination> {
  const destination = await resolveLocalRecordingDestination();
  if (!destination.expected) return destination;
  if (!destination.handle) throw new Error('The Hearth recording folder is unavailable. Relink it in Hearth before recording.');
  const handle = destination.handle as FileSystemDirectoryHandle & {
    queryPermission?: (options: { mode: string }) => Promise<string>;
    requestPermission?: (options: { mode: string }) => Promise<string>;
  };
  if (handle.queryPermission && await handle.queryPermission({ mode: 'readwrite' }) !== 'granted') {
    if (!handle.requestPermission || await handle.requestPermission({ mode: 'readwrite' }) !== 'granted') {
      throw new Error('Recording folder permission denied. Grant access through Hearth before recording.');
    }
  }
  return destination;
}

export async function writeLocalRecording(bytes: Uint8Array, name: string, capturedDestination?: LocalDestination): Promise<LocalWriteResult> {
  let destination: LocalDestination = { handle: null, expected: true, hint: null };
  let stage = 'directory_resolution_failed';
  let writable: FileSystemWritableFileStream | null = null;
  try {
    destination = capturedDestination ?? await resolveLocalRecordingDestination();
    if (!destination.handle) return { ...destination, success: false, errorCode: destination.expected ? 'missing_directory_handle' : null, errorMessage: destination.expected ? 'The Hearth recording folder is unavailable. Relink it in Hearth and retry local save.' : null };
    stage = 'directory_permission_not_granted';
    const handle = destination.handle as any;
    if (handle.queryPermission && await handle.queryPermission({ mode: 'readwrite' }) !== 'granted') {
      throw new Error('Recording folder permission is not granted. Relink it in Hearth and retry local save.');
    }
    stage = 'directory_file_creation_failed';
    const file = await handle.getFileHandle(name, { create: true });
    stage = 'directory_writable_open_failed';
    writable = await file.createWritable();
    stage = 'directory_write_failed';
    await writable!.write(bytes as any);
    stage = 'directory_close_failed';
    await writable!.close();
    return { ...destination, success: true, errorCode: null, errorMessage: null };
  } catch (error) {
    try { await writable?.abort(); } catch {}
    return { ...destination, success: false, errorCode: stage, errorMessage: (error as Error).message };
  }
}
