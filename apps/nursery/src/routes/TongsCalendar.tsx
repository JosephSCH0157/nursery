import { useCallback, useEffect, useMemo, useState } from "react";
import { MOUNT_ROLE_POLICY } from "@forge/tongs";
import type { ResolvedMount } from "@forge/tongs";
import type { CalendarEventRow } from "@forge/tongs";
import {
  listCalendarEvents,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
} from "@forge/tongs";
import { useMountRegistry } from "../hooks/useMountRegistry";
import { supabase } from "../lib/supabase";
import { useOutletContext } from "react-router-dom";
import type { AppShellContext } from "./AppShell";
import { LocalHearthStore } from "@forge/hearth";

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

const VIEW_KEY = "forge_tongs_calendar_view_v1";
const CURSOR_KEY = "forge_tongs_calendar_cursor_v1";

type CalendarView = "day" | "week" | "month";

type CalendarEvent = {
  id: string;
  sessionId?: string | null;
  title: string;
  description?: string;
  location?: string;
  startIso: string;
  endIso?: string;
  allDay?: boolean;
  createdAtIso: string;
  updatedAtIso: string;
};


const VIEW_OPTIONS: { value: CalendarView; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];


const hearthStore = new LocalHearthStore();

function getErrorMessage(err: unknown): string | undefined {
  if (err && typeof err === "object" && "message" in err) {
    const message = (err as { message?: unknown }).message;
    return typeof message === "string" ? message : undefined;
  }
  return undefined;
}

function getAssignmentIdFromSession(session: unknown): string | null {
  if (!session || typeof session !== "object") return null;
  const s = session as Record<string, unknown>;
  const candidates = [s.assignmentId, s.assignment_id, s.id, s.sessionId, s.session_id];
  for (const c of candidates) {
    if (typeof c === "string" && c.length > 0) return c;
  }
  return null;
}

async function ensureEventHasSessionId(args: {
  supabase: unknown;
  workspaceId: string;
  row: CalendarEventRow;
  assignmentId: string;
}): Promise<CalendarEventRow> {
  const { supabase, workspaceId, row, assignmentId } = args;
  if (row.session_id) return row;

  const hearthSession = await hearthStore.ensureSessionForCalendarEvent({
    calendarEventId: row.id,
    assignmentId,
    title: row.title,
    scheduledStart: row.start_at,
    scheduledEnd: row.end_at ?? undefined,
  });

  return updateCalendarEvent(supabase, workspaceId, row.id, {
    session_id: hearthSession.sessionId,
  });
}

function useLocalStorageState<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw != null ? (JSON.parse(raw) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore storage failures
    }
  }, [key, value]);

  return [value, setValue] as const;
}


function formatTargetShort(target: string): string {
  return target === "tongs_cloud" ? "Cloud" : "Local";
}

function formatRoleSummary(resolved: ResolvedMount): string {
  const role = resolved.role;
  const label = MOUNT_ROLE_POLICY.find((policy) => policy.role === role)?.label ?? role;
  return `${label}=${formatTargetShort(resolved.canonicalTarget.target)}`;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function startOfWeek(date: Date): Date {
  const d = startOfDay(date);
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}

function endOfWeek(date: Date): Date {
  const start = startOfWeek(date);
  return endOfDay(addDays(start, 6));
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return endOfDay(new Date(date.getFullYear(), date.getMonth() + 1, 0));
}

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(key: string): Date | null {
  const match = /^\\d{4}-\\d{2}-\\d{2}$/.test(key);
  if (!match) return null;
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateLabel(date: Date): string {
  const month = MONTH_NAMES[date.getMonth()];
  const day = String(date.getDate()).padStart(2, "0");
  return `${month} ${day}`;
}

function formatDayLabel(date: Date): string {
  const dayName = DAY_NAMES[date.getDay()];
  return `${dayName}, ${formatDateLabel(date)}`;
}

function formatWeekLabel(start: Date): string {
  return `Week of ${formatDateLabel(start)}`;
}

function formatMonthLabel(date: Date): string {
  return `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
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
    const date = addDays(weekStart, index);
    return {
      key: toDateKey(date),
      label: DAY_NAMES[date.getDay()],
      dateLabel: formatDateLabel(date),
    };
  });
}

function buildMonthDays(cursorDate: Date) {
  const monthStart = startOfMonth(cursorDate);
  const gridStart = startOfWeek(monthStart);
  const gridEnd = endOfWeek(endOfMonth(cursorDate));
  const days = [] as { key: string; label: string; inMonth: boolean }[];

  let current = gridStart;
  while (current <= gridEnd) {
    const key = toDateKey(current);
    days.push({
      key,
      label: String(current.getDate()),
      inMonth: current.getMonth() === cursorDate.getMonth(),
    });
    current = addDays(current, 1);
  }

  return days;
}


function dateKeyFromIso(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return toDateKey(date);
}

function getViewRange(view: CalendarView, cursorDate: Date) {
  if (view === "day") {
    return { start: startOfDay(cursorDate), end: endOfDay(cursorDate) };
  }

  if (view === "week") {
    const start = startOfWeek(cursorDate);
    return { start, end: endOfWeek(start) };
  }

  const monthStart = startOfMonth(cursorDate);
  const start = startOfWeek(monthStart);
  const end = endOfWeek(endOfMonth(cursorDate));
  return { start, end };
}

function normalizeEvent(event: CalendarEvent): CalendarEvent {
  const nowIso = new Date().toISOString();
  return {
    ...event,
    allDay: event.allDay ?? false,
    createdAtIso: event.createdAtIso ?? nowIso,
    updatedAtIso: event.updatedAtIso ?? event.createdAtIso ?? nowIso,
  };
}

function rowToEvent(row: CalendarEventRow): CalendarEvent {
  const startIso = row.start_at ?? new Date().toISOString();
  const endIso = row.end_at ?? undefined;

  return normalizeEvent({
    id: row.id,
    sessionId: row.session_id ?? null,
    title: row.title ?? "Calendar event",
    description: row.description ?? undefined,
    location: row.location ?? undefined,
    startIso,
    endIso,
    allDay: row.all_day ?? false,
    createdAtIso: row.created_at ?? startIso,
    updatedAtIso: row.updated_at ?? startIso,
  });
}

export default function TongsCalendar() {
  const shell = useOutletContext<AppShellContext>();
  const workspaceId = shell?.workspaceId ?? null;
  const session = shell?.session ?? null;
  const { resolveMount } = useMountRegistry("default");

  const todayIso = useMemo(() => toDateKey(new Date()), []);
  const [view, setView] = useLocalStorageState<CalendarView>(VIEW_KEY, "week");
  const [cursorDayIso, setCursorDayIso] = useLocalStorageState<string>(CURSOR_KEY, todayIso);

  const cursorDate = useMemo(() => parseDateKey(cursorDayIso) ?? new Date(), [cursorDayIso]);
  const weekStart = useMemo(() => startOfWeek(cursorDate), [cursorDate]);
  const weekDays = useMemo(() => buildWeekDays(weekStart), [weekStart]);
  const monthDays = useMemo(() => buildMonthDays(cursorDate), [cursorDate]);

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  const [title, setTitle] = useState("Calendar event");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [dateOverride, setDateOverride] = useState<string | null>(null);
  const [time, setTime] = useState(() => {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mi}`;
  });
  const date = dateOverride ?? cursorDayIso;
  const [durationMin, setDurationMin] = useState(60);
  const [allDay, setAllDay] = useState(false);

  useEffect(() => {
    if (!workspaceId || !session) {
      setEvents([]);
      return;
    }

    let alive = true;
    setLoading(true);
    setLoadError(null);

    const range = getViewRange(view, cursorDate);
    void (async () => {
      try {
        const rows = await listCalendarEvents(supabase, workspaceId, {
          startAt: range.start.toISOString(),
          endAt: range.end.toISOString(),
        });
        if (!alive) return;

        const assignmentId = getAssignmentIdFromSession(session);
        if (!assignmentId) {
          throw new Error("Missing assignmentId for calendar load (cannot bind sessions).");
        }

        const patchedRows = await Promise.all(
          rows.map((r) =>
            ensureEventHasSessionId({
              supabase,
              workspaceId,
              row: r,
              assignmentId,
            }).catch((err) => {
              console.warn("[tongs] calendar session backfill failed", { id: r.id, err });
              return r;
            })
          )
        );

        setEvents(patchedRows.map(rowToEvent));
      } catch (err: unknown) {
        if (!alive) return;
        console.warn("[tongs] calendar list failed", err);
        setLoadError(getErrorMessage(err) ?? "Failed loading calendar events.");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [workspaceId, session, view, cursorDate]);

  const openNewForm = useCallback(() => {
    setDateOverride(null);
    setShowNew(true);
  }, []);

  const closeNewForm = useCallback(() => {
    setShowNew(false);
    setDateOverride(null);
  }, []);


  async function addEvent() {
    if (!workspaceId || !session) return;
    const baseStart = allDay ? new Date(`${date}T00:00:00`) : new Date(`${date}T${time}:00`);
    if (Number.isNaN(baseStart.getTime())) return;
    const minutes = Math.max(15, Math.min(8 * 60, Number(durationMin) || 60));
    const endAt = allDay ? endOfDay(baseStart) : new Date(baseStart.getTime() + minutes * 60 * 1000);

    try {
      const row = await createCalendarEvent(supabase, workspaceId, {
        title: title.trim() || "Calendar event",
        description: description.trim() || undefined,
        location: location.trim() || undefined,
        start_at: baseStart.toISOString(),
        end_at: endAt.toISOString(),
        all_day: allDay,
      });

      const assignmentId = getAssignmentIdFromSession(session);
      if (!assignmentId) {
        throw new Error(
          "Missing assignmentId for calendar event (cannot bind recording session)."
        );
      }

      const hearthSession = await hearthStore.ensureSessionForCalendarEvent({
        calendarEventId: row.id,
        assignmentId,
        title: row.title,
        scheduledStart: row.start_at,
        scheduledEnd: row.end_at ?? undefined,
      });

      const patched = await updateCalendarEvent(supabase, workspaceId, row.id, {
        session_id: hearthSession.sessionId,
      });

      const event = rowToEvent(patched);
      setEvents((prev) => [event, ...prev].sort((a, b) => b.startIso.localeCompare(a.startIso)));
      closeNewForm();
    } catch (err: unknown) {
      console.warn("[tongs] calendar create failed", err);
      setLoadError(getErrorMessage(err) ?? "Failed creating calendar event.");
    }
  }

  async function deleteEvent(id: string) {
    if (!workspaceId || !session) return;
    try {
      await deleteCalendarEvent(supabase, id);
      setEvents((prev) => prev.filter((event) => event.id !== id));
    } catch (err: unknown) {
      console.warn("[tongs] calendar delete failed", err);
      setLoadError(getErrorMessage(err) ?? "Failed deleting calendar event.");
    }
  }

  function goToToday() {
    setCursorDayIso(todayIso);
  }

  function goPrev() {
    if (view === "day") {
      setCursorDayIso(toDateKey(addDays(cursorDate, -1)));
      return;
    }

    if (view === "week") {
      setCursorDayIso(toDateKey(addDays(cursorDate, -7)));
      return;
    }

    setCursorDayIso(toDateKey(addMonths(cursorDate, -1)));
  }

  function goNext() {
    if (view === "day") {
      setCursorDayIso(toDateKey(addDays(cursorDate, 1)));
      return;
    }

    if (view === "week") {
      setCursorDayIso(toDateKey(addDays(cursorDate, 7)));
      return;
    }

    setCursorDayIso(toDateKey(addMonths(cursorDate, 1)));
  }

  const rangeLabel = useMemo(() => {
    if (view === "day") return formatDayLabel(cursorDate);
    if (view === "week") return formatWeekLabel(weekStart);
    return formatMonthLabel(cursorDate);
  }, [view, cursorDate, weekStart]);

  const viewRange = useMemo(() => getViewRange(view, cursorDate), [view, cursorDate]);

  const visibleEvents = useMemo(() => {
    return events
      .filter((event) => {
        const start = new Date(event.startIso);
        if (Number.isNaN(start.getTime())) return false;
        return start >= viewRange.start && start <= viewRange.end;
      })
      .sort((a, b) => a.startIso.localeCompare(b.startIso));
  }, [events, viewRange]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of visibleEvents) {
      const key = dateKeyFromIso(event.startIso);
      if (!key) continue;
      const list = map.get(key) ?? [];
      list.push(event);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.startIso.localeCompare(b.startIso));
    }
    return map;
  }, [visibleEvents]);

  const storageSummary = useMemo(() => {
    return MOUNT_ROLE_POLICY.map((policy) => formatRoleSummary(resolveMount(policy.role))).join(", ");
  }, [resolveMount]);

  const dayEvents = eventsByDay.get(toDateKey(cursorDate)) ?? [];

  return (
    <div style={{ padding: 8, maxWidth: 1100 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h2 style={{ margin: 0 }}>Tongs Calendar</h2>
          <p style={{ marginTop: 6, opacity: 0.7 }}>Plan sessions across scripting, recording, and releases.</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <div
            style={{
              display: "inline-flex",
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            {VIEW_OPTIONS.map((option) => {
              const isActive = view === option.value;
              return (
                <button
                  key={option.value}
                  onClick={() => setView(option.value)}
                  style={{
                    padding: "6px 10px",
                    border: "none",
                    background: isActive ? "rgba(255,255,255,0.18)" : "transparent",
                    color: "inherit",
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button onClick={goPrev}>Prev</button>
            <button onClick={goToToday}>Today</button>
            <button onClick={goNext}>Next</button>
          </div>

          <div style={{ fontSize: 14, opacity: 0.7 }}>{rangeLabel}</div>

          <button onClick={showNew ? closeNewForm : openNewForm}>{showNew ? "Close" : "New Event"}</button>
        </div>
      </div>
      {loadError ? (
        <div style={{ marginTop: 10, color: "#ffb3b3", fontSize: 13 }}>
          {loadError}
        </div>
      ) : null}
      {loading ? (
        <div style={{ marginTop: 10, opacity: 0.7, fontSize: 13 }}>
          Loading events…
        </div>
      ) : null}

      {showNew && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 8,
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 160px", gap: 10 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, opacity: 0.8 }}>Title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: "100%" }} />
            </div>

            <div>
              <label style={{ display: "block", fontSize: 12, opacity: 0.8 }}>Location</label>
              <input value={location} onChange={(e) => setLocation(e.target.value)} style={{ width: "100%" }} />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => setAllDay(e.target.checked)}
              />
              <span style={{ fontSize: 12 }}>All day</span>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 160px 120px 120px", gap: 10, marginTop: 10 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, opacity: 0.8 }}>Description (optional)</label>
              <input value={description} onChange={(e) => setDescription(e.target.value)} style={{ width: "100%" }} />
            </div>

            <div>
              <label style={{ display: "block", fontSize: 12, opacity: 0.8 }}>Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDateOverride(e.target.value)}
                style={{ width: "100%" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: 12, opacity: 0.8 }}>Time</label>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={{ width: "100%" }} />
            </div>

            <div>
              <label style={{ display: "block", fontSize: 12, opacity: 0.8 }}>Minutes</label>
              <input
                type="number"
                min={15}
                max={480}
                value={durationMin}
                onChange={(e) => setDurationMin(Number(e.target.value))}
                style={{ width: "100%" }}
                disabled={allDay}
              />
            </div>
          </div>

          <div style={{ marginTop: 12, display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={closeNewForm}>Cancel</button>
            <button onClick={addEvent}>Add</button>
          </div>
        </div>
      )}

      {view === "day" && (
        <div
          style={{
            marginTop: 18,
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 14,
            padding: 12,
            background: "rgba(255,255,255,0.05)",
          }}
        >
          <div style={{ fontWeight: 700 }}>{formatDayLabel(cursorDate)}</div>
          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            {dayEvents.length === 0 && <div style={{ fontSize: 12, opacity: 0.5 }}>No events</div>}
            {dayEvents.map((event) => {
              const start = new Date(event.startIso);
              const timeLabel = Number.isNaN(start.getTime()) ? "Unknown" : formatTimeLabel(start);
              return (
                <div
                  key={event.id}
                  style={{
                    borderRadius: 10,
                    padding: "10px 12px",
                    background: "rgba(255,255,255,0.08)",
                    border: "1px solid rgba(255,255,255,0.2)",
                  }}
                >
                  <div style={{ fontWeight: 700 }}>{event.title}</div>
                  <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75, display: "flex", gap: 8 }}>
                    <span>{event.allDay ? "All day" : timeLabel}</span>
                    {event.location ? <span>{event.location}</span> : null}
                  </div>
                  {event.description ? (
                    <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>{event.description}</div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {view === "week" && (
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
              const dayEventsForWeek = eventsByDay.get(day.key) ?? [];
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
                    {dayEventsForWeek.length === 0 && <div style={{ fontSize: 12, opacity: 0.5 }}>No events</div>}
                    {dayEventsForWeek.map((event) => {
                      const start = new Date(event.startIso);
                      const timeLabel = Number.isNaN(start.getTime()) ? "Unknown" : formatTimeLabel(start);
                      return (
                        <div
                          key={event.id}
                          style={{
                            borderRadius: 10,
                            padding: "10px 12px",
                            background: "rgba(255,255,255,0.08)",
                            border: "1px solid rgba(255,255,255,0.2)",
                          }}
                        >
                          <div style={{ fontSize: 12, letterSpacing: 0.3, textTransform: "uppercase", opacity: 0.7 }}>
                            {event.allDay ? "All day" : timeLabel}
                          </div>
                          <div style={{ marginTop: 4, fontWeight: 700 }}>{event.title}</div>
                          {event.location ? (
                            <div style={{ marginTop: 4, fontSize: 12, opacity: 0.7 }}>{event.location}</div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {view === "month" && (
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(140px, 1fr))", gap: 12 }}>
            {monthDays.map((day) => {
              const dayEventsForMonth = eventsByDay.get(day.key) ?? [];
              const visible = dayEventsForMonth.slice(0, 3);
              const hiddenCount = dayEventsForMonth.length - visible.length;
              return (
                <button
                  key={day.key}
                  onClick={() => {
                    setCursorDayIso(day.key);
                    setView("day");
                  }}
                  style={{
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 12,
                    padding: 10,
                    minHeight: 140,
                    background: day.inMonth ? "rgba(0,0,0,0.2)" : "rgba(0,0,0,0.12)",
                    textAlign: "left",
                  }}
                >
                  <div style={{ fontSize: 12, opacity: day.inMonth ? 0.85 : 0.45 }}>{day.label}</div>
                  <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                    {visible.map((event) => {
                      return (
                        <div
                          key={event.id}
                          style={{
                            borderRadius: 8,
                            padding: "6px 8px",
                            background: "rgba(255,255,255,0.08)",
                            border: "1px solid rgba(255,255,255,0.2)",
                            fontSize: 12,
                          }}
                        >
                          {event.title}
                        </div>
                      );
                    })}
                    {hiddenCount > 0 && <div style={{ fontSize: 12, opacity: 0.6 }}>+{hiddenCount} more</div>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <h3 style={{ margin: "0 0 8px 0" }}>Events</h3>

        {visibleEvents.length === 0 ? (
          <div style={{ opacity: 0.7 }}>No events in this view.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {visibleEvents.map((event) => {
              const start = new Date(event.startIso);
              return (
                <div
                  key={event.id}
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
                    <div style={{ fontWeight: 600 }}>{event.title}</div>
                    <div style={{ opacity: 0.75, fontSize: 13, marginTop: 4 }}>
                      {Number.isNaN(start.getTime()) ? event.startIso : start.toLocaleString()}
                      {event.allDay ? " • All day" : ""}
                    </div>
                    {event.location ? (
                      <div style={{ marginTop: 4, fontSize: 12, opacity: 0.7 }}>{event.location}</div>
                    ) : null}
                    {event.description ? (
                      <div style={{ opacity: 0.7, fontSize: 13, marginTop: 6 }}>{event.description}</div>
                    ) : null}
                  </div>

                  <div style={{ display: "flex", alignItems: "center" }}>
                    <button onClick={() => deleteEvent(event.id)}>Delete</button>
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
