import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MobilePage, getLayoutModeForWidth, useLayoutMode } from "../src";

const ALLOWED_MODES = new Set(["mobile", "tablet", "desktop"]);

function withWindow(width: number, run: () => void) {
  const globalAny = globalThis as { window?: unknown };
  const hadWindow = "window" in globalAny;
  const previousWindow = globalAny.window;

  globalAny.window = {
    innerWidth: width,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    requestAnimationFrame: (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    },
    cancelAnimationFrame: () => undefined,
  };

  try {
    run();
  } finally {
    if (hadWindow) {
      globalAny.window = previousWindow;
    } else {
      delete globalAny.window;
    }
  }
}

function HookProbe() {
  const mode = useLayoutMode();
  expect(ALLOWED_MODES.has(mode)).toBe(true);
  return <div data-mode={mode}>{mode}</div>;
}

describe("@forge/ui-mobile contract", () => {
  it("maps width breakpoints to supported layout modes", () => {
    expect(getLayoutModeForWidth(375)).toBe("mobile");
    expect(getLayoutModeForWidth(900)).toBe("tablet");
    expect(getLayoutModeForWidth(1280)).toBe("desktop");
  });

  it("returns only supported hook values", () => {
    for (const width of [375, 900, 1280]) {
      withWindow(width, () => {
        const html = renderToString(<HookProbe />);
        expect(html).toMatch(/mobile|tablet|desktop/);
      });
    }
  });

  it("renders MobilePage slots without throwing", () => {
    withWindow(390, () => {
      const html = renderToString(
        <MobilePage
          title="Smoke Title"
          rightAction={<button type="button">Right</button>}
          bottomBar={<button type="button">Save</button>}
          onBack={() => undefined}
        >
          <div>Body Slot</div>
        </MobilePage>,
      );
      expect(html).toContain("Smoke Title");
      expect(html).toContain("Body Slot");
      expect(html).toContain("Right");
      expect(html).toContain("Save");
    });
  });
});
