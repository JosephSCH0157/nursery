import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import type { CustomerSpendingQuote } from "../../../packages/tongs/src/customer-spending-confirmation";
import {
  useHammerTranscriptQuoteDecision,
  type HammerTranscriptQuoteDecision,
} from "../src/prep/HammerTranscriptQuoteDialog";

const quote = (id: string, model: string): CustomerSpendingQuote => ({
  quote_id: id,
  operation_id: `operation-${id}`,
  quote_hash: id.replaceAll("-", "").padEnd(64, "a").slice(0, 64),
  request_fingerprint: "b".repeat(64),
  credit_charge: 0,
  reference_credit_units: 12,
  failure_terms: "Failed operations cost 0 Credits.",
  funding_eligible: true,
  funding_label: "Owner-sponsored",
  model_display_name: model,
  model_tradeoff_summary: "One attempt and no automatic retry.",
  expires_at: "2026-11-04T15:00:00.000Z",
});

test("an overlapping quote challenge cannot dismiss or replace the pending customer decision", async () => {
  const dom = new JSDOM('<div id="app"></div>', { url: "https://podcastersforge.com/app/hammer" });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    navigator: globalThis.navigator,
  };
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  let decision: HammerTranscriptQuoteDecision | null = null;
  function Harness() {
    decision = useHammerTranscriptQuoteDecision();
    return decision.dialog;
  }
  const root = createRoot(dom.window.document.querySelector("#app")!);
  try {
    await act(async () => root.render(<Harness />));
    assert.ok(decision);

    let firstDecision!: Promise<boolean>;
    await act(async () => {
      firstDecision = decision!.request(quote("11111111-1111-4111-8111-111111111111", "First exact quote"));
    });
    assert.match(dom.window.document.body.textContent ?? "", /First exact quote/);

    let overlappingAccepted = true;
    await act(async () => {
      overlappingAccepted = await decision!.request(quote("22222222-2222-4222-8222-222222222222", "Overlapping quote"));
    });
    assert.equal(overlappingAccepted, false);
    assert.match(dom.window.document.body.textContent ?? "", /First exact quote/);
    assert.doesNotMatch(dom.window.document.body.textContent ?? "", /Overlapping quote/);

    const accept = [...dom.window.document.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Accept quote and start transcription"));
    assert.ok(accept);
    await act(async () => accept.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })));
    assert.equal(await firstDecision, true);
    assert.doesNotMatch(dom.window.document.body.textContent ?? "", /First exact quote/);
  } finally {
    await act(async () => root.unmount());
    Object.assign(globalThis, previous);
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
    dom.window.close();
  }
});
