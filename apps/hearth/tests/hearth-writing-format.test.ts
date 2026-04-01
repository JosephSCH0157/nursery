import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWritingFormatShortcutPrompt,
  detectExplicitHearthWritingFormat,
  getHearthWritingFormatProfile,
  isExplicitHearthFullScriptRequest,
  readLastHearthWritingFormat,
  resolveHearthWritingFormatRequest,
  writeLastHearthWritingFormat,
} from "../src/lib/hearth-writing-format";

type FakeStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

function withFakeWindow(fn: (storage: Map<string, string>) => void): void {
  const runtime = globalThis as typeof globalThis & {
    window?: { localStorage: FakeStorage };
  };
  const previousWindow = runtime.window;
  const backing = new Map<string, string>();
  runtime.window = {
    localStorage: {
      getItem: (key) => backing.get(key) ?? null,
      setItem: (key, value) => {
        backing.set(key, value);
      },
    },
  };
  try {
    fn(backing);
  } finally {
    if (previousWindow === undefined) {
      delete runtime.window;
    } else {
      runtime.window = previousWindow;
    }
  }
}

test("hearthWritingFormat: profile keeps future read-mode seam available", () => {
  assert.equal(getHearthWritingFormatProfile("explore_expand").preferredReadMode, "flow");
  assert.equal(getHearthWritingFormatProfile("full_script").preferredReadMode, "flow");
  assert.equal(getHearthWritingFormatProfile("bullet_outline").preferredReadMode, "step");
});

test("hearthWritingFormat: explicit format detection prefers outline language when present", () => {
  assert.equal(detectExplicitHearthWritingFormat("Give me bullet points for this episode."), "bullet_outline");
  assert.equal(detectExplicitHearthWritingFormat("Write the full script for this."), "full_script");
  assert.equal(detectExplicitHearthWritingFormat("I have a script already. Help me tighten the opening."), null);
  assert.equal(detectExplicitHearthWritingFormat("Help me clean this opening."), null);
});

test("hearthWritingFormat: remembered default roundtrips through local storage", () => {
  withFakeWindow(() => {
    assert.equal(readLastHearthWritingFormat(), "explore_expand");
    writeLastHearthWritingFormat("bullet_outline");
    assert.equal(readLastHearthWritingFormat(), "bullet_outline");
  });
});

test("hearthWritingFormat: explore-and-expand is the default request lane", () => {
  const resolved = resolveHearthWritingFormatRequest({
    requestContent: "Help me shape this opening.",
    selectedFormat: "explore_expand",
    pendingShortcutIntent: null,
  });

  assert.equal(resolved.appliedFormat, "explore_expand");
  assert.equal(resolved.source, "default");
  assert.match(resolved.requestContent, /explore and expand the content before drafting/i);
  assert.match(resolved.requestContent, /do not write a full script or bullet outline unless the user explicitly asks/i);
});

test("hearthWritingFormat: default requests add tone and selected format guidance", () => {
  const resolved = resolveHearthWritingFormatRequest({
    requestContent: "Help me shape this opening.",
    selectedFormat: "bullet_outline",
    pendingShortcutIntent: null,
  });

  assert.equal(resolved.appliedFormat, "bullet_outline");
  assert.equal(resolved.source, "default");
  assert.match(resolved.requestContent, /creative operations partner/i);
  assert.match(resolved.requestContent, /concise bullet outline/i);
  assert.match(resolved.requestContent, /do not write the full script unless the user explicitly asks/i);
});

test("hearthWritingFormat: full-script preference stays planning-first until asked", () => {
  const resolved = resolveHearthWritingFormatRequest({
    requestContent: "Help me shape this opening.",
    selectedFormat: "full_script",
    pendingShortcutIntent: null,
  });

  assert.equal(resolved.appliedFormat, "full_script");
  assert.equal(resolved.source, "default");
  assert.match(resolved.requestContent, /do not draft the script preemptively/i);
  assert.match(resolved.requestContent, /ask whether they want you to turn the current thinking into a full script/i);
  assert.doesNotMatch(resolved.requestContent, /smooth spoken prose/i);
});

test("hearthWritingFormat: explicit or shortcut requests do not force extra format instructions", () => {
  const explicit = resolveHearthWritingFormatRequest({
    requestContent: "Turn this into a full script.",
    selectedFormat: "bullet_outline",
    pendingShortcutIntent: null,
  });
  assert.equal(explicit.appliedFormat, "full_script");
  assert.equal(explicit.source, "message");
  assert.doesNotMatch(explicit.requestContent, /concise bullet outline/i);

  const shortcut = resolveHearthWritingFormatRequest({
    requestContent: buildWritingFormatShortcutPrompt("bullet_outline"),
    selectedFormat: "full_script",
    pendingShortcutIntent: "outline",
  });
  assert.equal(shortcut.appliedFormat, "bullet_outline");
  assert.equal(shortcut.source, "message");
  assert.match(shortcut.requestContent, /creative operations partner/i);
  assert.doesNotMatch(shortcut.requestContent, /smooth spoken prose/i);
});

test("hearthWritingFormat: explicit script detection requires a real drafting ask", () => {
  assert.equal(isExplicitHearthFullScriptRequest("Write a cold open for this episode."), true);
  assert.equal(isExplicitHearthFullScriptRequest("Can you turn this into a script?"), true);
  assert.equal(isExplicitHearthFullScriptRequest("I already have a draft script to review."), false);
  assert.equal(isExplicitHearthFullScriptRequest("The script feels too stiff."), false);
});
