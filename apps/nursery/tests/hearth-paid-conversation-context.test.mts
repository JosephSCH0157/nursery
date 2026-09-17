import assert from "node:assert/strict";
import test from "node:test";
import { buildPaidHearthConversationMessages } from "../server/hearth/hearth-paid-conversation-context";
import { buildBoundedHearthChatProviderRequest } from "../server/hearth/hearth-paid-chat-execution";

const ACTIVE_EPISODE = {
  episodeId: "21d16d6a-905b-491e-8761-028789612ae5",
  workspaceId: "cc5478ff-37be-403e-824c-467fa7da061e",
  title: "Why gasoline prices are high",
  titleVariants: { A: "", B: "", C: "" },
  outline: "Crude oil, Iran supply risk, refining, inventories, taxes, and regional differences.",
  body: "Short opening draft already exists.",
  tonePreset: "Neutral conversational",
  sources: [
    { id: "eia-1", title: "EIA gasoline price fluctuations", url: "https://www.eia.gov/example", note: "Primary source", citedIn: [] },
    { id: "pbs-1", title: "PBS Iran-war gasoline report", url: "https://www.pbs.org/example", note: "Current reporting", citedIn: [] },
  ],
  sparks: [{ id: "spark-1", text: "Investigate why gasoline prices are so high." }],
};

test("ordinary paid conversation receives bounded active-episode, source, and recent research context", async () => {
  const latest = { role: "user", content: "are we ready to put together a script?" };
  const messages = [
    { role: "user", content: "Find strong sources for this episode." },
    { role: "assistant", content: "Use EIA first, then PBS for the current Iran-war reporting." },
    { role: "user", content: latest.content },
    { role: "user", content: latest.content },
    latest,
  ];
  const providerMessages = buildPaidHearthConversationMessages({
    episodeContext: ACTIVE_EPISODE,
    messages,
    latestUserMessage: latest,
  });
  const visible = providerMessages.map((message) => message.content).join("\n");
  assert.match(visible, /Do not behave as if each message is a new conversation/);
  assert.match(visible, /Why gasoline prices are high/);
  assert.match(visible, /EIA gasoline price fluctuations/);
  assert.match(visible, /Use EIA first, then PBS/);
  assert.equal(providerMessages.filter((message) => message.content === latest.content).length, 1);
  assert.equal(providerMessages.at(-1), latest);

  const bounded = await buildBoundedHearthChatProviderRequest({
    messages: providerMessages,
    model: "gpt-5.6-luna",
    maximumOutputTokens: 512,
    maximumAttempts: 1,
  });
  assert.ok(bounded.boundedInputTokens <= 2_000, JSON.stringify({
    boundedInputTokens: bounded.boundedInputTokens,
    serializedBytes: bounded.serializedBytes,
  }));
});

test("ordinary context permits a genuinely missing decision without asking for known episode facts", () => {
  const latest = { role: "user", content: "Are we ready to write?" };
  const providerMessages = buildPaidHearthConversationMessages({
    episodeContext: ACTIVE_EPISODE,
    messages: [latest],
    latestUserMessage: latest,
  });
  const system = providerMessages[0]?.content ?? "";
  assert.match(system, /Never ask for episode information already present/);
  assert.match(system, /ask at most one genuinely missing decision/);
  assert.equal("targetLength" in ACTIVE_EPISODE, false);
});

test("an explicit topic reset starts fresh and same-episode construction cannot leak another episode", () => {
  const reset = { role: "user", content: "New topic: start fresh with a story about city parks." };
  const resetMessages = buildPaidHearthConversationMessages({
    episodeContext: ACTIVE_EPISODE,
    messages: [
      { role: "assistant", content: "Iran and gasoline prices remain the current angle." },
      reset,
    ],
    latestUserMessage: reset,
  });
  const resetVisible = resetMessages.map((message) => message.content).join("\n");
  assert.match(resetVisible, /explicitly reset the topic/);
  assert.doesNotMatch(resetVisible, /Why gasoline prices are high/);
  assert.doesNotMatch(resetVisible, /Iran and gasoline prices remain/);

  const otherLatest = { role: "user", content: "What do we have so far?" };
  const otherMessages = buildPaidHearthConversationMessages({
    episodeContext: {
      ...ACTIVE_EPISODE,
      episodeId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      workspaceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      title: "City parks episode",
      sources: [{ id: "parks-1", title: "City parks report", url: "", note: "", citedIn: [] }],
      sparks: [],
    },
    messages: [otherLatest],
    latestUserMessage: otherLatest,
  });
  const otherVisible = otherMessages.map((message) => message.content).join("\n");
  assert.match(otherVisible, /City parks episode/);
  assert.match(otherVisible, /City parks report/);
  assert.doesNotMatch(otherVisible, /gasoline|EIA|PBS/i);
});
