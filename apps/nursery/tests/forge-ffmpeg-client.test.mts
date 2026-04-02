import assert from "node:assert/strict";
import http from "node:http";
import { Buffer } from "node:buffer";
import {
  readHammerForgeFfmpegClientConfig,
  transcodeToWorkingWavWithForgeFfmpeg,
} from "../scripts/hammer-forge-ffmpeg-client";

async function startServer(args: {
  statusCode?: number;
  contentType?: string;
  responseBody: Buffer | string;
  responseHeaders?: Record<string, string>;
  onRequest?: (req: http.IncomingMessage, body: Buffer) => void;
}): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      args.onRequest?.(req, body);
      res.statusCode = args.statusCode ?? 200;
      res.setHeader("content-type", args.contentType ?? "audio/wav");
      for (const [key, value] of Object.entries(args.responseHeaders ?? {})) {
        res.setHeader(key, value);
      }
      res.end(args.responseBody);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Test server failed to bind.");
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

async function testReadConfig(): Promise<void> {
  const config = readHammerForgeFfmpegClientConfig({
    HAMMER_FORGE_FFMPEG_BASE_URL: "https://forge-ffmpeg.fly.dev/",
    HAMMER_FORGE_FFMPEG_TIMEOUT_MS: "45000",
  } as NodeJS.ProcessEnv);
  assert.deepEqual(config, {
    baseUrl: "https://forge-ffmpeg.fly.dev",
    timeoutMs: 45000,
    maxAttempts: 2,
    retryDelayMs: 400,
  });
}

async function testTranscodeSuccess(): Promise<void> {
  let seenContentType: string | null = null;
  let seenFileName: string | null = null;
  let seenBodyBytes = 0;
  const server = await startServer({
    responseBody: Buffer.from("RIFFfakewave", "utf8"),
    responseHeaders: {
      "x-forge-request-id": "req_123",
      "x-forge-output-format": "wav",
      "x-forge-output-sample-rate": "48000",
      "x-forge-output-channels": "1",
    },
    onRequest: (req, body) => {
      seenContentType = req.headers["content-type"] as string | null;
      seenFileName = req.headers["x-file-name"] as string | null;
      seenBodyBytes = body.byteLength;
    },
  });
  try {
    const result = await transcodeToWorkingWavWithForgeFfmpeg({
      client: {
        baseUrl: server.baseUrl,
        timeoutMs: 5_000,
        maxAttempts: 1,
        retryDelayMs: 1,
      },
      sourceBytes: Buffer.from([1, 2, 3, 4]),
      sourceFilename: "input.m4a",
      contentType: "audio/mp4",
    });
    assert.equal(seenContentType, "audio/mp4");
    assert.equal(seenFileName, "input.m4a");
    assert.equal(seenBodyBytes, 4);
    assert.equal(result.requestId, "req_123");
    assert.equal(result.outputFormat, "wav");
    assert.equal(result.outputSampleRate, 48000);
    assert.equal(result.outputChannels, 1);
    assert.equal(result.audioBytes.toString("utf8"), "RIFFfakewave");
  } finally {
    await server.close();
  }
}

async function testTranscodeFailure(): Promise<void> {
  const server = await startServer({
    statusCode: 502,
    contentType: "application/json",
    responseBody: JSON.stringify({
      ok: false,
      error: {
        message: "upstream ffmpeg exploded",
      },
    }),
  });
  try {
    await assert.rejects(
      () => transcodeToWorkingWavWithForgeFfmpeg({
        client: {
          baseUrl: server.baseUrl,
          timeoutMs: 5_000,
          maxAttempts: 1,
          retryDelayMs: 1,
        },
        sourceBytes: Buffer.from([1]),
      }),
      /Forge FFmpeg working-audio transcode failed: upstream ffmpeg exploded/,
    );
  } finally {
    await server.close();
  }
}

async function testTranscodeRetriesTransientFailure(): Promise<void> {
  let requestCount = 0;
  const server = await startServer({
    responseBody: Buffer.from("RIFFretrywave", "utf8"),
    responseHeaders: {
      "x-forge-request-id": "req_retry",
      "x-forge-output-format": "wav",
      "x-forge-output-sample-rate": "48000",
      "x-forge-output-channels": "1",
    },
    onRequest: (_req, _body) => {
      requestCount += 1;
    },
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    if (requestCount === 0) {
      requestCount += 1;
      return new Response(JSON.stringify({
        ok: false,
        error: { message: "temporary overload" },
      }), {
        status: 503,
        headers: { "content-type": "application/json" },
      });
    }
    return originalFetch(input, init);
  };
  try {
    const result = await transcodeToWorkingWavWithForgeFfmpeg({
      client: {
        baseUrl: server.baseUrl,
        timeoutMs: 5_000,
        maxAttempts: 2,
        retryDelayMs: 1,
      },
      sourceBytes: Buffer.from([9, 9, 9]),
      sourceFilename: "retry.m4a",
      contentType: "audio/mp4",
    });
    assert.equal(requestCount, 2);
    assert.equal(result.requestId, "req_retry");
  } finally {
    globalThis.fetch = originalFetch;
    await server.close();
  }
}

await testReadConfig();
await testTranscodeSuccess();
await testTranscodeFailure();
await testTranscodeRetriesTransientFailure();
console.log("forge-ffmpeg client tests passed");
