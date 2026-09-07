import assert from "node:assert/strict";
import test from "node:test";
import {
  linkifyHearthText,
  selectHearthExportMessages,
  serializeHearthConversation,
} from "../src/lib/hearth-conversation-export";

test("conversation export preserves visible chronology and excludes internal messages", () => {
  const messages = [
    { role: "assistant" as const, content: "Spark selected: Big Boy 4014\nSpark ID: 11111111-1111-4111-8111-111111111111\nNotes: Big locomotive" },
    { role: "system" as const, content: "hidden prompt" },
    { role: "user" as const, content: "First paragraph.\n\n- Keep this list\nhttps://example.com/source" },
    { role: "assistant" as const, content: "I’m with you." },
  ];
  assert.deepEqual(selectHearthExportMessages(messages), [
    { role: "assistant", content: "Spark selected: Big Boy 4014\nNotes: Big locomotive" },
    { role: "user", content: "First paragraph.\n\n- Keep this list\nhttps://example.com/source" },
    { role: "assistant", content: "I’m with you." },
  ]);
  const transcript = serializeHearthConversation("Big Boy 4014", messages);
  assert.match(transcript, /^Big Boy 4014\n\nHearth\nSpark selected:/);
  assert.match(transcript, /\n\nYou\nFirst paragraph\.\n\n- Keep this list/);
  assert.doesNotMatch(transcript, /Spark ID|hidden prompt/);
});

test("conversation linkification preserves literal wording and link targets", () => {
  const input = "Read https://example.com/a?q=1, then continue.";
  const parts = linkifyHearthText(input);
  assert.equal(parts.map((part) => part.text).join(""), input);
  assert.equal(parts.find((part) => part.href)?.href, "https://example.com/a?q=1");
});
