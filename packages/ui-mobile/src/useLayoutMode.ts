import { useEffect, useState } from "react";

export type LayoutMode = "mobile" | "tablet" | "desktop";

const MOBILE_MAX_WIDTH = 767;
const TABLET_MAX_WIDTH = 1023;

function getLayoutModeForWidth(width: number): LayoutMode {
  if (width <= MOBILE_MAX_WIDTH) return "mobile";
  if (width <= TABLET_MAX_WIDTH) return "tablet";
  return "desktop";
}

export function useLayoutMode(): LayoutMode {
  const [mode, setMode] = useState<LayoutMode>(() => {
    if (typeof window === "undefined") return "desktop";
    return getLayoutModeForWidth(window.innerWidth);
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    let frame: number | null = null;

    const update = () => {
      setMode(getLayoutModeForWidth(window.innerWidth));
      frame = null;
    };

    const onViewportChange = () => {
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
      }
      frame = window.requestAnimationFrame(update);
    };

    onViewportChange();

    window.addEventListener("resize", onViewportChange);
    window.addEventListener("orientationchange", onViewportChange);

    return () => {
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("orientationchange", onViewportChange);
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, []);

  return mode;
}
