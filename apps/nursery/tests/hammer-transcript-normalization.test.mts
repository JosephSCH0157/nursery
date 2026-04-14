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

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

async function main(): Promise<void> {
  const originalFetch = globalThis.fetch;
  const calls: FetchCall[] = [];

  process.env.OPENAI_API_KEY = "test-openai-key";
  process.env.TONGS_SUPABASE_URL = "https://example.supabase.co";
  process.env.TONGS_SUPABASE_ANON_KEY = "test-anon-key";
  delete process.env.HAMMER_OPENAI_TRANSCRIBE_TIMEOUT_MS;

  const middleware = createHammerPrepMiddleware();
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

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = toUrl(input);
      if (url.startsWith(server.origin)) {
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

    console.log("Hammer transcript normalization tests passed.");
  } finally {
    globalThis.fetch = originalFetch;
    await fsPromises.rm(tempRoot, { recursive: true, force: true });
    await server.close();
  }
}

main().catch((error) => {
  console.error("Hammer transcript normalization tests failed:", error);
  process.exit(1);
});

