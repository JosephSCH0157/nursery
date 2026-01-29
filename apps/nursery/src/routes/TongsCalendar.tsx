import { useCallback, useEffect, useMemo, useState } from "react";
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
const EVENTS_KEY = "forge_tongs_events_v1";
const VIEW_KEY = "forge_tongs_calendar_view_v1";
const CURSOR_KEY = "forge_tongs_calendar_cursor_v1";

type CalendarView = "day" | "week" | "month";

type CalendarEventKind = "recording" | "scripting" | "editing" | "publishing" | "guest";

type CalendarEventStatus = "planned" | "in_progress" | "blocked" | "done";

type CalendarEventMeta = {
  scripting?: {
    scriptId?: string;
    targetLengthMin?: number;
    outline?: string;
  };
  editing?: {
    episodeId?: string;
    assets?: string[];
    deliverables?: string[];
  };
  publishing?: {
    platforms?: string[];
    scheduledPublishIso?: string;
    seoChecklist?: boolean;
  };
  guest?: {
    guestName?: string;
    guestHandle?: string;
    contact?: string;
    format?: "in_person" | "remote";
    prepItems?: string;
  };
};

type CalendarEvent = {
  id: string;
  kind: CalendarEventKind;
  title: string;
  startIso: string;
  durationMin?: number;
  notes?: string;
  status: CalendarEventStatus;
  createdAtIso: string;
  updatedAtIso: string;
  meta?: CalendarEventMeta;
};

type LegacyRecordingSession = {
  id: string;
  date: string;
  time: string;
  title: string;
  notes?: string;
  duration?: string;
};

type LegacyTongsSession = {
  id: string;
  title: string;
  startIso: string;
  minutes: number;
  notes?: string;
};

const VIEW_OPTIONS: { value: CalendarView; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

const KIND_OPTIONS: { value: CalendarEventKind; label: string }[] = [
  { value: "recording", label: "Recording" },
  { value: "scripting", label: "Scripting" },
  { value: "editing", label: "Editing" },
  { value: "publishing", label: "Publishing" },
  { value: "guest", label: "Guest" },
];

const STATUS_OPTIONS: { value: CalendarEventStatus; label: string }[] = [
  { value: "planned", label: "Planned" },
  { value: "in_progress", label: "In progress" },
  { value: "blocked", label: "Blocked" },
  { value: "done", label: "Done" },
];

const KIND_STYLES: Record<CalendarEventKind, { label: string; color: string; bg: string }> = {
  recording: { label: "Recording", color: "#f4cfa0", bg: "rgba(244,207,160,0.18)" },
  scripting: { label: "Scripting", color: "#9ad0ff", bg: "rgba(154,208,255,0.18)" },
  editing: { label: "Editing", color: "#b9f3c2", bg: "rgba(185,243,194,0.18)" },
  publishing: { label: "Publishing", color: "#f7b7ff", bg: "rgba(247,183,255,0.18)" },
  guest: { label: "Guest", color: "#ffd280", bg: "rgba(255,210,128,0.18)" },
};

const STATUS_COLORS: Record<CalendarEventStatus, string> = {
  planned: "#a0a0a0",
  in_progress: "#5da9ff",
  blocked: "#ff6b6b",
  done: "#4ade80",
};

function safeParseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
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

function parseDurationToMin(value?: string): number | undefined {
  if (!value) return undefined;
  const match = value.match(/(\d+)/);
  if (!match) return undefined;
  const minutes = Number(match[1]);
  return Number.isNaN(minutes) ? undefined : minutes;
}

function parseTimeString(time: string): { hours: number; minutes: number } | null {
  const ampm = time.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (ampm) {
    const hoursRaw = Number(ampm[1]);
    const minutes = Number(ampm[2]);
    const period = ampm[3].toUpperCase();
    if (Number.isNaN(hoursRaw) || Number.isNaN(minutes)) return null;
    const hours = hoursRaw % 12 + (period === "PM" ? 12 : 0);
    return { hours, minutes };
  }

  const twentyFour = time.match(/(\d+):(\d+)/);
  if (twentyFour) {
    const hours = Number(twentyFour[1]);
    const minutes = Number(twentyFour[2]);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
    return { hours, minutes };
  }

  return null;
}

function dateTimeFromDateAndTime(dateKey: string, time: string): Date | null {
  const date = parseDateKey(dateKey);
  if (!date) return null;
  const parsed = parseTimeString(time);
  if (!parsed) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), parsed.hours, parsed.minutes, 0, 0);
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
    status: event.status ?? "planned",
    createdAtIso: event.createdAtIso ?? nowIso,
    updatedAtIso: event.updatedAtIso ?? event.createdAtIso ?? nowIso,
  };
}

function isValidKind(kind: unknown): kind is CalendarEventKind {
  return KIND_OPTIONS.some((option) => option.value === kind);
}

function isCalendarEvent(value: unknown): value is CalendarEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as CalendarEvent;
  return (
    typeof event.id === "string" &&
    typeof event.kind === "string" &&
    isValidKind(event.kind) &&
    typeof event.title === "string" &&
    typeof event.startIso === "string"
  );
}

function legacyToEvent(session: LegacyRecordingSession | LegacyTongsSession): CalendarEvent | null {
  const nowIso = new Date().toISOString();

  if ((session as LegacyTongsSession).startIso) {
    const legacy = session as LegacyTongsSession;
    return normalizeEvent({
      id: legacy.id,
      kind: "recording",
      title: legacy.title || "Recording session",
      startIso: legacy.startIso,
      durationMin: legacy.minutes,
      notes: legacy.notes,
      status: "planned",
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    });
  }

  const legacy = session as LegacyRecordingSession;
  const start = dateTimeFromDateAndTime(legacy.date, legacy.time);
  if (!start) return null;

  return normalizeEvent({
    id: legacy.id,
    kind: "recording",
    title: legacy.title || "Recording session",
    startIso: start.toISOString(),
    durationMin: parseDurationToMin(legacy.duration),
    notes: legacy.notes,
    status: "planned",
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  });
}

function loadEvents(): CalendarEvent[] {
  const raw = localStorage.getItem(EVENTS_KEY);
  if (raw) {
    const parsed = safeParseJson<CalendarEvent[]>(raw, []);
    return Array.isArray(parsed)
      ? parsed.filter(isCalendarEvent).map((event) => normalizeEvent(event))
      : [];
  }

  const legacyRaw = localStorage.getItem(SESSIONS_KEY);
  if (!legacyRaw) return [];

  const parsedLegacy = safeParseJson<LegacyRecordingSession[] | LegacyTongsSession[]>(legacyRaw, []);
  if (!Array.isArray(parsedLegacy)) return [];

  return parsedLegacy
    .map((session) => legacyToEvent(session as LegacyRecordingSession | LegacyTongsSession))
    .filter((event): event is CalendarEvent => !!event);
}

export default function TongsCalendar() {
  const { getTarget } = useMountRegistry("default");

  const todayIso = useMemo(() => toDateKey(new Date()), []);
  const [view, setView] = useLocalStorageState<CalendarView>(VIEW_KEY, "week");
  const [cursorDayIso, setCursorDayIso] = useLocalStorageState<string>(CURSOR_KEY, todayIso);

  const cursorDate = useMemo(() => parseDateKey(cursorDayIso) ?? new Date(), [cursorDayIso]);
  const weekStart = useMemo(() => startOfWeek(cursorDate), [cursorDate]);
  const weekDays = useMemo(() => buildWeekDays(weekStart), [weekStart]);
  const monthDays = useMemo(() => buildMonthDays(cursorDate), [cursorDate]);

  const [events, setEvents] = useState<CalendarEvent[]>(() => {
    try {
      return loadEvents();
    } catch {
      return [];
    }
  });
  const [showNew, setShowNew] = useState(false);

  const [kind, setKind] = useState<CalendarEventKind>("recording");
  const [status, setStatus] = useState<CalendarEventStatus>("planned");
  const [title, setTitle] = useState("Recording session");
  const [dateOverride, setDateOverride] = useState<string | null>(null);
  const [time, setTime] = useState(() => {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mi}`;
  });
  const date = dateOverride ?? cursorDayIso;
  const [durationMin, setDurationMin] = useState(60);
  const [notes, setNotes] = useState("");

  const [scriptId, setScriptId] = useState("");
  const [targetLengthMin, setTargetLengthMin] = useState<number | "">("");
  const [outline, setOutline] = useState("");

  const [episodeId, setEpisodeId] = useState("");
  const [assets, setAssets] = useState("");
  const [deliverables, setDeliverables] = useState("");

  const [platforms, setPlatforms] = useState("");
  const [scheduledPublish, setScheduledPublish] = useState("");
  const [seoChecklist, setSeoChecklist] = useState(false);

  const [guestName, setGuestName] = useState("");
  const [guestHandle, setGuestHandle] = useState("");
  const [guestContact, setGuestContact] = useState("");
  const [guestFormat, setGuestFormat] = useState<"in_person" | "remote">("remote");
  const [prepItems, setPrepItems] = useState("");

  const [kindFilters, setKindFilters] = useState<Record<CalendarEventKind, boolean>>(() => ({
    recording: true,
    scripting: true,
    editing: true,
    publishing: true,
    guest: true,
  }));

  useEffect(() => {
    try {
      localStorage.setItem(EVENTS_KEY, JSON.stringify(events));
    } catch {
      // ignore storage failures
    }
  }, [events]);

  const openNewForm = useCallback(() => {
    setDateOverride(null);
    setShowNew(true);
  }, []);

  const closeNewForm = useCallback(() => {
    setShowNew(false);
    setDateOverride(null);
  }, []);

  function resetKindFields(selectedKind: CalendarEventKind) {
    if (selectedKind === "recording") return;
    if (selectedKind === "scripting") {
      setScriptId("");
      setTargetLengthMin("");
      setOutline("");
    }
    if (selectedKind === "editing") {
      setEpisodeId("");
      setAssets("");
      setDeliverables("");
    }
    if (selectedKind === "publishing") {
      setPlatforms("");
      setScheduledPublish("");
      setSeoChecklist(false);
    }
    if (selectedKind === "guest") {
      setGuestName("");
      setGuestHandle("");
      setGuestContact("");
      setGuestFormat("remote");
      setPrepItems("");
    }
  }

  function handleKindChange(next: CalendarEventKind) {
    setKind(next);
    resetKindFields(next);
  }

  function addEvent() {
    const start = new Date(`${date}T${time}:00`);
    if (Number.isNaN(start.getTime())) return;

    const nowIso = new Date().toISOString();

    const meta: CalendarEventMeta = {};
    if (kind === "scripting") {
      meta.scripting = {
        scriptId: scriptId.trim() || undefined,
        targetLengthMin: typeof targetLengthMin === "number" ? targetLengthMin : undefined,
        outline: outline.trim() || undefined,
      };
    }
    if (kind === "editing") {
      meta.editing = {
        episodeId: episodeId.trim() || undefined,
        assets: assets
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        deliverables: deliverables
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      };
    }
    if (kind === "publishing") {
      meta.publishing = {
        platforms: platforms
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        scheduledPublishIso: scheduledPublish ? new Date(scheduledPublish).toISOString() : undefined,
        seoChecklist: seoChecklist || undefined,
      };
    }
    if (kind === "guest") {
      meta.guest = {
        guestName: guestName.trim() || undefined,
        guestHandle: guestHandle.trim() || undefined,
        contact: guestContact.trim() || undefined,
        format: guestFormat,
        prepItems: prepItems.trim() || undefined,
      };
    }

    const event: CalendarEvent = normalizeEvent({
      id: uid(),
      kind,
      title: title.trim() || KIND_STYLES[kind].label,
      startIso: start.toISOString(),
      durationMin: Math.max(15, Math.min(8 * 60, Number(durationMin) || 60)),
      notes: notes.trim() || undefined,
      status,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
      meta: Object.keys(meta).length ? meta : undefined,
    });

    setEvents((prev) => [event, ...prev].sort((a, b) => b.startIso.localeCompare(a.startIso)));
    closeNewForm();
  }

  function deleteEvent(id: string) {
    setEvents((prev) => prev.filter((event) => event.id !== id));
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

  function toggleKindFilter(kindKey: CalendarEventKind) {
    setKindFilters((prev) => ({ ...prev, [kindKey]: !prev[kindKey] }));
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
        if (!kindFilters[event.kind]) return false;
        const start = new Date(event.startIso);
        if (Number.isNaN(start.getTime())) return false;
        return start >= viewRange.start && start <= viewRange.end;
      })
      .sort((a, b) => a.startIso.localeCompare(b.startIso));
  }, [events, viewRange, kindFilters]);

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
    return MOUNT_ROLE_POLICY.map((policy) => formatRoleSummary(policy.role, getTarget(policy.role))).join(", ");
  }, [getTarget]);

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

      <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {KIND_OPTIONS.map((option) => {
          const active = kindFilters[option.value];
          return (
            <button
              key={option.value}
              onClick={() => toggleKindFilter(option.value)}
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                border: `1px solid ${active ? KIND_STYLES[option.value].color : "rgba(255,255,255,0.2)"}`,
                background: active ? KIND_STYLES[option.value].bg : "transparent",
                color: "inherit",
              }}
            >
              {option.label}
            </button>
          );
        })}
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
          <div style={{ display: "grid", gridTemplateColumns: "160px 1fr 160px", gap: 10 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, opacity: 0.8 }}>Type</label>
              <select value={kind} onChange={(e) => handleKindChange(e.target.value as CalendarEventKind)}>
                {KIND_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: 12, opacity: 0.8 }}>Title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: "100%" }} />
            </div>

            <div>
              <label style={{ display: "block", fontSize: 12, opacity: 0.8 }}>Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as CalendarEventStatus)}>
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 160px 120px 120px", gap: 10, marginTop: 10 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, opacity: 0.8 }}>Notes (optional)</label>
              <input value={notes} onChange={(e) => setNotes(e.target.value)} style={{ width: "100%" }} />
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
              />
            </div>
          </div>

          {kind === "scripting" && (
            <div style={{ display: "grid", gridTemplateColumns: "160px 160px 1fr", gap: 10, marginTop: 12 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, opacity: 0.8 }}>Script ID</label>
                <input value={scriptId} onChange={(e) => setScriptId(e.target.value)} style={{ width: "100%" }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, opacity: 0.8 }}>Target length (min)</label>
                <input
                  type="number"
                  min={1}
                  value={targetLengthMin}
                  onChange={(e) => setTargetLengthMin(e.target.value ? Number(e.target.value) : "")}
                  style={{ width: "100%" }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, opacity: 0.8 }}>Outline</label>
                <input value={outline} onChange={(e) => setOutline(e.target.value)} style={{ width: "100%" }} />
              </div>
            </div>
          )}

          {kind === "editing" && (
            <div style={{ display: "grid", gridTemplateColumns: "160px 1fr 1fr", gap: 10, marginTop: 12 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, opacity: 0.8 }}>Episode ID</label>
                <input value={episodeId} onChange={(e) => setEpisodeId(e.target.value)} style={{ width: "100%" }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, opacity: 0.8 }}>Deliverables</label>
                <input
                  value={deliverables}
                  onChange={(e) => setDeliverables(e.target.value)}
                  placeholder="full ep, shorts"
                  style={{ width: "100%" }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, opacity: 0.8 }}>Assets</label>
                <input
                  value={assets}
                  onChange={(e) => setAssets(e.target.value)}
                  placeholder="audio stems, clips"
                  style={{ width: "100%" }}
                />
              </div>
            </div>
          )}

          {kind === "publishing" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 200px 160px", gap: 10, marginTop: 12 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, opacity: 0.8 }}>Platforms</label>
                <input
                  value={platforms}
                  onChange={(e) => setPlatforms(e.target.value)}
                  placeholder="YouTube, Spotify"
                  style={{ width: "100%" }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, opacity: 0.8 }}>Scheduled publish</label>
                <input
                  type="datetime-local"
                  value={scheduledPublish}
                  onChange={(e) => setScheduledPublish(e.target.value)}
                  style={{ width: "100%" }}
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={seoChecklist}
                  onChange={(e) => setSeoChecklist(e.target.checked)}
                />
                <span style={{ fontSize: 12 }}>SEO checklist complete</span>
              </div>
            </div>
          )}

          {kind === "guest" && (
            <div style={{ display: "grid", gridTemplateColumns: "160px 160px 1fr", gap: 10, marginTop: 12 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, opacity: 0.8 }}>Guest name</label>
                <input value={guestName} onChange={(e) => setGuestName(e.target.value)} style={{ width: "100%" }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, opacity: 0.8 }}>Handle</label>
                <input value={guestHandle} onChange={(e) => setGuestHandle(e.target.value)} style={{ width: "100%" }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, opacity: 0.8 }}>Contact</label>
                <input value={guestContact} onChange={(e) => setGuestContact(e.target.value)} style={{ width: "100%" }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, opacity: 0.8 }}>Format</label>
                <select value={guestFormat} onChange={(e) => setGuestFormat(e.target.value as "in_person" | "remote")}>
                  <option value="remote">Remote</option>
                  <option value="in_person">In person</option>
                </select>
              </div>
              <div style={{ gridColumn: "span 2" }}>
                <label style={{ display: "block", fontSize: 12, opacity: 0.8 }}>Prep items</label>
                <input value={prepItems} onChange={(e) => setPrepItems(e.target.value)} style={{ width: "100%" }} />
              </div>
            </div>
          )}

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
              const kindStyle = KIND_STYLES[event.kind];
              return (
                <div
                  key={event.id}
                  style={{
                    borderRadius: 10,
                    padding: "10px 12px",
                    background: "rgba(255,255,255,0.08)",
                    border: `1px solid ${kindStyle.color}`,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span
                      style={{
                        fontSize: 10,
                        textTransform: "uppercase",
                        letterSpacing: 0.4,
                        color: kindStyle.color,
                        background: kindStyle.bg,
                        padding: "2px 6px",
                        borderRadius: 999,
                        border: `1px solid ${kindStyle.color}`,
                      }}
                    >
                      {kindStyle.label}
                    </span>
                    <span style={{ fontWeight: 700 }}>{event.title}</span>
                  </div>
                  <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75, display: "flex", gap: 8 }}>
                    <span>{timeLabel}</span>
                    {event.durationMin && <span>{event.durationMin} min</span>}
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: 999,
                          background: STATUS_COLORS[event.status],
                        }}
                      />
                      {STATUS_OPTIONS.find((option) => option.value === event.status)?.label ?? event.status}
                    </span>
                  </div>
                  {event.notes && <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>{event.notes}</div>}
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
                      const kindStyle = KIND_STYLES[event.kind];
                      return (
                        <div
                          key={event.id}
                          style={{
                            borderRadius: 10,
                            padding: "10px 12px",
                            background: "rgba(255,255,255,0.08)",
                            border: `1px solid ${kindStyle.color}`,
                          }}
                        >
                          <div style={{ fontSize: 12, letterSpacing: 0.3, textTransform: "uppercase", opacity: 0.7 }}>
                            {timeLabel}
                          </div>
                          <div style={{ marginTop: 4, fontWeight: 700 }}>{event.title}</div>
                          <div style={{ marginTop: 4, fontSize: 12, opacity: 0.7 }}>
                            {kindStyle.label} -
                            <span style={{ marginLeft: 6, color: STATUS_COLORS[event.status] }}>
                              {STATUS_OPTIONS.find((option) => option.value === event.status)?.label ?? event.status}
                            </span>
                          </div>
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
                      const kindStyle = KIND_STYLES[event.kind];
                      return (
                        <div
                          key={event.id}
                          style={{
                            borderRadius: 8,
                            padding: "6px 8px",
                            background: "rgba(255,255,255,0.08)",
                            border: `1px solid ${kindStyle.color}`,
                            fontSize: 12,
                          }}
                        >
                          <span style={{ color: kindStyle.color, fontWeight: 600 }}>{kindStyle.label}</span>{" "}
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
              const kindStyle = KIND_STYLES[event.kind];
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
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span
                        style={{
                          fontSize: 10,
                          textTransform: "uppercase",
                          letterSpacing: 0.4,
                          color: kindStyle.color,
                          background: kindStyle.bg,
                          padding: "2px 6px",
                          borderRadius: 999,
                          border: `1px solid ${kindStyle.color}`,
                        }}
                      >
                        {kindStyle.label}
                      </span>
                      <span style={{ fontWeight: 600 }}>{event.title}</span>
                    </div>
                    <div style={{ opacity: 0.75, fontSize: 13, marginTop: 4 }}>
                      {Number.isNaN(start.getTime()) ? event.startIso : start.toLocaleString()}
                      {event.durationMin ? ` - ${event.durationMin} min` : ""}
                    </div>
                    <div style={{ marginTop: 4, fontSize: 12, opacity: 0.7 }}>
                      Status: {STATUS_OPTIONS.find((option) => option.value === event.status)?.label ?? event.status}
                    </div>
                    {event.notes ? (
                      <div style={{ opacity: 0.7, fontSize: 13, marginTop: 6 }}>{event.notes}</div>
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
