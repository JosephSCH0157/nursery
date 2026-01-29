import { useMemo, useState, useEffect } from "react";
import { MOUNT_ROLE_POLICY } from "@forge/tongs";
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

const SESSION_STORAGE_KEY = "forge_tongs_sessions_v1";

type RecordingSession = {
  id: string;
  date: string; // YYYY-MM-DD
  time: string;
  title: string;
  notes?: string;
  duration?: string;
};

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

function buildDefaultSessions(weekStart: Date): RecordingSession[] {
  const plan = [
    { offset: 0, time: "9:30 AM", notes: "Ep 12 - Cold open + intro", duration: "90 min" },
    { offset: 2, time: "1:00 PM", notes: "Guest: Liv (remote)", duration: "60 min" },
    { offset: 3, time: "4:00 PM", notes: "Ep 13 - Q&A", duration: "75 min" },
    { offset: 5, time: "10:00 AM", notes: "Bonus clips", duration: "45 min" },
  ];

  return plan.map((item, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + item.offset);
    return {
      id: `seed-${index}`,
      date: toDateKey(date),
      time: item.time,
      title: "Recording session",
      notes: item.notes,
      duration: item.duration,
    };
  });
}

function isRecordingSession(value: unknown): value is RecordingSession {
  if (!value || typeof value !== "object") return false;
  const session = value as RecordingSession;
  return (
    typeof session.id === "string" &&
    typeof session.date === "string" &&
    typeof session.time === "string" &&
    typeof session.title === "string"
  );
}

function loadSessions(weekStart: Date): RecordingSession[] {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) {
      const seeded = buildDefaultSessions(weekStart);
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("Invalid sessions payload");
    const cleaned = parsed.filter(isRecordingSession);
    if (!cleaned.length) throw new Error("No valid sessions");
    return cleaned;
  } catch {
    return buildDefaultSessions(weekStart);
  }
}

function timeToMinutes(time: string): number {
  const match = time.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return 0;
  const hoursRaw = Number(match[1]);
  const minutes = Number(match[2]);
  const period = match[3].toUpperCase();
  const hours = hoursRaw % 12 + (period === "PM" ? 12 : 0);
  return hours * 60 + minutes;
}

export default function TongsCalendar() {
  const weekStart = useMemo(() => startOfWeek(new Date()), []);
  const weekDays = useMemo(() => buildWeekDays(weekStart), [weekStart]);
  const [sessions, setSessions] = useState<RecordingSession[]>(() => loadSessions(weekStart));
  const { getTarget } = useMountRegistry();

  useEffect(() => {
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessions));
    } catch {
      // ignore storage failures
    }
  }, [sessions]);

  const storageSummary = useMemo(() => {
    return MOUNT_ROLE_POLICY.map((policy) => {
      const target = getTarget(policy.role);
      const targetLabel = target === "tongs_cloud" ? "Cloud" : "Local";
      const suffix = policy.eligibleTargets.length === 1 ? " (v1)" : "";
      return `${policy.label}=${targetLabel}${suffix}`;
    }).join(", ");
  }, [getTarget]);

  const handleNewSession = () => {
    const now = new Date();
    const newSession: RecordingSession = {
      id: `sess-${Date.now()}`,
      date: toDateKey(now),
      time: formatTimeLabel(now),
      title: "Recording session",
      notes: "New session",
      duration: "60 min",
    };

    setSessions((prev) => [newSession, ...prev]);
  };

  return (
    <div style={{ padding: 8, maxWidth: 1100 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h2 style={{ margin: 0 }}>Tongs Calendar</h2>
          <p style={{ marginTop: 6, opacity: 0.7 }}>Week view with local-only sessions.</p>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div style={{ fontSize: 14, opacity: 0.7 }}>{formatWeekLabel(weekStart)}</div>
          <button onClick={handleNewSession}>New Recording Session</button>
        </div>
      </div>

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
              .filter((session) => session.date === day.key)
              .sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
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
                  {daySessions.map((session) => (
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
                        {session.time}
                      </div>
                      <div style={{ marginTop: 4, fontWeight: 700 }}>{session.title}</div>
                      {session.notes && (
                        <div style={{ marginTop: 4, fontSize: 13, opacity: 0.8 }}>{session.notes}</div>
                      )}
                      {session.duration && (
                        <div style={{ marginTop: 6, fontSize: 12, opacity: 0.6 }}>{session.duration}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ marginTop: 14, fontSize: 12, opacity: 0.65 }}>Storage: {storageSummary}</div>
    </div>
  );
}
