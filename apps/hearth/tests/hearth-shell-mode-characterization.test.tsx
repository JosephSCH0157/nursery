import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getLayoutModeForWidth } from "../../../packages/ui-mobile/src/useLayoutMode";
import HearthMainContentSwitch from "../src/views/modes/HearthMainContentSwitch";

const renderMode = (
  mode: "sparks" | "episodes" | "ready" | "series" | "focus",
  showSparkRouteBootstrap = false,
) => renderToStaticMarkup(createElement(HearthMainContentSwitch, {
  showSparkRouteBootstrap,
  mode,
  renderSparkRouteBootstrapView: () => createElement("div", null, "bootstrap"),
  renderSparksView: () => createElement("div", null, "sparks"),
  renderEpisodesView: () => createElement("div", null, "episodes"),
  renderReadyView: () => createElement("div", null, "ready"),
  renderSeriesView: () => createElement("div", null, "series"),
  renderFocusEditor: () => createElement("div", null, "focus"),
}));

test("layout boundary classifies mobile, tablet, and desktop widths deterministically", () => {
  assert.equal(getLayoutModeForWidth(767), "mobile");
  assert.equal(getLayoutModeForWidth(768), "tablet");
  assert.equal(getLayoutModeForWidth(1023), "tablet");
  assert.equal(getLayoutModeForWidth(1024), "desktop");
});

test("desktop main-content modes select exactly one owning surface", () => {
  for (const mode of ["sparks", "episodes", "ready", "series", "focus"] as const) {
    const html = renderMode(mode);
    assert.equal(html, `<div>${mode}</div>`);
  }
});

test("mobile Spark intake bootstrap overrides the collection mode", () => {
  assert.equal(renderMode("episodes", true), "<div>bootstrap</div>");
});
