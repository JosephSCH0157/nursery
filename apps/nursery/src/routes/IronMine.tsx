import { useEffect, useState } from "react";

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
    <section
      style={{
        display: "grid",
        gap: 12,
        height: "calc(100vh - 140px)",
      }}
    >
      <header style={{ display: "grid", gap: 6 }}>
        <h2 style={{ margin: 0 }}>Iron Mine</h2>
        <div style={{ fontSize: 13, opacity: 0.8 }}>
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
        style={{
          width: "100%",
          height: "100%",
          border: "1px solid var(--forge-border)",
          borderRadius: 10,
          background: "var(--forge-bg-elevated)",
        }}
      />
      {showFallbackPanel ? (
        <div
          style={{
            border: "1px solid rgba(255, 255, 255, 0.22)",
            borderRadius: 10,
            padding: "10px 12px",
            background: "rgba(255, 255, 255, 0.05)",
            fontSize: 13,
          }}
        >
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
