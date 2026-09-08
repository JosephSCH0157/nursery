import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import {
  buildCurrentForgeNoticeRoute,
  buildHearthRouteContextUrl,
  buildOpenInAnvilHref,
  hasExplicitWorkpieceQuery,
  hasIncomingBarStockIntakeQuery,
  normalizeUuid,
} from "../src/routes/hearth-shell/hearth-shell-route";
import {
  isDevMode,
  readMode,
  readWorkpieceWorkspaceTab,
  readWorkspaceUiDensity,
  resolveStoreKind,
  writeMode,
  writeWorkpieceWorkspaceTab,
  writeWorkspaceUiDensity,
} from "../src/routes/hearth-shell/hearth-shell-preferences";
import {
  buildDiffLines,
  buildSparkPreview,
  deriveReadyUrgency,
  formatSparkStatus,
  normalizeGreetingName,
  normalizeMetadataTag,
  normalizeRailTitleKey,
  reorderVisibleReadyEntries,
  resolveCanonicalImageMapScriptHint,
  resolveReadyLabel,
} from "../src/routes/hearth-shell/hearth-shell-formatting";
import {
  buildAssistantMessageContent,
  buildProjectDraftSeed,
  buildSessionFingerprint,
  countProducerQuestions,
  createPlanningSessionForEpisode,
  detectAiAutosaveReasonCode,
  detectChatIntentSignals,
  isPlanningSessionEmpty,
  parsePlanningLines,
} from "../src/routes/hearth-shell/hearth-shell-planning";
import { resolveWorkpieceId, resolveWorkspaceId } from "../src/lib/sources-repo";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const WORKPIECE_ID = "22222222-2222-4222-8222-222222222222";

function installWindow(url: string): { dom: JSDOM; restore: () => void } {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url });
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value: dom.window,
  });
  return {
    dom,
    restore: () => {
      dom.window.close();
      if (previous) Object.defineProperty(globalThis, "window", previous);
      else Reflect.deleteProperty(globalThis, "window");
    },
  };
}

test("route helpers parse canonical identity through the existing owner", () => {
  const harness = installWindow(
    `http://localhost/app/hearth?workspace_id=${WORKSPACE_ID.toUpperCase()}&workpiece_id=${WORKPIECE_ID}`,
  );
  try {
    assert.equal(resolveWorkspaceId(), WORKSPACE_ID);
    assert.equal(resolveWorkpieceId(), WORKPIECE_ID);
    assert.equal(hasExplicitWorkpieceQuery(window.location.search), true);
    assert.equal(hasIncomingBarStockIntakeQuery(window.location.search), false);
  } finally {
    harness.restore();
  }
});

test("route helpers reject malformed identities and distinguish Bar-Stock intake", () => {
  const harness = installWindow("http://localhost/app/hearth?workspace_id=bad&workpiece_id=nope");
  try {
    assert.equal(resolveWorkspaceId(), null);
    assert.equal(resolveWorkpieceId(), null);
    assert.equal(normalizeUuid("not-a-uuid"), null);
    assert.equal(hasExplicitWorkpieceQuery("?workpiece_id=%20"), false);
    assert.equal(hasIncomingBarStockIntakeQuery("?spark_id=spark-1"), true);
    assert.equal(hasIncomingBarStockIntakeQuery("?spark_id=spark-1&workpieceId=existing"), false);
  } finally {
    harness.restore();
  }
});

test("route cleanup is deterministic and has no browser side effects", () => {
  const harness = installWindow("http://localhost/app/hearth?workspace=legacy&spark_id=spark-1&keep=yes#focus");
  try {
    const beforeHref = window.location.href;
    const beforeStorage = window.localStorage.length;
    const next = buildHearthRouteContextUrl({
      pathname: window.location.pathname,
      search: window.location.search,
      hash: window.location.hash,
      workspaceId: WORKSPACE_ID.toUpperCase(),
      workpieceId: WORKPIECE_ID,
    });
    assert.equal(
      next,
      `/app/hearth?keep=yes&workspace_id=${WORKSPACE_ID}&workpiece_id=${WORKPIECE_ID}#focus`,
    );
    assert.equal(window.location.href, beforeHref);
    assert.equal(window.localStorage.length, beforeStorage);
    assert.equal(
      buildCurrentForgeNoticeRoute({
        href: "http://localhost/app/hearth?keep=yes#focus",
        workspaceId: WORKSPACE_ID,
        workpieceId: WORKPIECE_ID,
      }),
      `/app/hearth?keep=yes&workspace_id=${WORKSPACE_ID}&workpiece_id=${WORKPIECE_ID}#focus`,
    );
    assert.equal(
      buildOpenInAnvilHref(WORKSPACE_ID, WORKPIECE_ID, "../unsafe.md"),
      null,
    );
  } finally {
    harness.restore();
  }
});

test("UI preferences preserve existing defaults, aliases, validation, and serialization", () => {
  const harness = installWindow("http://localhost/app/hearth?dev=1&store=local");
  try {
    assert.equal(isDevMode(), true);
    assert.equal(resolveStoreKind(), "local");
    assert.equal(window.localStorage.getItem("hearth_store_kind"), "local");

    assert.equal(readMode(WORKPIECE_ID), null);
    window.localStorage.setItem(`hearth:ui:mode:v1:${WORKPIECE_ID}`, "home");
    assert.equal(readMode(WORKPIECE_ID), "sparks");
    window.localStorage.setItem(`hearth:ui:mode:v1:${WORKPIECE_ID}`, "draft");
    assert.equal(readMode(WORKPIECE_ID), "focus");
    window.localStorage.setItem(`hearth:ui:mode:v1:${WORKPIECE_ID}`, "invalid");
    assert.equal(readMode(WORKPIECE_ID), null);
    writeMode(WORKPIECE_ID, "ready");
    assert.equal(window.localStorage.getItem(`hearth:ui:mode:v1:${WORKPIECE_ID}`), "ready");
    writeMode(WORKPIECE_ID, "sparks");
    assert.equal(window.localStorage.getItem(`hearth:ui:mode:v1:${WORKPIECE_ID}`), "ready");

    assert.equal(readWorkspaceUiDensity(WORKSPACE_ID), "comfortable");
    window.localStorage.setItem(`hearth:ui:density:v1:${WORKSPACE_ID}`, "wide");
    assert.equal(readWorkspaceUiDensity(WORKSPACE_ID), "comfortable");
    writeWorkspaceUiDensity(WORKSPACE_ID, "compact");
    assert.equal(readWorkspaceUiDensity(WORKSPACE_ID), "compact");

    writeWorkpieceWorkspaceTab(WORKPIECE_ID, WORKSPACE_ID, "visuals");
    assert.equal(readWorkpieceWorkspaceTab(WORKPIECE_ID, WORKSPACE_ID), "visuals");
    assert.equal(window.localStorage.getItem(`hearth:workpiece-tab:v1:${WORKPIECE_ID}`), "visuals");
    assert.equal(window.localStorage.getItem(`hearth:workspace-tab:v1:${WORKSPACE_ID}`), "visuals");
    assert.equal(window.localStorage.getItem("hearth:workpiece-tab:last:v1"), "visuals");
  } finally {
    harness.restore();
  }
});

test("formatting helpers preserve shell labels, ordering, and summaries", () => {
  assert.equal(normalizeRailTitleKey("  My   Episode "), "my episode");
  assert.equal(normalizeGreetingName("jane_doe@example.com"), "Jane Doe");
  assert.equal(normalizeMetadataTag(" ##Deep Dive! "), "deep-dive");
  assert.equal(buildSparkPreview("First line\n\nSecond line\nThird"), "First line Second line");
  assert.equal(formatSparkStatus({
    id: "spark",
    body: "Body",
    status: "forged",
    links: { hearthWorkpieceId: WORKPIECE_ID },
  } as never).label, "Forged");

  const now = Date.parse("2026-07-25T12:00:00.000Z");
  const hidden = { id: "hidden", hiddenAt: "2026-07-25T00:00:00.000Z" };
  const first = {
    id: "first",
    contentCategory: "hot_topic",
    updatedAt: "2026-07-25T00:00:00.000Z",
  };
  const second = { id: "second", contentCategory: "strategic_anchor" };
  assert.equal(deriveReadyUrgency(first as never, now), "fresh");
  assert.equal(resolveReadyLabel(second as never), "series");
  assert.deepEqual(
    reorderVisibleReadyEntries([first, hidden, second] as never, "second", "first").map((entry) => entry.id),
    ["second", "hidden", "first"],
  );
  assert.deepEqual(buildDiffLines("same\nold", "same\nnew").map((line) => line.status), ["same", "changed"]);
  assert.match(
    resolveCanonicalImageMapScriptHint({
      status: "ready",
      text: "script",
      source: "saved_draft",
      includesUnsavedLocalEdits: true,
      error: null,
    }) ?? "",
    /Unsaved local script edits/,
  );
});

test("planning helpers preserve deterministic defaults and calculations", () => {
  const session = createPlanningSessionForEpisode(WORKPIECE_ID, WORKSPACE_ID);
  assert.equal(isPlanningSessionEmpty(session), true);
  assert.equal(JSON.parse(buildSessionFingerprint(session)).workpiece_id, WORKPIECE_ID);
  assert.deepEqual(parsePlanningLines(" first \n\n second "), ["first", "second"]);
  assert.equal(countProducerQuestions("1. First?\n2) Second?"), 2);
  assert.equal(detectAiAutosaveReasonCode("Please fix the script tags"), "ai_repair");
  assert.equal(detectChatIntentSignals("Draft now, no questions: write the full script.").explicitDraftNow, true);
  assert.equal(
    buildProjectDraftSeed("Episode", [{
      id: "spark",
      body: "Opening thought",
      status: "open",
    }] as never).startsWith("# Episode\n\n## Intro"),
    true,
  );
});

test("planning helpers never render a phantom outline or script completion", () => {
  for (const assistantText of [
    "Here's a clean first-draft bullet set…",
    "Here's a loose bullet outline…",
  ]) {
    assert.equal(buildAssistantMessageContent({
      assistantText,
      ops: [],
      autosaveReasonCode: "ai_outline",
      scriptMutationRequested: false,
      scriptMutationReady: false,
    }), "Hearth did not return a usable bullet outline. No outline was created.");
  }

  assert.equal(buildAssistantMessageContent({
    assistantText: "Here's the full script.",
    ops: [],
    autosaveReasonCode: "ai_script",
    scriptMutationRequested: true,
    scriptMutationReady: false,
  }), "Hearth did not return usable script content. No script changes were created.");

  assert.match(buildAssistantMessageContent({
    assistantText: "Here's a loose outline.",
    ops: [{ op: "set_outline", value: "- Open on the empty block before the crowd arrives." }],
    autosaveReasonCode: "ai_outline",
    scriptMutationRequested: false,
    scriptMutationReady: false,
  }), /- Open on the empty block/);
});
