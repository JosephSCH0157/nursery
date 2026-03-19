/** @jest-environment jsdom */

describe('runtime ASR control', () => {
  beforeEach(() => {
    jest.resetModules();
    delete (window as any).__tpGetActiveRecognizer;
    delete (window as any).__tpRecognizer;
    delete (window as any).recog;
    delete (window as any).__tpSpeech;
  });

  test('stops the live recognizer before falling back to the legacy namespace stop', async () => {
    const activeRecognizer = { abort: jest.fn(), stop: jest.fn() };
    const namespaceRecognizer = { abort: jest.fn(), stop: jest.fn() };
    const globalRecognizer = { abort: jest.fn(), stop: jest.fn() };
    const stopRecognizer = jest.fn();

    (window as any).__tpGetActiveRecognizer = () => activeRecognizer;
    (window as any).__tpRecognizer = namespaceRecognizer;
    (window as any).recog = globalRecognizer;
    (window as any).__tpSpeech = { stopRecognizer };

    const { stopAsrRuntime } = await import('../../src/speech/runtime-control');

    stopAsrRuntime();

    expect(activeRecognizer.abort).toHaveBeenCalled();
    expect(activeRecognizer.stop).toHaveBeenCalled();
    expect(namespaceRecognizer.abort).toHaveBeenCalled();
    expect(namespaceRecognizer.stop).toHaveBeenCalled();
    expect(globalRecognizer.abort).toHaveBeenCalled();
    expect(globalRecognizer.stop).toHaveBeenCalled();
    expect(stopRecognizer).toHaveBeenCalled();
  });
});
