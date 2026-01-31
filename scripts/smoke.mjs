import { spawn } from "node:child_process";
import http from "node:http";

const DEV_COMMAND = "pnpm";
const DEV_ARGS = ["dev"];
const BUILD_COMMAND = "pnpm";
const BUILD_ARGS = ["build"];

const HOST = "127.0.0.1";
const PORT = 5173;
const PATH = "/";
const TIMEOUT_MS = 15_000;
const POLL_MS = 500;
const KILL_TIMEOUT_MS = 2_000;

function log(message) {
  process.stdout.write(`[SMOKE] ${message}\n`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function spawnCmd(command, args, opts = {}) {
  return spawn(command, args, {
    stdio: "inherit",
    shell: true,
    windowsHide: true,
    ...opts,
  });
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawnCmd(command, args);
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

function checkHealth() {
  return new Promise((resolve) => {
    const req = http.get(
      { host: HOST, port: PORT, path: PATH, timeout: 2_000 },
      (res) => {
        res.resume();
        resolve(res.statusCode >= 200 && res.statusCode < 300);
      },
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForHealthy() {
  const start = Date.now();
  while (Date.now() - start < TIMEOUT_MS) {
    if (await checkHealth()) return true;
    await sleep(POLL_MS);
  }
  return false;
}

function stopProcess(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null) {
      resolve();
      return;
    }

    const onExit = () => resolve();
    child.once("exit", onExit);
    child.kill("SIGTERM");

    setTimeout(() => {
      if (child.exitCode === null) {
        child.kill("SIGKILL");
      }
    }, KILL_TIMEOUT_MS);
  });
}

async function main() {
  await runCommand(BUILD_COMMAND, BUILD_ARGS);

  log("booting via pnpm dev");
  const dev = spawnCmd(DEV_COMMAND, DEV_ARGS);

  const cleanup = async () => {
    await stopProcess(dev);
  };

  process.once("SIGINT", () => void cleanup().then(() => process.exit(1)));
  process.once("SIGTERM", () => void cleanup().then(() => process.exit(1)));

  const healthy = await waitForHealthy();
  await cleanup();

  if (!healthy) {
    throw new Error(`Dev server did not become healthy on ${HOST}:${PORT}${PATH}`);
  }
}

try {
  await main();
  log("ok");
  process.exit(0);
} catch (err) {
  log(err instanceof Error ? err.message : "smoke failed");
  process.exit(1);
}
