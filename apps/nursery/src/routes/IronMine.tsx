import { useEffect, useState } from "react";
import "./IronMine.css";

const IRON_MINE_URL = "https://discord.com/channels/1457026850407841834/1457026850407841837";

export default function IronMine() {
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [frameTimedOut, setFrameTimedOut] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFrameTimedOut(true);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, []);

  const showFallbackPanel = frameTimedOut && !frameLoaded;

  return (
    <section className="iron-mine">
      <header className="iron-mine__header">
        <h2 className="iron-mine__title">Iron Mine</h2>
        <div className="iron-mine__subtitle">
          Community forum (Discord). If your browser blocks the embed, open Discord directly.
          {" "}
          <a href={IRON_MINE_URL} target="_blank" rel="noreferrer">
            Open in new tab
          </a>
        </div>
      </header>

      <iframe
        title="Iron Mine Community"
        src={IRON_MINE_URL}
        onLoad={() => setFrameLoaded(true)}
        onError={() => setFrameTimedOut(true)}
        className="iron-mine__frame"
      />
      {showFallbackPanel ? (
        <div className="iron-mine__fallback">
          Discord won&apos;t embed in this browser context.
          {" "}
          <a href={IRON_MINE_URL} target="_blank" rel="noreferrer">
            Open Iron Mine in a new tab
          </a>
          .
        </div>
      ) : null}
    </section>
  );
}
