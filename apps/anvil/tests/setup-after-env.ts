const consoleBaselineKey = Symbol.for('forge.anvil.jest.consoleBaseline');

export {};

afterAll(() => {
  const baseline = (console as typeof console & Record<symbol, any>)[consoleBaselineKey];
  if (!baseline) return;
  console.log = baseline.log;
  console.info = baseline.info;
  console.warn = baseline.warn;
  console.debug = baseline.debug;
  console.error = baseline.error;
});
