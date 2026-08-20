import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";

const identity = `forge-he3-proxy-test-${process.pid}`;
const proxyPort = 56251;
const container = `${identity}-container`;
const proxy = spawn(process.execPath, ["scripts/he3a-docker-loopback-proxy.mjs"], {
  cwd: process.cwd(), env: { ...process.env, HE3A_PROJECT_ID: identity, HE3A_DOCKER_PROXY_PORT: String(proxyPort), HE3A_PROXY_DEBUG: "1" }, stdio: ["ignore", "pipe", "inherit"],
});
try {
  let ready = "";
  while (!ready.includes("HE3A_DOCKER_PROXY_READY")) ready += String((await once(proxy.stdout, "data"))[0]);
  const dockerEnv = { ...process.env, DOCKER_HOST: `tcp://127.0.0.1:${proxyPort}` };
  const create = spawnSync("docker", ["create", "--name", container, "-p", "56252:80", "nginx:alpine"], { env: dockerEnv, encoding: "utf8" });
  assert.equal(create.status, 0, create.stderr);
  const start = spawnSync("docker", ["start", container], { env: dockerEnv, encoding: "utf8" });
  assert.equal(start.status, 0, start.stderr);
  const inspect = spawnSync("docker", ["inspect", container, "--format", "{{json .NetworkSettings.Ports}}"], { encoding: "utf8" });
  assert.equal(inspect.status, 0, inspect.stderr);
  const ports = JSON.parse(inspect.stdout.trim());
  assert.deepEqual(ports["80/tcp"], [{ HostIp: "127.0.0.1", HostPort: "56252" }]);
  const guard = spawnSync("docker", ["inspect", container, "--format", "{{json .Config.Labels}}|{{.HostConfig.PublishAllPorts}}"], { encoding: "utf8" });
  assert.match(guard.stdout, new RegExp(`forge.he3a.identity.*${identity.replaceAll("-", "\\-")}.*\\|false`));
  process.stdout.write("HE-3A Docker loopback proxy contract passed.\n");
} finally {
  spawnSync("docker", ["rm", "-f", container], { encoding: "utf8" });
  proxy.kill("SIGTERM");
}
