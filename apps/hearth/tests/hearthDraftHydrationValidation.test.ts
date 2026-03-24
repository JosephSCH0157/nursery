import assert from "node:assert/strict";
import test from "node:test";
import { normalizeScriptTags, validateScriptTags } from "@forge/shared/script-tags";
import { hydrateDraftBodyFromCanonicalScript } from "../src/lib/hearth-draft-hydration";
import type { Draft } from "../src/domain/draft";

test("hearthDraftHydrationValidation: hydrated draft validates immediately", () => {
  const base: Draft = {
    id: "draft-1",
    title: "Draft",
    body: "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const hydrated = hydrateDraftBodyFromCanonicalScript({
    draft: base,
    scriptText: "[s1]\nHydrated body\n[/s1]\n",
  });
  const validation = validateScriptTags(normalizeScriptTags(hydrated.body));
  assert.equal(validation.ok, true);
});
