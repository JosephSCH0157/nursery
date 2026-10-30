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

  // The paid prep route must present the server quote before sending the
  // acceptance and must preserve one stable request identity across both
  // calls. This is the production AssemblyAI path used by initial AI fallback.
  let paidRequestCount = 0;
  let acceptedBody: Record<string, unknown> | null = null;
  const quote = {
    quote_id: "11111111-1111-4111-8111-111111111111",
    operation_id: "hammer-assemblyai:22222222-2222-4222-8222-222222222222",
    quote_hash: "a".repeat(64),
    request_fingerprint: "b".repeat(64),
    credit_charge: 0,
    reference_credit_units: 12,
    failure_terms: "Failed operations cost 0 Credits. Unknown submissions are never retried automatically.",
    funding_eligible: true,
    funding_label: "Owner-sponsored certification; no customer charge",
    model_display_name: "AssemblyAI Universal-3.5 Pro + speaker labels",
    model_tradeoff_summary: "US processing with the certified account settings.",
    expires_at: "2030-01-01T00:00:00.000Z",
  };
  let presentedQuote: typeof quote | null = null;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    assert.equal(String(input), HAMMER_TRANSCRIPT_PREP_ROUTE);
    paidRequestCount += 1;
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    assert.equal(body.client_request_id, "assemblyai-request-1");
    if (paidRequestCount === 1) {
      assert.equal(body.spending_acceptance, undefined);
      return new Response(JSON.stringify({
        ok: false,
        error: {
          code: "transcription_spending_confirmation_required",
          message: "Explicit acceptance of the fixed Hammer transcription quote is required.",
        },
        billing_quote: quote,
      }), { status: 409, headers: { "content-type": "application/json" } });
    }
    acceptedBody = body;
    return new Response(JSON.stringify({
      ok: true,
      data: {
        provider: "assemblyai",
        model: "universal-3-5-pro",
        provider_request_id: "provider-request-1",
        text: "owner sponsored transcript",
        segments: [{ id: "seg_1", start: 0, end: 1, text: "owner sponsored transcript", speaker: "A" }],
      },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  const paid = await requestHammerTranscriptPrep({
    workspace_id: "ws_01",
    workpiece_id: "wp_01",
    media_kind: "recording_video",
    canonical_workpiece_path: "recordings/episode.webm",
    mime_type: "video/webm",
    client_request_id: "assemblyai-request-1",
  }, {
    confirmSpendingQuote: (presented) => {
      presentedQuote = presented;
      return true;
    },
  });
  assert.equal(paidRequestCount, 2);
  assert.deepEqual(presentedQuote, quote);
  assert.equal(paid.ok, true);
  if (paid.ok) assert.equal(paid.data.provider, "assemblyai");
  const spendingAcceptance = (acceptedBody as Record<string, unknown> | null)?.spending_acceptance as Record<string, unknown> | undefined;
  assert.deepEqual(spendingAcceptance, {
    quote_id: quote.quote_id,
    operation_id: quote.operation_id,
    quote_hash: quote.quote_hash,
    request_fingerprint: quote.request_fingerprint,
  });

  // A browser session may refresh while the accepted operation is being
  // polled. Every status request must use the current access token; retaining
  // the quote request's token produces a false POLICY_DENIED at expiry.
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const jwt = (subject: string) => `${encode({ alg: "none" })}.${encode({ sub: subject, exp: Math.floor(Date.now() / 1000) + 3600 })}.fixture`;
  const firstAccessToken = jwt("first-session");
  const refreshedAccessToken = jwt("refreshed-session");
  let currentAccessToken = firstAccessToken;
  runtimeWindow.localStorage.getItem = (key: string) => key === "forge-auth"
    ? JSON.stringify({ currentSession: { access_token: currentAccessToken } })
    : null;
  Object.assign(runtimeWindow, { __forgeHammerTranscriptStatusPollMs__: 1 });
  const observedAuthorizationHeaders: string[] = [];
  let refreshRequestCount = 0;
  globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    refreshRequestCount += 1;
    const requestHeaders = new Headers(init?.headers);
    observedAuthorizationHeaders.push(requestHeaders.get("x-forge-user-token") ?? "missing");
    if (refreshRequestCount === 1) {
      return new Response(JSON.stringify({
        ok: false,
        error: { code: "transcription_spending_confirmation_required", message: "Acceptance required." },
        billing_quote: quote,
      }), { status: 409, headers: { "content-type": "application/json" } });
    }
    if (refreshRequestCount === 2) {
      currentAccessToken = refreshedAccessToken;
      return new Response(JSON.stringify({ ok: true, data: { state: "processing" } }), {
        status: 202,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({
      ok: true,
      data: {
        provider: "assemblyai", model: "universal-3-5-pro", provider_request_id: "provider-request-2",
        text: "refreshed session transcript",
        segments: [{ id: "seg_1", start: 0, end: 1, text: "refreshed session transcript", speaker: "A" }],
      },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const refreshed = await requestHammerTranscriptPrep({
    workspace_id: "ws_01",
    workpiece_id: "wp_01",
    media_kind: "recording_video",
    canonical_workpiece_path: "recordings/episode.webm",
    client_request_id: "assemblyai-request-token-refresh",
  }, { confirmSpendingQuote: () => true });
  assert.equal(refreshed.ok, true);
  assert.deepEqual(observedAuthorizationHeaders, [firstAccessToken, firstAccessToken, refreshedAccessToken]);
  runtimeWindow.localStorage.getItem = () => null;

  // Declining the application-rendered quote must stop before acceptance and
  // return a stable, non-retryable result instead of collapsing the expected
  // 409 challenge into a generic failure.
  let declinedRequestCount = 0;
  globalThis.fetch = async (): Promise<Response> => {
    declinedRequestCount += 1;
    return new Response(JSON.stringify({
      ok: false,
      error: {
        code: "transcription_spending_confirmation_required",
        message: "Explicit acceptance of the fixed Hammer transcription quote is required.",
      },
      billing_quote: quote,
    }), { status: 409, headers: { "content-type": "application/json" } });
  };
  const declined = await requestHammerTranscriptPrep({
    workspace_id: "ws_01",
    workpiece_id: "wp_01",
    media_kind: "recording_video",
    canonical_workpiece_path: "recordings/episode.webm",
    mime_type: "video/webm",
    client_request_id: "assemblyai-request-declined",
  }, {
    confirmSpendingQuote: () => false,
  });
  assert.equal(declinedRequestCount, 1);
  assert.equal(declined.ok, false);
  if (!declined.ok) {
    assert.equal(declined.status, 409);
    assert.equal(declined.error.code, "TRANSCRIPTION_QUOTE_NOT_ACCEPTED");
    assert.equal(declined.error.retryable, false);
    assert.match(declined.error.message, /No charge was made/);
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

