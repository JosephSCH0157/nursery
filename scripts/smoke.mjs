import { spawn } from "node:child_process";
import http from "node:http";
import https from "node:https";

function resolvePnpmInvocation() {
  const execPath = process.env.npm_execpath;
  if (typeof execPath === "string" && /pnpm(?:\.c?js)?$/i.test(execPath)) {
    return {
      command: process.execPath,
      args: [execPath],
      label: "npm_execpath pnpm",
    };
  }

  return {
    command: process.platform === "win32" ? "corepack.cmd" : "corepack",
    args: ["pnpm"],
    label: "corepack pnpm",
  };
}

const PNPM = resolvePnpmInvocation();
const DEV_COMMAND = PNPM.command;
const DEV_ARGS = [...PNPM.args, "dev"];
const BUILD_COMMAND = PNPM.command;
const BUILD_ARGS = [...PNPM.args, "build"];

const DEFAULT_URL = "http://localhost:5173/";
const TIMEOUT_MS = 30_000;
const POLL_MS = 500;
const KILL_TIMEOUT_MS = 2_000;

function log(message) {
  process.stdout.write(`[SMOKE] ${message}\n`);
}

function stripAnsi(input) {
  return input.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
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

function checkHealth(urlString) {
  return new Promise((resolve) => {
    let url;
    try {
      url = new URL(urlString);
    } catch {
      resolve(false);
      return;
    }

    const client = url.protocol === "https:" ? https : http;
    const req = client.get(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: url.pathname + url.search,
        timeout: 2_000,
      },
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

async function waitForHealthy(getUrl) {
  const start = Date.now();
  while (Date.now() - start < TIMEOUT_MS) {
    const primary = getUrl();
    if (await checkHealth(primary)) return true;

    let fallback = null;
    try {
      const url = new URL(primary);
      if (url.hostname === "127.0.0.1") {
        url.hostname = "localhost";
        fallback = url.toString();
      } else if (url.hostname === "localhost") {
        url.hostname = "127.0.0.1";
        fallback = url.toString();
      }
    } catch {
      fallback = null;
    }

    if (fallback && (await checkHealth(fallback))) return true;
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

  log(`booting via ${PNPM.label} dev`);
  const dev = spawnCmd(DEV_COMMAND, DEV_ARGS, { stdio: ["ignore", "pipe", "pipe"] });
  let devUrl = DEFAULT_URL;
  let buffer = "";

  const onData = (chunk) => {
    const text = chunk.toString();
    buffer += text;
    process.stdout.write(text);

    let idx;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      const line = stripAnsi(buffer.slice(0, idx));
      buffer = buffer.slice(idx + 1);
      const match = line.match(/Local:\s*(https?:\/\/\S+)/i);
      if (match?.[1]) {
        devUrl = match[1];
      }
    }
  };

  const onErrorData = (chunk) => {
    process.stderr.write(chunk.toString());
  };

  dev.stdout?.on("data", onData);
  dev.stderr?.on("data", onErrorData);

  const cleanup = async () => {
    await stopProcess(dev);
  };

  process.once("SIGINT", () => void cleanup().then(() => process.exit(1)));
  process.once("SIGTERM", () => void cleanup().then(() => process.exit(1)));

  const healthy = await waitForHealthy(() => devUrl || DEFAULT_URL);
  await cleanup();

  if (!healthy) {
    throw new Error(`Dev server did not become healthy on ${devUrl || DEFAULT_URL}`);
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
