import assert from "node:assert/strict";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import fsPromises from "node:fs/promises";
import { createHammerPrepMiddleware } from "../scripts/mw-hammer-prep";

type FetchCall = {
  url: string;
  method: string;
  headers: Headers;
  body: unknown;
};

const TEST_USER_ID = "11111111-1111-4111-8111-111111111111";
const TEST_ORG_ID = "22222222-2222-4222-8222-222222222222";
const TEST_WORKSPACE_ID = "33333333-3333-4333-8333-333333333333";
const TEST_WORKPIECE_ID = "44444444-4444-4444-8444-444444444444";

function toUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

async function listenServer(handler: http.RequestListener): Promise<{
  origin: string;
  close: () => Promise<void>;
}> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to bind test server.");
  }
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    },
  };
}

async function startForgeFfmpegStub(args: {
  responseBody: Buffer;
  events: string[];
}): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
  calls: () => number;
  setResponse: (status: number, body: Buffer) => void;
}> {
  let callCount = 0;
  let responseStatus = 200;
  let responseBody = args.responseBody;
  const server = http.createServer((req, res) => {
    if (req.method === "POST" && req.url === "/transcode/wav") {
      callCount += 1;
      args.events.push("ffmpeg");
      req.resume();
      res.statusCode = responseStatus;
      res.setHeader("content-type", "audio/wav");
      res.setHeader("x-forge-request-id", "ffmpeg_req_hammer_transcript");
      res.setHeader("x-forge-output-format", "wav_pcm_s16le");
      res.setHeader("x-forge-output-sample-rate", "16000");
      res.setHeader("x-forge-output-channels", "1");
      res.end(responseBody);
      return;
    }
    res.statusCode = 404;
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to bind Forge FFmpeg test server.");
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    },
    calls: () => callCount,
    setResponse: (status, body) => {
      responseStatus = status;
      responseBody = body;
    },
  };
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

async function main(): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalTranscriptBackend = process.env.HAMMER_TRANSCRIPT_AUDIO_TRANSCODE_BACKEND;
  const originalForgeFfmpegBaseUrl = process.env.HAMMER_FORGE_FFMPEG_BASE_URL;
  const calls: FetchCall[] = [];
  const events: string[] = [];
  const transcriptionUploads: Array<{ type: string; name: string; bytes: Buffer }> = [];
  let refuseWavTranscription = false;

  process.env.OPENAI_API_KEY = "test-openai-key";
  process.env.TONGS_SUPABASE_URL = "https://example.supabase.co";
  process.env.TONGS_SUPABASE_ANON_KEY = "test-anon-key";
  delete process.env.HAMMER_OPENAI_TRANSCRIBE_TIMEOUT_MS;

  const middleware = createHammerPrepMiddleware();
  const ffmpegServer = await startForgeFfmpegStub({
    responseBody: Buffer.from("RIFFfake-transcript-wave", "utf8"),
    events,
  });
  process.env.HAMMER_FORGE_FFMPEG_BASE_URL = ffmpegServer.baseUrl;
  process.env.HAMMER_TRANSCRIPT_AUDIO_TRANSCODE_BACKEND = "forge";
  const server = await listenServer((req, res) => {
    middleware(req, res, (error) => {
      if (error) {
        res.statusCode = 500;
        res.setHeader("content-type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ ok: false, error: { message: String(error) } }));
        return;
      }
      res.statusCode = 404;
      res.end();
    });
  });

  const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "hammer-transcript-normalization-"));
  try {
    const mediaName = "source.wav";
    await fsPromises.writeFile(path.join(tempRoot, mediaName), Buffer.from("fake-audio-bytes"));
    await fsPromises.writeFile(path.join(tempRoot, "source.webm"), Buffer.from("fake-video-bytes"));
    await fsPromises.writeFile(path.join(tempRoot, "source-audio.webm"), Buffer.from("fake-audio-webm-bytes"));

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = toUrl(input);
      if (url.startsWith(server.origin) || url.startsWith(ffmpegServer.baseUrl)) {
        return originalFetch(input, init);
      }

      const method = (init?.method ?? "GET").toUpperCase();
      const headers = new Headers(init?.headers ?? {});
      let body: unknown = null;
      if (typeof init?.body === "string") {
        try {
          body = JSON.parse(init.body);
        } catch {
          body = init.body;
        }
      }
      calls.push({ url, method, headers, body });

      if (url.endsWith("/auth/v1/user")) {
        return jsonResponse(200, { id: TEST_USER_ID });
      }
      if (url.includes("/rest/v1/workspaces?id=eq.")) {
        return jsonResponse(200, [{ org_id: TEST_ORG_ID }]);
      }
      if (url.endsWith("/rest/v1/rpc/resolve_ai_policy")) {
        return jsonResponse(200, [{ decision_type: "ALLOW", reason_code: null }]);
      }
      if (url === "https://api.openai.com/v1/audio/transcriptions") {
        events.push("transcription");
        const body = init?.body;
        assert(body instanceof FormData, "expected OpenAI request body to be FormData");
        const file = body.get("file");
        assert(file instanceof Blob, "expected OpenAI request to include a file blob");
        transcriptionUploads.push({
          type: file.type,
          name: file instanceof File ? file.name : "",
          bytes: Buffer.from(await file.arrayBuffer()),
        });
        if (file.type === "audio/webm") {
          return jsonResponse(400, {
            error: {
              message: "Audio file might be corrupted or unsupported",
              type: "invalid_request_error",
              param: "file",
              code: "invalid_value",
            },
          });
        }
        if (calls.filter((call) => call.url === "https://api.openai.com/v1/audio/transcriptions").length >= 2) {
          assert.equal(file.type, "audio/wav", "expected fallback/transcoded upload to be WAV");
        }
        if (refuseWavTranscription && file.type === "audio/wav") {
          return jsonResponse(422, { error: { message: "transcription refused normalized WAV" } });
        }
        const longText = [
          "Here is the weird part.",
          "This is a longer sentence designed to force deterministic splitting because it contains a lot of words without stopping for a while.",
          "Now watch this!",
          "Right?",
        ].join(" ");
        return jsonResponse(200, {
          text: longText,
          segments: [
            {
              id: "seg_raw_1",
              start: 0,
              end: 60,
              text: longText,
              speaker: "speaker_1",
              confidence: 0.9,
            },
          ],
        });
      }

      throw new Error(`Unexpected fetch url in test: ${url}`);
    }) as typeof fetch;

    const response = await fetch(`${server.origin}/api/hammer/prep/transcript`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forge-user-authorization": "Bearer test-user-access-token",
      },
      body: JSON.stringify({
        workspace_id: TEST_WORKSPACE_ID,
        workpiece_id: TEST_WORKPIECE_ID,
        media_kind: "recording_audio",
        local_root_abs: tempRoot,
        local_relpath: mediaName,
        mime_type: "audio/wav",
      }),
    });

    const payload = await response.json();
    assert.equal(response.status, 200, "expected ok response");
    assert.equal(Boolean(payload?.ok), true, "expected ok flag");

    const segments = payload?.data?.segments as Array<{ start: number; end: number; text: string }>;
    assert.equal(Array.isArray(segments), true, "expected segments array");
    assert.equal(segments.length >= 8, true, "expected long segment to be split into multiple segments");

    const maxDuration = Math.max(...segments.map((segment) => Number(segment.end) - Number(segment.start)));
    assert.equal(maxDuration <= 8.0, true, "expected no segment to exceed absolute 8s max duration");

    const maxWords = Math.max(...segments.map((segment) => countWords(String(segment.text ?? ""))));
    assert.equal(maxWords <= 24, true, "expected no segment to exceed absolute 24 word max");

    const openAiCalls = calls.filter((call) => call.url === "https://api.openai.com/v1/audio/transcriptions");
    assert.equal(openAiCalls.length > 0, true, "expected OpenAI transcription to be called");

    const audioWebmResponse = await fetch(`${server.origin}/api/hammer/prep/transcript`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forge-user-authorization": "Bearer test-user-access-token",
      },
      body: JSON.stringify({
        workspace_id: TEST_WORKSPACE_ID,
        workpiece_id: TEST_WORKPIECE_ID,
        media_kind: "recording_audio",
        local_root_abs: tempRoot,
        local_relpath: "source-audio.webm",
        mime_type: "audio/webm",
      }),
    });
    const audioWebmPayload = await audioWebmResponse.json();
    assert.equal(audioWebmResponse.status, 200, "expected transcoded audio-webm prep response");
    assert.equal(Boolean(audioWebmPayload?.ok), true, "expected transcoded audio-webm ok flag");

    const videoResponse = await fetch(`${server.origin}/api/hammer/prep/transcript`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forge-user-authorization": "Bearer test-user-access-token",
      },
      body: JSON.stringify({
        workspace_id: TEST_WORKSPACE_ID,
        workpiece_id: TEST_WORKPIECE_ID,
        media_kind: "recording_video",
        local_root_abs: tempRoot,
        local_relpath: "source.webm",
        mime_type: "video/webm",
      }),
    });
    const videoPayload = await videoResponse.json();
    assert.equal(videoResponse.status, 200, "expected transcoded video prep response");
    assert.equal(Boolean(videoPayload?.ok), true, "expected transcoded video ok flag");
    assert.equal(ffmpegServer.calls(), 2, "expected audio-webm and video sources to use Forge FFmpeg");
    const videoUpload = transcriptionUploads.at(-1);
    assert(videoUpload, "expected normalized video transcription upload");
    assert.equal(videoUpload.type, "audio/wav");
    assert.equal(videoUpload.name, "source.wav");
    assert.deepEqual(videoUpload.bytes, Buffer.from("RIFFfake-transcript-wave", "utf8"));
    assert.notDeepEqual(videoUpload.bytes, Buffer.from("fake-video-bytes"));
    assert.deepEqual(events.slice(-2), ["ffmpeg", "transcription"], "FFmpeg must finish before transcription starts");

    const openAiBeforeFailures = transcriptionUploads.length;
    ffmpegServer.setResponse(500, Buffer.from("forced normalization failure"));
    const normalizationFailure = await fetch(`${server.origin}/api/hammer/prep/transcript`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forge-user-authorization": "Bearer test-user-access-token" },
      body: JSON.stringify({ workspace_id: TEST_WORKSPACE_ID, workpiece_id: TEST_WORKPIECE_ID, media_kind: "recording_video", local_root_abs: tempRoot, local_relpath: "source.webm", mime_type: "video/webm" }),
    });
    assert.notEqual(normalizationFailure.status, 200);
    assert.equal(transcriptionUploads.length, openAiBeforeFailures, "normalization failure must not submit original video");

    ffmpegServer.setResponse(200, Buffer.alloc(0));
    const emptyOutput = await fetch(`${server.origin}/api/hammer/prep/transcript`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forge-user-authorization": "Bearer test-user-access-token" },
      body: JSON.stringify({ workspace_id: TEST_WORKSPACE_ID, workpiece_id: TEST_WORKPIECE_ID, media_kind: "recording_video", local_root_abs: tempRoot, local_relpath: "source.webm", mime_type: "video/webm" }),
    });
    assert.notEqual(emptyOutput.status, 200);
    assert.equal(transcriptionUploads.length, openAiBeforeFailures, "empty normalized output must not reach transcription");

    process.env.HAMMER_FORGE_FFMPEG_BASE_URL = "http://127.0.0.1:1";
    const unavailable = await fetch(`${server.origin}/api/hammer/prep/transcript`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forge-user-authorization": "Bearer test-user-access-token" },
      body: JSON.stringify({ workspace_id: TEST_WORKSPACE_ID, workpiece_id: TEST_WORKPIECE_ID, media_kind: "recording_video", local_root_abs: tempRoot, local_relpath: "source.webm", mime_type: "video/webm" }),
    });
    assert.notEqual(unavailable.status, 200);
    assert.equal(transcriptionUploads.length, openAiBeforeFailures, "FFmpeg unavailability must not submit original video");
    process.env.HAMMER_FORGE_FFMPEG_BASE_URL = ffmpegServer.baseUrl;

    ffmpegServer.setResponse(200, Buffer.from("RIFFrefused-wave", "utf8"));
    refuseWavTranscription = true;
    const refused = await fetch(`${server.origin}/api/hammer/prep/transcript`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forge-user-authorization": "Bearer test-user-access-token" },
      body: JSON.stringify({ workspace_id: TEST_WORKSPACE_ID, workpiece_id: TEST_WORKPIECE_ID, media_kind: "recording_video", local_root_abs: tempRoot, local_relpath: "source.webm", mime_type: "video/webm" }),
    });
    assert.notEqual(refused.status, 200);
    assert.equal(transcriptionUploads.at(-1)?.type, "audio/wav");

    console.log("Hammer transcript normalization tests passed.");
  } finally {
    globalThis.fetch = originalFetch;
    if (typeof originalTranscriptBackend === "undefined") {
      delete process.env.HAMMER_TRANSCRIPT_AUDIO_TRANSCODE_BACKEND;
    } else {
      process.env.HAMMER_TRANSCRIPT_AUDIO_TRANSCODE_BACKEND = originalTranscriptBackend;
    }
    if (typeof originalForgeFfmpegBaseUrl === "undefined") {
      delete process.env.HAMMER_FORGE_FFMPEG_BASE_URL;
    } else {
      process.env.HAMMER_FORGE_FFMPEG_BASE_URL = originalForgeFfmpegBaseUrl;
    }
    await fsPromises.rm(tempRoot, { recursive: true, force: true });
    await server.close();
    await ffmpegServer.close();
  }
}

main().catch((error) => {
  console.error("Hammer transcript normalization tests failed:", error);
  process.exit(1);
});

