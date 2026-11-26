test('compatibility connection status is authenticated bridge status and enabling never records', async () => {
  jest.resetModules();
  let connected = false;
  const start = jest.fn();
  const bridge = { connect: jest.fn(async () => connected), isConnected: () => connected,
    setArmed: jest.fn(), maybeConnect: jest.fn(async () => connected), disconnect: jest.fn(() => { connected = false; }), start };
  (window as any).__obsBridge = bridge;
  const compat = await import('../../recorders-bridge-compat');
  const onStatus = jest.fn();
  compat.init({ onStatus });
  expect(onStatus).toHaveBeenCalledWith('disconnected', false);
  await expect(compat.connect()).resolves.toBe(false); expect(compat.isConnected()).toBe(false);
  await compat.setEnabled(true); expect(start).not.toHaveBeenCalled();
  connected = true; await expect(compat.connect()).resolves.toBe(true); expect(compat.isConnected()).toBe(true);
  await compat.disconnect(); expect(bridge.disconnect).toHaveBeenCalled(); expect(compat.isConnected()).toBe(false);
  delete (window as any).__obsBridge;
});
