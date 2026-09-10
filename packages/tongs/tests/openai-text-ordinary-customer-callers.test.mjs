import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");
const source = (path) => readFileSync(resolve(root, path), "utf8");

const ordinaryClients = [
  ["hearth.chat_completion / hearth.research_synthesis", "apps/hearth/src/hooks/useChatWorkspace.ts", false],
  ["visual.unified_plan", "apps/hearth/src/lib/hearth-unified-visual-plan-authority.ts", true],
  ["visual.narrative_interpretation", "apps/hearth/src/lib/hearth-image-prompt-authority.ts", true],
  ["motion.broll_interpretation", "apps/hearth/src/lib/hearth-broll-v2-authority.ts", true],
  ["hammer.transcript_cleanup", "apps/hammer/src/editor/hammerTranscriptCleanupAssistApi.ts", true],
  ["shorts.discovery", "apps/hammer/src/editor/HammerShortsToolBay.tsx", true],
  ["quench.metadata", "apps/nursery/src/routes/quenchMetadataAssistApi.ts", true],
];

for (const [label, path, parsesWireQuote] of ordinaryClients) {
  test(`${label} sends only exact server quote acceptance`, () => {
    const client = source(path);
    if (parsesWireQuote) assert.match(client, /readCustomerSpendingQuote/);
    else assert.match(client, /result\.billingQuote/);
    assert.match(client, parsesWireQuote
      ? /requestCustomerSpendingAcceptance\(quote\)/
      : /requestCustomerSpendingAcceptance\(\{/);
    assert.match(client, /spending(?:_acceptance|Acceptance)/);
    if (parsesWireQuote) {
      assert.doesNotMatch(client, /maximum_customer_charge_micros\s*:/);
      assert.doesNotMatch(client, /funding_eligible\s*:/);
    }
  });
}

test("unfunded creator navigation abandons the quote and requires a new action", () => {
  const helper = source("packages/tongs/src/customer-spending-confirmation.ts");
  assert.match(helper, /funding=required&return_to=/);
  assert.match(helper, /retry this action and accept a fresh quote/i);
  assert.match(helper, /return null;/);
});
