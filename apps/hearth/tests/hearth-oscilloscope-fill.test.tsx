import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { JSDOM } from "jsdom";
import OscilloscopeFill from "../src/routes/hearth-shell/OscilloscopeFill";

type AudioCounters = {
  contexts: number;
  sources: number;
  analysers: number;
  samples: number;
  sourceDisconnects: number;
  analyserDisconnects: number;
  closes: number;
};

function installOscilloscopeDom(): {
  container: HTMLElement;
  counters: AudioCounters;
  requestedFrames: Map<number, FrameRequestCallback>;
  cancelledFrames: number[];
  restore: () => void;
} {
  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", {
    url: "http://localhost/",
  });
  const runtime = globalThis as unknown as Record<string, unknown>;
  const names = [
    "window",
    "document",
    "navigator",
    "Node",
    "HTMLElement",
    "HTMLCanvasElement",
    "Event",
    "getComputedStyle",
    "ResizeObserver",
  ] as const;
  const previous = new Map<string, PropertyDescriptor | undefined>(
    names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]),
  );
  const counters: AudioCounters = {
    contexts: 0,
    sources: 0,
    analysers: 0,
    samples: 0,
    sourceDisconnects: 0,
    analyserDisconnects: 0,
    closes: 0,
  };
  const requestedFrames = new Map<number, FrameRequestCallback>();
  const cancelledFrames: number[] = [];
  let nextFrame = 1;

  class ResizeObserverMock {
    observe(): void {}
    disconnect(): void {}
  }

  const canvasContext = {
    lineWidth: 0,
    strokeStyle: "",
    clearRect(): void {},
    beginPath(): void {},
    moveTo(): void {},
    lineTo(): void {},
    stroke(): void {},
  };
  Object.defineProperty(dom.window.HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: () => canvasContext,
  });

  class AudioContextMock {
    constructor() {
      counters.contexts += 1;
    }

    createMediaStreamSource(): { connect: () => void; disconnect: () => void } {
      counters.sources += 1;
      return {
        connect: () => {},
        disconnect: () => { counters.sourceDisconnects += 1; },
      };
    }

    createAnalyser(): {
      fftSize: number;
      smoothingTimeConstant: number;
      getByteTimeDomainData: (data: Uint8Array) => void;
      disconnect: () => void;
    } {
      counters.analysers += 1;
      return {
        fftSize: 1024,
        smoothingTimeConstant: 0,
        getByteTimeDomainData: (data: Uint8Array) => {
          counters.samples += 1;
          data.fill(128);
        },
        disconnect: () => { counters.analyserDisconnects += 1; },
      };
    }

    close(): Promise<void> {
      counters.closes += 1;
      return Promise.resolve();
    }
  }

  Object.defineProperty(dom.window, "AudioContext", {
    configurable: true,
    writable: true,
    value: AudioContextMock,
  });
  dom.window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
    const id = nextFrame;
    nextFrame += 1;
    requestedFrames.set(id, callback);
    return id;
  };
  dom.window.cancelAnimationFrame = (id: number): void => {
    cancelledFrames.push(id);
    requestedFrames.delete(id);
  };

  const values: Record<(typeof names)[number], unknown> = {
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    Node: dom.window.Node,
    HTMLElement: dom.window.HTMLElement,
    HTMLCanvasElement: dom.window.HTMLCanvasElement,
    Event: dom.window.Event,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    ResizeObserver: ResizeObserverMock,
  };
  for (const name of names) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value: values[name],
    });
  }

  const container = dom.window.document.getElementById("root");
  assert.ok(container);
  return {
    container,
    counters,
    requestedFrames,
    cancelledFrames,
    restore: () => {
      dom.window.close();
      for (const name of names) {
        const descriptor = previous.get(name);
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else Reflect.deleteProperty(runtime, name);
      }
    },
  };
}

test("OscilloscopeFill renders safely without an active audio source", async () => {
  const harness = installOscilloscopeDom();
  let root: Root | null = null;
  try {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
    root = createRoot(harness.container);
    await act(async () => {
      root?.render(createElement(OscilloscopeFill, { stream: null, active: false }));
    });
    assert.equal(harness.container.querySelector("canvas"), null);
    assert.equal(harness.counters.contexts, 0);

    await act(async () => {
      root?.render(createElement(OscilloscopeFill, { stream: null, active: true }));
    });
    assert.ok(harness.container.querySelector("canvas"));
    assert.equal(harness.counters.contexts, 0);
    assert.equal(harness.requestedFrames.size, 0);
  } finally {
    await act(async () => { root?.unmount(); });
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
    harness.restore();
  }
});

test("OscilloscopeFill starts one visualization loop and cleans every audio resource", async () => {
  const harness = installOscilloscopeDom();
  let root: Root | null = null;
  const stream = {} as MediaStream;
  try {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
    root = createRoot(harness.container);
    await act(async () => {
      root?.render(createElement(OscilloscopeFill, { stream, active: true }));
    });

    assert.equal(harness.counters.contexts, 1);
    assert.equal(harness.counters.sources, 1);
    assert.equal(harness.counters.analysers, 1);
    assert.equal(harness.counters.samples, 1);
    assert.equal(harness.requestedFrames.size, 1);

    const firstFrame = [...harness.requestedFrames.entries()][0];
    assert.ok(firstFrame);
    harness.requestedFrames.delete(firstFrame[0]);
    firstFrame[1](16);
    assert.equal(harness.counters.samples, 2);
    assert.equal(harness.requestedFrames.size, 1);

    await act(async () => {
      root?.render(createElement(OscilloscopeFill, { stream, active: true }));
    });
    assert.equal(harness.counters.contexts, 1);
    assert.equal(harness.requestedFrames.size, 1);

    await act(async () => {
      root?.render(createElement(OscilloscopeFill, { stream, active: false }));
    });
    assert.equal(harness.counters.sourceDisconnects, 1);
    assert.equal(harness.counters.analyserDisconnects, 1);
    assert.equal(harness.counters.closes, 1);
    assert.equal(harness.requestedFrames.size, 0);
    assert.equal(harness.cancelledFrames.length, 1);

    await act(async () => { root?.unmount(); });
    root = null;
    assert.equal(harness.counters.closes, 1);
  } finally {
    await act(async () => { root?.unmount(); });
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
    harness.restore();
  }
});

test("OscilloscopeFill unmount cleanup is deterministic while visualization is active", async () => {
  const harness = installOscilloscopeDom();
  let root: Root | null = null;
  try {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
    root = createRoot(harness.container);
    await act(async () => {
      root?.render(createElement(OscilloscopeFill, {
        stream: {} as MediaStream,
        active: true,
      }));
    });
    assert.equal(harness.counters.contexts, 1);
    assert.equal(harness.requestedFrames.size, 1);

    await act(async () => { root?.unmount(); });
    root = null;
    assert.equal(harness.counters.sourceDisconnects, 1);
    assert.equal(harness.counters.analyserDisconnects, 1);
    assert.equal(harness.counters.closes, 1);
    assert.equal(harness.requestedFrames.size, 0);
    assert.equal(harness.cancelledFrames.length, 1);
  } finally {
    await act(async () => { root?.unmount(); });
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
    harness.restore();
  }
});
