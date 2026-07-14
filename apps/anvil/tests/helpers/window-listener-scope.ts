export function captureWindowListeners(): () => void {
  const added: Array<{ type: string; listener: EventListenerOrEventListenerObject; options?: boolean | AddEventListenerOptions }> = [];
  const originalAdd = window.addEventListener.bind(window);
  const originalRemove = window.removeEventListener.bind(window);
  const spy = jest.spyOn(window, 'addEventListener').mockImplementation((type, listener, options) => {
    added.push({ type, listener, options });
    originalAdd(type, listener, options);
  });
  return () => {
    for (const entry of added.splice(0).reverse()) {
      try { originalRemove(entry.type, entry.listener, entry.options); } catch {}
    }
    spy.mockRestore();
  };
}

export function captureConsoleMethods(): () => void {
  const methods = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    debug: console.debug,
  };
  return () => {
    console.log = methods.log;
    console.info = methods.info;
    console.warn = methods.warn;
    console.debug = methods.debug;
  };
}
