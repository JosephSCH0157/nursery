import { useEffect, useState } from "react";
import "./MobileWarningBanner.css";

type Props = {
  appName: string;
  storageKey: string;
};

export default function MobileWarningBanner({ appName, storageKey }: Props) {
  const [isMobile, setIsMobile] = useState(() =>
    window.matchMedia("(max-width: 1024px)").matches
  );
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(storageKey) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1024px)");
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  if (!isMobile || dismissed) return null;

  function handleDismiss() {
    try {
      sessionStorage.setItem(storageKey, "1");
    } catch {
      // ignore storage failure
    }
    setDismissed(true);
  }

  return (
    <div role="alert" className="mobile-warning-banner">
      <span className="mobile-warning-banner__icon" aria-hidden="true">⚠</span>
      <p className="mobile-warning-banner__text">
        <strong>{appName}</strong> is not optimized for mobile devices.
        For the best experience, we highly recommend using a computer.
      </p>
      <button
        type="button"
        className="mobile-warning-banner__dismiss"
        aria-label="Dismiss mobile device warning"
        onClick={handleDismiss}
      >
        ✕
      </button>
    </div>
  );
}
