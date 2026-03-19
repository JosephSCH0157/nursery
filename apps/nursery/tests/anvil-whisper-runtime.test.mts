import assert from "node:assert/strict";
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
