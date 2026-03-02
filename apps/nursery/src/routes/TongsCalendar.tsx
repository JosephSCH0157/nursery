import { useCallback, useEffect, useMemo, useState } from "react";
import { MOUNT_ROLE_POLICY } from "@forge/tongs";
import type { ResolvedMount, CalendarEventRow, Database } from "@forge/tongs";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  listCalendarEvents,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  listCalendarEventAssignments,
} from "@forge/tongs";
import { useMountRegistry } from "../hooks/useMountRegistry";
import { supabase } from "../lib/supabase";
import { tongsApiRequest } from "../lib/tongs-api";
import { useOutletContext } from "react-router-dom";
import type { AppShellContext } from "./AppShell";
import WorkspaceRequiredNotice from "./WorkspaceRequiredNotice";

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
  assignmentId?: string | null;
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

type RecordingSessionOption = {
  id: string;
  title: string;
  calendarEventId?: string | null;
  createdAtIso?: string | null;
};

type EpisodeOption = {
  id: string;
  label: string;
  updatedAtIso?: string | null;
};


const VIEW_OPTIONS: { value: CalendarView; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

type WorkspaceRole = "viewer" | "editor" | "admin" | "owner";

const WORKSPACE_ROLE_RANK: Record<WorkspaceRole, number> = {
  viewer: 10,
  editor: 20,
  admin: 30,
  owner: 40,
};

function normalizeWorkspaceRole(value: unknown): WorkspaceRole | null {
  if (value === "viewer" || value === "editor" || value === "admin" || value === "owner") {
    return value;
  }
  return null;
}

function workspaceRoleAtLeast(role: WorkspaceRole | null, minRole: WorkspaceRole): boolean {
  if (!role) return false;
  return WORKSPACE_ROLE_RANK[role] >= WORKSPACE_ROLE_RANK[minRole];
}


function getErrorMessage(err: unknown): string | undefined {
  if (err && typeof err === "object" && "message" in err) {
    const message = (err as { message?: unknown }).message;
    return typeof message === "string" ? message : undefined;
  }
  return undefined;
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

function formatTimeInputValue(date: Date): string {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
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
  const days = [] as { key: string; label: string; inMonth: boolean; date: Date }[];

  let current = gridStart;
  while (current <= gridEnd) {
    const key = toDateKey(current);
    days.push({
      key,
      date: current,
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
    assignmentId: row.assignment_id ?? null,
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
  const workspaceRole = useMemo(() => {
    if (!workspaceId) return null;
    const match = shell?.workspaces?.find((workspace) => workspace.id === workspaceId);
    return normalizeWorkspaceRole(match?.role ?? null);
  }, [shell?.workspaces, workspaceId]);
  const canReadCalendar = workspaceRole
    ? workspaceRoleAtLeast(workspaceRole, "viewer")
    : Boolean(session && workspaceId);
  const canEditCalendar = workspaceRole ? workspaceRoleAtLeast(workspaceRole, "editor") : false;
  const canDeleteCalendar = workspaceRole ? workspaceRoleAtLeast(workspaceRole, "admin") : false;
  const { resolveMount } = useMountRegistry("default");

  const todayIso = useMemo(() => toDateKey(new Date()), []);
  const [view, setView] = useLocalStorageState<CalendarView>(VIEW_KEY, "week");
  const [cursorDayIso, setCursorDayIso] = useLocalStorageState<string>(CURSOR_KEY, todayIso);
  const [cursorDate, setCursorDate] = useState(() => parseDateKey(cursorDayIso) ?? new Date());
  const setViewDate = useCallback((nextDate: Date) => {
    setCursorDate(nextDate);
    setCursorDayIso(toDateKey(nextDate));
  }, [setCursorDayIso]);

  useEffect(() => {
    const parsed = parseDateKey(cursorDayIso);
    if (!parsed) return;
    if (parsed.getTime() !== cursorDate.getTime()) {
      setCursorDate(parsed);
    }
  }, [cursorDayIso, cursorDate]);
  const weekStart = useMemo(() => startOfWeek(cursorDate), [cursorDate]);
  const weekDays = useMemo(() => buildWeekDays(weekStart), [weekStart]);
  const monthDays = useMemo(() => buildMonthDays(cursorDate), [cursorDate]);

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);

  const [recordingSessions, setRecordingSessions] = useState<RecordingSessionOption[]>([]);
  const [recordingSessionsLoading, setRecordingSessionsLoading] = useState(false);
  const [recordingSessionsError, setRecordingSessionsError] = useState<string | null>(null);
  const [episodes, setEpisodes] = useState<EpisodeOption[]>([]);
  const [episodesLoading, setEpisodesLoading] = useState(false);
  const [episodesError, setEpisodesError] = useState<string | null>(null);
  const [eventAssignmentIdsByEventId, setEventAssignmentIdsByEventId] = useState<Record<string, string[]>>({});

  const [title, setTitle] = useState("Calendar event");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [linkedSessionId, setLinkedSessionId] = useState("");
  const [linkedEpisodeIds, setLinkedEpisodeIds] = useState<string[]>([]);
  const [dateOverride, setDateOverride] = useState<string | null>(null);
  const [time, setTime] = useState(() => {
    const d = new Date();
    return formatTimeInputValue(d);
  });
  const date = dateOverride ?? cursorDayIso;
  const [durationMin, setDurationMin] = useState(60);
  const [allDay, setAllDay] = useState(false);
  const isEditingEvent = editingEventId !== null;

  const loadRecordingSessions = useCallback(async () => {
    if (!workspaceId || !session || !canReadCalendar) {
      setRecordingSessions([]);
      setRecordingSessionsError(null);
      return;
    }

    setRecordingSessionsLoading(true);
    setRecordingSessionsError(null);
    try {
      const { data, error } = await supabase
        .schema("tongs")
        .from("recording_sessions")
        .select("id,title,calendar_event_id,created_at")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      const next = (data ?? []).map((row) => ({
        id: row.id,
        title: row.title?.trim() || "Recording Session",
        calendarEventId: row.calendar_event_id ?? null,
        createdAtIso: row.created_at ?? null,
      }));
      setRecordingSessions(next);
    } catch (err: unknown) {
      console.warn("[tongs] recording sessions list failed", err);
      setRecordingSessionsError(getErrorMessage(err) ?? "Failed loading recording sessions.");
    } finally {
      setRecordingSessionsLoading(false);
    }
  }, [workspaceId, session, canReadCalendar]);

  useEffect(() => {
    void loadRecordingSessions();
  }, [loadRecordingSessions]);

  const loadEpisodes = useCallback(async () => {
    if (!workspaceId || !session || !canReadCalendar) {
      setEpisodes([]);
      setEpisodesError(null);
      return;
    }

    setEpisodesLoading(true);
    setEpisodesError(null);
    try {
      const { data, error } = await supabase
        .schema("tongs")
        .from("episodes")
        .select("id,label,updated_at")
        .eq("workspace_id", workspaceId)
        .order("updated_at", { ascending: false });

      if (error) throw error;
      const next = (data ?? []).map((row) => ({
        id: row.id,
        label: row.label?.trim() || "Untitled episode",
        updatedAtIso: row.updated_at ?? null,
      }));
      setEpisodes(next);
    } catch (err: unknown) {
      console.warn("[tongs] episodes list failed", err);
      setEpisodesError(getErrorMessage(err) ?? "Failed loading episodes.");
    } finally {
      setEpisodesLoading(false);
    }
  }, [workspaceId, session, canReadCalendar]);

  useEffect(() => {
    void loadEpisodes();
  }, [loadEpisodes]);

  const sessionTitleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const sessionRow of recordingSessions) {
      map.set(sessionRow.id, sessionRow.title);
    }
    return map;
  }, [recordingSessions]);

  const episodeLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const episode of episodes) {
      map.set(episode.id, episode.label);
    }
    return map;
  }, [episodes]);

  const resetEventForm = useCallback((baseDate?: string) => {
    const nextBaseDate = baseDate ?? cursorDayIso;
    setTitle("Calendar event");
    setDescription("");
    setLocation("");
    setLinkedSessionId("");
    setLinkedEpisodeIds([]);
    setAllDay(false);
    setDurationMin(60);
    setDateOverride(nextBaseDate);
    setTime(formatTimeInputValue(new Date()));
    setEditingEventId(null);
  }, [cursorDayIso]);

  const openNewForm = useCallback(() => {
    if (!canEditCalendar) {
      setLoadError("You need Editor access in this workspace to create or edit events.");
      return;
    }
    resetEventForm(cursorDayIso);
    setShowNew(true);
  }, [canEditCalendar, cursorDayIso, resetEventForm]);

  const closeNewForm = useCallback(() => {
    setShowNew(false);
    setDateOverride(null);
    setEditingEventId(null);
  }, []);

  const openEditForm = useCallback((event: CalendarEvent) => {
    if (!canEditCalendar) {
      setLoadError("You need Editor access in this workspace to create or edit events.");
      return;
    }
    const start = new Date(event.startIso);
    const end = event.endIso ? new Date(event.endIso) : null;
    const parsedStart = Number.isNaN(start.getTime()) ? new Date() : start;
    const nextDate = toDateKey(parsedStart);
    const nextDuration = (() => {
      if (event.allDay) return 60;
      if (!end || Number.isNaN(end.getTime())) return 60;
      const diffMinutes = Math.round((end.getTime() - parsedStart.getTime()) / 60000);
      if (!Number.isFinite(diffMinutes) || diffMinutes <= 0) return 60;
      return Math.max(15, Math.min(8 * 60, diffMinutes));
    })();

    setTitle(event.title || "Calendar event");
    setDescription(event.description ?? "");
    setLocation(event.location ?? "");
    setLinkedSessionId(event.sessionId ?? "");
    setLinkedEpisodeIds(eventAssignmentIdsByEventId[event.id] ?? []);
    setAllDay(!!event.allDay);
    setDurationMin(nextDuration);
    setDateOverride(nextDate);
    setTime(formatTimeInputValue(parsedStart));
    setEditingEventId(event.id);
    setShowNew(true);
  }, [canEditCalendar, eventAssignmentIdsByEventId]);

  const toggleLinkedEpisode = useCallback((episodeId: string, checked: boolean) => {
    setLinkedEpisodeIds((prev) => {
      if (checked) {
        return prev.includes(episodeId) ? prev : [...prev, episodeId];
      }
      return prev.filter((id) => id !== episodeId);
    });
  }, []);

  const syncRecordingSessionAttachment = useCallback(async (
    calendarEventId: string,
    nextSessionId: string | null,
  ) => {
    if (!workspaceId || !session) return;

    let clearEventLinksQuery = supabase
      .schema("tongs")
      .from("recording_sessions")
      .update({ calendar_event_id: null })
      .eq("workspace_id", workspaceId)
      .eq("calendar_event_id", calendarEventId);

    if (nextSessionId) {
      clearEventLinksQuery = clearEventLinksQuery.neq("id", nextSessionId);
    }

    const { error: clearEventLinksError } = await clearEventLinksQuery;
    if (clearEventLinksError) throw clearEventLinksError;

    if (nextSessionId) {
      const { error: clearOtherEventBindingsError } = await supabase
        .schema("tongs")
        .from("calendar_events")
        .update({ session_id: null })
        .eq("workspace_id", workspaceId)
        .eq("session_id", nextSessionId)
        .neq("id", calendarEventId);
      if (clearOtherEventBindingsError) throw clearOtherEventBindingsError;

      const { error: attachSessionError } = await supabase
        .schema("tongs")
        .from("recording_sessions")
        .update({ calendar_event_id: calendarEventId })
        .eq("workspace_id", workspaceId)
        .eq("id", nextSessionId);
      if (attachSessionError) throw attachSessionError;
    }
  }, [workspaceId, session]);

  const syncEventAssignments = useCallback(async (
    calendarEventId: string,
    nextAssignmentIds: string[],
  ): Promise<string[]> => {
    if (!workspaceId || !session) return [];

    const normalizedTargetIds = Array.from(new Set(
      nextAssignmentIds
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ));
    const currentIds = eventAssignmentIdsByEventId[calendarEventId] ?? [];
    const currentIdSet = new Set(currentIds);
    const targetIdSet = new Set(normalizedTargetIds);
    const idsToAttach = normalizedTargetIds.filter((value) => !currentIdSet.has(value));
    const idsToDetach = currentIds.filter((value) => !targetIdSet.has(value));
    const basePath = `/tongs/workspaces/${encodeURIComponent(workspaceId)}/calendar-events/${encodeURIComponent(calendarEventId)}/assignments`;

    await Promise.all(idsToAttach.map((assignmentId) => (
      tongsApiRequest<{ assignment: { assignment_id: string } }>(basePath, {
        method: "POST",
        body: JSON.stringify({ assignment_id: assignmentId }),
      })
    )));

    await Promise.all(idsToDetach.map((assignmentId) => (
      tongsApiRequest<{ detached: boolean }>(`${basePath}/${encodeURIComponent(assignmentId)}`, {
        method: "DELETE",
      })
    )));

    const data = await tongsApiRequest<{ assignments: Array<{ assignment_id: string }> }>(basePath, {
      method: "GET",
    });
    return Array.from(new Set(
      (Array.isArray(data.assignments) ? data.assignments : [])
        .map((row) => row?.assignment_id)
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0),
    ));
  }, [eventAssignmentIdsByEventId, session, workspaceId]);

  useEffect(() => {
    if (!workspaceId || !session || !canReadCalendar) {
      setEvents([]);
      setEventAssignmentIdsByEventId({});
      if (!session) {
        setLoadError("Trial mode: sign in to view and create cloud calendar sessions.");
      } else if (!workspaceId) {
        setLoadError("Select a workspace to view and create calendar sessions.");
      } else if (!canReadCalendar) {
        setLoadError("You need Viewer access in this workspace to view calendar events.");
      }
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

        const links = rows.length > 0
          ? await listCalendarEventAssignments(
            supabase as SupabaseClient<Database>,
            workspaceId,
            rows.map((row) => row.id),
          )
          : [];
        if (!alive) return;

        const nextAssignments: Record<string, string[]> = {};
        for (const row of links) {
          const list = nextAssignments[row.event_id] ?? [];
          if (!list.includes(row.assignment_id)) {
            list.push(row.assignment_id);
          }
          nextAssignments[row.event_id] = list;
        }

        setEventAssignmentIdsByEventId(nextAssignments);
        setEvents(rows.map(rowToEvent));
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
  }, [workspaceId, session, canReadCalendar, view, cursorDate]);

  async function saveEvent() {
    if (!workspaceId || !session || !canEditCalendar) {
      setLoadError("You need Editor access in this workspace to create or edit events.");
      return;
    }
    const baseStart = allDay ? new Date(`${date}T00:00:00`) : new Date(`${date}T${time}:00`);
    if (Number.isNaN(baseStart.getTime())) return;
    const minutes = Math.max(15, Math.min(8 * 60, Number(durationMin) || 60));
    const endAt = allDay ? endOfDay(baseStart) : new Date(baseStart.getTime() + minutes * 60 * 1000);
    const nextSessionId = linkedSessionId.trim() || null;

    try {
      let persistedRow: CalendarEventRow;
      if (editingEventId) {
        persistedRow = await updateCalendarEvent(supabase, workspaceId, editingEventId, {
          title: title.trim() || "Calendar event",
          description: description.trim() || undefined,
          location: location.trim() || undefined,
          start_at: baseStart.toISOString(),
          end_at: endAt.toISOString(),
          all_day: allDay,
          session_id: nextSessionId,
        });
      } else {
        const created = await createCalendarEvent(supabase, workspaceId, {
          title: title.trim() || "Calendar event",
          description: description.trim() || undefined,
          location: location.trim() || undefined,
          start_at: baseStart.toISOString(),
          end_at: endAt.toISOString(),
          all_day: allDay,
          session_id: nextSessionId,
        });
        persistedRow = created;
      }

      await syncRecordingSessionAttachment(persistedRow.id, nextSessionId);
      const nextAssignmentIds = await syncEventAssignments(persistedRow.id, linkedEpisodeIds);
      await loadRecordingSessions();
      await loadEpisodes();

      const event = rowToEvent({
        ...persistedRow,
        session_id: nextSessionId,
      });
      setEvents((prev) => {
        const withClearedConflicts = nextSessionId
          ? prev.map((existing) => (
            existing.id !== event.id && existing.sessionId === nextSessionId
              ? { ...existing, sessionId: null }
              : existing
          ))
          : prev;

        const exists = withClearedConflicts.some((existing) => existing.id === event.id);
        const next = exists
          ? withClearedConflicts.map((existing) => (existing.id === event.id ? event : existing))
          : [event, ...withClearedConflicts];
        return next.sort((a, b) => b.startIso.localeCompare(a.startIso));
      });
      setEventAssignmentIdsByEventId((prev) => ({
        ...prev,
        [event.id]: nextAssignmentIds,
      }));
      closeNewForm();
    } catch (err: unknown) {
      console.warn("[tongs] calendar save failed", err);
      setLoadError(getErrorMessage(err) ?? "Failed saving calendar event.");
    }
  }

  async function deleteEvent(id: string) {
    if (!workspaceId || !session || !canDeleteCalendar) {
      setLoadError("You need Admin access in this workspace to delete events.");
      return;
    }
    try {
      await deleteCalendarEvent(supabase, workspaceId, id);
      setEvents((prev) => prev.filter((event) => event.id !== id));
      setEventAssignmentIdsByEventId((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      await loadRecordingSessions();
    } catch (err: unknown) {
      console.warn("[tongs] calendar delete failed", err);
      setLoadError(getErrorMessage(err) ?? "Failed deleting calendar event.");
    }
  }

  function goToToday() {
    setViewDate(new Date());
  }

  function goPrev() {
    if (view === "day") {
      setViewDate(addDays(cursorDate, -1));
      return;
    }

    if (view === "week") {
      setViewDate(addDays(cursorDate, -7));
      return;
    }

    setViewDate(addMonths(cursorDate, -1));
  }

  function goNext() {
    if (view === "day") {
      setViewDate(addDays(cursorDate, 1));
      return;
    }

    if (view === "week") {
      setViewDate(addDays(cursorDate, 7));
      return;
    }

    setViewDate(addMonths(cursorDate, 1));
  }

  function openDay(date: Date) {
    setViewDate(date);
    setView("day");
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

  const getEventEpisodeSummary = useCallback((eventId: string) => {
    const ids = eventAssignmentIdsByEventId[eventId] ?? [];
    if (ids.length === 0) return null;

    const labels = ids.map((id) => episodeLabelById.get(id) ?? id.slice(0, 8));
    if (labels.length <= 2) {
      return labels.join(", ");
    }
    return `${labels[0]}, ${labels[1]} +${labels.length - 2} more`;
  }, [eventAssignmentIdsByEventId, episodeLabelById]);

  const storageSummary = useMemo(() => {
    return MOUNT_ROLE_POLICY.map((policy) => formatRoleSummary(resolveMount(policy.role))).join(", ");
  }, [resolveMount]);

  const dayEvents = eventsByDay.get(toDateKey(cursorDate)) ?? [];

  if (!workspaceId) {
    return <WorkspaceRequiredNotice toolName="Tongs Calendar" />;
  }

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

          <button
            onClick={showNew ? closeNewForm : openNewForm}
            disabled={!session || !workspaceId || !canEditCalendar}
            title={
              !session
                ? "Sign in to create events."
                : !workspaceId
                  ? "Select a workspace first."
                  : !canEditCalendar
                    ? "You need Editor access to create events."
                    : ""
            }
          >
            {showNew ? "Close" : "New Event"}
          </button>
        </div>
      </div>
      {loadError ? (
        <div style={{ marginTop: 10, color: "#ffb3b3", fontSize: 13 }}>
          {loadError}
        </div>
      ) : null}
      {session && workspaceId && canReadCalendar && !canEditCalendar ? (
        <div style={{ marginTop: 10, color: "#ffd599", fontSize: 13 }}>
          Read-only: Editor access is required to create or edit events.
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
          <div style={{ fontWeight: 700, marginBottom: 10 }}>
            {isEditingEvent ? "Edit Event" : "New Event"}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 160px", gap: 10 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, opacity: 0.8 }}>Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                style={{ width: "100%" }}
                disabled={!canEditCalendar}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: 12, opacity: 0.8 }}>Location</label>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                style={{ width: "100%" }}
                disabled={!canEditCalendar}
              />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => setAllDay(e.target.checked)}
                disabled={!canEditCalendar}
              />
              <span style={{ fontSize: 12 }}>All day</span>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 160px 120px 120px", gap: 10, marginTop: 10 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, opacity: 0.8 }}>Description (optional)</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                style={{ width: "100%" }}
                disabled={!canEditCalendar}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: 12, opacity: 0.8 }}>Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDateOverride(e.target.value)}
                style={{ width: "100%" }}
                disabled={!canEditCalendar}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: 12, opacity: 0.8 }}>Time</label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                style={{ width: "100%" }}
                disabled={!canEditCalendar}
              />
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
                disabled={allDay || !canEditCalendar}
              />
            </div>
          </div>

          <div style={{ marginTop: 10 }}>
            <label style={{ display: "block", fontSize: 12, opacity: 0.8 }}>Recording Session (optional)</label>
            <select
              value={linkedSessionId}
              onChange={(e) => setLinkedSessionId(e.target.value)}
              style={{ width: "100%" }}
              disabled={recordingSessionsLoading || !canEditCalendar}
            >
              <option value="">No recording session</option>
              {recordingSessions.map((sessionRow) => {
                const linkedElsewhere = !!sessionRow.calendarEventId
                  && sessionRow.calendarEventId !== editingEventId;
                const label = linkedElsewhere
                  ? `${sessionRow.title} (currently linked elsewhere)`
                  : sessionRow.title;
                return (
                  <option key={sessionRow.id} value={sessionRow.id}>
                    {label}
                  </option>
                );
              })}
            </select>
            <div style={{ marginTop: 4, fontSize: 11, opacity: 0.68 }}>
              Attaching a session here will move that session from any other event.
            </div>
            {recordingSessionsError ? (
              <div style={{ marginTop: 4, color: "#ffb3b3", fontSize: 12 }}>
                {recordingSessionsError}
              </div>
            ) : null}
          </div>

          <div style={{ marginTop: 10 }}>
            <label style={{ display: "block", fontSize: 12, opacity: 0.8 }}>Attached Episodes (optional)</label>
            <div
              style={{
                marginTop: 6,
                maxHeight: 160,
                overflowY: "auto",
                border: "1px solid rgba(255,255,255,0.2)",
                borderRadius: 8,
                padding: 8,
                display: "grid",
                gap: 6,
                background: "rgba(0,0,0,0.2)",
              }}
            >
              {episodesLoading ? (
                <div style={{ fontSize: 12, opacity: 0.72 }}>Loading episodes...</div>
              ) : episodes.length === 0 ? (
                <div style={{ fontSize: 12, opacity: 0.72 }}>No episodes available in this workspace.</div>
              ) : (
                episodes.map((episode) => {
                  const checked = linkedEpisodeIds.includes(episode.id);
                  return (
                    <label key={episode.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => toggleLinkedEpisode(episode.id, e.target.checked)}
                        disabled={!canEditCalendar}
                      />
                      <span>{episode.label}</span>
                    </label>
                  );
                })
              )}
            </div>
            <div style={{ marginTop: 4, fontSize: 11, opacity: 0.68 }}>
              Attach one or more episodes/workpieces to this calendar event.
            </div>
            {episodesError ? (
              <div style={{ marginTop: 4, color: "#ffb3b3", fontSize: 12 }}>
                {episodesError}
              </div>
            ) : null}
          </div>

          <div style={{ marginTop: 12, display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={closeNewForm}>Cancel</button>
            <button onClick={saveEvent} disabled={!canEditCalendar}>{isEditingEvent ? "Save" : "Add"}</button>
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
              const episodeSummary = getEventEpisodeSummary(event.id);
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
                  {event.sessionId ? (
                    <div style={{ marginTop: 4, fontSize: 12, opacity: 0.72 }}>
                      Session: {sessionTitleById.get(event.sessionId) ?? event.sessionId.slice(0, 8)}
                    </div>
                  ) : null}
                  {episodeSummary ? (
                    <div style={{ marginTop: 4, fontSize: 12, opacity: 0.72 }}>
                      Episodes: {episodeSummary}
                    </div>
                  ) : null}
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
                      const episodeSummary = getEventEpisodeSummary(event.id);
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
                          {event.sessionId ? (
                            <div style={{ marginTop: 4, fontSize: 12, opacity: 0.66 }}>
                              Session: {sessionTitleById.get(event.sessionId) ?? event.sessionId.slice(0, 8)}
                            </div>
                          ) : null}
                          {episodeSummary ? (
                            <div style={{ marginTop: 4, fontSize: 12, opacity: 0.66 }}>
                              Episodes: {episodeSummary}
                            </div>
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
                  type="button"
                  onClick={() => {
                    openDay(day.date);
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
              const episodeSummary = getEventEpisodeSummary(event.id);
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
                    {event.sessionId ? (
                      <div style={{ marginTop: 4, fontSize: 12, opacity: 0.7 }}>
                        Session: {sessionTitleById.get(event.sessionId) ?? event.sessionId.slice(0, 8)}
                      </div>
                    ) : null}
                    {episodeSummary ? (
                      <div style={{ marginTop: 4, fontSize: 12, opacity: 0.7 }}>
                        Episodes: {episodeSummary}
                      </div>
                    ) : null}
                    {event.description ? (
                      <div style={{ opacity: 0.7, fontSize: 13, marginTop: 6 }}>{event.description}</div>
                    ) : null}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {canEditCalendar ? <button onClick={() => openEditForm(event)}>Edit</button> : null}
                    {canDeleteCalendar ? <button onClick={() => deleteEvent(event.id)}>Delete</button> : null}
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
