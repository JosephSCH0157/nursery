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
import { AI_USAGE_LANE } from "../../../packages/tongs/src/ai-usage-taxonomy";

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

const TEST_USER_ID = "11111111-2222-4333-8444-555555555555";

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
  let applyDeltaCalls = 0;

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: TEST_USER_ID }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
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
    if (url.includes("/rest/v1/rpc/apply_ai_token_delta")) {
      applyDeltaCalls += 1;
      return new Response(JSON.stringify([{ token_balance: 999_999 }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    return originalFetch(input, init);
  };

  try {
    const handler = createAnvilWhisperHandler(buildConfig({
      apiKey: "test-key",
      configuredBillingMode: AI_USAGE_LANE.FORGE,
      initialTokenBalance: 999_999,
      supabaseUrl: "https://runtime-test.supabase.co",
      supabaseServiceRoleKey: "service-role",
      ffmpegClient: {
        baseUrl: ffmpegServer.baseUrl,
        timeoutMs: 5_000,
        maxAttempts: 1,
        retryDelayMs: 1,
      },
    }));

    const response = await handler(new Request(`http://localhost${ANVIL_WHISPER_ROUTE}`, {
      method: "POST",
      headers: { authorization: "Bearer test-access-token" },
      body: buildChunkFormData(),
    }));
    assert.equal(response.status, 200);
    const payload = await response.json();

    assert.equal(payload.ok, true);
    assert.equal(payload.text, "Recovered via wav fallback");
    assert.equal(payload.provider_request_id, "req_after_ffmpeg");
    assert.equal(payload.ffmpeg_fallback_attempted, true);
    assert.equal(payload.ffmpeg_fallback_used, true);
    assert.equal(openAiCalls, 2);
    assert.equal(ffmpegCalls, 1);
    assert.equal(applyDeltaCalls, 1);
    assert.deepEqual(seenOpenAiFileTypes, ["audio/webm", "audio/wav"]);
  } finally {
    globalThis.fetch = originalFetch;
    await ffmpegServer.close();
  }
});

test("createAnvilWhisperHandler treats client lane as advisory and still enforces BYO resolution", async () => {
  const originalFetch = globalThis.fetch;
  let openAiCalls = 0;

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: TEST_USER_ID }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("/rest/v1/rpc/get_user_ai_key_for_resolution")) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url === "https://api.openai.com/v1/audio/transcriptions") {
      openAiCalls += 1;
      return new Response(JSON.stringify({ text: "should-not-run" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch call in test: ${url} ${init?.method ?? "GET"}`);
  };

  try {
    const handler = createAnvilWhisperHandler(buildConfig({
      apiKey: "forge-key",
      configuredBillingMode: AI_USAGE_LANE.BYO,
      supabaseUrl: "https://runtime-test.supabase.co",
      supabaseServiceRoleKey: "service-role",
    }));
    const form = buildChunkFormData();
    form.set("lane", AI_USAGE_LANE.FORGE);
    const response = await handler(new Request(`http://localhost${ANVIL_WHISPER_ROUTE}`, {
      method: "POST",
      headers: { authorization: "Bearer test-access-token" },
      body: form,
    }));

    assert.equal(response.status, 422);
    const payload = await response.json();
    assert.equal(payload.ok, false);
    assert.equal(payload.code, "missing_user_byo_key");
    assert.equal(payload.billing_mode, AI_USAGE_LANE.BYO);
    assert.equal(openAiCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createAnvilWhisperHandler blocks forge requests with exhausted credits before upstream OpenAI call", async () => {
  const originalFetch = globalThis.fetch;
  let openAiCalls = 0;

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: TEST_USER_ID }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url === "https://api.openai.com/v1/audio/transcriptions") {
      openAiCalls += 1;
      return new Response(JSON.stringify({ text: "should-not-run" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch call in test: ${url} ${init?.method ?? "GET"}`);
  };

  try {
    const handler = createAnvilWhisperHandler(buildConfig({
      apiKey: "forge-key",
      configuredBillingMode: AI_USAGE_LANE.FORGE,
      initialTokenBalance: 0,
      supabaseUrl: "https://runtime-test.supabase.co",
      supabaseServiceRoleKey: "service-role",
    }));
    const form = buildChunkFormData();
    form.set("lane", AI_USAGE_LANE.FORGE);
    const response = await handler(new Request(`http://localhost${ANVIL_WHISPER_ROUTE}`, {
      method: "POST",
      headers: { authorization: "Bearer test-access-token" },
      body: form,
    }));

    assert.equal(response.status, 402);
    const payload = await response.json();
    assert.equal(payload.ok, false);
    assert.equal(payload.error, "No AI credits remaining.");
    assert.equal(payload.billing_mode, AI_USAGE_LANE.FORGE);
    assert.equal(openAiCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createAnvilWhisperHandler routes ASR2 lane to configured provider model", async () => {
  const originalFetch = globalThis.fetch;
  let seenModel = "";

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: TEST_USER_ID }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("/rest/v1/rpc/apply_ai_token_delta")) {
      return new Response(JSON.stringify([{ token_balance: 999_999 }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url === "https://api.openai.com/v1/audio/transcriptions") {
      const body = init?.body;
      assert(body instanceof FormData);
      seenModel = String(body.get("model") || "");
      return new Response(JSON.stringify({ text: "ok" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch call in test: ${url} ${init?.method ?? "GET"}`);
  };

  try {
    const handler = createAnvilWhisperHandler(buildConfig({
      apiKey: "forge-key",
      asr2SttModel: "whisper-1",
      configuredBillingMode: AI_USAGE_LANE.FORGE,
      initialTokenBalance: 999_999,
      supabaseUrl: "https://runtime-test.supabase.co",
      supabaseServiceRoleKey: "service-role",
    }));
    const form = buildChunkFormData();
    form.set("lane", AI_USAGE_LANE.FORGE);
    form.set("asr_lane", "ASR2_WHISPER_LARGE_V3_EXPERIMENTAL");
    form.set("model_hint", "whisper-large-v3");
    const response = await handler(new Request(`http://localhost${ANVIL_WHISPER_ROUTE}`, {
      method: "POST",
      headers: { authorization: "Bearer test-access-token" },
      body: form,
    }));
    assert.equal(response.status, 200);
    assert.equal(seenModel, "whisper-1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createAnvilWhisperHandler does not fallback models for ASR2 when model is unavailable", async () => {
  const originalFetch = globalThis.fetch;
  const seenModels: string[] = [];

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: TEST_USER_ID }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("/rest/v1/rpc/apply_ai_token_delta")) {
      return new Response(JSON.stringify([{ token_balance: 999_999 }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url === "https://api.openai.com/v1/audio/transcriptions") {
      const body = init?.body;
      assert(body instanceof FormData);
      const model = String(body.get("model") || "");
      seenModels.push(model);
      return new Response(JSON.stringify({
        error: {
          message: "The model `whisper-large-v3` does not exist or you do not have access to it.",
          code: "model_not_found",
        },
      }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch call in test: ${url} ${init?.method ?? "GET"}`);
  };

  try {
    const handler = createAnvilWhisperHandler(buildConfig({
      apiKey: "forge-key",
      sttModel: "gpt-4o-mini-transcribe",
      asr2SttModel: "whisper-large-v3",
      configuredBillingMode: AI_USAGE_LANE.FORGE,
      initialTokenBalance: 999_999,
      supabaseUrl: "https://runtime-test.supabase.co",
      supabaseServiceRoleKey: "service-role",
    }));
    const form = buildChunkFormData();
    form.set("lane", AI_USAGE_LANE.FORGE);
    form.set("asr_lane", "ASR2_WHISPER_LARGE_V3_EXPERIMENTAL");
    form.set("model_hint", "whisper-large-v3");
    const response = await handler(new Request(`http://localhost${ANVIL_WHISPER_ROUTE}`, {
      method: "POST",
      headers: { authorization: "Bearer test-access-token" },
      body: form,
    }));
    assert.equal(response.status, 404);
    const payload = await response.json();
    assert.equal(payload.ok, false);
    assert.equal(payload.error, "ASR2 model unavailable for selected provider");
    assert.deepEqual(seenModels, ["whisper-large-v3"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createAnvilWhisperHandler returns ASR2 provider-model unavailable message when both configured and fallback models fail", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: TEST_USER_ID }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url === "https://api.openai.com/v1/audio/transcriptions") {
      const body = init?.body;
      assert(body instanceof FormData);
      const model = String(body.get("model") || "");
      return new Response(JSON.stringify({
        error: {
          message: `The model \`${model}\` does not exist or you do not have access to it.`,
          code: "model_not_found",
        },
      }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch call in test: ${url} ${init?.method ?? "GET"}`);
  };

  try {
    const handler = createAnvilWhisperHandler(buildConfig({
      apiKey: "forge-key",
      sttModel: "gpt-4o-mini-transcribe",
      asr2SttModel: "whisper-large-v3",
      configuredBillingMode: AI_USAGE_LANE.FORGE,
      initialTokenBalance: 999_999,
      supabaseUrl: "https://runtime-test.supabase.co",
      supabaseServiceRoleKey: "service-role",
    }));
    const form = buildChunkFormData();
    form.set("lane", AI_USAGE_LANE.FORGE);
    form.set("asr_lane", "ASR2_WHISPER_LARGE_V3_EXPERIMENTAL");
    const response = await handler(new Request(`http://localhost${ANVIL_WHISPER_ROUTE}`, {
      method: "POST",
      headers: { authorization: "Bearer test-access-token" },
      body: form,
    }));
    assert.equal(response.status, 404);
    const payload = await response.json();
    assert.equal(payload.ok, false);
    assert.equal(payload.error, "ASR2 model unavailable for selected provider");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createAnvilWhisperHandler routes ASR2 lane through Hugging Face when configured", async () => {
  const originalFetch = globalThis.fetch;
  const seenUrls: string[] = [];
  const seenAuth: string[] = [];
  const seenContentTypes: string[] = [];

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    seenUrls.push(url);
    if (url.includes("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: TEST_USER_ID }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("/rest/v1/rpc/apply_ai_token_delta")) {
      return new Response(JSON.stringify([{ token_balance: 999_999 }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("huggingface.co/api/models/openai/whisper-large-v3-turbo") && url.includes("inferenceProviderMapping")) {
      return new Response(JSON.stringify({
        inferenceProviderMapping: [
          {
            provider: "hf-inference",
            hfModelId: "openai/whisper-large-v3-turbo",
            providerId: "openai/whisper-large-v3-turbo",
            status: "live",
            task: "automatic-speech-recognition",
          },
        ],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.includes("/hf-inference/models/")) {
      let auth = "";
      let contentType = "";
      if (init?.headers instanceof Headers) {
        auth = String(init.headers.get("authorization") ?? "");
        contentType = String(init.headers.get("content-type") ?? "");
      } else if (init?.headers && typeof init.headers === "object") {
        auth = String(
          (init.headers as Record<string, string>)["authorization"]
          ?? (init.headers as Record<string, string>)["Authorization"]
          ?? "",
        );
        contentType = String(
          (init.headers as Record<string, string>)["content-type"]
          ?? (init.headers as Record<string, string>)["Content-Type"]
          ?? "",
        );
      }
      seenAuth.push(auth);
      seenContentTypes.push(contentType);
      return new Response(JSON.stringify({ text: "hf ok" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("router.huggingface.co")) {
      return new Response(JSON.stringify({ text: "hf ok" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch call in test: ${url} ${init?.method ?? "GET"}`);
  };

  try {
    const handler = createAnvilWhisperHandler(buildConfig({
      apiKey: "forge-key",
      asr2Provider: "auto",
      asr2SttModel: "openai/whisper-large-v3-turbo",
      huggingFaceApiToken: "hf_test_token",
      configuredBillingMode: AI_USAGE_LANE.FORGE,
      initialTokenBalance: 999_999,
      supabaseUrl: "https://runtime-test.supabase.co",
      supabaseServiceRoleKey: "service-role",
    }));
    const form = buildChunkFormData();
    form.set("lane", AI_USAGE_LANE.FORGE);
    form.set("asr_lane", "ASR2_WHISPER_LARGE_V3_EXPERIMENTAL");
    const response = await handler(new Request(`http://localhost${ANVIL_WHISPER_ROUTE}`, {
      method: "POST",
      headers: { authorization: "Bearer test-access-token" },
      body: form,
    }));
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.text, "hf ok");
    assert.equal(payload.model, "openai/whisper-large-v3-turbo");
    assert.equal(payload.input_audio_content_type, "audio/webm");
    assert.equal(payload.hf_request_content_type, "audio/webm");
    assert.ok(typeof payload.input_audio_size_bytes === "number" && payload.input_audio_size_bytes > 0);
    assert.ok(!String(payload.model || "").includes(":fastest"));
    assert.ok(seenUrls.some((url) => url.includes("huggingface.co/api/models/openai/whisper-large-v3-turbo") && url.includes("inferenceProviderMapping")));
    assert.ok(!seenUrls.some((url) => url.includes(":fastest")));
    assert.ok(seenAuth.some((value) => value === "Bearer hf_test_token"));
    assert.ok(seenContentTypes.some((value) => value.startsWith("audio/webm")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createAnvilWhisperHandler returns ASR2 local content-type error before Hugging Face call", async () => {
  const originalFetch = globalThis.fetch;
  const seenUrls: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    seenUrls.push(url);
    if (url.includes("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: TEST_USER_ID }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("/rest/v1/rpc/apply_ai_token_delta")) {
      return new Response(JSON.stringify([{ token_balance: 999_999 }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch call in test: ${url} ${init?.method ?? "GET"}`);
  };
  try {
    const handler = createAnvilWhisperHandler(buildConfig({
      apiKey: "forge-key",
      asr2Provider: "auto",
      asr2SttModel: "openai/whisper-large-v3-turbo",
      huggingFaceApiToken: "hf_test_token",
      configuredBillingMode: AI_USAGE_LANE.FORGE,
      initialTokenBalance: 999_999,
      supabaseUrl: "https://runtime-test.supabase.co",
      supabaseServiceRoleKey: "service-role",
    }));
    const form = new FormData();
    form.set("file", new Blob(["test audio"]), "chunk");
    form.set("asr_lane", "ASR2_WHISPER_LARGE_V3_EXPERIMENTAL");
    form.set("lane", AI_USAGE_LANE.FORGE);
    const response = await handler(new Request(`http://localhost${ANVIL_WHISPER_ROUTE}`, {
      method: "POST",
      headers: { authorization: "Bearer test-access-token" },
      body: form,
    }));
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.code, "hf_audio_content_type_missing");
    assert.equal(payload.error, "ASR2 Hugging Face audio content type missing");
    assert.equal(payload.model_id, "openai/whisper-large-v3-turbo");
    assert.equal(payload.input_audio_content_type, null);
    assert.equal(payload.hf_request_content_type, null);
    assert.ok(!seenUrls.some((url) => url.includes("huggingface.co")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createAnvilWhisperHandler returns detailed Hugging Face diagnostics on upstream 404", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: TEST_USER_ID }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("huggingface.co/api/models/openai/whisper-large-v3-turbo") && url.includes("inferenceProviderMapping")) {
      return new Response(JSON.stringify({
        inferenceProviderMapping: [
          {
            provider: "hf-inference",
            hfModelId: "openai/whisper-large-v3-turbo",
            providerId: "openai/whisper-large-v3-turbo",
            status: "live",
            task: "automatic-speech-recognition",
          },
        ],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.includes("/hf-inference/models/")) {
      return new Response(JSON.stringify({
        error: "Model openai/whisper-large-v3 not found",
      }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("huggingface.co")) {
      return new Response(JSON.stringify({
        error: "Model openai/whisper-large-v3 not found",
      }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch call in test: ${url} ${init?.method ?? "GET"}`);
  };

  try {
    const handler = createAnvilWhisperHandler(buildConfig({
      apiKey: "forge-key",
      asr2Provider: "auto",
      asr2SttModel: "openai/whisper-large-v3-turbo",
      huggingFaceApiToken: "hf_test_token",
      configuredBillingMode: AI_USAGE_LANE.FORGE,
      initialTokenBalance: 999_999,
      supabaseUrl: "https://runtime-test.supabase.co",
      supabaseServiceRoleKey: "service-role",
    }));
    const form = buildChunkFormData();
    form.set("lane", AI_USAGE_LANE.FORGE);
    form.set("asr_lane", "ASR2_WHISPER_LARGE_V3_EXPERIMENTAL");
    const response = await handler(new Request(`http://localhost${ANVIL_WHISPER_ROUTE}`, {
      method: "POST",
      headers: { authorization: "Bearer test-access-token" },
      body: form,
    }));
    assert.ok(response.status === 404 || response.status === 502);
    const payload = await response.json();
    assert.equal(payload.ok, false);
    assert.ok(payload.code === "hf_upstream_404" || payload.code === "hf_upstream_error");
    assert.equal(payload.provider, "auto");
    assert.equal(payload.model_id, "openai/whisper-large-v3-turbo");
    assert.ok(!String(payload.model_id || "").includes(":fastest"));
    assert.equal(payload.asr_lane, "ASR2_WHISPER_LARGE_V3_EXPERIMENTAL");
    assert.ok(typeof payload.upstream_status === "number");
    assert.ok(String(payload.upstream_message || "").length > 0);
    assert.ok(!String(payload.upstream_message || "").includes("reading 'accessToken'"));
    assert.ok(String(payload.upstream_url || "").includes("huggingface.co"));
    assert.equal(payload.model_url, "https://huggingface.co/openai/whisper-large-v3-turbo");
    assert.ok(!String(payload.upstream_url || "").includes(":fastest"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createAnvilWhisperHandler distinguishes missing Hugging Face token", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: TEST_USER_ID }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch call in test: ${url} ${init?.method ?? "GET"}`);
  };
  try {
    const handler = createAnvilWhisperHandler(buildConfig({
      apiKey: "forge-key",
      asr2Provider: "auto",
      asr2SttModel: "openai/whisper-large-v3-turbo",
      huggingFaceApiToken: null,
      configuredBillingMode: AI_USAGE_LANE.FORGE,
      initialTokenBalance: 999_999,
      supabaseUrl: "https://runtime-test.supabase.co",
      supabaseServiceRoleKey: "service-role",
    }));
    const form = buildChunkFormData();
    form.set("lane", AI_USAGE_LANE.FORGE);
    form.set("asr_lane", "ASR2_WHISPER_LARGE_V3_EXPERIMENTAL");
    const response = await handler(new Request(`http://localhost${ANVIL_WHISPER_ROUTE}`, {
      method: "POST",
      headers: { authorization: "Bearer test-access-token" },
      body: form,
    }));
    assert.equal(response.status, 500);
    const payload = await response.json();
    assert.equal(payload.code, "hf_missing_token");
    assert.equal(payload.provider, "auto");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createAnvilWhisperHandler distinguishes Hugging Face malformed upstream response", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: TEST_USER_ID }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("huggingface.co/api/models/openai/whisper-large-v3-turbo") && url.includes("inferenceProviderMapping")) {
      return new Response(JSON.stringify({
        inferenceProviderMapping: [
          {
            provider: "hf-inference",
            hfModelId: "openai/whisper-large-v3-turbo",
            providerId: "openai/whisper-large-v3-turbo",
            status: "live",
            task: "automatic-speech-recognition",
          },
        ],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.includes("/hf-inference/models/")) {
      return new Response("<html>not json</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }
    if (url.includes("huggingface.co")) {
      return new Response("<html>not json</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }
    if (url.includes("/rest/v1/rpc/apply_ai_token_delta")) {
      return new Response(JSON.stringify([{ token_balance: 999_999 }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch call in test: ${url} ${init?.method ?? "GET"}`);
  };
  try {
    const handler = createAnvilWhisperHandler(buildConfig({
      apiKey: "forge-key",
      asr2Provider: "auto",
      asr2SttModel: "openai/whisper-large-v3-turbo",
      huggingFaceApiToken: "hf_test_token",
      configuredBillingMode: AI_USAGE_LANE.FORGE,
      initialTokenBalance: 999_999,
      supabaseUrl: "https://runtime-test.supabase.co",
      supabaseServiceRoleKey: "service-role",
    }));
    const form = buildChunkFormData();
    form.set("lane", AI_USAGE_LANE.FORGE);
    form.set("asr_lane", "ASR2_WHISPER_LARGE_V3_EXPERIMENTAL");
    const response = await handler(new Request(`http://localhost${ANVIL_WHISPER_ROUTE}`, {
      method: "POST",
      headers: { authorization: "Bearer test-access-token" },
      body: form,
    }));
    assert.equal(response.status, 502);
    const payload = await response.json();
    assert.equal(payload.code, "hf_malformed_upstream_response");
    assert.equal(payload.provider, "auto");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createAnvilWhisperHandler provider auto resolves via HF mapping (no app hardcoded auto URL)", async () => {
  const originalFetch = globalThis.fetch;
  const seenUrls: string[] = [];

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    seenUrls.push(url);
    if (url.includes("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: TEST_USER_ID }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("/rest/v1/rpc/apply_ai_token_delta")) {
      return new Response(JSON.stringify([{ token_balance: 999_999 }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("huggingface.co/api/models/openai/whisper-large-v3-turbo") && url.includes("inferenceProviderMapping")) {
      return new Response(JSON.stringify({
        inferenceProviderMapping: [
          {
            provider: "hf-inference",
            hfModelId: "openai/whisper-large-v3-turbo",
            providerId: "openai/whisper-large-v3-turbo",
            status: "live",
            task: "automatic-speech-recognition",
          },
        ],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.includes("/hf-inference/models/")) {
      return new Response(JSON.stringify({ text: "ok" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("router.huggingface.co")) {
      return new Response(JSON.stringify({ text: "ok" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch call in test: ${url} ${init?.method ?? "GET"}`);
  };

  try {
    const handler = createAnvilWhisperHandler(buildConfig({
      apiKey: "forge-key",
      asr2Provider: "auto",
      asr2SttModel: "openai/whisper-large-v3-turbo",
      huggingFaceApiToken: "hf_test_token",
      configuredBillingMode: AI_USAGE_LANE.FORGE,
      initialTokenBalance: 999_999,
      supabaseUrl: "https://runtime-test.supabase.co",
      supabaseServiceRoleKey: "service-role",
    }));
    const form = buildChunkFormData();
    form.set("lane", AI_USAGE_LANE.FORGE);
    form.set("asr_lane", "ASR2_WHISPER_LARGE_V3_EXPERIMENTAL");
    const response = await handler(new Request(`http://localhost${ANVIL_WHISPER_ROUTE}`, {
      method: "POST",
      headers: { authorization: "Bearer test-access-token" },
      body: form,
    }));
    assert.equal(response.status, 200);
    assert.ok(
      seenUrls.some((url) => url.includes("inferenceProviderMapping"))
      || seenUrls.some((url) => url.includes("/hf-inference/models/")),
    );
    assert.ok(!seenUrls.some((url) => url.includes(":fastest")));
    assert.ok(!seenUrls.some((url) => url.includes("/models/openai%2Fwhisper-large-v3-turbo%3Afastest/automatic-speech-recognition?provider=auto")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createAnvilWhisperHandler ASR2 deduction failure is deferred without blocking transcription", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: TEST_USER_ID }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("huggingface.co/api/models/openai/whisper-large-v3-turbo") && url.includes("inferenceProviderMapping")) {
      return new Response(JSON.stringify({
        inferenceProviderMapping: [
          {
            provider: "hf-inference",
            hfModelId: "openai/whisper-large-v3-turbo",
            providerId: "openai/whisper-large-v3-turbo",
            status: "live",
            task: "automatic-speech-recognition",
          },
        ],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.includes("/hf-inference/models/") || url.includes("router.huggingface.co")) {
      return new Response(JSON.stringify({ text: "hf ok deferred" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("/rest/v1/rpc/apply_ai_token_delta")) {
      return new Response(JSON.stringify({ error: "db write failed" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch call in test: ${url} ${init?.method ?? "GET"}`);
  };
  try {
    const handler = createAnvilWhisperHandler(buildConfig({
      apiKey: "forge-key",
      asr2Provider: "auto",
      asr2SttModel: "openai/whisper-large-v3-turbo",
      huggingFaceApiToken: "hf_test_token",
      configuredBillingMode: AI_USAGE_LANE.FORGE,
      initialTokenBalance: 999_999,
      supabaseUrl: "https://runtime-test.supabase.co",
      supabaseServiceRoleKey: "service-role",
    }));
    const form = buildChunkFormData();
    form.set("lane", AI_USAGE_LANE.FORGE);
    form.set("asr_lane", "ASR2_WHISPER_LARGE_V3_EXPERIMENTAL");
    const response = await handler(new Request(`http://localhost${ANVIL_WHISPER_ROUTE}`, {
      method: "POST",
      headers: { authorization: "Bearer test-access-token" },
      body: form,
    }));
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.text, "hf ok deferred");
    assert.equal(payload.billing_mode, "forge");
    assert.equal(payload.billing_status, "deduction_deferred");
    assert.equal(payload.billing_error_code, "forge_deduction_failed");
    assert.equal(payload.asr_lane, "ASR2_WHISPER_LARGE_V3_EXPERIMENTAL");
    assert.equal(payload.provider, "auto");
    assert.equal(payload.model_id, "openai/whisper-large-v3-turbo");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createAnvilWhisperHandler ASR1 deduction failure still blocks with forge_deduction_failed", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: TEST_USER_ID }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url === "https://api.openai.com/v1/audio/transcriptions") {
      return new Response(JSON.stringify({ text: "asr1 ok" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("/rest/v1/rpc/apply_ai_token_delta")) {
      return new Response(JSON.stringify({ error: "db write failed" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch call in test: ${url} ${init?.method ?? "GET"}`);
  };
  try {
    const handler = createAnvilWhisperHandler(buildConfig({
      apiKey: "forge-key",
      sttModel: "gpt-4o-mini-transcribe",
      configuredBillingMode: AI_USAGE_LANE.FORGE,
      initialTokenBalance: 999_999,
      supabaseUrl: "https://runtime-test.supabase.co",
      supabaseServiceRoleKey: "service-role",
    }));
    const form = buildChunkFormData();
    form.set("lane", AI_USAGE_LANE.FORGE);
    const response = await handler(new Request(`http://localhost${ANVIL_WHISPER_ROUTE}`, {
      method: "POST",
      headers: { authorization: "Bearer test-access-token" },
      body: form,
    }));
    assert.equal(response.status, 502);
    const payload = await response.json();
    assert.equal(payload.ok, false);
    assert.equal(payload.code, "forge_deduction_failed");
    assert.equal(payload.billing_mode, "forge");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
