import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useHearthAutosave } from "../src/hooks/useHearthAutosave";
import { hydrateDraftBodyFromCanonicalScript } from "../src/lib/hearth-draft-hydration";

type Draft = {
  id: string;
  title: string;
  body: string;
};

test("draft hydration replaces an unusable buffer with canonical script content", () => {
  const hydrated = hydrateDraftBodyFromCanonicalScript({
    draft: {
      id: "draft-a",
      title: "Episode",
      body: "## Draft Script\n\n",
      createdAt: 1,
      updatedAt: 1,
      archived: false,
      pinned: false,
    },
    scriptText: "[s1]\nCanonical script body.\n[/s1]",
    updatedAt: 2,
    updatedBy: { userId: "user-a", displayName: "Creator" },
  });
  assert.equal(hydrated.body, "[s1]\nCanonical script body.\n[/s1]");
  assert.equal(hydrated.updatedAt, 2);
});

test("queued AI autosave persists the current draft with an attributable revision", async () => {
  const draft: Draft = { id: "draft-a", title: "Episode", body: "Updated by AI" };
  const persisted: Array<Record<string, unknown>> = [];
  let resolvePersisted: (() => void) | null = null;
  const persistedOnce = new Promise<void>((resolve) => {
    resolvePersisted = resolve;
  });
  let api: ReturnType<typeof useHearthAutosave<Draft, "ai_rewrite" | "retry", "autosave">> | null = null;

  function Harness() {
    api = useHearthAutosave<Draft, "ai_rewrite" | "retry", "autosave">({
      activeDraft: draft,
      draftSnapshot: { title: "Episode", body: "Original body" },
      isDirty: true,
      isBodyComposing: false,
      lastAutosaveRevisionAt: null,
      autosaveDelayMs: 60_000,
      autosaveMinGapMs: 0,
      autosaveRevisionGapMs: 60_000,
      autosaveRevisionKind: "autosave",
      persistAutosaveIO: async (args) => {
        persisted.push(args);
        resolvePersisted?.();
        return true;
      },
      toAiAutosaveSaveReason: (reason) => `autosave:${reason}`,
      retryReasonCode: "retry",
      setAiAutosaveWarning: () => undefined,
      setAiAutosaveStatusAt: () => undefined,
    });
    return null;
  }

  renderToStaticMarkup(createElement(Harness));
  assert.ok(api);
  api.queueAiAutosave({
    draft,
    previousBody: "Original body",
    reasonCode: "ai_rewrite",
  });
  await persistedOnce;

  assert.equal(persisted.length, 1);
  assert.equal(persisted[0]?.draft, draft);
  assert.equal(persisted[0]?.saveReason, "autosave:ai_rewrite");
  assert.deepEqual(persisted[0]?.revision, {
    kind: "autosave",
    note: "autosave:ai_rewrite",
  });
  assert.equal(persisted[0]?.quietFailure, true);
});
