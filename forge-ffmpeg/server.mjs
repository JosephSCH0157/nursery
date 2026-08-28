import { spawn } from "node:child_process";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import fsPromises from "node:fs/promises";
import crypto from "node:crypto";
import { parseFfprobeMedia } from "./media-probe.mjs";

const PORT = readPositiveInteger(process.env.PORT) ?? 8080;
const HOST = process.env.HOST?.trim() || "0.0.0.0";
const MAX_INPUT_BYTES = readPositiveInteger(process.env.MAX_INPUT_BYTES) ?? 64 * 1024 * 1024;
const FFMPEG_TIMEOUT_MS = readPositiveInteger(process.env.FFMPEG_TIMEOUT_MS) ?? 120_000;
const BACKGROUND_EFFECT_TIMEOUT_MS = readPositiveInteger(process.env.BACKGROUND_EFFECT_TIMEOUT_MS) ?? 30 * 60_000;

function readPositiveInteger(value) {
  if (!value) return null;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function sendJson(res, statusCode, payload) {
  const body = Buffer.from(JSON.stringify(payload, null, 2));
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": body.byteLength,
    "cache-control": "no-store",
  });
  res.end(body);
}

function sendText(res, statusCode, text, contentType = "text/plain; charset=utf-8") {
  const body = Buffer.from(text);
  res.writeHead(statusCode, {
    "content-type": contentType,
    "content-length": body.byteLength,
    "cache-control": "no-store",
  });
  res.end(body);
}

function readRequestBuffer(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;

    req.on("data", (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        reject(Object.assign(new Error(`Request body exceeds ${maxBytes} bytes.`), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
    req.on("aborted", () => reject(Object.assign(new Error("Request aborted."), { statusCode: 499 })));
  });
}

function runCommand(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    const stdout = [];
    const stderr = [];
    let finished = false;

    const timeoutId = setTimeout(() => {
      if (finished) return;
      finished = true;
      child.kill("SIGKILL");
      reject(Object.assign(new Error(`${command} timed out after ${timeoutMs}ms.`), { statusCode: 504 }));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeoutId);
      reject(error);
    });
    child.on("close", (code, signal) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeoutId);
      const stdoutText = Buffer.concat(stdout).toString("utf8");
      const stderrText = Buffer.concat(stderr).toString("utf8");
      if (code === 0) {
        resolve({ stdout: stdoutText, stderr: stderrText });
        return;
      }
      reject(Object.assign(new Error(`${command} exited with code ${code ?? "null"}${signal ? ` (${signal})` : ""}.`), {
        statusCode: 500,
        stdout: stdoutText,
        stderr: stderrText,
      }));
    });
  });
}

async function withTempDir(fn) {
  const root = await fsPromises.mkdtemp(path.join(os.tmpdir(), "forge-ffmpeg-"));
  try {
    return await fn(root);
  } finally {
    await fsPromises.rm(root, { recursive: true, force: true });
  }
}

function buildRequestId() {
  return crypto.randomBytes(8).toString("hex");
}

async function handleHealth(_req, res) {
  sendJson(res, 200, {
    ok: true,
    service: "forge-ffmpeg",
    timestamp: new Date().toISOString(),
    limits: {
      max_input_bytes: MAX_INPUT_BYTES,
      ffmpeg_timeout_ms: FFMPEG_TIMEOUT_MS,
    },
    routes: {
      health: "/health",
      ffmpeg_version: "/ffmpeg/version",
      transcode_wav: "/transcode/wav",
      render_background_effect: "/render/background-effect",
    },
  });
}

function decodeBase64Field(payload, field, required = true) {
  const value = payload?.[field];
  if (typeof value !== "string" || value.length === 0) {
    if (!required) return null;
    throw Object.assign(new Error(`${field} is required.`), { statusCode: 400 });
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.byteLength === 0) throw Object.assign(new Error(`${field} is empty.`), { statusCode: 400 });
  return bytes;
}

async function handleBackgroundEffectRender(req, res) {
  try {
    const body = await readRequestBuffer(req, MAX_INPUT_BYTES);
    const payload = JSON.parse(body.toString("utf8"));
    if (!payload?.plan || typeof payload.plan !== "object") throw Object.assign(new Error("plan is required."), { statusCode: 400 });
    const source = decodeBase64Field(payload, "source_base64");
    const audio = decodeBase64Field(payload, "audio_master_base64", false);
    const replacement = decodeBase64Field(payload, "replacement_asset_base64", false);
    const output = await withTempDir(async (tempDir) => {
      const sourcePath = path.join(tempDir, "source.mp4");
      const audioPath = audio ? path.join(tempDir, "audio-master.wav") : null;
      const replacementPath = replacement ? path.join(tempDir, "replacement-image") : null;
      const planPath = path.join(tempDir, "background-effect-plan.json");
      const outputPath = path.join(tempDir, "video-master.mp4");
      await fsPromises.writeFile(sourcePath, source);
      await fsPromises.writeFile(planPath, JSON.stringify(payload.plan));
      if (audioPath) await fsPromises.writeFile(audioPath, audio);
      if (replacementPath) await fsPromises.writeFile(replacementPath, replacement);
      const args = ["background-effects-render.py", "--input", sourcePath, "--output", outputPath, "--plan", planPath];
      if (audioPath) args.push("--audio", audioPath);
      if (replacementPath) args.push("--replacement", replacementPath);
      const executed = await runCommand("python", args, BACKGROUND_EFFECT_TIMEOUT_MS);
      const report = JSON.parse(executed.stdout.trim());
      if (!report?.ok || !report.evidence) throw new Error("Background-effect renderer returned invalid evidence.");
      return { bytes: await fsPromises.readFile(outputPath), evidence: report.evidence };
    });
    res.writeHead(200, {
      "content-type": "video/mp4",
      "content-length": output.bytes.byteLength,
      "cache-control": "no-store",
      "x-forge-request-id": buildRequestId(),
      "x-forge-render-evidence": Buffer.from(JSON.stringify(output.evidence)).toString("base64url"),
    });
    res.end(output.bytes);
  } catch (error) {
    sendJson(res, error.statusCode ?? 500, { ok: false, error: { message: error.message, stderr: error.stderr ?? null } });
  }
}

async function handleFfmpegVersion(_req, res) {
  try {
    const result = await runCommand("ffmpeg", ["-version"], FFMPEG_TIMEOUT_MS);
    const lines = result.stdout.split(/\r?\n/).filter(Boolean);
    sendJson(res, 200, {
      ok: true,
      service: "forge-ffmpeg",
      ffmpeg: {
        first_line: lines[0] ?? null,
        lines,
      },
    });
  } catch (error) {
    sendJson(res, error.statusCode ?? 500, {
      ok: false,
      error: {
        message: error.message,
        stderr: error.stderr ?? null,
      },
    });
  }
}

async function handleTranscodeWav(req, res) {
  try {
    const inputBuffer = await readRequestBuffer(req, MAX_INPUT_BYTES);
    if (inputBuffer.byteLength === 0) {
      sendJson(res, 400, {
        ok: false,
        error: { message: "POST /transcode/wav requires a non-empty binary body." },
      });
      return;
    }

    const requestId = buildRequestId();
    const sourceName = req.headers["x-file-name"];
    const sourceExt = typeof sourceName === "string" && sourceName.includes(".")
      ? path.extname(sourceName).slice(0, 16)
      : ".bin";

    const output = await withTempDir(async (tempDir) => {
      const inputPath = path.join(tempDir, `input${sourceExt}`);
      const outputPath = path.join(tempDir, "output.wav");
      await fsPromises.writeFile(inputPath, inputBuffer);
      await runCommand("ffmpeg", [
        "-hide_banner",
        "-loglevel", "error",
        "-y",
        "-i", inputPath,
        "-vn",
        "-acodec", "pcm_s16le",
        "-ar", "48000",
        "-ac", "1",
        outputPath,
      ], FFMPEG_TIMEOUT_MS);
      const bytes = await fsPromises.readFile(outputPath);
      return { bytes };
    });

    res.writeHead(200, {
      "content-type": "audio/wav",
      "content-length": output.bytes.byteLength,
      "cache-control": "no-store",
      "x-forge-request-id": requestId,
      "x-forge-output-format": "wav",
      "x-forge-output-sample-rate": "48000",
      "x-forge-output-channels": "1",
    });
    res.end(output.bytes);
  } catch (error) {
    sendJson(res, error.statusCode ?? 500, {
      ok: false,
      error: {
        message: error.message,
        stderr: error.stderr ?? null,
      },
    });
  }
}

async function handleProbeMedia(req, res) {
  try {
    const inputBuffer = await readRequestBuffer(req, MAX_INPUT_BYTES);
    if (inputBuffer.byteLength === 0) {
      sendJson(res, 400, { ok: false, error: { message: "POST /probe/media requires a non-empty binary body." } });
      return;
    }
    const sourceName = req.headers["x-file-name"];
    const sourceExt = typeof sourceName === "string" && sourceName.includes(".") ? path.extname(sourceName).slice(0, 16) : ".bin";
    const result = await withTempDir(async (tempDir) => {
      const inputPath = path.join(tempDir, `input${sourceExt}`);
      await fsPromises.writeFile(inputPath, inputBuffer);
      const probed = await runCommand("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", inputPath], FFMPEG_TIMEOUT_MS);
      return JSON.parse(probed.stdout);
    });
    sendJson(res, 200, { ok: true, inspection: parseFfprobeMedia(result) });
  } catch (error) {
    sendJson(res, error.statusCode ?? 500, { ok: false, error: { message: error.message, stderr: error.stderr ?? null } });
  }
}

const server = http.createServer(async (req, res) => {
  const method = req.method ?? "GET";
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  try {
    if (method === "GET" && url.pathname === "/health") {
      await handleHealth(req, res);
      return;
    }

    if (method === "GET" && url.pathname === "/ffmpeg/version") {
      await handleFfmpegVersion(req, res);
      return;
    }

    if (method === "POST" && url.pathname === "/transcode/wav") {
      await handleTranscodeWav(req, res);
      return;
    }
    if (method === "POST" && url.pathname === "/probe/media") {
      await handleProbeMedia(req, res);
      return;
    }
    if (method === "POST" && url.pathname === "/render/background-effect") {
      await handleBackgroundEffectRender(req, res);
      return;
    }

    if (method === "GET" && url.pathname === "/") {
      sendText(res, 200, "forge-ffmpeg is running\n");
      return;
    }

    sendJson(res, 404, {
      ok: false,
      error: {
        message: `No route for ${method} ${url.pathname}`,
      },
    });
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: {
        message: error instanceof Error ? error.message : "Unknown server error.",
      },
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`forge-ffmpeg listening on http://${HOST}:${PORT}`);
});

process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});

process.on("SIGINT", () => {
  server.close(() => process.exit(0));
});
