import { useEffect, useMemo, useState } from "react";
import { MOUNT_ROLE_POLICY } from "@forge/tongs";
import type { MountRole } from "@forge/tongs";
import { useMountRegistry } from "../hooks/useMountRegistry";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const SESSIONS_KEY = "forge_tongs_sessions_v1";

type TongsSession = {
  id: string;
  title: string;
  startIso: string; // ISO string
  minutes: number;
  notes?: string;
};

function safeParseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + "-" + Date.now().toString(36);
}

function formatTargetShort(target: string): string {
  return target === "tongs_cloud" ? "Cloud" : "Local";
}

function formatRoleSummary(role: MountRole, target: string): string {
  const label = MOUNT_ROLE_POLICY.find((policy) => policy.role === role)?.label ?? role;
  return `${label}=${formatTargetShort(target)}`;
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day + 6) % 7; // Monday start
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateLabel(date: Date): string {
  const month = MONTH_NAMES[date.getMonth()];
  const day = String(date.getDate()).padStart(2, "0");
  return `${month} ${day}`;
}

function formatWeekLabel(start: Date): string {
  return `Week of ${formatDateLabel(start)}`;
}

function formatTimeLabel(date: Date): string {
  const hours24 = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const period = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${minutes} ${period}`;
}

function buildWeekDays(weekStart: Date) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    return {
      key: toDateKey(date),
      label: DAY_NAMES[date.getDay()],
      dateLabel: formatDateLabel(date),
    };
  });
}

function dateKeyFromIso(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return toDateKey(date);
}

export default function TongsCalendar() {
  const { getTarget } = useMountRegistry("default");

  const weekStart = useMemo(() => startOfWeek(new Date()), []);
  const weekDays = useMemo(() => buildWeekDays(weekStart), [weekStart]);

  const [sessions, setSessions] = useState<TongsSession[]>([]);
  const [showNew, setShowNew] = useState(false);

  const [title, setTitle] = useState("Recording session");
  const [date, setDate] = useState(() => {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${mm}-${dd}`;
  });
  const [time, setTime] = useState(() => {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mi}`;
  });
  const [minutes, setMinutes] = useState(60);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSIONS_KEY);
      const parsed = safeParseJson<TongsSession[]>(raw, []);
      const clean = Array.isArray(parsed)
        ? parsed.filter((s) => s && typeof s.id === "string" && typeof s.startIso === "string")
        : [];
      setSessions(clean);
    } catch {
      setSessions([]);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
    } catch {
      // ignore storage failures
    }
  }, [sessions]);

  function addSession() {
    const start = new Date(`${date}T${time}:00`);
    if (Number.isNaN(start.getTime())) return;

    const session: TongsSession = {
      id: uid(),
      title: title.trim() || "Recording session",
      startIso: start.toISOString(),
      minutes: Math.max(15, Math.min(8 * 60, Number(minutes) || 60)),
      notes: notes.trim() || undefined,
    };

    setSessions((prev) => [session, ...prev].sort((a, b) => b.startIso.localeCompare(a.startIso)));
    setShowNew(false);
  }

  function deleteSession(id: string) {
    setSessions((prev) => prev.filter((session) => session.id !== id));
  }

  const storageSummary = useMemo(() => {
    return MOUNT_ROLE_POLICY.map((policy) => formatRoleSummary(policy.role, getTarget(policy.role))).join(", ");
  }, [getTarget]);

  return (
    <div style={{ padding: 8, maxWidth: 1100 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h2 style={{ margin: 0 }}>Tongs Calendar</h2>
          <p style={{ marginTop: 6, opacity: 0.7 }}>Week view with local-only sessions.</p>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div style={{ fontSize: 14, opacity: 0.7 }}>{formatWeekLabel(weekStart)}</div>
          <button onClick={() => setShowNew((v) => !v)}>
            {showNew ? "Close" : "New Recording Session"}
          </button>
        </div>
      </div>

      {showNew && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 8,
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 160px 120px", gap: 10 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, opacity: 0.8 }}>Title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: "100%" }} />
            </div>

            <div>
              <label style={{ display: "block", fontSize: 12, opacity: 0.8 }}>Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: "100%" }} />
            </div>

            <div>
              <label style={{ display: "block", fontSize: 12, opacity: 0.8 }}>Time</label>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={{ width: "100%" }} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 10, marginTop: 10 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, opacity: 0.8 }}>Minutes</label>
              <input
                type="number"
                min={15}
                max={480}
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
                style={{ width: "100%" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: 12, opacity: 0.8 }}>Notes (optional)</label>
              <input value={notes} onChange={(e) => setNotes(e.target.value)} style={{ width: "100%" }} />
            </div>
          </div>

          <div style={{ marginTop: 12, display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={() => setShowNew(false)}>Cancel</button>
            <button onClick={addSession}>Add</button>
          </div>
        </div>
      )}

      <div
        style={{
          marginTop: 18,
          border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: 14,
          padding: 12,
          background: "rgba(255,255,255,0.05)",
          overflowX: "auto",
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(160px, 1fr))", gap: 12 }}>
          {weekDays.map((day) => {
            const daySessions = sessions
              .filter((session) => dateKeyFromIso(session.startIso) === day.key)
              .sort((a, b) => a.startIso.localeCompare(b.startIso));
            return (
              <div
                key={day.key}
                style={{
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 12,
                  padding: 12,
                  minHeight: 200,
                  background: "rgba(0,0,0,0.2)",
                }}
              >
                <div style={{ fontWeight: 700 }}>{day.label}</div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>{day.dateLabel}</div>

                <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                  {daySessions.length === 0 && (
                    <div style={{ fontSize: 12, opacity: 0.5 }}>No sessions</div>
                  )}
                  {daySessions.map((session) => {
                    const start = new Date(session.startIso);
                    const timeLabel = Number.isNaN(start.getTime()) ? "Unknown" : formatTimeLabel(start);
                    return (
                      <div
                        key={session.id}
                        style={{
                          borderRadius: 10,
                          padding: "10px 12px",
                          background: "rgba(255,255,255,0.08)",
                          border: "1px solid rgba(244,207,160,0.35)",
                        }}
                      >
                        <div style={{ fontSize: 12, letterSpacing: 0.3, textTransform: "uppercase", opacity: 0.7 }}>
                          {timeLabel}
                        </div>
                        <div style={{ marginTop: 4, fontWeight: 700 }}>{session.title}</div>
                        {session.notes && (
                          <div style={{ marginTop: 4, fontSize: 13, opacity: 0.8 }}>{session.notes}</div>
                        )}
                        <div style={{ marginTop: 6, fontSize: 12, opacity: 0.6 }}>{session.minutes} min</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <h3 style={{ margin: "0 0 8px 0" }}>Sessions</h3>

        {sessions.length === 0 ? (
          <div style={{ opacity: 0.7 }}>No sessions yet. Click "New Recording Session".</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {sessions.map((session) => {
              const start = new Date(session.startIso);
              return (
                <div
                  key={session.id}
                  style={{
                    padding: 12,
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 8,
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{session.title}</div>
                    <div style={{ opacity: 0.75, fontSize: 13 }}>
                      {Number.isNaN(start.getTime()) ? session.startIso : start.toLocaleString()} · {session.minutes} min
                    </div>
                    {session.notes ? (
                      <div style={{ opacity: 0.7, fontSize: 13, marginTop: 6 }}>{session.notes}</div>
                    ) : null}
                  </div>

                  <div style={{ display: "flex", alignItems: "center" }}>
                    <button onClick={() => deleteSession(session.id)}>Delete</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ marginTop: 14, fontSize: 12, opacity: 0.65 }}>Storage: {storageSummary}</div>
    </div>
  );
}
