import assert from "node:assert/strict";
import test from "node:test";
import { shouldKeepHearthOutlineInChatOnly } from "../src/lib/hearth-chat-proposal-routing";

test("hearthChatProposalRouting: planning outline stays chat-only", () => {
  const keepInChat = shouldKeepHearthOutlineInChatOnly({
    productionAction: false,
    autosaveReasonCode: "ai_outline",
    ops: [{ op: "set_outline" }],
  });
  assert.equal(keepInChat, true);
});

test("hearthChatProposalRouting: bullet script proposal reaches the draft lane", () => {
  const keepInChat = shouldKeepHearthOutlineInChatOnly({
    productionAction: false,
    autosaveReasonCode: "ai_outline",
    ops: [{ op: "set_body" }],
  });
  assert.equal(keepInChat, false);
});
