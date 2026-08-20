import http from "node:http";

const listenPort = Number(process.env.HE3A_DOCKER_PROXY_PORT ?? "23751");
const identity = process.env.HE3A_PROJECT_ID ?? "";
if (!/^forge-he3-[a-z0-9-]+$/.test(identity)) throw new Error("HE3A_PROJECT_ID must be a unique forge-he3-* identity");
if (!Number.isInteger(listenPort) || listenPort < 1024 || listenPort > 65535) throw new Error("Invalid HE3A_DOCKER_PROXY_PORT");

function confineCreateBody(url, body) {
  if (!/\/containers\/create(?:\?|$)/.test(url)) return body;
  const value = JSON.parse(body.toString("utf8"));
  value.Labels = { ...(value.Labels ?? {}), "forge.he3a.identity": identity };
  if (value.HostConfig) value.HostConfig.PublishAllPorts = false;
  const bindings = value?.HostConfig?.PortBindings;
  if (bindings && typeof bindings === "object") {
    for (const entries of Object.values(bindings)) {
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        if (entry && typeof entry === "object") entry.HostIp = "127.0.0.1";
      }
    }
  }
  return Buffer.from(JSON.stringify(value));
}

function handle(incoming, outgoing) {
  if (process.env.HE3A_PROXY_DEBUG === "1") process.stderr.write(`${incoming.method} ${incoming.url}\n`);
  const chunks = [];
  incoming.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
  incoming.on("end", () => {
    let body = Buffer.concat(chunks);
    try { body = confineCreateBody(incoming.url ?? "", body); }
    catch (error) {
      outgoing.writeHead(400, { "content-type": "application/json" });
      outgoing.end(JSON.stringify({ message: `HE-3A rejected malformed container creation: ${error instanceof Error ? error.message : String(error)}` }));
      return;
    }
    const headers = { ...incoming.headers, host: "localhost", "content-length": String(body.length) };
    delete headers["transfer-encoding"];
    const forwarded = http.request({ socketPath: "//./pipe/docker_engine", agent: false, method: incoming.method, path: incoming.url, headers: { ...headers, connection: "close" } }, (response) => {
      const responseHeaders = { ...response.headers };
      delete responseHeaders.connection;
      delete responseHeaders["content-length"];
      delete responseHeaders["transfer-encoding"];
      outgoing.writeHead(response.statusCode ?? 500, responseHeaders);
      response.pipe(outgoing);
    });
    forwarded.on("error", (error) => {
      if (!outgoing.headersSent) outgoing.writeHead(502, { "content-type": "application/json" });
      outgoing.end(JSON.stringify({ message: `HE-3A Docker proxy failure: ${error.message}` }));
    });
    if (body.length) forwarded.write(body);
    forwarded.end();
  });
}

const server = http.createServer(handle);
server.on("checkContinue", (incoming, outgoing) => {
  outgoing.writeContinue();
  handle(incoming, outgoing);
});

server.listen(listenPort, "127.0.0.1", () => {
  process.stdout.write(`HE3A_DOCKER_PROXY_READY ${identity} 127.0.0.1:${listenPort}\n`);
});

for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(() => process.exit(0)));
