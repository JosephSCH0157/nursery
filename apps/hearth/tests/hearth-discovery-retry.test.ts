import assert from "node:assert/strict";
import test from "node:test";
import { HearthDiscoveryError, recoverInitialHearthDiscovery } from "../src/lib/hearth-discovery-retry";
import { listHearthWorkpieces } from "../src/lib/hearth-workpieces";

const workspace = "f7f581e2-94d0-4c7d-bd0c-b650f6f9d8b1";
const workpiece = "9287963f-e82a-4d9a-b810-db100e9d0021";
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

async function withFetch(run: () => Promise<void>, impl: typeof fetch) {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousFetch = globalThis.fetch;
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    __forgeTongsApiToken: "isolated-fixture", location: { search: "" },
    localStorage: { getItem: () => null, key: () => null, length: 0 },
  } });
  globalThis.fetch = impl;
  try { await run(); } finally {
    globalThis.fetch = previousFetch;
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
}

test("discovery retries only GET at 250/750ms, at most three attempts", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0;
  const promise = recoverInitialHearthDiscovery(async () => {
    calls++;
    if (calls < 3) throw new HearthDiscoveryError("temporary", "temporary_service", 503);
    return [];
  }, new AbortController().signal);
  await flush();
  assert.equal(calls, 1);
  t.mock.timers.tick(249); await flush(); assert.equal(calls, 1);
  t.mock.timers.tick(1); await flush(); assert.equal(calls, 2);
  t.mock.timers.tick(749); await flush(); assert.equal(calls, 2);
  t.mock.timers.tick(1); await flush(); assert.deepEqual(await promise, []);
  assert.equal(calls, 3);
});

test("timeout includes response consumption; exhaustion cancels all attempts and has no polling", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const signals: AbortSignal[] = [];
  await withFetch(async () => {
    const result = recoverInitialHearthDiscovery((signal) => listHearthWorkpieces(workspace, { signal }), new AbortController().signal)
      .then(() => null, (error: unknown) => error);
    await flush();
    for (const delay of [5_000, 250, 5_000, 750, 5_000]) { t.mock.timers.tick(delay); await flush(); }
    const error = await result;
    assert.ok(error instanceof HearthDiscoveryError && error.reason === "timeout");
    assert.equal(signals.length, 3);
    assert.ok(signals.every((signal) => signal.aborted));
    t.mock.timers.tick(60_000); await flush(); assert.equal(signals.length, 3);
  }, async (_url, init) => {
    signals.push(init!.signal!);
    return { ok: true, status: 200, json: () => new Promise(() => {}) } as Response;
  });
});

test("parent cancellation cancels a pending attempt and prevents late success", async () => {
  const parent = new AbortController();
  let finish!: (value: string) => void;
  let child!: AbortSignal;
  const result = recoverInitialHearthDiscovery((signal) => {
    child = signal;
    return new Promise<string>((resolve) => { finish = resolve; });
  }, parent.signal).then(() => null, (error) => error);
  await flush(); parent.abort(); finish("too late");
  assert.equal((await result).name, "AbortError");
  assert.equal(child.aborted, true);
});

test("terminal status rejects before reading a hanging response body, never retrying as timeout", async () => {
  let bodyReads = 0;
  await withFetch(async () => {
    await assert.rejects(recoverInitialHearthDiscovery((signal) => listHearthWorkpieces(workspace, { signal }), new AbortController().signal),
      (error: unknown) => error instanceof HearthDiscoveryError && error.status === 403 && error.reason === "terminal");
    assert.equal(bodyReads, 0);
  }, async () => ({ ok: false, status: 403, json: () => { bodyReads++; return new Promise(() => {}); } }) as Response);
});

test("gateway body unknown exceptions and string error codes remain terminal", async () => {
  for (const response of [
    Object.assign(new Response("", { status: 503 }), { json: async () => { throw new Error("unknown decoder exception"); } }),
    json({ ok: false, error: "not_permitted" }, 503),
  ]) {
    await withFetch(async () => {
      await assert.rejects(listHearthWorkpieces(workspace), (error: unknown) => error instanceof HearthDiscoveryError && error.reason === "terminal");
    }, async () => response);
  }
});

test("parent cancellation during backoff prevents the next attempt", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const parent = new AbortController();
  let calls = 0;
  const result = recoverInitialHearthDiscovery(async () => {
    calls++; throw new HearthDiscoveryError("transport", "transport");
  }, parent.signal).catch((error) => error);
  await flush(); parent.abort(); t.mock.timers.tick(60_000); await flush();
  assert.equal((await result).name, "AbortError"); assert.equal(calls, 1);
});

for (const status of [401, 403, 404, 400, 409, 422, 429, 500, 501]) {
  test(`HTTP ${status} is terminal, not broadly retryable unavailable`, async () => {
    let calls = 0;
    await withFetch(async () => {
      await assert.rejects(recoverInitialHearthDiscovery((signal) => listHearthWorkpieces(workspace, { signal }), new AbortController().signal),
        (error: unknown) => error instanceof HearthDiscoveryError && error.reason === "terminal" && error.status === status);
      assert.equal(calls, 1);
    }, async () => { calls++; return json({ ok: false }, status); });
  });
}

for (const code of ["not_permitted", "invalid_workspace_relationship", "invalid_project_relationship", "integrity_failure", "provenance_failure", "unknown_failure"]) {
  test(`temporary status cannot override terminal/unknown code ${code}`, async () => {
    let calls = 0;
    await withFetch(async () => {
      await assert.rejects(recoverInitialHearthDiscovery((signal) => listHearthWorkpieces(workspace, { signal }), new AbortController().signal),
        (error: unknown) => error instanceof HearthDiscoveryError && error.reason === "terminal" && error.code === code);
      assert.equal(calls, 1);
    }, async () => { calls++; return json({ ok: false, error: { code } }, 503); });
  });
}

for (const status of [502, 503, 504]) {
  test(`supported temporary HTTP ${status} preserves transient classification`, async () => {
    await withFetch(async () => {
      await assert.rejects(listHearthWorkpieces(workspace), (error: unknown) =>
        error instanceof HearthDiscoveryError && error.reason === "temporary_service" && error.status === status);
    }, async () => json({ ok: false }, status));
  });
}

for (const [name, payload] of [
  ["missing identity", { id: workpiece }],
  ["malformed identity", { id: "not-a-uuid", workspace_id: workspace }],
  ["cross-workspace identity", { id: workpiece, workspace_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }],
] as const) {
  test(`${name} rejects the whole canonical collection without retry`, async () => {
    let calls = 0;
    await withFetch(async () => {
      await assert.rejects(recoverInitialHearthDiscovery((signal) => listHearthWorkpieces(workspace, { signal }), new AbortController().signal));
      assert.equal(calls, 1);
    }, async () => { calls++; return json({ ok: true, data: { episodes: [{ id: workpiece, workspace_id: workspace }, payload] } }); });
  });
}

test("known transport error is retryable; unknown exceptions and unreadable JSON are terminal", async () => {
  await withFetch(async () => {
    await assert.rejects(listHearthWorkpieces(workspace), (error: unknown) => error instanceof HearthDiscoveryError && error.reason === "transport");
  }, async () => { throw new TypeError("Failed to fetch"); });
  for (const impl of [
    async () => { throw new Error("unclassified exception"); },
    async () => { throw new TypeError("unrecognized programmer error"); },
    async () => new Response("invalid json"),
  ]) {
    let calls = 0;
    await withFetch(async () => {
      await assert.rejects(recoverInitialHearthDiscovery((signal) => listHearthWorkpieces(workspace, { signal }), new AbortController().signal));
      assert.equal(calls, 1);
    }, async () => { calls++; return impl(); });
  }
});
