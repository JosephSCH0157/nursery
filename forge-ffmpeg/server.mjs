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
const MAX_TRANSCODE_INPUT_BYTES = readPositiveInteger(process.env.MAX_TRANSCODE_INPUT_BYTES) ?? MAX_INPUT_BYTES;
const MAX_PROBE_INPUT_BYTES = readPositiveInteger(process.env.MAX_PROBE_INPUT_BYTES) ?? MAX_INPUT_BYTES;
const MAX_POSTER_INPUT_BYTES = readPositiveInteger(process.env.MAX_POSTER_INPUT_BYTES) ?? MAX_INPUT_BYTES;
const MAX_BACKGROUND_EFFECT_INPUT_BYTES = readPositiveInteger(process.env.MAX_BACKGROUND_EFFECT_INPUT_BYTES) ?? MAX_INPUT_BYTES;
const MAX_TRANSCODE_OUTPUT_BYTES = readPositiveInteger(process.env.MAX_TRANSCODE_OUTPUT_BYTES) ?? 512 * 1024 * 1024;
const MAX_BACKGROUND_EFFECT_OUTPUT_BYTES = readPositiveInteger(process.env.MAX_BACKGROUND_EFFECT_OUTPUT_BYTES) ?? 1024 * 1024 * 1024;
const MAX_POSTER_OUTPUT_BYTES = readPositiveInteger(process.env.MAX_POSTER_OUTPUT_BYTES) ?? 10 * 1024 * 1024;
const MAX_TRANSCODE_DURATION_MS = readPositiveInteger(process.env.MAX_TRANSCODE_DURATION_MS) ?? 4 * 60 * 60_000;
const MAX_PROBE_DURATION_MS = readPositiveInteger(process.env.MAX_PROBE_DURATION_MS) ?? 4 * 60 * 60_000;
const MAX_POSTER_DURATION_MS = readPositiveInteger(process.env.MAX_POSTER_DURATION_MS) ?? 10 * 60_000;
const MAX_BACKGROUND_EFFECT_DURATION_MS = readPositiveInteger(process.env.MAX_BACKGROUND_EFFECT_DURATION_MS) ?? 2 * 60 * 60_000;
const FFMPEG_TIMEOUT_MS = readPositiveInteger(process.env.FFMPEG_TIMEOUT_MS) ?? 120_000;
const BACKGROUND_EFFECT_TIMEOUT_MS = readPositiveInteger(process.env.BACKGROUND_EFFECT_TIMEOUT_MS) ?? 30 * 60_000;
const RATE_LIMIT_WINDOW_MS = 60_000;

const PROTECTED_ROUTE_CONFIG = new Map([
  ["GET /ffmpeg/version", { concurrency: 2, requestsPerWindow: readPositiveInteger(process.env.MAX_VERSION_REQUESTS_PER_MINUTE) ?? 20 }],
  ["POST /transcode/wav", { concurrency: readPositiveInteger(process.env.MAX_CONCURRENT_TRANSCODES) ?? 2, requestsPerWindow: readPositiveInteger(process.env.MAX_TRANSCODE_REQUESTS_PER_MINUTE) ?? 30 }],
  ["POST /probe/media", { concurrency: readPositiveInteger(process.env.MAX_CONCURRENT_PROBES) ?? 4, requestsPerWindow: readPositiveInteger(process.env.MAX_PROBE_REQUESTS_PER_MINUTE) ?? 60 }],
  ["POST /derive/poster", { concurrency: readPositiveInteger(process.env.MAX_CONCURRENT_POSTERS) ?? 2, requestsPerWindow: readPositiveInteger(process.env.MAX_POSTER_REQUESTS_PER_MINUTE) ?? 30 }],
  ["POST /render/background-effect", { concurrency: readPositiveInteger(process.env.MAX_CONCURRENT_BACKGROUND_EFFECTS) ?? 1, requestsPerWindow: readPositiveInteger(process.env.MAX_BACKGROUND_EFFECT_REQUESTS_PER_MINUTE) ?? 6 }],
]);

const activeRouteCounts = new Map();
const rateLimitWindows = new Map();

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

function readRequestBuffer(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    let rejected = false;

    req.on("data", (chunk) => {
      if (rejected) return;
      totalBytes += chunk.length;
      if (req.forgeContext) req.forgeContext.inputBytes = totalBytes;
      if (totalBytes > maxBytes) {
        rejected = true;
        reject(Object.assign(new Error(`Request body exceeds ${maxBytes} bytes.`), { statusCode: 413 }));
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => { if (!rejected) resolve(Buffer.concat(chunks)); });
    req.on("error", (error) => { if (!rejected) reject(error); });
    req.on("aborted", () => { if (!rejected) reject(Object.assign(new Error("Request aborted."), { statusCode: 499 })); });
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
  });
}

async function inspectMediaFile(filePath) {
  const result = await runCommand(
    "ffprobe",
    ["-v", "error", "-show_streams", "-show_format", "-of", "json", filePath],
    Math.min(FFMPEG_TIMEOUT_MS, 30_000),
  );
  return parseFfprobeMedia(JSON.parse(result.stdout));
}

function assertDurationWithinLimit(inspection, maximumDurationMs, routeLabel) {
  const durationMs = Number(inspection?.duration_ms);
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    throw Object.assign(new Error(`${routeLabel} input duration could not be verified.`), { statusCode: 422 });
  }
  if (durationMs > maximumDurationMs) {
    throw Object.assign(new Error(`${routeLabel} input exceeds the ${maximumDurationMs}ms duration limit.`), { statusCode: 413 });
  }
}

function assertOutputWithinLimit(bytes, maximumBytes, routeLabel) {
  if (bytes.byteLength > maximumBytes) {
    throw Object.assign(new Error(`${routeLabel} output exceeds the ${maximumBytes}-byte limit.`), { statusCode: 413 });
  }
}

function readSecret(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length >= 32 ? trimmed : null;
}

function tokenDigest(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest();
}

function loadServiceCredentials() {
  const credentials = [];
  const definitions = [
    ["netlify", "FORGE_FFMPEG_NETLIFY_SERVICE_TOKEN_CURRENT", "FORGE_FFMPEG_NETLIFY_SERVICE_TOKEN_NEXT"],
    ["supabase", "FORGE_FFMPEG_SUPABASE_SERVICE_TOKEN_CURRENT", "FORGE_FFMPEG_SUPABASE_SERVICE_TOKEN_NEXT"],
    ["worker", "FORGE_FFMPEG_WORKER_SERVICE_TOKEN_CURRENT", "FORGE_FFMPEG_WORKER_SERVICE_TOKEN_NEXT"],
  ];
  for (const [callerId, currentName, nextName] of definitions) {
    for (const [generation, name] of [["current", currentName], ["next", nextName]]) {
      const token = readSecret(process.env[name]);
      if (token) credentials.push({ callerId, generation, digest: tokenDigest(token) });
    }
  }

  const seen = new Set();
  for (const credential of credentials) {
    const encoded = credential.digest.toString("hex");
    if (seen.has(encoded)) {
      return { credentials: [], error: "Service credentials must be unique per caller and rotation slot." };
    }
    seen.add(encoded);
  }
  return credentials.length > 0
    ? { credentials, error: null }
    : { credentials: [], error: "No valid service credentials are configured." };
}

const SERVICE_AUTH = loadServiceCredentials();

function authenticateServiceRequest(req) {
  if (SERVICE_AUTH.error) {
    throw Object.assign(new Error("Forge FFmpeg service authentication is unavailable."), { statusCode: 503 });
  }
  const authorization = req.headers.authorization;
  if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) {
    throw Object.assign(new Error("Service authentication required."), { statusCode: 401 });
  }
  const token = readSecret(authorization.slice("Bearer ".length));
  if (!token) throw Object.assign(new Error("Invalid service credential."), { statusCode: 401 });
  const candidate = tokenDigest(token);
  const match = SERVICE_AUTH.credentials.find((credential) => crypto.timingSafeEqual(credential.digest, candidate));
  if (!match) throw Object.assign(new Error("Invalid service credential."), { statusCode: 401 });
  return { callerId: match.callerId, generation: match.generation };
}

function consumeRateLimit(callerId, routeKey, maximum) {
  const now = Date.now();
  const key = `${callerId}:${routeKey}`;
  const existing = rateLimitWindows.get(key);
  if (!existing || now - existing.startedAt >= RATE_LIMIT_WINDOW_MS) {
    rateLimitWindows.set(key, { startedAt: now, count: 1 });
    return true;
  }
  if (existing.count >= maximum) return false;
  existing.count += 1;
  return true;
}

async function runProtectedRoute(req, res, routeKey, handler) {
  let identity;
  try {
    identity = authenticateServiceRequest(req);
  } catch (error) {
    sendJson(res, error.statusCode ?? 401, { ok: false, error: { message: error.message } });
    return;
  }
  req.forgeContext.callerId = identity.callerId;
  res.setHeader("x-forge-caller-id", identity.callerId);

  const config = PROTECTED_ROUTE_CONFIG.get(routeKey);
  if (!config) {
    sendJson(res, 500, { ok: false, error: { message: "Protected route configuration is missing." } });
    return;
  }
  if (!consumeRateLimit(identity.callerId, routeKey, config.requestsPerWindow)) {
    sendJson(res, 429, { ok: false, retryable: true, error: { message: "Caller rate limit exceeded." } });
    return;
  }
  const active = activeRouteCounts.get(routeKey) ?? 0;
  if (active >= config.concurrency) {
    sendJson(res, 429, { ok: false, retryable: true, error: { message: "Route concurrency limit reached." } });
    return;
  }
  activeRouteCounts.set(routeKey, active + 1);
  try {
    await handler(req, res);
  } finally {
    const remaining = Math.max(0, (activeRouteCounts.get(routeKey) ?? 1) - 1);
    if (remaining === 0) activeRouteCounts.delete(routeKey);
    else activeRouteCounts.set(routeKey, remaining);
  }
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
    const body = await readRequestBuffer(req, MAX_BACKGROUND_EFFECT_INPUT_BYTES);
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
      const sourceInspection = await inspectMediaFile(sourcePath);
      assertDurationWithinLimit(sourceInspection, MAX_BACKGROUND_EFFECT_DURATION_MS, "Background-effect render");
      await fsPromises.writeFile(planPath, JSON.stringify(payload.plan));
      if (audioPath) await fsPromises.writeFile(audioPath, audio);
      if (replacementPath) await fsPromises.writeFile(replacementPath, replacement);
      const args = ["background-effects-render.py", "--input", sourcePath, "--output", outputPath, "--plan", planPath];
      if (audioPath) args.push("--audio", audioPath);
      if (replacementPath) args.push("--replacement", replacementPath);
      const executed = await runCommand("python", args, BACKGROUND_EFFECT_TIMEOUT_MS);
      const report = JSON.parse(executed.stdout.trim());
      if (!report?.ok || !report.evidence) throw new Error("Background-effect renderer returned invalid evidence.");
      const bytes = await fsPromises.readFile(outputPath);
      assertOutputWithinLimit(bytes, MAX_BACKGROUND_EFFECT_OUTPUT_BYTES, "Background-effect render");
      return { bytes, evidence: report.evidence };
    });
    res.writeHead(200, {
      "content-type": "video/mp4",
      "content-length": output.bytes.byteLength,
      "cache-control": "no-store",
      "x-forge-request-id": req.forgeContext.requestId,
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
    const inputBuffer = await readRequestBuffer(req, MAX_TRANSCODE_INPUT_BYTES);
    if (inputBuffer.byteLength === 0) {
      sendJson(res, 400, {
        ok: false,
        error: { message: "POST /transcode/wav requires a non-empty binary body." },
      });
      return;
    }

    const requestId = req.forgeContext.requestId;
    const sourceName = req.headers["x-file-name"];
    const sourceExt = typeof sourceName === "string" && sourceName.includes(".")
      ? path.extname(sourceName).slice(0, 16)
      : ".bin";

    const output = await withTempDir(async (tempDir) => {
      const inputPath = path.join(tempDir, `input${sourceExt}`);
      const outputPath = path.join(tempDir, "output.wav");
      await fsPromises.writeFile(inputPath, inputBuffer);
      const sourceInspection = await inspectMediaFile(inputPath);
      assertDurationWithinLimit(sourceInspection, MAX_TRANSCODE_DURATION_MS, "WAV transcode");
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
      assertOutputWithinLimit(bytes, MAX_TRANSCODE_OUTPUT_BYTES, "WAV transcode");
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
    const inputBuffer = await readRequestBuffer(req, MAX_PROBE_INPUT_BYTES);
    if (inputBuffer.byteLength === 0) {
      sendJson(res, 400, { ok: false, error: { message: "POST /probe/media requires a non-empty binary body." } });
      return;
    }
    const sourceName = req.headers["x-file-name"];
    const sourceExt = typeof sourceName === "string" && sourceName.includes(".") ? path.extname(sourceName).slice(0, 16) : ".bin";
    const result = await withTempDir(async (tempDir) => {
      const inputPath = path.join(tempDir, `input${sourceExt}`);
      await fsPromises.writeFile(inputPath, inputBuffer);
      return inspectMediaFile(inputPath);
    });
    assertDurationWithinLimit(result, MAX_PROBE_DURATION_MS, "Media probe");
    sendJson(res, 200, { ok: true, inspection: result });
  } catch (error) {
    sendJson(res, error.statusCode ?? 500, { ok: false, error: { message: error.message, stderr: error.stderr ?? null } });
  }
}

async function handleDerivePoster(req, res) {
  try {
    const inputBuffer = await readRequestBuffer(req, MAX_POSTER_INPUT_BYTES);
    if (inputBuffer.byteLength === 0) {
      sendJson(res, 400, { ok: false, error: { message: "POST /derive/poster requires a non-empty binary body." } });
      return;
    }
    const sourceName = req.headers["x-file-name"];
    const sourceExt = typeof sourceName === "string" && sourceName.includes(".") ? path.extname(sourceName).slice(0, 16) : ".bin";
    const output = await withTempDir(async (tempDir) => {
      const inputPath = path.join(tempDir, `input${sourceExt}`);
      const outputPath = path.join(tempDir, "poster.jpg");
      await fsPromises.writeFile(inputPath, inputBuffer);
      const inspection = await inspectMediaFile(inputPath);
      assertDurationWithinLimit(inspection, MAX_POSTER_DURATION_MS, "Poster extraction");
      await runCommand("ffmpeg", [
        "-hide_banner",
        "-loglevel", "error",
        "-ss", "0.1",
        "-i", inputPath,
        "-frames:v", "1",
        "-vf", "scale='min(1280,iw)':-2",
        "-y",
        outputPath,
      ], FFMPEG_TIMEOUT_MS);
      const bytes = await fsPromises.readFile(outputPath);
      assertOutputWithinLimit(bytes, MAX_POSTER_OUTPUT_BYTES, "Poster extraction");
      return bytes;
    });
    res.writeHead(200, {
      "content-type": "image/jpeg",
      "content-length": output.byteLength,
      "cache-control": "no-store",
      "x-forge-request-id": req.forgeContext.requestId,
      "x-forge-output-format": "jpeg",
    });
    res.end(output);
  } catch (error) {
    sendJson(res, error.statusCode ?? 500, { ok: false, error: { message: error.message, stderr: error.stderr ?? null } });
  }
}

const server = http.createServer(async (req, res) => {
  const method = req.method ?? "GET";
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const requestId = buildRequestId();
  const startedAt = Date.now();
  req.forgeContext = { requestId, callerId: "public", inputBytes: 0 };
  res.setHeader("x-forge-request-id", requestId);
  res.on("finish", () => {
    const outputLength = Number(res.getHeader("content-length"));
    console.log(JSON.stringify({
      event: "forge_ffmpeg_request",
      request_id: requestId,
      caller_id: req.forgeContext.callerId,
      method,
      route: url.pathname,
      status: res.statusCode,
      input_bytes: req.forgeContext.inputBytes,
      output_bytes: Number.isFinite(outputLength) ? outputLength : null,
      duration_ms: Date.now() - startedAt,
    }));
  });

  try {
    if (method === "GET" && url.pathname === "/health") {
      await handleHealth(req, res);
      return;
    }

    if (method === "GET" && url.pathname === "/ffmpeg/version") {
      await runProtectedRoute(req, res, "GET /ffmpeg/version", handleFfmpegVersion);
      return;
    }

    if (method === "POST" && url.pathname === "/transcode/wav") {
      await runProtectedRoute(req, res, "POST /transcode/wav", handleTranscodeWav);
      return;
    }
    if (method === "POST" && url.pathname === "/probe/media") {
      await runProtectedRoute(req, res, "POST /probe/media", handleProbeMedia);
      return;
    }
    if (method === "POST" && url.pathname === "/derive/poster") {
      await runProtectedRoute(req, res, "POST /derive/poster", handleDerivePoster);
      return;
    }
    if (method === "POST" && url.pathname === "/render/background-effect") {
      await runProtectedRoute(req, res, "POST /render/background-effect", handleBackgroundEffectRender);
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

export { server };

if (process.env.FORGE_FFMPEG_DISABLE_LISTEN !== "1") {
  server.listen(PORT, HOST, () => {
    console.log(`forge-ffmpeg listening on http://${HOST}:${PORT}`);
  });

  process.on("SIGTERM", () => {
    server.close(() => process.exit(0));
  });

  process.on("SIGINT", () => {
    server.close(() => process.exit(0));
  });
}
