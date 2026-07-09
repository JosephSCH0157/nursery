import assert from "node:assert/strict";
import {
  HAMMER_TRANSCRIPT_PREP_ROUTE,
  requestHammerTranscriptPrep,
} from "../src/prep/hammerPrepApi";

const originalFetch = globalThis.fetch;
const runtimeGlobals = globalThis as { fetch: typeof globalThis.fetch; window?: unknown };
const originalWindow = runtimeGlobals.window;

async function main(): Promise<void> {
  const runtimeWindow = {
    location: { search: "" },
    localStorage: {
      getItem: () => null,
      key: () => null,
      length: 0,
      clear: () => undefined,
      removeItem: () => undefined,
      setItem: () => undefined,
    },
  };
  runtimeGlobals.window = runtimeWindow;

  // Legacy error envelope -> synthesize UNKNOWN_ERROR.
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    assert.equal(String(input), HAMMER_TRANSCRIPT_PREP_ROUTE);
    assert.equal(init?.method, "POST");
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    assert.equal(typeof body.client_request_id, "string");
    assert.equal(String(body.client_request_id).length > 0, true);
    return new Response(JSON.stringify({ ok: false, error: { message: "legacy failure" } }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  };

  const legacy = await requestHammerTranscriptPrep({
    workspace_id: "ws_01",
    workpiece_id: "wp_01",
    media_kind: "recording_audio",
    canonical_workpiece_path: "recordings/example.wav",
    mime_type: "audio/wav",
  });
  assert.equal(legacy.ok, false);
  if (!legacy.ok) {
    assert.equal(legacy.status, 403);
    assert.equal(legacy.error.code, "UNKNOWN_ERROR");
    assert.equal(legacy.error.message, "legacy failure");
  }

  // Structured envelope -> parse code, retryable, detail, meta.
  globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
    assert.equal(String(input), HAMMER_TRANSCRIPT_PREP_ROUTE);
    return new Response(JSON.stringify({
      ok: false,
      error: {
        code: "SOURCE_TOO_LARGE",
        message: "too big",
        retryable: false,
        detail: { max_source_bytes: 10, observed_bytes: 11 },
      },
      meta: {
        timestamp: "2026-04-14T00:00:00.000Z",
        workspace_id: "ws_01",
        workpiece_id: "wp_01",
        client_request_id: "client_01",
        provider_request_id: "provider_01",
      },
    }), {
      status: 413,
      headers: { "content-type": "application/json" },
    });
  };

  const structured = await requestHammerTranscriptPrep({
    workspace_id: "ws_01",
    workpiece_id: "wp_01",
    media_kind: "recording_audio",
    canonical_workpiece_path: "recordings/example.wav",
    mime_type: "audio/wav",
    client_request_id: "client_01",
  });
  assert.equal(structured.ok, false);
  if (!structured.ok) {
    assert.equal(structured.status, 413);
    assert.equal(structured.error.code, "SOURCE_TOO_LARGE");
    assert.equal(structured.error.retryable, false);
    assert.deepEqual(structured.error.detail, { max_source_bytes: 10, observed_bytes: 11 });
    assert.equal(structured.meta?.client_request_id, "client_01");
    assert.equal(structured.meta?.provider_request_id, "provider_01");
  }

  // Success payload unchanged.
  globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
    assert.equal(String(input), HAMMER_TRANSCRIPT_PREP_ROUTE);
    return new Response(JSON.stringify({
      ok: true,
      data: {
        provider: "openai",
        model: "gpt-4o-mini-transcribe",
        provider_request_id: null,
        text: "hello",
        segments: [{ id: "seg_1", start: 0, end: 1, text: "hello", speaker: "speaker_1" }],
      },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const ok = await requestHammerTranscriptPrep({
    workspace_id: "ws_01",
    workpiece_id: "wp_01",
    media_kind: "recording_audio",
    canonical_workpiece_path: "recordings/example.wav",
    mime_type: "audio/wav",
    client_request_id: "client_02",
  });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.data.segments.length, 1);
    assert.equal(ok.data.segments[0]?.text, "hello");
  }

  console.log("Hammer transcript prep API tests passed.");
}

main().catch((error) => {
  console.error("Hammer transcript prep API tests failed:", error);
  process.exit(1);
}).finally(() => {
  globalThis.fetch = originalFetch;
  runtimeGlobals.window = originalWindow;
});

