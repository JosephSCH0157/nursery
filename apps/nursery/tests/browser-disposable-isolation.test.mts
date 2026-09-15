import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import { once } from "node:events";
import { createHash } from "node:crypto";
import path from "node:path";
import { test } from "node:test";
import vm from "node:vm";
import { chromium } from "playwright/test";
import { allowedDisposableTarget, disposableRuntimeMiddleware, disposableRuntimeScript, isolateDisposableHtml, readDisposableBrowserConfig, startDisposableProxy } from "../scripts/browser-disposable-isolation.mts";
import { getHearthPhase4ArtifactPath } from "../playwright/helpers/hearth-phase4-fixtures";

const config = { appOrigin: "http://127.0.0.1:5173", apiOrigin: "http://127.0.0.1:58621", anonKey: "synthetic-anonymous" };
const env = { FORGE_BROWSER_SUPABASE_WORKDIR: "synthetic-job", SUPABASE_URL: config.apiOrigin, TONGS_SUPABASE_URL: config.apiOrigin, VITE_SUPABASE_URL: config.apiOrigin, SUPABASE_ANON_KEY: config.anonKey, TONGS_SUPABASE_ANON_KEY: config.anonKey, VITE_SUPABASE_ANON_KEY: config.anonKey };

test("Phase 4 generated evidence uses the job-owned path rather than the tracked cache", () => {
  const artifact = path.resolve("synthetic-job", "hearth-phase4-fixtures.json");
  assert.equal(getHearthPhase4ArtifactPath({ HEARTH_PHASE4_FIXTURE_ARTIFACT: artifact }), artifact);
});

test("disposable configuration is opt-in and fails closed on inconsistent/remote authority", () => {
  assert.equal(readDisposableBrowserConfig({}), null);
  assert.deepEqual(readDisposableBrowserConfig(env), config);
  for (const patch of [{ SUPABASE_URL: "https://example.invalid" }, { VITE_SUPABASE_URL: "https://example.invalid" }, { TONGS_SUPABASE_ANON_KEY: "different" }, { SUPABASE_URL: config.apiOrigin + "/other" }]) {
    assert.throws(() => readDisposableBrowserConfig({ ...env, ...patch }));
  }
});

test("runtime globals use only disposable authority; DOCX is explicitly excluded", () => {
  const context = { window: {} };
  vm.runInNewContext(disposableRuntimeScript(config), context);
  assert.deepEqual(context.window, { __forgeSupabaseUrl: config.apiOrigin, __forgeSupabaseAnonKey: config.anonKey });
  const html = '<script src="https://unpkg.com/mammoth/mammoth.browser.min.js"></script>';
  assert.equal(isolateDisposableHtml(html), '<script src="/__forge-browser/docx-excluded.js"></script>');
  assert.equal(isolateDisposableHtml("other HTML"), "other HTML");
});

test("only exact loopback origins are authorized, including WebSockets", () => {
  for (const url of [config.appOrigin + "/x", config.apiOrigin + "/auth/v1/user", "ws://127.0.0.1:5173/hmr"]) assert(allowedDisposableTarget(url, config));
  for (const url of ["https://example.invalid", "http://localhost:5173", "http://127.0.0.1:12345", "http://user:password@127.0.0.1:5173", "file:///x", "wss://127.0.0.1:5173", "invalid"]) assert.equal(allowedDisposableTarget(url, config), null);
});

test("allowed CONNECT client reset closes cleanly and the proxy remains usable", { timeout: 10_000 }, async () => {
  const server = http.createServer((_req, res) => res.end("still healthy"));
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  const local = { ...config, appOrigin: `http://127.0.0.1:${address.port}` };
  const proxy = await startDisposableProxy(local, 0);
  assert(proxy.address && typeof proxy.address !== "string");
  const proxyPort = proxy.address.port;
  const client = net.connect(proxyPort, "127.0.0.1");
  try {
    const upstreamConnected = once(server, "connection");
    await once(client, "connect");
    const response = once(client, "data");
    client.write(`CONNECT 127.0.0.1:${address.port} HTTP/1.1\r\nHost: 127.0.0.1:${address.port}\r\n\r\n`);
    assert.match(String((await response)[0]), /200 Connection Established/);
    const [upstream] = await upstreamConnected as [net.Socket];
    const upstreamClosed = new Promise<void>(resolve => upstream.once("close", () => resolve()));
    client.resetAndDestroy();
    await upstreamClosed;
    assert(proxy.transportClosures.ECONNRESET > 0, "The real accepted socket must observe the reset");
    assert.deepEqual(proxy.transportErrors, []);
    assert.deepEqual(proxy.denied, []);
    const body = await new Promise<string>((resolve, reject) => {
      http.get({ hostname: "127.0.0.1", port: proxyPort, path: local.appOrigin + "/healthy" }, res => {
        let text = "";
        res.setEncoding("utf8"); res.on("data", chunk => { text += chunk; });
        res.on("error", reject); res.on("end", () => resolve(text));
      }).on("error", reject);
    });
    assert.equal(body, "still healthy");
    assert.deepEqual(proxy.transportErrors, []);
    assert.deepEqual(proxy.denied, []);
  } finally {
    client.destroy();
    try { await proxy.close(); }
    finally {
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  }
});

test("unexpected allowed-upstream socket errors are observable and fail teardown", { timeout: 10_000 }, async () => {
  const unavailable = net.createServer();
  await new Promise<void>(resolve => unavailable.listen(0, "127.0.0.1", resolve));
  const address = unavailable.address();
  assert(address && typeof address !== "string");
  await new Promise<void>(resolve => unavailable.close(() => resolve()));
  const local = { ...config, appOrigin: `http://127.0.0.1:${address.port}` };
  const proxy = await startDisposableProxy(local, 0);
  assert(proxy.address && typeof proxy.address !== "string");
  const client = net.connect(proxy.address.port, "127.0.0.1");
  try {
    await once(client, "connect");
    const closed = once(client, "close");
    client.write(`CONNECT 127.0.0.1:${address.port} HTTP/1.1\r\nHost: 127.0.0.1:${address.port}\r\n\r\n`);
    await closed;
    assert.deepEqual(proxy.transportErrors, [{ code: "ECONNREFUSED" }]);
    assert.deepEqual(proxy.denied, [], "An allowed but unavailable destination is not a policy violation");
  } finally {
    client.destroy();
    await assert.rejects(proxy.close(), /Unexpected disposable proxy transport errors/);
  }
});

test("Chromium uses disposable globals and proxy blocks remote redirects, requests, sockets and HTTPS", async () => {
  const server = http.createServer();
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  const local = { ...config, appOrigin: `http://127.0.0.1:${address.port}` };
  const middleware = disposableRuntimeMiddleware(local);
  server.on("request", (req, res) => middleware(req, res, () => {
    if (req.url === "/redirect") { res.writeHead(302, { Location: "https://external.invalid/private?secret=excluded" }); res.end(); }
    else { res.end("local response"); }
  }));
  server.on("upgrade", (req, socket) => {
    const accept = createHash("sha1").update(String(req.headers["sec-websocket-key"]) + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    socket.on("data", () => socket.end());
  });
  const proxy = await startDisposableProxy(local, 0);
  assert(proxy.address && typeof proxy.address !== "string");
  const browser = await chromium.launch({ proxy: { server: `http://127.0.0.1:${proxy.address.port}`, bypass: "<-loopback>" } });
  try {
    const context = await browser.newContext({ serviceWorkers: "block" });
    const page = await context.newPage();
    await page.goto(local.appOrigin + "/__forge-browser/config-check");
    assert.equal(await page.evaluate(() => (window as unknown as { __forgeSupabaseUrl: string }).__forgeSupabaseUrl), config.apiOrigin);
    assert.equal(proxy.denied.length, 0);
    assert.equal(await page.evaluate(url => new Promise(resolve => {
      const ws = new WebSocket(url);
      const timer = setTimeout(() => { ws.close(); resolve("timeout"); }, 5000);
      ws.onopen = () => { clearTimeout(timer); ws.close(); resolve("open"); };
      ws.onerror = () => { clearTimeout(timer); resolve("denied"); };
    }), local.appOrigin.replace("http:", "ws:") + "/hmr"), "open");
    await page.addScriptTag({ url: local.appOrigin + "/__forge-browser/docx-excluded.js" });
    await assert.rejects(page.evaluate(() => (window as unknown as { mammoth: { convertToHtml: unknown } }).mammoth.convertToHtml), /DOCX import is excluded/);
    await assert.rejects(page.goto(local.appOrigin + "/redirect"));
    assert(proxy.denied.some(url => url === "https://external.invalid/"));
    const deniedPage = await context.newPage();
    const response = await deniedPage.goto("http://external.invalid/private?secret=excluded");
    assert.equal(response?.status(), 403);
    assert(proxy.denied.includes("http://external.invalid/private"));
    assert(!JSON.stringify(proxy.denied).includes("secret"));
    // Fresh manually-created contexts must inherit the browser-wide guard.
    const second = await browser.newContext();
    const secondPage = await second.newPage();
    assert.equal((await secondPage.goto("http://another.invalid/"))?.status(), 403);
    assert(proxy.denied.includes("http://another.invalid/"));
    const apiResponse = await context.request.get("http://api-request.invalid/");
    assert.equal(apiResponse.status(), 403);
    assert(proxy.denied.some(url => new URL(url).hostname === "api-request.invalid"));
  } finally {
    await browser.close();
    await proxy.close();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
