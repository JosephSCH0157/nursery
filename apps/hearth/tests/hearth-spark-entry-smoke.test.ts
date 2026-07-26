import assert from "node:assert/strict";
import { createElement } from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import HearthMainContentSwitch from "../src/views/modes/HearthMainContentSwitch";

const source = readFileSync(
  resolve(process.cwd(), "src/hooks/useHearthIntakeLifecycle.ts"),
  "utf8",
);

assert.match(source, /preferredWorkspaceTab:\s*"script"/);
assert.match(source, /preferredEditorPanel:\s*"script"/);
assert.doesNotMatch(source, /pendingDraftEditorPanelRef\.current = "manual"/);

const rendered = renderToStaticMarkup(createElement(HearthMainContentSwitch, {
  showSparkRouteBootstrap: true,
  mode: "episodes",
  renderSparkRouteBootstrapView: () => createElement("div", null, "Spark intake"),
  renderSparksView: () => createElement("div", null, "Sparks"),
  renderEpisodesView: () => createElement("div", null, "Episodes"),
  renderReadyView: () => createElement("div", null, "Ready"),
  renderSeriesView: () => createElement("div", null, "Series"),
  renderFocusEditor: () => createElement("div", null, "Focus"),
}));
assert.match(rendered, /Spark intake/);
assert.doesNotMatch(rendered, /Episodes/);

console.log("[ok] hearth-spark-entry-smoke");
