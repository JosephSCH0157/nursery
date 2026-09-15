import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import type { Duplex } from "node:stream";

export type DisposableBrowserConfig = { appOrigin: string; apiOrigin: string; anonKey: string };
export const DISPOSABLE_PROXY = "http://127.0.0.1:58625";

export function readDisposableBrowserConfig(env: NodeJS.ProcessEnv = process.env): DisposableBrowserConfig | null {
  if (!env.FORGE_BROWSER_SUPABASE_WORKDIR) return null;
  const appOrigin = "http://127.0.0.1:5173";
  const api = new URL(env.SUPABASE_URL ?? "");
  assert.equal(api.hostname, "127.0.0.1", "Disposable Supabase must use literal loopback");
  assert.equal(api.protocol, "http:");
  assert.equal(api.pathname, "/");
  assert(!api.username && !api.password && !api.search && !api.hash);
  for (const key of ["TONGS_SUPABASE_URL", "VITE_SUPABASE_URL"]) {
    assert.equal(env[key], api.origin, "Disposable API origins must agree");
  }
  const anonKey = env.SUPABASE_ANON_KEY ?? "";
  assert(anonKey && !/[\r\n]/.test(anonKey), "Missing disposable anonymous credential");
  for (const key of ["VITE_SUPABASE_ANON_KEY", "TONGS_SUPABASE_ANON_KEY"]) {
    assert.equal(env[key], anonKey, "Disposable anonymous credentials must agree");
  }
  return { appOrigin, apiOrigin: api.origin, anonKey };
}

export function disposableRuntimeScript(config: DisposableBrowserConfig): string {
  return `window.__forgeSupabaseUrl=${JSON.stringify(config.apiOrigin)};window.__forgeSupabaseAnonKey=${JSON.stringify(config.anonKey)};\n`;
}

export function isolateDisposableHtml(html: string): string {
  // DOCX importing is not covered by this gate. Preserve an explicit failure if
  // a test starts using it; do not download or silently allowlist a CDN.
  return html.replace('<script src="https://unpkg.com/mammoth/mammoth.browser.min.js"></script>',
    '<script src="/__forge-browser/docx-excluded.js"></script>');
}

export function disposableRuntimeMiddleware(config: DisposableBrowserConfig) {
  return (req: http.IncomingMessage, res: http.ServerResponse, next: () => void) => {
    const path = new URL(req.url ?? "/", config.appOrigin).pathname;
    let body: string;
    if (path === "/forge-config.js" || path === "/anvil/forge-config.js") {
      body = disposableRuntimeScript(config);
    } else if (path === "/__forge-browser/config-check") {
      res.setHeader("Content-Type", "text/html");
      res.end('<!doctype html><script src="/forge-config.js"></script><title>Disposable runtime check</title>');
      return;
    } else if (path === "/__forge-browser/docx-excluded.js") {
      body = 'window.mammoth=new Proxy({}, {get(){throw new Error("DOCX import is excluded from disposable browser certification; provide an offline fixture before testing it.");}});';
    } else { next(); return; }
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/javascript");
    res.end(body);
  };
}

export function allowedDisposableTarget(raw: string, config: DisposableBrowserConfig): URL | null {
  try {
    const url = new URL(raw);
    const origin = url.protocol === "ws:" ? "http://" + url.host : url.origin;
    return !url.username && !url.password && ["http:", "ws:"].includes(url.protocol)
      && [config.appOrigin, config.apiOrigin].includes(origin) ? url : null;
  } catch { return null; }
}

// All Chromium contexts and Playwright API requests use this proxy. It never
// resolves an external hostname. Rejections fail the whole run at teardown.
export async function startDisposableProxy(config: DisposableBrowserConfig, port = 58625) {
  const denied: string[] = [];
  const forwarded = { http: 0, tunnels: 0, upgrades: 0 };
  const sockets = new Set<Duplex>();
  function track(socket: Duplex) { sockets.add(socket); socket.on("close", () => sockets.delete(socket)); }
  function reject(raw: string) {
    try { const u = new URL(raw); denied.push(u.protocol + "//" + u.host + u.pathname); }
    catch { denied.push("malformed destination"); }
  }
  const server = http.createServer((req, res) => {
    const target = allowedDisposableTarget(req.url ?? "", config);
    if (!target) { reject(req.url ?? ""); res.writeHead(403); res.end("Disposable browser network destination denied"); return; }
    forwarded.http++;
    const upstream = http.request({
      hostname: target.hostname, port: target.port, path: target.pathname + target.search,
      method: req.method, headers: { ...req.headers, host: target.host },
    }, response => { res.writeHead(response.statusCode ?? 502, response.headers); response.pipe(res); });
    upstream.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end(); });
    req.pipe(upstream);
  });
  server.on("connection", track);
  server.on("connect", (req, socket, head) => {
    // Chromium tunnels even plain ws:// connections. Only the same two exact
    // loopback destinations may be tunneled; no external host is resolved.
    const target = allowedDisposableTarget("http://" + req.url, config);
    if (!target || req.url !== target.host) {
      reject("https://" + req.url); socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n"); return;
    }
    const upstream = net.connect(Number(target.port), target.hostname);
    forwarded.tunnels++;
    track(upstream);
    upstream.on("connect", () => {
      socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      upstream.write(head);
      socket.pipe(upstream); upstream.pipe(socket);
    });
    upstream.on("error", () => socket.destroy());
    socket.on("close", () => upstream.destroy());
  });
  server.on("upgrade", (req, socket, head) => {
    const target = allowedDisposableTarget(req.url ?? "", config);
    if (!target) { reject(req.url ?? ""); socket.end("HTTP/1.1 403 Forbidden\r\n\r\n"); return; }
    forwarded.upgrades++;
    const upstream = net.connect(Number(target.port), target.hostname);
    track(upstream);
    upstream.on("connect", () => {
      const headers = { ...req.headers, host: target.host };
      upstream.write(`${req.method} ${target.pathname + target.search} HTTP/1.1\r\n`
        + Object.entries(headers).map(([key, value]) => key + ": " + value).join("\r\n") + "\r\n\r\n");
      upstream.write(head); socket.pipe(upstream); upstream.pipe(socket);
    });
    upstream.on("error", () => socket.destroy());
    socket.on("close", () => upstream.destroy());
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
  return {
    denied, forwarded, address: server.address(),
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    },
  };
}
