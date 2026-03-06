import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, JSX } from "react";

type TranscriptRow = {
  id: string;
  startSec: number;
  speaker: "S1" | "S2" | "G1" | "G2";
  text: string;
};

const MOCK_MEDIA_ID = "media_local_01";
const MOCK_DURATION_SEC = 32;

const MOCK_TRANSCRIPT: TranscriptRow[] = [
  { id: "r1", startSec: 3, speaker: "S1", text: "Let me start with this." },
  { id: "r2", startSec: 7, speaker: "S2", text: "Right, and that is exactly the tension." },
  { id: "r3", startSec: 10, speaker: "S1", text: "Here is the real problem we keep seeing." },
  { id: "r4", startSec: 14, speaker: "S2", text: "Most teams optimize output, not signal." },
  { id: "r5", startSec: 17, speaker: "S1", text: "That is why workflow quality breaks first." },
  { id: "r6", startSec: 21, speaker: "G1", text: "Can we anchor this to one repeatable pattern?" },
  { id: "r7", startSec: 24, speaker: "S1", text: "Yes, transcript-driven edits become deterministic." },
  { id: "r8", startSec: 28, speaker: "S2", text: "Then shorts packaging is mostly review, not rescue." },
];

const ROOT_STYLE: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(340px, 0.95fr) minmax(420px, 1.05fr)",
  gap: 14,
  minHeight: "calc(100vh - 138px)",
};

const PANEL_STYLE: CSSProperties = {
  border: "1px solid rgba(148, 163, 184, 0.28)",
  borderRadius: 12,
  background: "rgba(15, 23, 38, 0.74)",
  display: "grid",
  alignContent: "start",
  minHeight: 0,
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function formatClock(totalSec: number): string {
  const sec = Math.floor(totalSec);
  const mm = Math.floor(sec / 60);
  const ss = sec % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function pickTranscriptRowForTime(rows: TranscriptRow[], timeSec: number): string | null {
  let active: string | null = null;
  for (const row of rows) {
    if (row.startSec <= timeSec) active = row.id;
  }
  return active;
}

export default function TranscriptSeekMock(): JSX.Element {
  const [currentSec, setCurrentSec] = useState(MOCK_TRANSCRIPT[0]?.startSec ?? 0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(MOCK_TRANSCRIPT[0]?.id ?? null);

  useEffect(() => {
    if (!isPlaying) return;
    const timer = window.setInterval(() => {
      setCurrentSec((prev) => {
        const next = prev + 0.25;
        if (next >= MOCK_DURATION_SEC) {
          setIsPlaying(false);
          return MOCK_DURATION_SEC;
        }
        return next;
      });
    }, 250);
    return () => window.clearInterval(timer);
  }, [isPlaying]);

  useEffect(() => {
    const active = pickTranscriptRowForTime(MOCK_TRANSCRIPT, currentSec);
    if (active && active !== selectedRowId) {
      setSelectedRowId(active);
    }
  }, [currentSec, selectedRowId]);

  const selectedRow = useMemo(
    () => MOCK_TRANSCRIPT.find((row) => row.id === selectedRowId) ?? null,
    [selectedRowId],
  );

  const progressPercent = useMemo(
    () => clamp((currentSec / MOCK_DURATION_SEC) * 100, 0, 100),
    [currentSec],
  );

  return (
    <section style={ROOT_STYLE}>
      <div style={{ ...PANEL_STYLE, padding: 12, gap: 12 }}>
        <header style={{ display: "grid", gap: 2 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Transcript</h2>
          <div style={{ fontSize: 13, opacity: 0.78 }}>
            Click a row to seek the preview playhead.
          </div>
        </header>

        <div style={{ display: "grid", gap: 6, overflow: "auto", maxHeight: "calc(100vh - 230px)" }}>
          {MOCK_TRANSCRIPT.map((row) => {
            const isSelected = row.id === selectedRowId;
            return (
              <button
                key={row.id}
                type="button"
                onClick={() => {
                  setCurrentSec(row.startSec);
                  setSelectedRowId(row.id);
                }}
                style={{
                  border: isSelected
                    ? "1px solid rgba(96, 165, 250, 0.72)"
                    : "1px solid rgba(148, 163, 184, 0.22)",
                  borderRadius: 10,
                  background: isSelected
                    ? "rgba(59, 130, 246, 0.2)"
                    : "rgba(2, 6, 23, 0.42)",
                  textAlign: "left",
                  padding: "8px 10px",
                  display: "grid",
                  gap: 3,
                }}
              >
                <div style={{ fontSize: 12, opacity: 0.85 }}>
                  {formatClock(row.startSec)} {row.speaker}
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.35 }}>{row.text}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ ...PANEL_STYLE, padding: 14, gap: 12 }}>
        <header style={{ display: "grid", gap: 4 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Preview (Stub)</h2>
          <div style={{ fontSize: 13, opacity: 0.8 }}>
            media_id: <strong>{MOCK_MEDIA_ID}</strong>
          </div>
        </header>

        <div
          style={{
            border: "1px solid rgba(148, 163, 184, 0.28)",
            borderRadius: 12,
            background: "linear-gradient(145deg, rgba(11, 20, 38, 0.9), rgba(2, 6, 23, 0.84))",
            padding: 12,
            display: "grid",
            gap: 10,
          }}
        >
          <div style={{ fontSize: 13, opacity: 0.85 }}>
            Time: {formatClock(currentSec)} / {formatClock(MOCK_DURATION_SEC)}
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            <div
              style={{
                height: 10,
                borderRadius: 999,
                border: "1px solid rgba(148, 163, 184, 0.25)",
                background: "rgba(2, 6, 23, 0.75)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${progressPercent}%`,
                  height: "100%",
                  background: "linear-gradient(90deg, rgba(96, 165, 250, 0.75), rgba(14, 165, 233, 0.85))",
                }}
              />
            </div>
            <input
              type="range"
              min={0}
              max={MOCK_DURATION_SEC}
              step={0.25}
              value={currentSec}
              onChange={(event) => setCurrentSec(Number(event.target.value))}
              aria-label="Preview playhead"
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={() => setIsPlaying((prev) => !prev)}>
              {isPlaying ? "Pause" : "Play"}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsPlaying(false);
                setCurrentSec(0);
                setSelectedRowId(MOCK_TRANSCRIPT[0]?.id ?? null);
              }}
            >
              Reset
            </button>
          </div>
        </div>

        <div
          style={{
            border: "1px dashed rgba(148, 163, 184, 0.35)",
            borderRadius: 10,
            padding: "8px 10px",
            fontSize: 13,
            color: "#b8c7db",
            background: "rgba(2, 6, 23, 0.45)",
          }}
        >
          {selectedRow
            ? `Selected row: ${formatClock(selectedRow.startSec)} ${selectedRow.speaker} - ${selectedRow.text}`
            : "No row selected."}
        </div>
      </div>
    </section>
  );
}
