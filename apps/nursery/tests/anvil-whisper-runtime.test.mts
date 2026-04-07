import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import anvilWhisperFunction from "../netlify/functions/anvil-whisper";
import {
  ANVIL_WHISPER_ROUTE,
  createAnvilWhisperHandler,
  type AnvilWhisperRuntimeConfig,
} from "../server/anvil/create-anvil-whisper-handler";
import { mwAnvilWhisperApi } from "../scripts/mw-anvil-whisper-api";

function buildConfig(overrides: Partial<AnvilWhisperRuntimeConfig> = {}): AnvilWhisperRuntimeConfig {
  return {
    apiKey: null,
    sttModel: "gpt-4o-mini-transcribe",
    ...overrides,
  };
}

function buildChunkFormData(): FormData {
  const form = new FormData();
  form.set("file", new Blob(["test audio"], { type: "audio/webm" }), "chunk.webm");
  form.set("language", "en-US");
  return form;
}

function buildChunkRequest(url: string): Request {
  return new Request(url, {
    method: "POST",
    body: buildChunkFormData(),
  });
}

async function startForgeFfmpegStub(args: {
  responseBody: Buffer | string;
  onRequest?: (request: { headers: Record<string, string | string[] | undefined>; body: Buffer }) => void;
}): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      args.onRequest?.({ headers: req.headers, body });
      res.statusCode = 200;
      res.setHeader("content-type", "audio/wav");
      res.setHeader("x-forge-request-id", "ffmpeg_req_01");
      res.setHeader("x-forge-output-format", "wav");
      res.setHeader("x-forge-output-sample-rate", "48000");
      res.setHeader("x-forge-output-channels", "1");
      res.end(args.responseBody);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("FFmpeg test server failed to bind.");
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

test("createAnvilWhisperHandler keeps error semantics when api key is missing", async () => {
  const handler = createAnvilWhisperHandler(buildConfig({ apiKey: null }));
  const response = await handler(buildChunkRequest(`http://localhost${ANVIL_WHISPER_ROUTE}`));

  assert.equal(response.status, 500);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.error, "Missing OPENAI_TEXT_API_KEY (or OPENAI_API_KEY) in server env");
});

test("createAnvilWhisperHandler rejects non-post requests", async () => {
  const handler = createAnvilWhisperHandler(buildConfig({ apiKey: "test-key" }));
  const response = await handler(new Request(`http://localhost${ANVIL_WHISPER_ROUTE}`));

  assert.equal(response.status, 405);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.error, "Method not allowed");
});

test("Vite middleware whisper route matches direct handler output", async () => {
  const priorKey = process.env.OPENAI_TEXT_API_KEY;
  const priorFallbackKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_TEXT_API_KEY;
  delete process.env.OPENAI_API_KEY;

  const middleware = mwAnvilWhisperApi();
  const server = createServer((req, res) => {
    middleware(req, res, (error) => {
      if (error) {
        res.statusCode = 500;
        res.end(String(error));
        return;
      }
      res.statusCode = 404;
      res.end("not found");
    });
  });

  try {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${address.port}${ANVIL_WHISPER_ROUTE}`;

    const direct = await createAnvilWhisperHandler(buildConfig({ apiKey: null }))(buildChunkRequest(url));
    const directJson = await direct.json();

    const adapted = await fetch(url, {
      method: "POST",
      body: buildChunkFormData(),
    });
    assert.equal(adapted.status, direct.status);
    const adaptedJson = await adapted.json();

    assert.deepEqual(adaptedJson, directJson);
  } finally {
    server.close();
    await once(server, "close");
    if (priorKey == null) delete process.env.OPENAI_TEXT_API_KEY;
    else process.env.OPENAI_TEXT_API_KEY = priorKey;
    if (priorFallbackKey == null) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = priorFallbackKey;
  }
});

test("Netlify whisper function matches direct handler output", async () => {
  const direct = await createAnvilWhisperHandler(buildConfig({ apiKey: null }))(
    new Request(`http://localhost${ANVIL_WHISPER_ROUTE}`),
  );
  const directJson = await direct.json();

  const deployed = await anvilWhisperFunction(
    new Request("http://localhost/.netlify/functions/anvil-whisper"),
  );
  assert.equal(deployed.status, direct.status);
  const deployedJson = await deployed.json();

  assert.deepEqual(deployedJson, directJson);
});

test("createAnvilWhisperHandler retries unsupported audio through forge-ffmpeg fallback", async () => {
  const ffmpegServer = await startForgeFfmpegStub({
    responseBody: Buffer.from("RIFFfakewave", "utf8"),
  });
  const originalFetch = globalThis.fetch;
  let openAiCalls = 0;
  let ffmpegCalls = 0;
  const seenOpenAiFileTypes: string[] = [];

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url === "https://api.openai.com/v1/audio/transcriptions") {
      openAiCalls += 1;
      const body = init?.body;
      assert(body instanceof FormData);
      const file = body.get("file");
      assert(file instanceof Blob);
      seenOpenAiFileTypes.push(file.type);

      if (openAiCalls === 1) {
        return new Response(JSON.stringify({
          error: { message: "Audio file might be corrupted or unsupported" },
        }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        text: "Recovered via wav fallback",
      }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-request-id": "req_after_ffmpeg",
        },
      });
    }

    if (url === `${ffmpegServer.baseUrl}/transcode/wav`) {
      ffmpegCalls += 1;
    }

    return originalFetch(input, init);
  };

  try {
    const handler = createAnvilWhisperHandler(buildConfig({
      apiKey: "test-key",
      configuredBillingMode: "byo",
      ffmpegClient: {
        baseUrl: ffmpegServer.baseUrl,
        timeoutMs: 5_000,
        maxAttempts: 1,
        retryDelayMs: 1,
      },
    }));

    const response = await handler(buildChunkRequest(`http://localhost${ANVIL_WHISPER_ROUTE}`));
    assert.equal(response.status, 200);
    const payload = await response.json();

    assert.equal(payload.ok, true);
    assert.equal(payload.text, "Recovered via wav fallback");
    assert.equal(payload.provider_request_id, "req_after_ffmpeg");
    assert.equal(payload.ffmpeg_fallback_attempted, true);
    assert.equal(payload.ffmpeg_fallback_used, true);
    assert.equal(openAiCalls, 2);
    assert.equal(ffmpegCalls, 1);
    assert.deepEqual(seenOpenAiFileTypes, ["audio/webm", "audio/wav"]);
  } finally {
    globalThis.fetch = originalFetch;
    await ffmpegServer.close();
  }
});
