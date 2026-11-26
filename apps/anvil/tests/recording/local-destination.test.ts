import { requireLocalRecordingDestination, writeLocalRecording } from '../../src/recording/local-destination';

function destination(handle: any, expected = true) {
  (window as any).__tpRecDir = { init: jest.fn(async () => {}), get: () => handle, isManaged: () => true,
    localPersistenceExpected: () => expected, managedHint: () => 'Hearth folder' };
}
afterEach(() => { delete (window as any).__tpRecDir; });

test('writes the authorized Hearth directory and waits for writable close', async () => {
  const write = jest.fn(async () => {}); const close = jest.fn(async () => {});
  const getFileHandle = jest.fn(async () => ({ createWritable: async () => ({ write, close }) }));
  destination({ queryPermission: async () => 'granted', getFileHandle });
  await requireLocalRecordingDestination();
  const bytes = new Uint8Array([1, 2, 3]);
  await expect(writeLocalRecording(bytes, 'take.webm')).resolves.toMatchObject({ success: true, expected: true });
  expect(getFileHandle).toHaveBeenCalledWith('take.webm', { create: true });
  expect(write).toHaveBeenCalledWith(bytes); expect(close).toHaveBeenCalledTimes(1);
});
test('missing managed destination blocks capture without download or alternate directory', async () => {
  destination(null);
  await expect(requireLocalRecordingDestination()).rejects.toThrow('Relink');
  await expect(writeLocalRecording(new Uint8Array([1]), 'take.webm')).resolves.toMatchObject({ success: false, errorCode: 'missing_directory_handle' });
});
test('denied permission cannot create a file and does not request permission during finalization', async () => {
  const getFileHandle = jest.fn(); const requestPermission = jest.fn(async () => 'denied');
  destination({ queryPermission: async () => 'denied', requestPermission, getFileHandle });
  await expect(requireLocalRecordingDestination()).rejects.toThrow('permission denied');
  requestPermission.mockClear();
  await expect(writeLocalRecording(new Uint8Array([1]), 'take.webm')).resolves.toMatchObject({ success: false, errorCode: 'directory_permission_not_granted' });
  expect(getFileHandle).not.toHaveBeenCalled(); expect(requestPermission).not.toHaveBeenCalled();
});
test('failed close is not successful local finalization', async () => {
  const abort = jest.fn(async () => {});
  destination({ getFileHandle: async () => ({ createWritable: async () => ({ write: async () => {}, close: async () => { throw new Error('disk full'); }, abort }) }) });
  await expect(writeLocalRecording(new Uint8Array([1]), 'take.webm')).resolves.toMatchObject({ success: false, errorCode: 'directory_close_failed' });
  expect(abort).toHaveBeenCalled();
});
test('cloud-only configuration does not invent a local destination', async () => {
  destination(null, false);
  await expect(requireLocalRecordingDestination()).resolves.toMatchObject({ expected: false, handle: null });
  await expect(writeLocalRecording(new Uint8Array([1]), 'take.webm')).resolves.toMatchObject({ success: false, expected: false, errorCode: null });
});

test('capture uses its authorized directory snapshot when workspace settings change', async () => {
  const firstWrite = jest.fn(async () => {}); const secondWrite = jest.fn(async () => {});
  const handle = (write: jest.Mock) => ({ getFileHandle: async () => ({ createWritable: async () => ({ write, close: async () => {} }) }) });
  destination(handle(firstWrite));
  const captured = await requireLocalRecordingDestination();
  destination(handle(secondWrite));
  await writeLocalRecording(new Uint8Array([1]), 'take.webm', captured);
  expect(firstWrite).toHaveBeenCalledTimes(1); expect(secondWrite).not.toHaveBeenCalled();
});
