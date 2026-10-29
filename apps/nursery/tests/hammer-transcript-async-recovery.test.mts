import assert from "node:assert/strict";
import test from "node:test";

import { requestHammerTranscriptPrep } from "../../hammer/src/prep/hammerPrepApi";

function token(): string {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1_000) + 3_600 })).toString("base64url");
  return `${header}.${payload}.fixture`;
}

test("accepted Hammer quote uses durable status recovery without duplicate execution requests", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = (globalThis as typeof globalThis & { window?: unknown }).window;
  const originalConfirm = globalThis.confirm;
  const calls: Array<{ statusOnly: boolean; body: Record<string, unknown> }> = [];
  let index = 0;
  const quote = {
    quote_id: "10000000-0000-4000-8000-000000000001",
    operation_id: "hammer-assemblyai:20000000-0000-4000-8000-000000000001",
    quote_hash: "a".repeat(64),
    request_fingerprint: "b".repeat(64),
    credit_charge: 0,
    reference_credit_units: 12,
    failure_terms: "Failed operations cost 0 Credits.",
    funding_eligible: true,
    funding_label: "Owner-sponsored certification; no customer charge",
    model_display_name: "AssemblyAI Universal-3.5 Pro + speaker labels",
    model_tradeoff_summary: "US processing",
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  };
  (globalThis as typeof globalThis & { window?: unknown }).window = {
    __forgeHammerTranscriptStatusPollMs__: 1,
    localStorage: {
      getItem(key: string) {
        return key === "forge-auth" ? JSON.stringify({ access_token: token() }) : null;
      },
      key() { return null; },
      length: 0,
    },
  };
  globalThis.confirm = () => true;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    calls.push({ statusOnly: headers.get("x-hammer-transcript-status") === "1", body });
    index += 1;
    if (index === 1) {
      return Response.json({ ok: false, error: { code: "transcription_spending_confirmation_required", message: "accept" }, billing_quote: quote }, { status: 409 });
    }
    if (index === 2 || index === 3) {
      return Response.json({ ok: true, data: { state: "pending", operation_id: quote.operation_id } }, { status: 202 });
    }
    return Response.json({ ok: true, data: {
      provider: "assemblyai",
      model: "universal-3-5-pro",
      provider_request_id: "provider-request-1",
      text: "Ready.",
      segments: [{ id: "segment-1", start: 0, end: 1, text: "Ready.", speaker: "A" }],
    } });
  }) as typeof fetch;

  try {
    const result = await requestHammerTranscriptPrep({
      workspace_id: "cc5478ff-37be-403e-824c-467fa7da061e",
      workpiece_id: "21d16d6a-905b-491e-8761-028789612ae5",
      media_kind: "recording_video",
      canonical_workpiece_path: "recordings/episode.webm",
    });
    assert.equal(result.ok, true);
    assert.equal(calls.length, 4);
    assert.deepEqual(calls.map((call) => call.statusOnly), [false, false, true, true]);
    assert.equal("spending_acceptance" in calls[0].body, false);
    for (const call of calls.slice(1)) {
      assert.deepEqual(call.body.spending_acceptance, {
        quote_id: quote.quote_id,
        operation_id: quote.operation_id,
        quote_hash: quote.quote_hash,
        request_fingerprint: quote.request_fingerprint,
      });
    }
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.confirm = originalConfirm;
    if (originalWindow === undefined) delete (globalThis as typeof globalThis & { window?: unknown }).window;
    else (globalThis as typeof globalThis & { window?: unknown }).window = originalWindow;
  }
});
